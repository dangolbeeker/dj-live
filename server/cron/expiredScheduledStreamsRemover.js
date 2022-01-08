const CompositeError = require('../errors/CompositeError');
const {CronJob} = require('cron');
const {cronTime, storage} = require('../../mainroom.config');
const {ScheduledStream, User} = require('../model/schemas');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const LOGGER = require('../../logger')('./server/cron/expiredScheduledStreamsRemover.js');

const jobName = 'Expired ScheduledStreams Remover';

const job = new CronJob(cronTime.expiredScheduledStreamsRemover, async () => {
    LOGGER.debug(`${jobName} triggered`);

    try {
        const expiryTime = Date.now() - storage.scheduledStream.ttl;
        const streams = await ScheduledStream.find({endTime: {$lte: expiryTime}})
            .select('_id eventStage prerecordedVideoFile')
            .exec();

        if (streams.length) {
            let numVideosToDelete = 0;
            let numDocsToDelete = 0;
            const promises = [];

            streams.forEach(stream => {
                if (stream.eventStage) {
                    if (stream.prerecordedVideoFile && stream.prerecordedVideoFile.bucket && stream.prerecordedVideoFile.key) {
                        // Do not delete ScheduledStreams from database that were scheduled as part of an event,
                        // just delete their prerecorded videos from S3, if they have any.
                        numVideosToDelete++;
                        promises.push(stream.deletePrerecordedVideo());
                    }
                } else {
                    numDocsToDelete++;
                    if (stream.prerecordedVideoFile && stream.prerecordedVideoFile.bucket && stream.prerecordedVideoFile.key) {
                        numVideosToDelete++;
                    }

                    const pullReferences = User.updateMany(
                        {nonSubscribedScheduledStreams: stream._id},
                        {$pull: {nonSubscribedScheduledStreams: stream._id}}
                    );
                    const deleteStream = ScheduledStream.findByIdAndDelete(stream._id);
                    promises.push(pullReferences, deleteStream);
                }
            });

            LOGGER.info('Deleting {} ScheduledStream{} from database, and {} prerecorded video file{} from S3, ' +
                'for scheduled streams that finished before {}',
                numDocsToDelete, numDocsToDelete === 1 ? '' : 's',
                numVideosToDelete, numVideosToDelete === 1 ? '' : 's',
                expiryTime);

            const promiseResults = await Promise.allSettled(promises);
            const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');
            if (rejectedPromises.length) {
                throw new CompositeError(rejectedPromises.map(promise => promise.reason));
            }
        }
    } catch (err) {
        LOGGER.error('An error occurred when deleting ScheduledStreams past their TTL from database: {}', err);
        await snsErrorPublisher.publish(err);
    }

    LOGGER.debug(`${jobName} finished`);
});

module.exports = {jobName, job};