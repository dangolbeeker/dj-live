const NodeMediaServer = require('node-media-server');
const config = require('../mainroom.config');
const {User, RecordedStream, EventStage} = require('./model/schemas');
const mainroomEventBus = require('./mainroomEventBus');
const {generateStreamThumbnail} = require('../server/aws/s3ThumbnailGenerator');
const {uploadVideoToS3} = require('../server/aws/s3VideoUploader');
const path = require('path');
const fs = require('fs').promises;
const sesEmailSender = require('./aws/sesEmailSender');
const CompositeError = require('./errors/CompositeError');
const {spawn} = require('child_process');
const snsErrorPublisher = require('./aws/snsErrorPublisher');
const LOGGER = require('../logger')('./server/mediaServer.js');

const EXPECTED_APP_NAME = `/${process.env.RTMP_SERVER_APP_NAME}`;
const IS_RECORDING_TO_MP4 = config.rtmpServer.trans.tasks.some(task => task.mp4);

const nms = new NodeMediaServer(config.rtmpServer);

nms.on('prePublish', async (sessionId, streamPath) => {
    const {app, streamKey} = extractAppAndStreamKey(streamPath);

    if (app !== EXPECTED_APP_NAME) {
        nms.getSession(sessionId).reject();
        LOGGER.info(`A stream session (ID: {}) was rejected because it was targeting the wrong app ('{}' instead of '{}')`,
            sessionId, app, EXPECTED_APP_NAME);
        return;
    }

    let user;
    try {
        user = await getUserPrePublish(streamKey);
    } catch (err) {
        LOGGER.error('An error occurred when finding user with stream key {}: {}', streamKey, err);
        return await snsErrorPublisher.publish(err);
    }

    if (user) {
        try {
            // reset view counts before starting stream. These counts will be updated in websocketServer
            user.streamInfo.viewCount = 0;
            user.streamInfo.cumulativeViewCount = 0;
            user.streamInfo.startTime = new Date();
            await user.save();
        } catch (err) {
            LOGGER.error('An error occurred when updating view counts and start time for user (username: {}): {}',
                user.username, err);
            return await snsErrorPublisher.publish(err);
        }

        mainroomEventBus.send('streamStarted', user.username);
        mainroomEventBus.send(`streamStarted_${streamKey}`);
        if (config.email.enabled) {
            sesEmailSender.notifySubscribersUserWentLive(user);
        }
        return;
    }

    let eventStage;
    try {
        eventStage = await getEventStagePrePublish(streamKey);
    } catch (err) {
        LOGGER.error('An error occurred when finding event stage with stream key {}: {}', streamKey, err);
        return await snsErrorPublisher.publish(err);
    }

    if (eventStage) {
        try {
            // reset view counts before starting stream. These counts will be updated in websocketServer
            eventStage.streamInfo.viewCount = 0;
            eventStage.streamInfo.cumulativeViewCount = 0;
            eventStage.streamInfo.startTime = new Date();
            await eventStage.save();
        } catch (err) {
            LOGGER.error(`An error occurred when updating view counts and start time for event stage '{} - {}': {}`,
                eventStage.event.eventName, eventStage.stageName, err);
            return await snsErrorPublisher.publish(err);
        }

        mainroomEventBus.send('streamStarted', eventStage._id);
        mainroomEventBus.send(`streamStarted_${streamKey}`);
        return;
    }

    nms.getSession(sessionId).reject();
    LOGGER.info('A stream session (ID: {}) was rejected because no user or event stage exists with stream key {}',
        sessionId, streamKey);
});

async function getUserPrePublish(streamKey) {
    const query = User.findOne({'streamInfo.streamKey': streamKey})
    let select = 'username';
    if (config.email.enabled) {
        // retrieve fields required for sending email
        select += ' displayName subscribers profilePic.bucket profilePic.key';
        query.populate({
            path: 'subscribers.user',
            select: 'username displayName email emailSettings'
        });
    }
    return await query.select(select).exec();
}

async function getEventStagePrePublish(streamKey) {
    return await EventStage.findOne({'streamInfo.streamKey': streamKey})
        .select('_id event stageName')
        .populate({
            path: 'event',
            select: 'eventName'
        })
        .exec();
}

nms.on('donePublish', async (sessionId, streamPath) => {
    const timestamp = getSessionConnectTime(sessionId);
    const {streamKey} = extractAppAndStreamKey(streamPath);

    let user;
    try {
        user = await getUserDonePublish(streamKey);
    } catch (err) {
        LOGGER.error('An error occurred when finding user with stream key {}: {}', streamKey, err);
        return await snsErrorPublisher.publish(err);
    }

    if (user) {
        mainroomEventBus.send('streamEnded', user.username);
        if (IS_RECORDING_TO_MP4) {
            await saveRecordedStream({
                streamKey,
                timestamp,
                streamer: user,
                userId: user._id
            });
        }
        return;
    }

    let eventStage;
    try {
        eventStage = await getEventStageDonePublish(streamKey);
    } catch (err) {
        LOGGER.error('An error occurred when finding event stage with stream key {}: {}', streamKey, err);
        return await snsErrorPublisher.publish(err);
    }

    if (eventStage) {
        mainroomEventBus.send('streamEnded', eventStage._id);
        if (IS_RECORDING_TO_MP4) {
            await saveRecordedStream({
                streamKey,
                timestamp,
                streamer: eventStage,
                userId: eventStage.event.createdBy._id,
                eventStage
            });
        }
    }
});

const extractAppAndStreamKey = path => {
    const parts = path.split('/');
    const removedElements = parts.splice(parts.length - 1, 1);
    return {
        app: parts.join('/'),
        streamKey: removedElements[0]
    };
};

function getSessionConnectTime(sessionId) {
    return nms.getSession(sessionId).connectTime;
}

async function getUserDonePublish(streamKey) {
    return await User.findOne({'streamInfo.streamKey': streamKey})
        .select('_id username streamInfo.title streamInfo.genre streamInfo.category streamInfo.tags streamInfo.cumulativeViewCount')
        .exec();
}

async function getEventStageDonePublish(streamKey) {
    return await EventStage.findOne({'streamInfo.streamKey': streamKey})
        .select('_id event streamInfo.title streamInfo.genre streamInfo.category streamInfo.tags streamInfo.cumulativeViewCount')
        .populate({
            path: 'event',
            populate: {
                path: 'createdBy',
                select: '_id'
            }
        })
        .exec();
}

async function saveRecordedStream({streamKey, timestamp, streamer, userId, eventStage}) {
    const inputDirectory = path.join(process.cwd(), config.rtmpServer.http.mediaroot, process.env.RTMP_SERVER_APP_NAME, streamKey);
    const mp4FileName = await findMP4FileName(inputDirectory, timestamp);
    if (!mp4FileName) return;

    const inputURL = path.join(inputDirectory, mp4FileName);
    const Bucket = config.storage.s3.streams.bucketName;
    const Key = `${config.storage.s3.streams.keyPrefixes.recorded}/${userId}/${mp4FileName}`;

    try {
        const videoDurationPromise = getVideoDurationString(inputURL);
        const uploadVideoPromise = uploadVideoToS3({inputURL, Bucket, Key});
        const generateThumbnailPromise = generateStreamThumbnail({
            streamer,
            inputURL,
            Bucket,
            Key: Key.replace('.mp4', '.jpg')
        });

        const promiseResults = await Promise.all([
            videoDurationPromise,
            uploadVideoPromise,
            generateThumbnailPromise
        ]);

        const videoDuration = promiseResults[0];
        const {originalFileURLs, video} = promiseResults[1];
        const thumbnail = promiseResults[2];

        const recordedStream = new RecordedStream({
            user: userId,
            eventStage,
            title: streamer.streamInfo.title || 'Untitled Stream',
            genre: streamer.streamInfo.genre,
            category: streamer.streamInfo.category,
            tags: streamer.streamInfo.tags,
            viewCount: streamer.streamInfo.cumulativeViewCount,
            timestamp,
            videoDuration,
            video,
            thumbnail: {
                bucket: thumbnail.Bucket,
                key: thumbnail.Key
            }
        });

        const allSettledResults = await Promise.allSettled([...originalFileURLs.map(deleteFile), recordedStream.save()]);
        const rejectedPromises = allSettledResults.filter(res => res.status === 'rejected');
        if (rejectedPromises.length) {
            throw new CompositeError(rejectedPromises.map(promise => promise.reason));
        }
    } catch (err) {
        LOGGER.error('An error occurred when uploading recorded stream at {} to S3 (bucket: {}, key: {}): {}',
            inputURL, Bucket, Key, err);
        await snsErrorPublisher.publish(err);
    }
}

async function findMP4FileName(inputDirectory, sessionConnectTime) {
    LOGGER.debug('Looking for MP4 files in {}', inputDirectory);

    const fileNames = await fs.readdir(inputDirectory);
    LOGGER.debug('All files found: {}', fileNames);

    const mp4FileNames = fileNames.filter(fileName => path.extname(fileName).toLowerCase() === '.mp4');
    LOGGER.debug('MP4 files found: {}', mp4FileNames);

    if (mp4FileNames.length === 1) {
        return mp4FileNames[0];
    }

    LOGGER.error('{} MP4 files found in {} but expected 1', mp4FileNames.length, inputDirectory);
    LOGGER.info('Attempting to find MP4 file comparing file creation times against session connect time of {}',
        sessionConnectTime);

    const possibleMp4FileNames = [];
    const deletePromises = []

    for (const filename of mp4FileNames) {
        const filePath = path.join(inputDirectory, filename);
        const { birthtimeMs } = await fs.stat(filePath);
        if (birthtimeMs < sessionConnectTime) {
            deletePromises.push(deleteFile(filePath));
        } else {
            possibleMp4FileNames.push(filename)
            LOGGER.info('Found possible MP4 file for stream: {}', filename);
        }
    }

    if (deletePromises.length) {
        const allSettledResults = await Promise.allSettled(deletePromises);
        const rejectedPromises = allSettledResults.filter(res => res.status === 'rejected');
        if (rejectedPromises.length) {
            const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
            LOGGER.error('One or more errors occurred when deleting MP4 files: {}', err);
            await snsErrorPublisher.publish(err);
        }
    }

    if (possibleMp4FileNames.length !== 1) {
        const msg = `Expected 1 file in ${inputDirectory} to have creation time >= session connect time of ${sessionConnectTime}, but found ${possibleMp4FileNames.length}`
        LOGGER.error(msg);
        await snsErrorPublisher.publish(new Error(msg));
        return undefined;
    }

    const mp4FileName = possibleMp4FileNames[0];
    LOGGER.info('Found matching MP4 file for stream: {}', mp4FileName);
    return mp4FileName;
}

async function deleteFile(filePath) {
    try {
        LOGGER.info('Deleting file at {}', filePath);
        await fs.unlink(filePath);
        LOGGER.info('Successfully deleted file at {}', filePath);
    } catch (err) {
        LOGGER.error('An error occurred when deleting file at {}: {}', filePath, err);
        throw err;
    }
}

function getVideoDurationString(inputURL) {
    return new Promise((resolve, reject) => {
        const args = [
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            '-sexagesimal',
            inputURL
        ];

        const ffprobe = spawn(process.env.FFPROBE_PATH, args);
        ffprobe.on('error', err => {
            LOGGER.error('An error occurred when getting video file duration for {}: {}', inputURL, err);
            reject(err);
        });
        ffprobe.stderr.on('data', data => {
            LOGGER.debug('stderr: {}', data)
        });
        ffprobe.stdout.on('data', data => {
            const durationString = data.toString();
            const indexOfMillis = durationString.indexOf('.')
            resolve(durationString.substring(0, indexOfMillis));
        });
    });
}

module.exports = nms;
