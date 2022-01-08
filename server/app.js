require('dotenv').config();

const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const Session = require('express-session');
const MongoStore = require('connect-mongo')(Session);
const bodyParser = require('body-parser');
const passport = require('./auth/passport');
const mongoose = require('mongoose');
const config = require('../mainroom.config');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const nodeMediaServer = require('./mediaServer');
const cronJobs = require('./cron/cronJobs');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const {User, RecordedStream, Event, EventStage} = require('./model/schemas');
const sanitise = require('mongo-sanitize');
const {getThumbnail} = require('./aws/s3ThumbnailGenerator');
const axios = require('axios');
const {startWebSocketServer} = require('./websocketServer');
const {setXSRFTokenCookie} = require('./middleware/setXSRFTokenCookie');
const snsErrorPublisher = require('./aws/snsErrorPublisher');
const LOGGER = require('../logger')('./server/app.js');

// in production environment, publish info about uncaught exceptions and unhandled promise rejections to SNS topic
if (process.env.NODE_ENV === 'production') {
    process.on('uncaughtException', async err => {
        try {
            LOGGER.error('An uncaught exception occurred: {}', err);
            await snsErrorPublisher.publish(err);
        } catch (publisherError) {
            LOGGER.error(`An error occurred when publishing info about an existing error '{}' to SNS. New error: {}`,
                err.name, publisherError);
        }
    });

    process.on('unhandledRejection', async reason => {
        const err = reason instanceof Error || (reason && reason.name && reason.message)
            ? reason : new Error(reason ? reason.toString() : 'An unhandled promise rejection occurred with no reason');
        try {
            LOGGER.error('An unhandled promise rejection occurred: {}', err);
            await snsErrorPublisher.publish(err);
        } catch (publisherError) {
            LOGGER.error(`An error occurred when publishing info about an unhandled promise rejection to SNS: {}`,
                publisherError.toString());
        }
    });
}

// connect to database
mongoose.connect(process.env.MONGODB_CONNECTION_STRING, {
    useNewUrlParser: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
    useCreateIndex: true
}, async err => {
    if (err) {
        LOGGER.error(`An error occurred when connecting to MongoDB database: {}`, err);
        return await snsErrorPublisher.publish(err);
    }
    LOGGER.info('Connected to MongoDB database');
});

// set up views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, './views'));
app.use(express.static('public'));
app.use(flash());

// set up cookies and CSRF token
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json({extended: true}));
app.use(csrf({cookie: true}))

// store session data in MongoDB
app.use(Session({
    store: new MongoStore({ mongooseConnection: mongoose.connection }),
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: false,
}));

// set up Passport for authentication
app.use(passport.initialize());
app.use(passport.session());

// apply rate limiter to all requests
app.use(rateLimit({
    windowMs: config.rateLimiter.windowMs,
    max: config.rateLimiter.maxRequests
}));

// Register app routes
app.use('/login', require('./routes/login'));
app.use('/register', require('./routes/register'));
app.use('/forgot-password', require('./routes/forgot-password'));
app.use('/api/users', require('./routes/users'));
app.use('/api/livestreams', require('./routes/livestreams'));
app.use('/api/scheduled-streams', require('./routes/scheduled-streams'));
app.use('/api/recorded-streams', require('./routes/recorded-streams'));
app.use('/api/events', require('./routes/events'));

app.get('/api/logged-in-user', (req, res) => {
    res.json(!req.user ? {} : {
        _id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName,
        profilePicURL: req.user.getProfilePicURL(),
        chatColour: req.user.chatColour
    });
});

app.get('/logout', (req, res) => {
    req.logout();
    return res.redirect('/');
});

/**
 * The following routes all point to the index view, which renders the React SPA,
 * but the purpose of the separate server side routes is to dynamically set open
 * graph meta tags for each page.
 */

app.get('/genre/:genre', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `${req.params.genre} Livestreams - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

app.get('/category/:category', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `${req.params.category} Livestreams - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

app.get('/search/:query', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `${req.params.query} - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

app.get('/events', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `Events - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    })
});

app.get('/event/:eventId', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    let imageURL;
    let imageAlt;

    try {
        const eventId = sanitise(req.params.eventId);
        const event = await Event.findById(eventId).select('eventName thumbnail.bucket thumbnail.key').exec();
        title = `${event.eventName} - ${siteName}`;
        imageURL = event.getThumbnailURL();
        imageAlt = `${event.eventName} Event Thumbnail`;
    } catch (err) {
        title = config.headTitle;
    }

    const params = {
        siteName, brandingURL, faviconURL, title, imageURL, imageAlt
    };
    if (imageURL && imageURL.startsWith('https')) {
        Object.assign(params, {secureImageURL: imageURL});
    }
    res.render('index', params);
});

app.get('/event/:eventId/subscribers', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    try {
        const eventId = sanitise(req.params.eventId);
        const event = await Event.findById(eventId).select('eventName').exec();
        title = `${event.eventName}'s Subscribers - ${siteName}`;
    } catch (err) {
        title = config.headTitle;
    }
    res.render('index', {siteName, brandingURL, faviconURL, title});
});

app.get('/stage/:eventStageId', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    let description;
    let imageURL;
    let imageAlt;
    let videoURL;
    let videoMimeType;
    let twitterCard;

    try {
        const eventStageId = sanitise(req.params.eventStageId);
        const eventStage = await EventStage.findById(eventStageId)
            .select( 'event stageName splashThumbnail.bucket splashThumbnail.key streamInfo.title +streamInfo.streamKey streamInfo.genre streamInfo.category streamInfo.thumbnailGenerationStatus')
            .populate({
                path: 'event',
                select: 'eventName'
            })
            .exec();
        const streamKey = eventStage.streamInfo.streamKey;
        const {data} = await axios.get(`http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/api/streams/live/${streamKey}`, {
            headers: { Authorization: config.rtmpServer.auth.header }
        });
        if (data.isLive) {
            title = [eventStage.event.eventName, eventStage.stageName, eventStage.streamInfo.title, siteName].filter(Boolean).join(' - ');
            description = `${eventStage.streamInfo.genre ? `${eventStage.streamInfo.genre} ` : ''}${eventStage.streamInfo.category || ''}`;
            try {
                imageURL = await getThumbnail(eventStage);
            } catch (err) {
                LOGGER.info('An error occurred when getting thumbnail for eventStage stream (_id: {}). ' +
                    'Returning splash thumbnail. Error: {}', eventStageId, err);
                imageURL = eventStage.getSplashThumbnailURL();
            }
            videoURL = process.env.NODE_ENV === 'production'
                ? `https://${config.storage.cloudfront.liveStreams}/${streamKey}/index.m3u8`
                : `http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/${process.env.RTMP_SERVER_APP_NAME}/${streamKey}/index.m3u8`;
            videoMimeType = 'application/x-mpegURL';
            twitterCard = 'player';
        } else {
            title = `${eventStage.event.eventName} - ${eventStage.stageName}`;
            imageURL = eventStage.getSplashThumbnailURL();
        }
        imageAlt = `${eventStage.stageName} Stage Thumbnail`;
    } catch (err) {
        title = config.headTitle;
    }

    const params = {
        siteName, brandingURL, faviconURL, title, description, imageURL, imageAlt, videoURL, videoMimeType, twitterCard
    };
    if (imageURL && imageURL.startsWith('https')) {
        Object.assign(params, {secureImageURL: imageURL});
    }
    if (videoURL && videoURL.startsWith('https')) {
        Object.assign(params, {secureVideoURL: videoURL});
    }
    res.render('index', params);
});

app.get('/user/:username', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    let description;
    try {
        const username = sanitise(req.params.username.toLowerCase());
        const user = await User.findOne({username: username}).select('displayName bio').exec();
        title = `${user.displayName || username} - ${siteName}`
        description = user.bio;
    } catch (err) {
        title = config.headTitle;
    }
    res.render('index', {siteName, brandingURL, faviconURL, title, description});
});

app.get('/user/:username/subscribers', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    try {
        const username = sanitise(req.params.username.toLowerCase());
        const user = await User.findOne({username: username}).select('displayName').exec();
        title = `${user.displayName || username}'s Subscribers - ${siteName}`
    } catch (err) {
        title = config.headTitle;
    }
    res.render('index', {siteName, brandingURL, faviconURL, title});
});

app.get('/user/:username/subscriptions', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    try {
        const username = sanitise(req.params.username.toLowerCase());
        const user = await User.findOne({username: username}).select( 'displayName').exec();
        title = `${user.displayName || username}'s Subscriptions - ${siteName}`
    } catch (err) {
        title = config.headTitle;
    }
    res.render('index', {siteName, brandingURL, faviconURL, title});
});

app.get('/user/:username/live', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    let description;
    let imageURL;
    let imageAlt;
    let videoURL;
    let videoMimeType;
    let twitterCard;

    try {
        const username = sanitise(req.params.username.toLowerCase());
        const user = await User.findOne({username})
            .select( 'displayName streamInfo.title +streamInfo.streamKey streamInfo.genre streamInfo.category streamInfo.thumbnailGenerationStatus')
            .exec();
        const streamKey = user.streamInfo.streamKey;
        const {data} = await axios.get(`http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/api/streams/live/${streamKey}`, {
            headers: { Authorization: config.rtmpServer.auth.header }
        });
        if (data.isLive) {
            title = [(user.displayName || username), user.streamInfo.title, siteName].filter(Boolean).join(' - ');
            description = `${user.streamInfo.genre ? `${user.streamInfo.genre} ` : ''}${user.streamInfo.category || ''}`;
            try {
                imageURL = await getThumbnail(user);
            } catch (err) {
                LOGGER.info('An error occurred when getting thumbnail for user stream (username: {}). ' +
                    'Returning default thumbnail. Error: {}', username, err);
                imageURL = config.defaultThumbnailURL;
            }
            imageAlt = `${username} Stream Thumbnail`;
            videoURL = process.env.NODE_ENV === 'production'
                ? `https://${config.storage.cloudfront.liveStreams}/${streamKey}/index.m3u8`
                : `http://localhost:${process.env.RTMP_SERVER_HTTP_PORT}/${process.env.RTMP_SERVER_APP_NAME}/${streamKey}/index.m3u8`;
            videoMimeType = 'application/x-mpegURL';
            twitterCard = 'player';
        } else {
            title = config.headTitle;
        }
    } catch (err) {
        title = config.headTitle;
    }

    const params = {
        siteName, brandingURL, faviconURL, title, description, imageURL, imageAlt, videoURL, videoMimeType, twitterCard
    };
    if (imageURL && imageURL.startsWith('https')) {
        Object.assign(params, {secureImageURL: imageURL});
    }
    if (videoURL && videoURL.startsWith('https')) {
        Object.assign(params, {secureVideoURL: videoURL});
    }
    res.render('index', params);
});

app.get('/stream/:streamId', setXSRFTokenCookie, async (req, res) => {
    const siteName = config.siteName;
    const brandingURL = config.brandingURL;
    const faviconURL = config.faviconURL;
    let title;
    let description;
    let imageURL;
    let imageAlt;
    let videoURL;
    let videoMimeType;
    let twitterCard;

    try {
        const streamId = sanitise(req.params.streamId);
        const stream = await RecordedStream.findById(streamId)
            .select('user title genre category video.bucket video.key thumbnail.bucket thumbnail.key')
            .populate({
                path: 'user',
                select: 'username displayName'
            })
            .exec();
        title = [(stream.user.displayName || stream.user.username), stream.title, siteName].filter(Boolean).join(' - ');
        description = `${stream.genre ? `${stream.genre} ` : ''}${stream.category || ''}`;
        imageURL = stream.getThumbnailURL() || config.defaultThumbnailURL;
        imageAlt = `${stream.user.username} Stream Thumbnail`;
        videoURL = stream.getVideoURL();
        videoMimeType = 'video/mp4';
        twitterCard = 'player';
    } catch (err) {
        title = config.headTitle;
    }

    const params = {
        siteName, brandingURL, faviconURL, title, description, imageURL, imageAlt, videoURL, videoMimeType, twitterCard
    };
    if (imageURL && imageURL.startsWith('https')) {
        Object.assign(params, {secureImageURL: imageURL});
    }
    if (videoURL && videoURL.startsWith('https')) {
        Object.assign(params, {secureVideoURL: videoURL});
    }
    res.render('index', params);
});

app.get('/manage-recorded-streams', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `Manage Recorded Streams - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

app.get('/schedule', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `Schedule - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

app.get('/settings', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `Settings - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

app.get('/go-live', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: `Stream Settings - ${config.siteName}`,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

app.get('*', setXSRFTokenCookie, (req, res) => {
    res.render('index', {
        siteName: config.siteName,
        title: config.headTitle,
        brandingURL: config.brandingURL,
        faviconURL: config.faviconURL
    });
});

// Register global error handler
app.use(async (err, req, res, next) => {
    // if non-production environment, send error to default Express error handler
    if (process.env.NODE_ENV !== 'production') {
        return next(err);
    }
    // if production environment, publish info about error to SNS topic
    try {
        await snsErrorPublisher.publish(err);
        next(err); // send error to default Express error handler which prints error to console and sends 500 response
    } catch (publisherError) {
        LOGGER.error(`An error occurred when publishing info about an existing error '{}' to SNS. New error: {}`,
            err.name || err.toString(), publisherError);
        next(publisherError);
    }
});

// Start HTTP and WebSocket server
const httpServer = http.createServer(app).listen(process.env.SERVER_HTTP_PORT, async () => {
    LOGGER.info('{} HTTP server listening on port: {}', config.siteName, httpServer.address().port);
    await startWebSocketServer(httpServer);
    LOGGER.info('{} WebSocket server listening on port: {}', config.siteName, httpServer.address().port);
});

// Start cron jobs only in first pm2 instance of mainroom app, or on non-production environment
if ((process.env.PM2_APP_NAME === 'mainroom' && process.env.NODE_APP_INSTANCE === process.env.MAIN_PM2_INSTANCE_ID)
    || process.env.NODE_ENV !== 'production') {
    cronJobs.startAll();
}

// Start RTMP server only in rtmpServer pm2 app (which should only contain 1 instance) or on non-production environment
if (process.env.PM2_APP_NAME === 'rtmpServer' || process.env.NODE_ENV !== 'production') {
    nodeMediaServer.run();
}

// On application shutdown, then disconnect from database and close servers
process.on('SIGINT', async () => {
    LOGGER.info('Gracefully shutting down application...');
    try {
        LOGGER.debug('Disconnecting from database');
        await mongoose.disconnect();
        LOGGER.info('Disconnected from database');

        LOGGER.debug('Closing servers');
        nodeMediaServer.stop();
        await closeServer();
        LOGGER.info('Servers closed');

        LOGGER.info('Application shut down successfully. Exiting process with exit code 0');
        process.exit(0);
    } catch (err) {
        LOGGER.error('An error occurred during application shutdown. Exiting process with exit code 1. Error: {}', err);
        process.exit(1);
    }
});

function closeServer() {
    return new Promise((resolve, reject) => {
        httpServer.close(err => {
            if (err) {
                LOGGER.error('An error occurred when closing HTTP server: {}', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}
