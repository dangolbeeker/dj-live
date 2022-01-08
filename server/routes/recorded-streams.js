const express = require('express');
const router = express.Router();
const sanitise = require('mongo-sanitize');
const _ = require('lodash');
const {User, RecordedStream, Event, EventStage} = require('../model/schemas');
const loginChecker = require('connect-ensure-login');
const CompositeError = require('../errors/CompositeError');
const {validation: {streamSettings: {titleMaxLength, tagsMaxAmount}}} = require('../../mainroom.config');
const LOGGER = require('../../logger')('./server/routes/recorded-streams.js');

router.get('/', async (req, res, next) => {
    const query = {};

    const options = {
        page: req.query.page,
        limit: req.query.limit,
        select: '_id user timestamp title genre category tags thumbnail.bucket thumbnail.key video.bucket video.key viewCount videoDuration',
        populate: {
            path: 'user',
            select: 'username displayName profilePic.bucket profilePic.key'
        }
    };

    if (req.query.username) {
        const username = sanitise(req.query.username);
        try {
            const user = await User.findOne({username}, '_id');
            if (!user) {
                return res.status(404).send(`User (username: ${escape(username)}) not found`);
            }
            if (req.query.tags && req.query.tags.length) {
                query.$or = [
                    {user},
                    {tags: req.query.tags}
                ]
                options.sort = '-viewCount';
            } else {
                query.user = user;
                options.sort = '-timestamp';
            }
        } catch (err) {
            LOGGER.error('An error occurred when finding user {}: {}', username, err);
            next(err);
        }
    } else {
        if (req.query.searchQuery) {
            const sanitisedQuery = sanitise(req.query.searchQuery);
            const escapedQuery = _.escapeRegExp(sanitisedQuery)
            const searchQuery = new RegExp(escapedQuery, 'i');
            query.$or = [
                {title: searchQuery},
                {genre: searchQuery},
                {category: searchQuery},
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
                    query.$or.push({user: {$in: userIds}});
                }
            };

            const getEventStageIds = async () => {
                const eventStageQuery = {
                    $or: [
                        {stageName: searchQuery}
                    ]
                };

                const events = await Event.find({
                    $or: [
                        {eventName: searchQuery},
                        {tags: searchQuery}
                    ]
                }).select('_id').exec();
                if (events.length) {
                    const eventIds = events.map(event => event._id);
                    eventStageQuery.$or.push({event: {$in: eventIds}});
                }

                const eventStages = await EventStage.find(eventStageQuery).select('_id').exec();
                if (eventStages.length) {
                    const eventStageIds = eventStages.map(eventStage => eventStage._id);
                    query.$or.push({eventStage: {$in: eventStageIds}});
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
        }
        if (req.query.genre) {
            query.genre = sanitise(req.query.genre);
        }
        if (req.query.category) {
            query.category = sanitise(req.query.category);
        }
        options.sort = '-viewCount';
    }

    RecordedStream.paginate(query, options, (err, result) => {
        if (err) {
            LOGGER.error('An error occurred when finding recorded streams: {}', err);
            next(err);
        } else {
            res.json({
                recordedStreams: result.docs.map(stream => ({
                    _id: stream._id,
                    user: {
                        username: stream.user.username,
                        displayName: stream.user.displayName,
                        profilePicURL: stream.user.getProfilePicURL()
                    },
                    timestamp: stream.timestamp,
                    title: stream.title,
                    genre: stream.genre,
                    category: stream.category,
                    tags: stream.tags,
                    viewCount: stream.viewCount,
                    videoDuration: stream.videoDuration,
                    thumbnailURL: stream.getThumbnailURL(),
                    videoURL: stream.getVideoURL()
                })),
                nextPage: result.nextPage
            });
        }
    });
});

router.get('/:id', (req, res, next) => {
    const id = sanitise(req.params.id);
    RecordedStream.findById(id)
        .select('user timestamp title genre category tags video.bucket video.key viewCount')
        .populate({
            path: 'user',
            select: 'username displayName profilePic.bucket profilePic.key'
        })
        .exec((err, recordedStream) => {
            if (err) {
                LOGGER.error('An error occurred when finding recorded stream (_id: {}): {}', id, err);
                next(err);
            } else if (!recordedStream) {
                res.status(404).send(`Recorded stream (_id: ${escape(id)}) not found`);
            } else {
                recordedStream.updateOne({$inc: {viewCount: 1}}, err => {
                    if (err) {
                        LOGGER.error('An error occurred when incrementing view count for recorded stream (_id: {}): {}',
                            id, err);
                        next(err);
                    } else {
                        res.json({
                            recordedStream: {
                                user: {
                                    username: recordedStream.user.username,
                                    displayName: recordedStream.user.displayName,
                                    profilePicURL: recordedStream.user.getProfilePicURL()
                                },
                                timestamp: recordedStream.timestamp,
                                title: recordedStream.title,
                                genre: recordedStream.genre,
                                tags: recordedStream.tags,
                                category: recordedStream.category,
                                videoURL: recordedStream.getVideoURL(),
                                viewCount: recordedStream.viewCount
                            }
                        });
                    }
                });
            }
        });
});

router.patch('/:id', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const id = sanitise(req.params.id);
    const sanitisedInput = sanitise(req.body);

    if (sanitisedInput.title > titleMaxLength) {
        return res.status(403).send(`Length of title was greater than the maximum allowed length of ${titleMaxLength}`);
    }
    if (sanitisedInput.tags.length > tagsMaxAmount) {
        return res.status(403).send(`Number of tags was greater than the maximum allowed amount of ${tagsMaxAmount}`);
    }

    const recordedStream = await RecordedStream.findById(id).select('user').exec();
    if (!recordedStream) {
        res.status(404).send(`Recorded stream (_id: ${escape(id)}) not found`);
    }
    if (recordedStream.user.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    recordedStream.title = sanitisedInput.title;
    recordedStream.genre = sanitisedInput.genre;
    recordedStream.category = sanitisedInput.category;
    recordedStream.tags = sanitisedInput.tags;

    try {
        await recordedStream.save();
        res.json({
            title: recordedStream.title,
            genre: recordedStream.genre,
            category: recordedStream.category,
            tags: recordedStream.tags
        });
    } catch (err) {
        LOGGER.error(`An error occurred when updating info for recorded stream (_id: {}): {}`, id, err);
        next(err);
    }
});

router.delete('/:id', loginChecker.ensureLoggedIn(), async (req, res, next) => {
    const id = sanitise(req.params.id);

    let recordedStream;
    try {
        recordedStream = await RecordedStream.findById(id).select('user').exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding RecordedStream with id '{}': {}`, id, err);
        return next(err);
    }

    if (!recordedStream) {
        return res.status(404).send(`Recorded stream (_id: ${escape(id)}) not found`);
    }
    if (recordedStream.user.toString() !== req.user._id.toString()) {
        return res.sendStatus(401);
    }

    try {
        await RecordedStream.findByIdAndDelete(id);
        res.sendStatus(200);
    } catch (err) {
        LOGGER.error(`An error occurred when deleting recorded stream (_id: {}) from database: {}`, id, err);
        next(err);
    }
});

module.exports = router;