const express = require('express');
const router = express.Router();
const config = require('../../mainroom.config');
const axios = require('axios');
const {User, EventStage, Event} = require('../model/schemas');
const _ = require('lodash');
const sanitise = require('mongo-sanitize');
const {getThumbnail} = require('../aws/s3ThumbnailGenerator');
const LOGGER = require('../../logger')('./server/routes/livestreams.js');

router.get('/', async (req, res, next) => {
    const streamKeys = await getLiveStreamKeys();
    if (!streamKeys.length) {
        return res.json({});
    }

    const query = {
        'streamInfo.streamKey': {$in: streamKeys}
    };
    if (req.query.searchQuery) {
        const sanitisedQuery = sanitise(req.query.searchQuery);
        const escapedQuery = _.escapeRegExp(sanitisedQuery)
        const searchQuery = new RegExp(escapedQuery, 'i');
        query.$or = [
            {'streamInfo.title': searchQuery},
            {'streamInfo.genre': searchQuery},
            {'streamInfo.category': searchQuery},
            {'streamInfo.tags': searchQuery},
            {username: searchQuery},
            {displayName: searchQuery}
        ];
    }
    if (req.query.genre) {
        query['streamInfo.genre'] = sanitise(req.query.genre);
    }
    if (req.query.category) {
        query['streamInfo.category'] = sanitise(req.query.category);
    }
    if (req.query.usernames) {
        query.username = {$in: req.query.usernames}
    }

    const options = {
        page: req.query.page,
        limit: req.query.limit,
        select: 'username displayName profilePic.bucket profilePic.key +streamInfo.streamKey streamInfo.title streamInfo.genre streamInfo.category streamInfo.viewCount streamInfo.startTime streamInfo.thumbnailGenerationStatus',
        sort: '-streamInfo.viewCount'
    };

    User.paginate(query, options, async (err, result) => {
        if (err) {
            LOGGER.error('An error occurred when finding User livestream info: {}', err);
            return next(err);
        }

        res.json({
            streams: await Promise.all(result.docs.map(buildUserLivestream)),
            nextPage: result.nextPage
        });
    });
});

async function buildUserLivestream(user) {
    let thumbnailURL;
    try {
        thumbnailURL = await getThumbnail(user);
    } catch (err) {
        LOGGER.info('An error occurred when getting thumbnail for user stream (username: {}). ' +
            'Returning default thumbnail. Error: {}', user.username, err);
        thumbnailURL = config.defaultThumbnailURL;
    }
    return {
        username: user.username,
        displayName: user.displayName,
        profilePicURL: user.getProfilePicURL(),
        title: user.streamInfo.title,
        genre: user.streamInfo.genre,
        category: user.streamInfo.category,
        viewCount: user.streamInfo.viewCount,
        startTime: user.streamInfo.startTime,
        thumbnailURL
    };
}

router.get('/event-stages', async (req, res, next) => {
    const streamKeys = await getLiveStreamKeys();
    if (!streamKeys.length) {
        return res.json({});
    }

    const query = {
        'streamInfo.streamKey': {$in: streamKeys}
    };
    if (req.query.searchQuery) {
        const sanitisedQuery = sanitise(req.query.searchQuery);
        const escapedQuery = _.escapeRegExp(sanitisedQuery)
        const searchQuery = new RegExp(escapedQuery, 'i');
        query.$or = [
            {'streamInfo.title': searchQuery},
            {'streamInfo.genre': searchQuery},
            {'streamInfo.category': searchQuery},
            {'streamInfo.tags': searchQuery}
        ];

        try {
            const users = await User.find({
                $or: [
                    {username: searchQuery},
                    {displayName: searchQuery}
                ]
            }).select('_id').exec();
            if (users.length) {
                const userIds = users.map(user => user._id);
                const events = await Event.find({createdBy: {$in: userIds}}).select('_id').exec();
                if (events.length) {
                    const eventIds = events.map(event => event._id);
                    query.$or.push({event: {$in: eventIds}});
                }
            }
        } catch (err) {
            LOGGER.error(`An error occurred when finding events querying createdBy.username and createdBy.displayName with '{}': {}`,
                searchQuery, err);
            next(err);
        }
    }
    if (req.query.genre) {
        query['streamInfo.genre'] = sanitise(req.query.genre);
    }
    if (req.query.category) {
        query['streamInfo.category'] = sanitise(req.query.category);
    }
    if (req.query.eventIds) {
        query['event._id'] = {$in: req.query.eventIds}
    }

    const options = {
        page: req.query.page,
        limit: req.query.limit,
        select: '_id event stageName +streamInfo.streamKey streamInfo.title streamInfo.genre streamInfo.category streamInfo.viewCount streamInfo.startTime streamInfo.thumbnailGenerationStatus',
        populate: {
            path: 'event',
            select: '_id eventName'
        },
        sort: '-streamInfo.viewCount'
    };

    EventStage.paginate(query, options, async (err, result) => {
        if (err) {
            LOGGER.error('An error occurred when finding EventStage livestream info: {}', err);
            return next(err);
        }

        res.json({
            streams: await Promise.all(result.docs.map(buildEventStageLivestream)),
            nextPage: result.nextPage
        });
    });
});

async function getLiveStreamKeys() {
    const {data} = await axios.get(`http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/api/streams`, {
        headers: { Authorization: config.rtmpServer.auth.header }
    });
    return data.live ? Object.getOwnPropertyNames(data.live) : [];
}

async function buildEventStageLivestream(eventStage) {
    let thumbnailURL;
    try {
        thumbnailURL = await getThumbnail(eventStage);
    } catch (err) {
        LOGGER.info('An error occurred when getting thumbnail for eventStage stream (_id: {}). ' +
            'Returning default thumbnail. Error: {}', eventStage._id, err);
        thumbnailURL = config.defaultThumbnailURL;
    }
    return {
        eventStageId: eventStage._id,
        stageName: eventStage.stageName,
        event: eventStage.event,
        title: eventStage.streamInfo.title,
        genre: eventStage.streamInfo.genre,
        category: eventStage.streamInfo.category,
        viewCount: eventStage.streamInfo.viewCount,
        startTime: eventStage.streamInfo.startTime,
        thumbnailURL
    };
}

router.get('/:streamKey/thumbnail', async (req, res) => {
    const streamKey = sanitise(req.params.streamKey);
    try {
        const streamer = await getStreamerByStreamKey(streamKey);
        const thumbnailURL = await getThumbnail(streamer);
        res.json({ thumbnailURL });
    } catch (err) {
        LOGGER.info('An error occurred when getting thumbnail for stream (stream key: {}). ' +
            'Returning default thumbnail. Error: {}', streamKey, err);
        res.json({
            thumbnailURL: config.defaultThumbnailURL
        });
    }
});

async function getStreamerByStreamKey(streamKey) {
    let streamer;
    try {
        streamer = await User.findOne({'streamInfo.streamKey': streamKey})
            .select('+streamInfo.streamKey streamInfo.thumbnailGenerationStatus')
            .exec();
    } catch (err) {
        LOGGER.error('An error occurred when finding user with stream key {}: {}', streamKey, err);
        throw err;
    }

    if (streamer) {
        return streamer;
    }

    try {
        streamer = await EventStage.findOne({'streamInfo.streamKey': streamKey})
            .select('+streamInfo.streamKey streamInfo.thumbnailGenerationStatus')
            .exec();
    } catch (err) {
        LOGGER.error('An error occurred when finding event stage with stream key {}: {}', streamKey, err);
        throw err;
    }

    if (!streamer) {
        throw new Error(`No user or event stage exists with stream key ${streamKey}`);
    }

    return streamer;
}

module.exports = router;