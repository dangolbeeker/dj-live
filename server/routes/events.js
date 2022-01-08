const express = require('express');
const router = express.Router();
const {Event, EventStage, RecordedStream, ScheduledStream, User} = require('../model/schemas');
const mongoose = require('mongoose');
const sanitise = require('mongo-sanitize');
const escape = require('escape-html');
const _ = require('lodash');
const axios = require('axios');
const loginChecker = require('connect-ensure-login');
const {
    rtmpServer,
    defaultProfilePicURL,
    storage: {s3, formDataKeys, cloudfront},
    validation: {
        event: {eventNameMaxLength, tagsMaxAmount},
        eventStage: {stageNameMaxLength, stagesMaxAmount}
    }
} = require('../../mainroom.config');
const multer = require('multer');
const multerS3 = require('multer-s3');
const S3V2ToV3Bridge = require('../aws/s3-v2-to-v3-bridge');
const mime = require('mime-types');
const CompositeError = require('../errors/CompositeError');
const {deleteObject, createMultipartUpload, getUploadPartSignedURLs, completeMultipartUpload, abortMultipartUpload} = require('../aws/s3Utils');
const {getThumbnail} = require('../aws/s3ThumbnailGenerator');
const LOGGER = require('../../logger')('./server/routes/events.js');

const S3_V2_TO_V3_BRIDGE = new S3V2ToV3Bridge();
const RTMP_SERVER_RTMP_PORT = process.env.RTMP_SERVER_RTMP_PORT !== '1935' ? `:${process.env.RTMP_SERVER_RTMP_PORT}` : '';
const RTMP_SERVER_URL = `rtmp://${process.env.NODE_ENV === 'production' ? process.env.SERVER_HOST : 'localhost'}`
    + `${RTMP_SERVER_RTMP_PORT}/${process.env.RTMP_SERVER_APP_NAME}`;

router.get('/', async (req, res, next) => {
    const query = {};

    if (req.query.searchQuery) {
        const sanitisedQuery = sanitise(req.query.searchQuery);
        const escapedQuery = _.escapeRegExp(sanitisedQuery)
        const searchQuery = new RegExp(escapedQuery, 'i');
        query.$or = [
            {eventName: searchQuery},
            {tags: searchQuery}
        ];

        const getUserIds = async () => {
            const users = await User.find({
                $or: [
                    {username: searchQuery},
                    {displayName: searchQuery}
                ]
            }).select('_id').exec();
            if (users.length) {
                const userIds = users.map(user => user._id);
                query.$or.push({createdBy: {$in: userIds}});
            }
        }

        const getEventStageIds = async () => {
            const eventStages = await EventStage.find({
                $or: [
                    {stageName: searchQuery},
                    {'streamInfo.title': searchQuery},
                    {'streamInfo.genre': searchQuery},
                    {'streamInfo.category': searchQuery},
                    {'streamInfo.tags': searchQuery},
                ]
            }).select('_id').exec();
            if (eventStages.length) {
                const eventStageIds = eventStages.map(eventStage => eventStage._id);
                query.$or.push({stages: {$in: eventStageIds}});
            }
        }

        const promiseResults = await Promise.allSettled([getUserIds(), getEventStageIds()]);
        const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');

        if (rejectedPromises.length) {
            const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
            LOGGER.error('{} error{} occurred when getting user/stage ids. Error: {}',
                rejectedPromises.length, rejectedPromises.length === 1 ? '' : 's', err);
            return next(err);
        }
    } else {
        query.endTime = {$gte: Date.now()};
    }
    if (req.query.genre) {
        query['stages.streamInfo.genre'] = sanitise(req.query.genre);
    }
    if (req.query.category) {
        query['stages.streamInfo.category'] = sanitise(req.query.category);
    }

    const options = {
        page: req.query.page,
        limit: req.query.limit,
        select: '_id eventName createdBy startTime endTime thumbnail.bucket thumbnail.key',
        populate: {
            path: 'createdBy',
            select: 'displayName username'
        },
        sort: 'startTime'
    };

    Event.paginate(query, options, async (err, result) => {
        if (err) {
            LOGGER.error('An error occurred when finding Events: {}', err);
            return next(err);
        }
        res.json({
            events: result.docs.map(event => ({
                _id: event._id,
                eventName: event.eventName,
                createdBy: event.createdBy,
                startTime: event.startTime,
                endTime: event.endTime,
                thumbnailURL: event.getThumbnailURL()
            })),
            nextPage: result.nextPage
        });
    });
});

router.put('/', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const sanitisedInput = sanitise(req.body);

    if (sanitisedInput.userId !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    if (!sanitisedInput.eventName.length) {
        return res.status(403).send('Event must have a name');
    }
    if (sanitisedInput.eventName > eventNameMaxLength) {
        return res.status(403).send(`Length of event name '${escape(sanitisedInput.eventName)}' is greater than the maximum allowed length of ${eventNameMaxLength}`);
    }
    if (sanitisedInput.tags.length > tagsMaxAmount) {
        return res.status(403).send(`Number of tags was greater than the maximum allowed amount of ${tagsMaxAmount}`);
    }
    if (sanitisedInput.stages.length > stagesMaxAmount) {
        return res.status(403).send(`Number of stages was greater than the maximum allowed amount of ${stagesMaxAmount}`);
    }
    if (sanitisedInput.stages && sanitisedInput.stages.length) {
        const stageNameEncountered = [];
        for (const stage of sanitisedInput.stages) {
            if (!stage.stageName) {
                return res.status(403).send('All stages must have a name');
            }
            if (stage.stageName > stageNameMaxLength) {
                return res.status(403).send(`Length of stage name '${escape(stage.stageName)}' is greater than the maximum allowed length of ${stageNameMaxLength}`);
            }
            if (stageNameEncountered[stage.stageName]) {
                return res.status(403).send(`Duplicate stage names found. Names of stages must be unique.`);
            }
            stageNameEncountered[stage.stageName] = true;
        }
    }

    let event;
    if (sanitisedInput.eventId) {
        try {
            event = await Event.findById(sanitisedInput.eventId)
                .select('_id stages')
                .populate({
                    path: 'stages',
                    select: '_id'
                })
                .exec();
        } catch (err) {
            LOGGER.error(`An error occurred when finding Event with id '{}': {}`, sanitisedInput.eventId, err);
            return next(err);
        }
        if (!event) {
            return res.status(404).send(`Event (_id: ${escape(sanitisedInput.eventId)}) not found`);
        }
    } else {
        event = new Event({
            createdBy: sanitisedInput.userId
        });
    }

    event.eventName = sanitisedInput.eventName;
    event.startTime = sanitisedInput.startTime;
    event.endTime = sanitisedInput.endTime;
    event.tags = sanitisedInput.tags;

    try {
        await event.save();
    } catch (err) {
        LOGGER.error('An error occurred when saving Event: {}, Error: {}', JSON.stringify(event), err);
        next(err);
    }

    const eventStageIds = [];
    if (sanitisedInput.stages && sanitisedInput.stages.length) {
        for (const stage of sanitisedInput.stages) {
            let eventStage;
            if (stage._id) {
                try {
                    eventStage = await EventStage.findById(stage._id).select('_id').exec();
                } catch (err) {
                    LOGGER.error(`An error occurred when finding EventStage with id '{}': {}`, stage._id, err);
                    return next(err);
                }
                if (!eventStage) {
                    return res.status(404).send(`EventStage (_id: ${escape(stage._id)}) not found`);
                }
            } else {
                eventStage = new EventStage({
                    event: event._id,
                    streamInfo: {
                        streamKey: EventStage.generateStreamKey()
                    }
                });
            }

            eventStage.stageName = stage.stageName;

            try {
                await eventStage.save();
            } catch (err) {
                LOGGER.error('An error occurred when saving new EventStage: {}, Error: {}',
                    JSON.stringify(eventStage), err);
                next(err);
            }

            eventStageIds.push(eventStage._id);
        }
    }

    if (event.stages) {
        const deletePromises = [];
        const newEventStageIds = eventStageIds.map(eventStageId => eventStageId.toString());
        const oldEventStageIds = event.stages.map(stage => stage._id.toString());

        for (const eventStageId of oldEventStageIds) {
            if (!newEventStageIds.includes(eventStageId)) {
                deletePromises.push(EventStage.findByIdAndDelete(eventStageId));
            }
        }
        if (deletePromises.length) {
            const promiseResults = await Promise.allSettled(deletePromises);
            const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');
            if (rejectedPromises.length) {
                return next(new CompositeError(rejectedPromises.map(promise => promise.reason)));
            }
        }
    }

    try {
        event.stages = eventStageIds;
        await event.save();
        res.json({
            eventId: event._id,
            eventStageIds
        });
    } catch (err) {
        LOGGER.error('An error occurred when saving new Event: {}, Error: {}', JSON.stringify(event), err);
        next(err);
    }
});

const s3UploadBannerPic = multer({
    storage: multerS3({
        s3: S3_V2_TO_V3_BRIDGE,
        bucket: s3.staticContent.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, undefined); // set metadata explicitly to undefined
        },
        key: (req, file, cb) => {
            const path = s3.staticContent.keyPrefixes.eventImages;
            const eventId = sanitise(req.params.eventId);
            const extension = mime.extension(file.mimetype);
            cb(null, `${path}/${eventId}/banner-${Date.now()}.${extension}`);
        }
    })
}).single(formDataKeys.event.bannerPic);

router.patch('/:eventId/banner-pic', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    let event;
    try {
        event = await Event.findById(eventId)
            .select('_id createdBy bannerPic.bucket bannerPic.key')
            .populate({
                path: 'createdBy',
                select: '_id'
            })
            .exec();
        if (!event) {
            return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
        }
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }

    if (event.createdBy._id.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    s3UploadBannerPic(req, res, async err => {
        if (err) {
            LOGGER.error('An error occurred when uploading banner pic to S3 for Event (_id: {}): {}, Error: {}',
                eventId, err);
            return next(err);
        }
        try {
            const promises = [];
            // delete old banner pic if not empty
            if (event.bannerPic && event.bannerPic.bucket && event.bannerPic.key) {
                promises.push(deleteObject({
                    Bucket: event.bannerPic.bucket,
                    Key: event.bannerPic.key
                }));
            }
            event.bannerPic = {
                bucket: req.file.bucket,
                key: req.file.key
            };
            promises.push(event.save());
            await Promise.all(promises);
            res.sendStatus(200);
        } catch (err) {
            LOGGER.error('An error occurred when updating banner pic info for Event (_id: {}): {}', eventId, err);
            next(err);
        }
    });
});

const s3UploadEventThumbnail = multer({
    storage: multerS3({
        s3: S3_V2_TO_V3_BRIDGE,
        bucket: s3.staticContent.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, undefined); // set metadata explicitly to undefined
        },
        key: (req, file, cb) => {
            const path = s3.staticContent.keyPrefixes.eventImages;
            const eventId = sanitise(req.params.eventId);
            const extension = mime.extension(file.mimetype);
            cb(null, `${path}/${eventId}/thumbnail-${Date.now()}.${extension}`);
        }
    })
}).single(formDataKeys.event.thumbnail);

router.patch('/:eventId/thumbnail', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    let event;
    try {
        event = await Event.findById(eventId)
            .select('_id createdBy thumbnail.bucket thumbnail.key')
            .populate({
                path: 'createdBy',
                select: '_id'
            }).exec();
        if (!event) {
            return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
        }
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }

    if (event.createdBy._id.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    s3UploadEventThumbnail(req, res, async err => {
        if (err) {
            LOGGER.error('An error occurred when uploading thumbnail to S3 for Event (_id: {}): {}, Error: {}',
                eventId, err);
            return next(err);
        }
        try {
            const promises = [];
            // delete old thumbnail if not default
            if (!(event.thumbnail.bucket === s3.defaultEventThumbnail.bucket
                && event.thumbnail.key === s3.defaultEventThumbnail.key)) {
                promises.push(deleteObject({
                    Bucket: event.thumbnail.bucket,
                    Key: event.thumbnail.key
                }));
            }
            event.thumbnail = {
                bucket: req.file.bucket,
                key: req.file.key
            };
            promises.push(event.save());
            await Promise.all(promises);
            res.sendStatus(200);
        } catch (err) {
            LOGGER.error('An error occurred when updating thumbnail info for Event (_id: {}): {}', eventId, err);
            next(err);
        }
    });
});

const s3UploadEventStageSplashThumbnail = multer({
    storage: multerS3({
        s3: S3_V2_TO_V3_BRIDGE,
        bucket: s3.staticContent.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, undefined); // set metadata explicitly to undefined
        },
        key: (req, file, cb) => {
            const path = s3.staticContent.keyPrefixes.eventImages;
            const eventId = sanitise(req.params.eventId);
            const eventStageId = sanitise(req.params.eventStageId);
            const extension = mime.extension(file.mimetype);
            cb(null, `${path}/${eventId}/${eventStageId}-${Date.now()}.${extension}`);
        }
    })
}).single(formDataKeys.eventStage.splashThumbnail);

router.patch('/:eventId/stage/:eventStageId/splash-thumbnail', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const eventStageId = sanitise(req.params.eventStageId);

    let eventStage;
    try {
        eventStage = await EventStage.findById(eventStageId)
            .select('_id event splashThumbnail.bucket splashThumbnail.key')
            .populate({
                path: 'event',
                populate: {
                    path: 'createdBy',
                    select: '_id'
                }
            })
            .exec();
        if (!eventStage) {
            return res.status(404).send(`EventStage (_id: ${escape(eventStageId)}) not found`);
        }
    } catch (err) {
        LOGGER.error(`An error occurred when finding EventStage with id '{}': {}`, eventStageId, err);
        return next(err);
    }

    if (eventStage.event.createdBy._id.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    s3UploadEventStageSplashThumbnail(req, res, async err => {
        if (err) {
            LOGGER.error('An error occurred when uploading splash thumbnail to S3 for EventStage (_id: {}): {}, Error: {}',
                eventStageId, err);
            return next(err);
        }
        try {
            const promises = [];
            // delete old splash thumbnail if not default
            if (!(eventStage.splashThumbnail.bucket === s3.defaultEventStageSplashThumbnail.bucket
                && eventStage.splashThumbnail.key === s3.defaultEventStageSplashThumbnail.key)) {
                promises.push(deleteObject({
                    Bucket: eventStage.splashThumbnail.bucket,
                    Key: eventStage.splashThumbnail.key
                }));
            }
            eventStage.splashThumbnail = {
                bucket: req.file.bucket,
                key: req.file.key
            };
            promises.push(eventStage.save());
            await Promise.all(promises);
            res.sendStatus(200);
        } catch (err) {
            LOGGER.error('An error occurred when updating splash thumbnail info for EventStage (_id: {}): {}',
                eventStageId, err);
            next(err);
        }
    });
});

router.get('/:eventId', async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    let event;
    try {
        event = await Event.findById(eventId)
            .select('_id eventName createdBy startTime endTime bannerPic.bucket bannerPic.key tags stages subscribers')
            .populate({
                path: 'createdBy',
                select: '_id username displayName'
            })
            .populate({
                path: 'stages',
                select: '_id stageName splashThumbnail.bucket splashThumbnail.key +streamInfo.streamKey streamInfo.title streamInfo.genre streamInfo.category streamInfo.viewCount streamInfo.thumbnailGenerationStatus'
            })
            .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }

    if (!event) {
        return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
    }

    const socketIOURL = (process.env.NODE_ENV === 'production' ? 'https' : 'http')
        + `://${process.env.SERVER_HOST}:${process.env.SOCKET_IO_PORT}?eventId=${eventId}`;

    res.json({
        eventName: event.eventName,
        createdBy: event.createdBy,
        startTime: event.startTime,
        endTime: event.endTime,
        bannerPicURL: event.getBannerPicURL(),
        tags: event.tags,
        stages: await Promise.all(event.stages.map(buildEventStage)),
        numOfSubscribers: event.subscribers.length,
        rtmpServerURL: RTMP_SERVER_URL,
        socketIOURL
    });
});

async function buildEventStage(eventStage) {
    const streamKey = eventStage.streamInfo.streamKey;
    const {data: {isLive}} = await axios.get(`http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/api/streams/live/${streamKey}`, {
        headers: {Authorization: rtmpServer.auth.header}
    });

    let thumbnailURL;
    if (isLive) {
        try {
            thumbnailURL = await getThumbnail(eventStage);
        } catch (err) {
            LOGGER.info('An error occurred when getting thumbnail for eventStage stream (_id: {}). ' +
                'Returning splash thumbnail. Error: {}', eventStage._id, err);
            thumbnailURL = eventStage.getSplashThumbnailURL();
        }
    } else {
        thumbnailURL = eventStage.getSplashThumbnailURL();
    }

    return {
        _id: eventStage._id,
        isLive,
        stageName: eventStage.stageName,
        thumbnailURL,
        streamInfo: {
            streamKey: eventStage.streamInfo.streamKey,
            title: eventStage.streamInfo.title,
            genre: eventStage.streamInfo.genre,
            category: eventStage.streamInfo.category,
            viewCount: eventStage.streamInfo.viewCount
        }
    };
}

router.get('/:eventId/event-name', async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    let event;
    try {
        event = await Event.findById(eventId).select('eventName').exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }
    if (!event) {
        return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
    }

    res.json({eventName: event.eventName});
});

router.get('/:eventId/subscribers', async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    // count number of subscribers for calculating 'nextPage' pagination property on result JSON
    let result;
    try {
        result = await Event.aggregate([
            {
                $match: {_id: mongoose.Types.ObjectId(eventId)}
            },
            {
                $project: {count: {$size: '$subscribers'}}
            }
        ]).exec();
    } catch (err) {
        LOGGER.error('An error occurred when counting number of subscribers for Event (_id: {}): {}', eventId, err);
        return next(err);
    }

    if (result && result.length === 1) {
        result = result[0];
    }

    if (!result || !result.count) {
        return res.json({
            subscribers: [],
            nextPage: null
        });
    }

    // populate subscribers, paginated
    const limit = req.query.limit
    const page = req.query.page;
    const pages = Math.ceil(result.count / limit);
    const skip = (page - 1) * limit;

    let event;
    try {
        event = await Event.findById(eventId, 'subscribers')
            .populate({
                path: `subscribers.user`,
                select: 'username profilePic.bucket profilePic.key',
                skip,
                limit
            })
            .exec();
    } catch (err) {
        LOGGER.error('An error occurred when getting subscribers for Event (_id: {}): {}', eventId, err);
        return next(err);
    }

    if (!event) {
        return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
    }

    res.json({
        subscribers: (event.subscribers || []).map(sub => ({
            username: sub.user.username,
            profilePicURL: sub.user.getProfilePicURL() || defaultProfilePicURL
        })),
        nextPage: page < pages ? page + 1 : null
    });
});

router.get('/:eventId/recorded-streams', async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    let event;
    try {
        event = await Event.findById(eventId)
            .select('stages')
            .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }

    if (!event) {
        return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
    }

    if (!event.stages || !event.stages.length) {
        return res.json({
            recordedStreams: [],
            nextPage: null
        });
    }

    const options = {
        page: req.query.page,
        limit: req.query.limit,
        select: '_id timestamp title genre category thumbnail.bucket thumbnail.key viewCount videoDuration',
        sort: '-timestamp'
    };

    RecordedStream.paginate({eventStage: {$in: event.stages}}, options, (err, result) => {
        if (err) {
            LOGGER.error('An error occurred when finding recorded streams for Event (_id: {}): {}', eventId, err);
            next(err);
        } else {
            res.json({
                recordedStreams: result.docs.map(stream => ({
                    _id: stream._id,
                    timestamp: stream.timestamp,
                    title: stream.title,
                    genre: stream.genre,
                    category: stream.category,
                    viewCount: stream.viewCount,
                    videoDuration: stream.videoDuration,
                    thumbnailURL: stream.getThumbnailURL()
                })),
                nextPage: result.nextPage
            });
        }
    });
});

router.get('/:eventId/scheduled-streams', async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    let event;
    try {
        event = await Event.findById(eventId)
            .select('stages')
            .populate({
                path: 'stages',
                select: '_id stageName'
            })
            .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }

    if (!event.stages || !event.stages.length) {
        return res.json({
            scheduleGroups: [],
            scheduleItems: []
        });
    }

    const filter = {
        eventStage: {$in: event.stages.map(stage => stage._id)},
        startTime: {$lte: req.query.scheduleEndTime},
        endTime: {$gte: req.query.scheduleStartTime}
    };

    let scheduledStreams;
    try {
        scheduledStreams = await ScheduledStream.find(filter)
            .select('eventStage title startTime endTime genre category prerecordedVideoFile')
            .populate({
                path: 'eventStage',
                select: '_id stageName'
            })
            .sort('startTime')
            .exec();
    } catch (err) {
        LOGGER.error('An error occurred when finding scheduled streams for Event (_id: {}): {}', eventId, err);
        next(err);
    }

    res.json({
        scheduleGroups: event.stages.map(stage => ({
            id: stage._id,
            title: stage.stageName
        })),
        scheduleItems: !scheduledStreams ? [] : scheduledStreams.map((scheduledStream, index) => ({
            _id: scheduledStream._id,
            id: index,
            group: scheduledStream.eventStage._id,
            title: scheduledStream.title || scheduledStream.eventStage.stageName,
            start_time: scheduledStream.startTime,
            end_time: scheduledStream.endTime,
            genre: scheduledStream.genre,
            category: scheduledStream.category,
            hasPrerecordedVideo: !!scheduledStream.prerecordedVideoFile
        }))
    });
});

router.delete('/:eventId', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const eventId = sanitise(req.params.eventId);

    let event;
    try {
        event = await Event.findById(eventId)
            .select('createdBy')
            .populate({
                path: 'createdBy',
                select: '_id'
            })
            .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }

    if (!event) {
        return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
    }
    if (event.createdBy._id.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    try {
        await Event.findByIdAndDelete(eventId);
        res.sendStatus(200);
    } catch (err) {
        LOGGER.error(`An error occurred when deleting Event (_id: {}) from database: {}`, eventId, err);
        next(err);
    }
});

router.get('/:eventStageId/stream-info', async (req, res, next) => {
    const eventStageId = sanitise(req.params.eventStageId);

    let eventStage;
    try {
        eventStage = await EventStage.findById(eventStageId)
            .select('event stageName +streamInfo.streamKey streamInfo.title streamInfo.genre streamInfo.category streamInfo.tags streamInfo.viewCount streamInfo.startTime')
            .populate({
                path: 'event',
                select: '_id eventName'
            })
            .exec()
    } catch (err) {
        LOGGER.error(`An error occurred when finding EventStage with id '{}': {}`, eventStageId, err);
        return next(err);
    }

    if (!eventStage) {
        return res.status(404).send(`Event (_id: ${escape(eventStageId)}) not found`);
    }

    const streamKey = eventStage.streamInfo.streamKey;
    const {data: {isLive}} = await axios.get(`http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/api/streams/live/${streamKey}`, {
        headers: {Authorization: rtmpServer.auth.header}
    });

    const liveStreamURL = process.env.NODE_ENV === 'production'
        ? `https://${cloudfront.liveStreams}/${streamKey}/index.m3u8`
        : `http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/${process.env.RTMP_SERVER_APP_NAME}/${streamKey}/index.m3u8`;

    const socketIOURL = (process.env.NODE_ENV === 'production' ? 'https' : 'http')
        + `://${process.env.SERVER_HOST}:${process.env.SOCKET_IO_PORT}?eventStageId=${eventStageId}`;

    res.json({
        isLive,
        streamKey,
        event: eventStage.event,
        stageName: eventStage.stageName,
        title: eventStage.streamInfo.title,
        genre: eventStage.streamInfo.genre,
        category: eventStage.streamInfo.category,
        tags: eventStage.streamInfo.tags,
        viewCount: eventStage.streamInfo.viewCount,
        startTime: eventStage.streamInfo.startTime,
        rtmpServerURL: RTMP_SERVER_URL,
        liveStreamURL,
        socketIOURL
    });
});

router.get('/:eventStageId/init-stream-upload', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const eventStageId = sanitise(req.params.eventStageId);
    const sanitisedInput = sanitise(req.query);

    let eventStage;
    try {
        eventStage = await EventStage.findById(eventStageId)
            .select('event')
            .populate({
                path: 'event',
                select: 'createdBy',
                populate: {
                    path: 'createdBy',
                    select: '_id'
                }
            })
            .exec()
    } catch (err) {
        LOGGER.error(`An error occurred when finding EventStage with id '{}': {}`, eventStageId, err);
        return next(err);
    }

    if (!eventStage) {
        return res.status(404).send(`Event (_id: ${escape(eventStageId)}) not found`);
    }

    if (eventStage.event.createdBy._id.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    try {
        const s3Params = {
            Bucket: s3.streams.bucketName,
            Key: `${s3.streams.keyPrefixes.prerecorded}/${eventStageId}/${Date.now()}.${sanitisedInput.fileExtension}`,
        };
        s3Params.UploadId = await createMultipartUpload(s3Params);
        s3Params.NumberOfParts = sanitisedInput.numberOfParts;
        const signedURLs = await getUploadPartSignedURLs(s3Params);

        res.json({
            bucket: s3Params.Bucket,
            key: s3Params.Key,
            uploadId: s3Params.UploadId,
            signedURLs
        });
    } catch (err) {
        LOGGER.error(`An error occurred when getting signed URLs for stream upload for EventStage with id '{}': {}`,
            eventStageId, err);
        next(err);
    }
});

router.post('/:eventStageId/complete-stream-upload', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const eventStageId = sanitise(req.params.eventStageId);
    const sanitisedInput = sanitise(req.body);

    let eventStage;
    try {
        eventStage = await EventStage.findById(eventStageId)
            .select('event')
            .populate({
                path: 'event',
                select: 'createdBy',
                populate: {
                    path: 'createdBy',
                    select: '_id'
                }
            })
            .exec()
    } catch (err) {
        LOGGER.error(`An error occurred when finding EventStage with id '{}': {}`, eventStageId, err);
        return next(err);
    }

    if (!eventStage) {
        return res.status(404).send(`Event (_id: ${escape(eventStageId)}) not found`);
    }

    if (eventStage.event.createdBy._id.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    try {
        await completeMultipartUpload({
            Bucket: sanitisedInput.bucket,
            Key: sanitisedInput.key,
            UploadId: sanitisedInput.uploadId,
            Parts: sanitisedInput.uploadedParts
        });
        res.sendStatus(201);
    } catch (err) {
        LOGGER.error(`An error occurred when completing stream upload for EventStage with id '{}': {}`,
            eventStageId, err);
        next(err);
    }
});

router.delete('/:eventStageId/cancel-stream-upload', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const eventStageId = sanitise(req.params.eventStageId);
    const sanitisedInput = sanitise(req.query);

    let eventStage;
    try {
        eventStage = await EventStage.findById(eventStageId)
            .select('event')
            .populate({
                path: 'event',
                select: 'createdBy',
                populate: {
                    path: 'createdBy',
                    select: '_id'
                }
            })
            .exec()
    } catch (err) {
        LOGGER.error(`An error occurred when finding EventStage with id '{}': {}`, eventStageId, err);
        return next(err);
    }

    if (!eventStage) {
        return res.status(404).send(`Event (_id: ${escape(eventStageId)}) not found`);
    }

    if (eventStage.event.createdBy._id.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    try {
        await abortMultipartUpload({
            Bucket: sanitisedInput.bucket,
            Key: sanitisedInput.key,
            UploadId: sanitisedInput.uploadId,
        });
        res.sendStatus(200);
    } catch (err) {
        LOGGER.error(`An error occurred when cancelling stream upload for EventStage with id '{}': {}`,
            eventStageId, err);
        next(err);
    }
});

module.exports = router;