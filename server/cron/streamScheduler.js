const {CronJob} = require('cron');
const {cronTime, streamSchedulerTimeout} = require('../../mainroom.config');
const {ScheduledStream, User, EventStage} = require('../model/schemas');
const CompositeError = require('../errors/CompositeError');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const {spawn} = require('child_process');
const mainroomEventBus = require('../mainroomEventBus');
const LOGGER = require('../../logger')('./server/cron/streamScheduler.js');

const RTMP_SERVER_RTMP_PORT = process.env.RTMP_SERVER_RTMP_PORT !== '1935' ? `:${process.env.RTMP_SERVER_RTMP_PORT}` : '';
const RTMP_SERVER_URL = `rtmp://localhost${RTMP_SERVER_RTMP_PORT}/${process.env.RTMP_SERVER_APP_NAME}`;

const jobName = 'Stream Scheduler';

let lastTimeTriggered = Date.now();
let isFirstTimeTriggered = true;

const job = new CronJob(cronTime.streamScheduler, async () => {
    LOGGER.debug(`${jobName} triggered`);

    const thisTimeTriggered = job.lastDate().valueOf();

    let query = {
        $and: [
            {startTime: {$gt: lastTimeTriggered}},
            {startTime: {$lte: thisTimeTriggered}}
        ]
    };

    if (isFirstTimeTriggered) {
        isFirstTimeTriggered = false;
        query = {
            $or: [query, {
                // Find scheduled streams that should have started before now and are due to finish after now.
                // This is to ensure streams that are meant to be live now are actually live, e.g., in the case
                // of a server restart, scheduled streams with a prerecorded video can be started again from the
                // correct position corresponding to the current time
                $and: [
                    {startTime: {$lte: thisTimeTriggered}},
                    {endTime: {$gt: thisTimeTriggered}}
                ]
            }]
        }
    }

    let streams;
    try {
        streams = await ScheduledStream.find(query)
            .select('user eventStage startTime title genre category tags prerecordedVideoFile.bucket prerecordedVideoFile.key')
            .populate({
                path: 'user',
                select: '_id'
            })
            .populate({
                path: 'eventStage',
                select: '_id'
            })
            .exec();
    } catch (err) {
        LOGGER.error('An error occurred when finding scheduled streams starting between {} and {}: {}',
            lastTimeTriggered, thisTimeTriggered, err);

        lastTimeTriggered = thisTimeTriggered;
        return await snsErrorPublisher.publish(err);
    }

    if (!streams.length) {
        LOGGER.info('No streams found starting between {} and {}, so nothing to update',
            lastTimeTriggered, thisTimeTriggered);
    } else {
        const pluralSuffix = streams.length === 1 ? '' : `s`;
        LOGGER.info('Updating stream info for {} user{}/stage{} from scheduled streams',
            streams.length, pluralSuffix, pluralSuffix);

        const databaseUpdatePromises = [];
        const startStreamPromises = [];

        for (const stream of streams) {
            if (stream.eventStage) {
                const eventStage = await EventStage.findById(stream.eventStage._id)
                    .select('+streamInfo.streamKey')
                    .exec();

                const prerecordedVideoFileURL = stream.getPrerecordedVideoFileURL();
                if (prerecordedVideoFileURL) {
                    const startStreamPromise = startStreamFromPrerecordedVideo({
                        startTime: stream.startTime.valueOf(),
                        inputURL: prerecordedVideoFileURL,
                        streamKey: eventStage.streamInfo.streamKey
                    });
                    startStreamPromises.push(startStreamPromise);
                }

                eventStage.streamInfo.title = stream.title;
                eventStage.streamInfo.genre = stream.genre;
                eventStage.streamInfo.category = stream.category;
                eventStage.streamInfo.tags = stream.tags;
                databaseUpdatePromises.push(eventStage.save());
            } else {
                const updateUserPromise = User.findByIdAndUpdate(stream.user._id, {
                    'streamInfo.title': stream.title,
                    'streamInfo.genre': stream.genre,
                    'streamInfo.category': stream.category,
                    'streamInfo.tags': stream.tags
                });
                databaseUpdatePromises.push(updateUserPromise);
            }
        }

        const promiseResults = await Promise.allSettled([...databaseUpdatePromises, startAllStreams(startStreamPromises)]);
        const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');

        if (rejectedPromises.length) {
            const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
            LOGGER.error('{} error{} occurred when updating user/stage stream info from scheduled streams. Error: {}',
                err.errors.length, err.errors.length === 1 ? '' : 's', err);
            lastTimeTriggered = thisTimeTriggered;
            return await snsErrorPublisher.publish(err);
        }

        LOGGER.info(`Successfully updated stream info for {} user{}/stage{} from scheduled streams`,
            streams.length, pluralSuffix, pluralSuffix);
    }

    lastTimeTriggered = thisTimeTriggered;

    LOGGER.debug(`${jobName} finished`);
});

function startStreamFromPrerecordedVideo({startTime, inputURL, streamKey}) {
    return new Promise((resolve, reject) => {
        LOGGER.debug('Starting stream from prerecorded video at {} (stream key: {})', inputURL, streamKey);

        const args = ['-re', '-y'];
        const startMillis = Date.now() - startTime;
        if (startMillis > 0) {
            args.push('-ss', `${startMillis}ms`);
        }
        args.push(
            '-i', inputURL,
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-f', 'tee',
            '-map', '0:a?',
            '-map', '0:v?',
            '-f', 'flv',
            `${RTMP_SERVER_URL}/${streamKey}`
        );

        mainroomEventBus.once(`streamStarted_${streamKey}`, resolve);

        spawn(process.env.FFMPEG_PATH, args, {detached: true, stdio: 'ignore'})
            .on('error', reject)
            .unref();

        setTimeout(reject, streamSchedulerTimeout);
    });
}

async function startAllStreams(startStreamPromises) {
    if (!startStreamPromises.length) {
        return;
    }

    LOGGER.info('Starting {} streams from prerecorded videos', startStreamPromises.length);

    let successCount = 0;
    const errors = [];

    for (const startStreamPromise of startStreamPromises) {
        try {
            await startStreamPromise;
            successCount++;
        } catch (err) {
            errors.push(err);
        }
    }

    LOGGER.info('Successfully started {} out of {} streams from prerecorded videos',
        successCount, startStreamPromises.length);

    if (errors.length) {
        throw new CompositeError(errors);
    }
}

module.exports = {jobName, job};