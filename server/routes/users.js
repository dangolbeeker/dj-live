const express = require('express');
const router = express.Router();
const config = require('../../mainroom.config');
const {User, ScheduledStream, Event} = require('../model/schemas');
const loginChecker = require('connect-ensure-login');
const sanitise = require('mongo-sanitize');
const escape = require('escape-html');
const multer = require('multer');
const multerS3 = require('multer-s3');
const S3V2ToV3Bridge = require('../aws/s3-v2-to-v3-bridge');
const mime = require('mime-types');
const {validatePassword, getInvalidPasswordMessage} = require('../auth/passwordValidator');
const _ = require('lodash');
const axios = require('axios');
const mainroomEventBus = require('../mainroomEventBus');
const normalizeUrl = require('normalize-url');
const {isAuthorised} = require('../middleware/isAuthorised');
const {deleteObject} = require('../aws/s3Utils');
const LOGGER = require('../../logger')('./server/routes/users.js');

const RTMP_SERVER_RTMP_PORT = process.env.RTMP_SERVER_RTMP_PORT !== '1935' ? `:${process.env.RTMP_SERVER_RTMP_PORT}` : '';
const RTMP_SERVER_URL = `rtmp://${process.env.NODE_ENV === 'production' ? process.env.SERVER_HOST : 'localhost'}`
    + `${RTMP_SERVER_RTMP_PORT}/${process.env.RTMP_SERVER_APP_NAME}`;

router.get('/', (req, res, next) => {
    const sanitisedQuery = sanitise(req.query.searchQuery);
    const escapedQuery = _.escapeRegExp(sanitisedQuery)
    const searchQuery = new RegExp(escapedQuery, 'i');

    const query = {
        $or: [
            {username: searchQuery},
            {displayName: searchQuery}
        ]
    };

    const options = {
        page: req.query.page,
        limit: req.query.limit,
        select: 'username displayName profilePic.bucket profilePic.key',
    };

    User.paginate(query, options, (err, result) => {
        if (err) {
            LOGGER.error('An error occurred when finding users: {}', err);
            next(err);
        } else {
            res.json({
                users: result.docs.map(user => ({
                    username: user.username,
                    displayName: user.displayName,
                    profilePicURL: user.getProfilePicURL()
                })),
                nextPage: result.nextPage
            });
        }
    });
});

router.get('/:username', (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    User.findOne({username: username}, 'username displayName profilePic.bucket profilePic.key location bio chatColour links subscribers')
        .exec((err, user) => {
            if (err) {
                LOGGER.error('An error occurred when finding user {}: {}', username, err);
                next(err);
            } else if (!user) {
                res.status(404).send(`User (username: ${escape(username)}) not found`);
            } else {
                res.json({
                    username: user.username,
                    profilePicURL: user.getProfilePicURL() || config.defaultProfilePicURL,
                    displayName: user.displayName,
                    location: user.location,
                    bio: user.bio,
                    chatColour: user.chatColour,
                    links: user.links,
                    numOfSubscribers: user.subscribers.length
                });
            }
        });
});

router.patch('/:username', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const updateQuery = {};

    if (req.body.displayName) {
        const displayName = sanitise(req.body.displayName);
        const displayNameMaxLength = config.validation.profile.displayNameMaxLength;
        if (displayName.length > displayNameMaxLength) {
            return res.status(403).send(`Length of displayName was greater than the maximum allowed length of ${displayNameMaxLength}`);
        }
        updateQuery.displayName = displayName;
    }
    if (req.body.location) {
        const location = sanitise(req.body.location);
        const locationMaxLength = config.validation.profile.locationMaxLength;
        if (location.length > locationMaxLength) {
            return res.status(403).send(`Length of location was greater than the maximum allowed length of ${locationMaxLength}`);
        }
        updateQuery.location = location;
    }
    if (req.body.bio) {
        const bio = sanitise(req.body.bio);
        const bioMaxLength = config.validation.profile.bioMaxLength;
        if (bio.length > bioMaxLength) {
            return res.status(403).send(`Length of bio was greater than the maximum allowed length of ${bioMaxLength}`);
        }
        updateQuery.bio = bio;
    }
    if (req.body.chatColour) {
        updateQuery.chatColour = sanitise(req.body.chatColour);
    }
    if (req.body.links && Array.isArray(req.body.links)) {
        const sanitisedLinks = sanitise(req.body.links);
        const linkTitleMaxLength = config.validation.profile.linkTitleMaxLength;
        const normalisedLinks = [];
        const indexesOfInvalidLinks = []
        sanitisedLinks.forEach((link, index) => {
            if (link.title.length > linkTitleMaxLength) {
                return res.status(403).send(`Length of a link's title was greater than the maximum allowed length of ${linkTitleMaxLength}`);
            }
            try {
                link.url = normalizeUrl(link.url, {
                    forceHttps: true,
                    stripWWW: false
                });
                normalisedLinks.push(link);
            } catch (err) {
                if (err.message.startsWith('Invalid URL') || err.message.startsWith('`view-source:`')) {
                    indexesOfInvalidLinks.push(index);
                } else {
                    LOGGER.error('An error occurred whilst validating URL: {}', url);
                    throw err;
                }
            }
        });
        if (indexesOfInvalidLinks.length) {
            return res.status(400).json({indexesOfInvalidLinks});
        }
        updateQuery.links = normalisedLinks;
    }

    const username = sanitise(req.params.username.toLowerCase());
    User.findOneAndUpdate({username}, updateQuery, {new: true},(err, user) => {
        if (err) {
            LOGGER.error('An error occurred when updating user {}: {}', username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            res.sendStatus(200);
        }
    })
});

router.post('/:username/chat-colour', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    User.findOneAndUpdate({
        username
    }, {
        'chatColour': User.getRandomChatColour()
    }, {
        new: true
    }, (err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when updating user {}'s chat colour: {}`, username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            res.json({
                chatColour: user.chatColour
            });
        }
    });
});

const s3UploadProfilePic = multer({
    storage: multerS3({
        s3: new S3V2ToV3Bridge(),
        bucket: config.storage.s3.staticContent.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, undefined); // set metadata explicitly to undefined
        },
        key: (req, file, cb) => {
            const path = config.storage.s3.staticContent.keyPrefixes.profilePics;
            const userId = sanitise(req.params.userId);
            const extension = mime.extension(file.mimetype);
            cb(null, `${path}/${userId}/${Date.now()}.${extension}`);
        }
    })
}).single(config.storage.formDataKeys.profilePic);

router.put('/:userId/profile-pic', loginChecker.ensureLoggedIn(), isAuthorised, async (req, res, next) => {
    const userId = sanitise(req.params.userId);

    if (userId) {
        let user;
        try {
            user = await User.findById(userId).select('profilePic.bucket profilePic.key').exec();
            if (!user) {
                return res.status(404).send(`User (_id: ${escape(userId)}) not found`);
            }
        } catch (err) {
            LOGGER.error(`An error occurred when finding User with id '{}': {}`, userId, err);
            return next(err);
        }

        s3UploadProfilePic(req, res, async err => {
            if (err) {
                LOGGER.error('An error occurred when uploading profile pic to S3 for user {}: {}', userId, err);
                return next(err);
            }
            try {
                const promises = [];
                // delete old profile pic if not default
                if (!(user.profilePic.bucket === config.storage.s3.defaultProfilePic.bucket
                    && user.profilePic.key === config.storage.s3.defaultProfilePic.key)) {
                    promises.push(deleteObject({
                        Bucket: user.profilePic.bucket,
                        Key: user.profilePic.key
                    }));
                }
                user.profilePic = {
                    bucket: req.file.bucket,
                    key: req.file.key
                };
                promises.push(user.save());
                await Promise.all(promises);
                res.sendStatus(200);
            } catch (err) {
                LOGGER.error('An error occurred when updating profile pic info for user (_id: {}): {}', userId, err);
                next(err);
            }
        });
    }
});

router.get('/:userId/profile-pic', (req, res, next) => {
    const userId = sanitise(req.params.userId);
    User.findById(userId, 'profilePic.bucket profilePic.key', (err, user) => {
        if (err) {
            LOGGER.error('An error occurred when finding user with _id {}: {}', userId, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (_id: ${escape(userId)}) not found`);
        } else {
            res.json({
                profilePicURL: user.getProfilePicURL() || config.defaultProfilePicURL
            })
        }
    })
});

const getSubscribersOrSubscriptions = key => async (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());

    if (!req.query.limit && !req.query.page) {
        let user;
        try {
            user = await User.findOne({username})
                .select(key)
                .populate({
                    path: `${key}.user`,
                    select: 'username'
                })
                .exec();
        } catch (err) {
            LOGGER.error(`An error occurred when getting {} for user with username '{}': {}`, key, username, err);
            return next(err);
        }

        if (!user) {
            return res.status(404).send(`User (username: ${escape(username)}) not found`);
        }

        return res.json({
            [key]: (user[key] || []).map(sub => sub.user.username)
        });
    }

    // count number of subscribers for calculating 'nextPage' pagination property on result JSON
    let result;
    try {
        result = await User.aggregate([
            {
                $match: {username}
            },
            {
                $project: {count: {$size: '$' + key}}
            }
        ]).exec();
    } catch (err) {
        LOGGER.error(`An error occurred when counting number of {} for user with username '{}': {}`, key, username, err);
        return next(err);
    }

    if (result && result.length === 1) {
        result = result[0];
    }

    if (!result || !result.count) {
        return res.json({
            [key]: [],
            nextPage: null
        });
    }

    // populate subscribers/subscriptions, paginated
    const limit = req.query.limit
    const page = req.query.page;
    const pages = Math.ceil(result.count / limit);
    const skip = (page - 1) * limit;

    let user;
    try {
        user = await User.findOne({username})
            .select(key)
            .populate({
                path: `${key}.user`,
                select: 'username profilePic.bucket profilePic.key',
                skip,
                limit
            })
            .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when getting {} for user with username '{}': {}`, key, username, err);
        return next(err);
    }

    if (!user) {
        return res.status(404).send(`User (username: ${escape(username)}) not found`);
    }

    res.json({
        [key]: (user[key] || []).map(sub => ({
            username: sub.user.username,
            profilePicURL: sub.user.getProfilePicURL() || config.defaultProfilePicURL
        })),
        nextPage: page < pages ? page + 1 : null
    });
}

router.get('/:username/subscribers', getSubscribersOrSubscriptions('subscribers'));

router.get('/:username/subscriptions', getSubscribersOrSubscriptions('subscriptions'));

router.get('/:username/subscribed-events', async (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());

    let user;
    try {
        user = await User.findOne({username})
            .select('subscribedEvents')
            .populate({
                path: `subscribedEvents.event`,
                select: '_id'
            })
            .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when getting subscribed events for user with username '{}': {}`, username, err);
        return next(err);
    }

    if (!user) {
        return res.status(404).send(`User (username: ${escape(username)}) not found`);
    }

    res.json({
        subscribedEventIds: (user.subscribedEvents || []).map(sub => sub.event._id)
    });
});

router.get('/:username/subscribed-to/:otherUsername', (req, res, next) => {
    const otherUsername = sanitise(req.params.otherUsername.toLowerCase());
    User.findOne({username: otherUsername}, 'subscribers', (err, otherUser) => {
        if (err) {
            LOGGER.error('An error occurred when finding user {}: {}', otherUsername, err);
            next(err);
        } else if (!otherUser) {
            res.status(404).send(`User (username: ${escape(otherUsername)}) not found`);
        } else {
            const username = sanitise(req.params.username.toLowerCase());
            User.findOne({username}, '_id', (err, user) => {
                if (err) {
                    LOGGER.error('An error occurred when finding user {}: {}', username, err);
                    next(err);
                } else if (!user) {
                    res.status(404).send(`User (username: ${escape(username)}) not found`);
                } else {
                    const isSubscribed = otherUser.subscribers.some(sub => _.isEqual(sub.user, user._id));
                    res.send(isSubscribed);
                }
            });
        }
    });
});

router.get('/:userId/subscribed-to-event/:eventId', async (req, res, next) => {
    const userId = sanitise(req.params.userId);
    const eventId = sanitise(req.params.eventId);

    let user;
    try {
        user = await User.findById(userId).select('subscribedEvents').exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding User with id '{}': {}`, userId, err);
        return next(err);
    }
    if (!user) {
        return res.status(404).send(`User (_id: ${escape(userId)}) not found`);
    }

    const isSubscribed = user.subscribedEvents.some(sub => sub.event.toString() === eventId);
    res.send(isSubscribed);
});

router.post('/:username/subscribe/:userToSubscribeTo', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    User.findOne({username: username}, '_id', (err, user) => {
        if (err) {
            LOGGER.error('An error occurred when finding user {}: {}', username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            const usernameToSubscribeTo = sanitise(req.params.userToSubscribeTo.toLowerCase())
            User.findOne({username: usernameToSubscribeTo}, 'subscribers',(err, userToSubscribeTo) => {
                if (err) {
                    LOGGER.error('An error occurred when finding user {}: {}', usernameToSubscribeTo, err);
                    next(err);
                } else if (!userToSubscribeTo) {
                    res.status(404).send(`User (username: ${escape(usernameToSubscribeTo)}) not found`);
                } else {
                    const isAlreadySubscribed = userToSubscribeTo.subscribers.some(sub => _.isEqual(sub.user, user._id));
                    if (!isAlreadySubscribed) {
                        userToSubscribeTo.updateOne({$push: {subscribers: {user: user._id}}}, err => {
                            if (err) {
                                LOGGER.error(`An error occurred when adding user {} to user {}'s subscribers: {}`,
                                    username, usernameToSubscribeTo, err);
                                next(err);
                            } else {
                                user.updateOne({$push: {subscriptions: {user: userToSubscribeTo._id}}}, err => {
                                    if (err) {
                                        LOGGER.error(`An error occurred when adding user {} to user {}'s subscriptions: {}`,
                                            usernameToSubscribeTo, username, err);
                                        next(err);
                                    } else {
                                        res.sendStatus(200);
                                    }
                                });
                            }
                        });
                    } else {
                        res.sendStatus(200);
                    }
                }
            });
        }
    });
});

router.post('/:userId/subscribe-to-event/:eventId', async (req, res, next) => {
    const userId = sanitise(req.params.userId);
    let user;
    try {
        user = await User.findById(userId).select('_id').exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding User with id '{}': {}`, userId, err);
        return next(err);
    }
    if (!user) {
        return res.status(404).send(`User (_id: ${escape(userId)}) not found`);
    }

    const eventId = sanitise(req.params.eventId);
    let event;
    try {
        event = await Event.findById(eventId).select('_id subscribers').exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }
    if (!event) {
        return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
    }


    const isAlreadySubscribed = event.subscribers.some(sub => _.isEqual(sub.user, user._id));
    if (!isAlreadySubscribed) {
        try {
            await event.updateOne({$push: {subscribers: {user: user._id}}}).exec();
        } catch (err) {
            LOGGER.error(`An error occurred when adding User (_id: {}) to Event's (_id: {}) subscribers: {}`,
                userId, eventId, err);
            return next(err);
        }
        try {
            await user.updateOne({$push: {subscribedEvents: {event: event._id}}}).exec();
        } catch (err) {
            LOGGER.error(`An error occurred when adding Event (_id: {}) to User's (_id: {}) subscriptions: {}`,
                eventId, userId, err);
            return next(err);
        }
    }

    res.sendStatus(200);
});

router.post('/:username/unsubscribe/:userToUnsubscribeFrom', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    User.findOne({username}, (err, user) => {
        if (err) {
            LOGGER.error('An error occurred when finding user {}: {}', username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            const usernameToUnsubscribeFrom = sanitise(req.params.userToUnsubscribeFrom.toLowerCase())
            User.findOne({username: usernameToUnsubscribeFrom}, 'subscribers', (err, userToUnsubscribeFrom) => {
                if (err) {
                    LOGGER.error('An error occurred when finding user {}: {}', usernameToUnsubscribeFrom, err);
                    next(err);
                } else if (!userToUnsubscribeFrom) {
                    res.status(404).send(`User (username: ${escape(usernameToUnsubscribeFrom)}) not found`);
                } else {
                    const isSubscribed = userToUnsubscribeFrom.subscribers.some(sub => _.isEqual(sub.user, user._id));
                    if (isSubscribed) {
                        userToUnsubscribeFrom.updateOne({$pull: {subscribers: {user: user._id}}}, err => {
                            if (err) {
                                LOGGER.error(`An error occurred when removing user {} from user {}'s subscribers: {}`,
                                    username, userToUnsubscribeFrom, err);
                                next(err);
                            } else {
                                user.updateOne({$pull: {subscriptions: {user: userToUnsubscribeFrom._id}}}, err => {
                                    if (err) {
                                        LOGGER.error(`An error occurred when removing user {} from user {}'s subscriptions: {}`,
                                            userToUnsubscribeFrom, username, err);
                                        next(err);
                                    } else {
                                        res.sendStatus(200);
                                    }
                                });
                            }
                        });
                    } else {
                        res.sendStatus(200);
                    }
                }
            });
        }
    });
});

router.post('/:userId/unsubscribe-from-event/:eventId', async (req, res, next) => {
    const userId = sanitise(req.params.userId);
    let user;
    try {
        user = await User.findById(userId).select('_id').exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding User with id '{}': {}`, userId, err);
        return next(err);
    }
    if (!user) {
        return res.status(404).send(`User (_id: ${escape(userId)}) not found`);
    }

    const eventId = sanitise(req.params.eventId);
    let event;
    try {
        event = await Event.findById(eventId).select('_id subscribers').exec();
    } catch (err) {
        LOGGER.error(`An error occurred when finding Event with id '{}': {}`, eventId, err);
        return next(err);
    }
    if (!event) {
        return res.status(404).send(`Event (_id: ${escape(eventId)}) not found`);
    }


    const isSubscribed = event.subscribers.some(sub => _.isEqual(sub.user, user._id));
    if (isSubscribed) {
        try {
            await event.updateOne({$pull: {subscribers: {user: user._id}}}).exec();
        } catch (err) {
            LOGGER.error(`An error occurred when removing User (_id: {}) from Event's (_id: {}) subscribers: {}`,
                userId, eventId, err);
            return next(err);
        }
        try {
            await user.updateOne({$pull: {subscribedEvents: {event: event._id}}}).exec();
        } catch (err) {
            LOGGER.error(`An error occurred when removing Event (_id: {}) from User's (_id: {}) subscriptions: {}`,
                eventId, userId, err);
            return next(err);
        }
    }

    res.sendStatus(200);
});

router.get('/:username/stream-info', async (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    try {
        const user = await User.findOne({username})
            .select('displayName profilePic.bucket profilePic.key +streamInfo.streamKey streamInfo.title streamInfo.genre streamInfo.category streamInfo.tags streamInfo.viewCount streamInfo.startTime')
            .exec();

        if (!user) {
            return res.status(404).send(`User (username: ${escape(username)}) not found`);
        }

        const streamKey = user.streamInfo.streamKey;
        const {data: {isLive}} = await axios.get(`http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/api/streams/live/${streamKey}`, {
            headers: {Authorization: config.rtmpServer.auth.header}
        });

        const liveStreamURL = process.env.NODE_ENV === 'production'
            ? `https://${config.storage.cloudfront.liveStreams}/${streamKey}/index.m3u8`
            : `http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/${process.env.RTMP_SERVER_APP_NAME}/${streamKey}/index.m3u8`;

        const socketIOURL = (process.env.NODE_ENV === 'production' ? 'https' : 'http')
            + `://${process.env.SERVER_HOST}:${process.env.SOCKET_IO_PORT}?liveStreamUsername=${username}`;

        res.json({
            isLive,
            streamKey,
            displayName: user.displayName,
            profilePicURL: user.getProfilePicURL() || config.defaultProfilePicURL,
            title: user.streamInfo.title,
            genre: user.streamInfo.genre,
            category: user.streamInfo.category,
            tags: user.streamInfo.tags,
            viewCount: user.streamInfo.viewCount,
            startTime: user.streamInfo.startTime,
            rtmpServerURL: RTMP_SERVER_URL,
            liveStreamURL,
            socketIOURL
        });
    } catch (err) {
        LOGGER.error(`An error occurred when finding user {}'s stream info: {}`, username, err);
        next(err);
    }
});

router.patch('/:username/stream-info', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    const sanitisedInput = sanitise(req.body);

    const titleMaxLength = config.validation.streamSettings.titleMaxLength
    if (sanitisedInput.title > titleMaxLength) {
        return res.status(403).send(`Length of title was greater than the maximum allowed length of ${titleMaxLength}`);
    }
    const tagsMaxAmount = config.validation.streamSettings.tagsMaxAmount;
    if (sanitisedInput.tags.length > tagsMaxAmount) {
        return res.status(403).send(`Number of tags was greater than the maximum allowed amount of ${tagsMaxAmount}`);
    }

    User.findOneAndUpdate({
        username
    }, {
        'streamInfo.title': sanitisedInput.title,
        'streamInfo.genre': sanitisedInput.genre,
        'streamInfo.category': sanitisedInput.category,
        'streamInfo.tags': sanitisedInput.tags
    }, {
        new: true,
    }, (err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when updating user {}'s stream info: {}`, username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            const streamInfo = {
                title: user.streamInfo.title,
                genre: user.streamInfo.genre,
                category: user.streamInfo.category
            };
            mainroomEventBus.send('streamInfoUpdated', Object.assign(streamInfo, {username}));
            res.json(Object.assign(streamInfo, {tags: user.streamInfo.tags}));
        }
    });
});

router.post('/:username/stream-key', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    User.findOneAndUpdate({
        username: username
    }, {
        'streamInfo.streamKey': User.generateStreamKey()
    }, {
        new: true
    }, (err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when updating user {}'s stream key: {}`, username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            res.json({
                streamKey: user.streamInfo.streamKey
            });
        }
    });
});

router.get('/:username/schedule', async (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());

    let user;
    try {
        user = await User.findOne({username})
            .select('subscriptions nonSubscribedScheduledStreams subscribedEvents')
            .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when getting finding user {}: {}`, username, err);
        return next(err);
    }
    if (!user) {
        return res.status(404).send(`User (username: ${escape(username)}) not found`);
    }

    const eventStageIds = [];
    const eventIds = user.subscribedEvents.map(sub => sub.event._id);
    if (eventIds.length) {
        try {
            const events = await Event.find({_id: {$in: eventIds}})
                .select('stages')
                .populate({
                    path: 'stages',
                    select: '_id'
                })
                .exec()

            events.forEach(event => {
                if (event.stages && event.stages.length) {
                    const currentEventStageIds = event.stages.map(eventStage => eventStage._id);
                    eventStageIds.push(...currentEventStageIds);
                }
            });
        } catch (err) {
            LOGGER.error(`An error occurred when getting finding _id's of EventStages: {}`, err);
            return next(err);
        }
    }

    let scheduledStreams;
    const subscriptionsIds = user.subscriptions.map(sub => sub.user._id);
    try {
        scheduledStreams = await ScheduledStream.find({
            $or: [
                {user: {$in: [user._id, ...subscriptionsIds]}},
                {_id: {$in: user.nonSubscribedScheduledStreams}},
                {eventStage: {$in: eventStageIds}}
            ],
            startTime: {$lte: req.query.scheduleEndTime},
            endTime: {$gte: req.query.scheduleStartTime}
        })
        .select('user eventStage title startTime endTime genre category')
        .populate({
            path: 'user',
            select: '_id username displayName profilePic.bucket profilePic.key'
        })
        .populate({
            path: 'eventStage',
            select: 'event stageName',
            populate: {
                path: 'event',
                select: '_id eventName'
            }
        })
        .exec();
    } catch (err) {
        LOGGER.error(`An error occurred when getting User's (username :{}) schedule: {}`, username, err);
        return next(err);
    }

    const scheduleGroups = [{
        id: 0,
        title: 'My Streams'
    }];
    const scheduleItems = [];

    if (scheduledStreams && scheduledStreams.length) {
        const scheduleGroupTitlesToIds = new Map();
        scheduleGroupTitlesToIds.set(username, 0);

        scheduledStreams.forEach(scheduledStream => {
            const scheduledGroupTitle = scheduledStream.eventStage
                ? `${scheduledStream.eventStage.stageName} (${scheduledStream.eventStage.event.eventName})`
                : scheduledStream.user.username;

            let scheduleGroupId;
            if (scheduleGroupTitlesToIds.has(scheduledGroupTitle)) {
                // if schedule group already exists for given title, get its ID
                scheduleGroupId = scheduleGroupTitlesToIds.get(scheduledGroupTitle);
            } else {
                // if schedule group does not exist for given title, create one
                scheduleGroupId = scheduleGroups.length;
                scheduleGroupTitlesToIds.set(scheduledGroupTitle, scheduleGroupId);
                scheduleGroups.push({
                    id: scheduleGroupId,
                    title: scheduledGroupTitle
                });
            }

            const scheduleItem = {
                _id: scheduledStream._id,
                id: scheduleItems.length,
                group: scheduleGroupId,
                title: scheduledStream.title || scheduledGroupTitle,
                start_time: scheduledStream.startTime,
                end_time: scheduledStream.endTime,
                genre: scheduledStream.genre,
                category: scheduledStream.category,
                isNonSubscribed: user.nonSubscribedScheduledStreams.includes(scheduledStream._id),
                user: {
                    _id: scheduledStream.user._id
                }
            };

            if (scheduledStream.eventStage) {
                scheduleItem.event = {
                    _id: scheduledStream.eventStage.event._id,
                    eventName: scheduledStream.eventStage.event.eventName,
                    stageName: scheduledStream.eventStage.stageName
                };
            } else {
                scheduleItem.user.username = scheduledStream.user.username;
                scheduleItem.user.displayName = scheduledStream.user.displayName;
                scheduleItem.user.profilePicURL = scheduledStream.user.getProfilePicURL();
            }

            scheduleItems.push(scheduleItem);
        });
    }

    res.json({
        scheduleGroups,
        scheduleItems
    });
});

router.get('/:username/schedule/non-subscribed', (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    const scheduledStreamUsername = sanitise(req.query.scheduledStreamUsername.toLowerCase());
    User.findOne({username})
        .select('nonSubscribedScheduledStreams')
        .populate({
            path: 'nonSubscribedScheduledStreams',
            select: 'user',
            populate: {
                path: 'user',
                select: 'username',
                match: {
                    username: scheduledStreamUsername
                }
            }
        })
        .exec((err, user) => {
            if (err) {
                LOGGER.error(`An error occurred when retrieving non-subscribed scheduled streams for user {}: {}`,
                    username, err);
                next(err);
            } else if (!user) {
                res.status(404).send(`User (username: ${escape(username)}) not found`);
            } else {
                res.json({
                    nonSubscribedScheduledStreams: user.nonSubscribedScheduledStreams.map(s => s._id)
                })
            }
        });
});

router.patch('/:username/schedule/add-non-subscribed/:scheduledStreamId', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    const scheduledStreamId = sanitise(req.params.scheduledStreamId);
    User.findOneAndUpdate({
        username
    }, {
        $push: {nonSubscribedScheduledStreams: scheduledStreamId}
    }, (err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when adding non-subscribed scheduled stream (ID: {}) to user {}'s schedule: {}`,
                scheduledStreamId, username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            res.sendStatus(200);
        }
    });
});

router.patch('/:username/schedule/remove-non-subscribed/:scheduledStreamId', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const username = sanitise(req.params.username.toLowerCase());
    const scheduledStreamId = sanitise(req.params.scheduledStreamId);
    User.findOneAndUpdate({
        username
    }, {
        $pull: {nonSubscribedScheduledStreams: scheduledStreamId}
    }, (err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when removing non-subscribed scheduled stream (ID: {}) to user {}'s schedule: {}`,
                scheduledStreamId, username, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(username)}) not found`);
        } else {
            res.sendStatus(200);
        }
    });
});

router.get('/:userId/settings', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const userId = sanitise(req.params.userId);
    User.findById(userId, 'username email emailSettings').exec((err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when finding user with _id {}: {}`, userId, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(userId)}) not found`);
        } else {
            res.json({
                username: user.username,
                email: user.email,
                emailSettings: user.emailSettings
            });
        }
    });
});

router.patch('/:userId/settings', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const findQuery = {$or: []};
    const updateQuery = {};

    let isUpdatingUsernameOrEmail = false;

    const username = sanitise(req.body.username.toLowerCase());
    const email = sanitise(req.body.email);

    if (req.body.updateUsername) {
        findQuery.$or.push({username: username});
        updateQuery.username = username;
        isUpdatingUsernameOrEmail = true;
    }
    if (req.body.updateEmail) {
        findQuery.$or.push({email: email});
        updateQuery.email = email;
        isUpdatingUsernameOrEmail = true
    }
    if (req.body.emailSettings) {
        Object.entries(req.body.emailSettings).forEach(entry => {
            updateQuery[`emailSettings.${entry[0]}`] = entry[1];
        });
    }

    if (isUpdatingUsernameOrEmail) {
        User.find(findQuery, 'username email', (err, users) => {
            if (err) {
                LOGGER.error(`An error occurred when finding users with query {}: {}`, JSON.stringify(findQuery), err);
                next(err);
            } else if (users) {
                const invalidReasons = {};
                for (const user of users) {
                    if (user.email === email) {
                        invalidReasons.emailInvalidReason = 'Email is already taken';
                    }
                    if (user.username === username) {
                        invalidReasons.usernameInvalidReason = 'Username is already taken';
                    }
                }
                if (invalidReasons.emailInvalidReason || invalidReasons.usernameInvalidReason) {
                    res.json(invalidReasons);
                } else {
                    updateUserSettings(updateQuery, req, res, next);
                }
            }
        });
    } else {
        updateUserSettings(updateQuery, req, res, next);
    }
});

function updateUserSettings(updateQuery, req, res, next) {
    const userId = sanitise(req.params.userId);
    User.findByIdAndUpdate(userId, updateQuery, (err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when updating user settings for user with _id {}: {}`, userId, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (_id: ${escape(userId)}) not found`);
        } else {
            res.sendStatus(200);
        }
    });
}

router.post('/:userId/password', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const userId = sanitise(req.params.userId);
    User.findById(userId).select('+password').exec((err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when finding user with _id {}: {}`, userId, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (_id: ${escape(userId)}) not found`);
        } else {
            if (!user.checkPassword(req.body.currentPassword)) {
                res.json({
                    currentPasswordInvalidReason: 'Password incorrect'
                });
            } else if (user.checkPassword(req.body.newPassword)) {
                res.json({
                    newPasswordInvalidReason: 'New password cannot be the same as current password'
                });
            } else if (!validatePassword(req.body.newPassword)) {
                res.json({
                    newPasswordInvalidReason: getInvalidPasswordMessage()
                });
            } else if (req.body.newPassword !== req.body.confirmNewPassword) {
                res.json({
                    confirmNewPasswordInvalidReason: 'Passwords do not match'
                });
            } else {
                user.password = User.generateHash(req.body.newPassword);
                user.save(err => {
                    if (err) {
                        LOGGER.error(`An error occurred when updating password for user with _id {}: {}`, userId, err);
                        next(err);
                    } else {
                        res.sendStatus(200);
                    }
                });
            }
        }
    });
});

router.delete('/:userId', loginChecker.ensureLoggedIn(), isAuthorised, (req, res, next) => {
    const userId = sanitise(req.params.userId);
    User.findById(userId, (err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when finding user (_id: {}) in database: {}`, userId, err);
            next(err);
        } else if (!user) {
            res.status(404).send(`User (username: ${escape(userId)}) not found`);
        } else {
            req.logout()
            User.findByIdAndDelete(userId, err => {
                if (err) {
                    LOGGER.error(`An error occurred when deleting user (_id: {}) from database: {}`, userId, err);
                    next(err);
                } else {
                    res.sendStatus(200);
                }
            })
        }
    });
});



module.exports = router;