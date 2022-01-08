const {CronJob} = require('cron');
const {cronTime, email} = require('../../mainroom.config');
const {ScheduledStream, User} = require('../model/schemas');
const _ = require('lodash');
const sesEmailSender = require('../aws/sesEmailSender');
const CompositeError = require('../errors/CompositeError');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const LOGGER = require('../../logger')('./server/cron/createdScheduledStreamsEmailer.js');

const jobName = 'Subscription-created Scheduled Streams Emailer';

let lastTimeTriggered = Date.now();

const job = new CronJob(cronTime.createdScheduledStreamsEmailer, async () => {
    LOGGER.debug(`${jobName} triggered`);

    const thisTimeTriggered = job.lastDate().valueOf();

    if (!email.enabled) {
        LOGGER.info('Email is not enabled, so will not send emails about subscription-created scheduled streams');
    } else {
        try {
            const filter = {
                $and: [
                    {createdAt: {$gt: lastTimeTriggered}},
                    {createdAt: {$lte: thisTimeTriggered}}
                ]
            };
            const scheduledStreams = await ScheduledStream.find(filter)
                .select('user title startTime endTime genre category')
                .populate({
                    path: 'user',
                    select: '_id username displayName profilePic.bucket profilePic.key'
                })
                .exec();

            if (!scheduledStreams.length) {
                LOGGER.info('No ScheduledStreams found created between {} and {}, so sending no emails',
                    lastTimeTriggered, thisTimeTriggered);
            } else {
                const userIds = scheduledStreams.map(stream => stream.user._id);
                const users = await User.find({'subscriptions.user': {$in: userIds}})
                    .select('username displayName email subscriptions')
                    .exec()

                const sIfMultipleUsers = users.length === 1 ? '' : 's';
                LOGGER.info('Creating request{} to send email{} to {} user{} about new subscriber-created scheduled streams',
                    sIfMultipleUsers, sIfMultipleUsers, users.length, sIfMultipleUsers);

                const promises = users.map(user => {
                    const isSubscribedPredicate = stream => user.subscriptions.some(sub => _.isEqual(sub.user, stream.user._id));
                    const subscribedStreams = scheduledStreams.filter(isSubscribedPredicate);
                    return sesEmailSender.notifyUserSubscriptionsCreatedScheduledStreams(user, subscribedStreams);
                });
                const promiseResults = await Promise.allSettled(promises);
                const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');

                const sIfMultiplePromises = promises.length === 1 ? '' : 's';
                if (rejectedPromises.length) {
                    LOGGER.error('{} out of {} email{} failed to send',
                        rejectedPromises.length, promises.length, sIfMultiplePromises);
                    throw new CompositeError(rejectedPromises.map(promise => promise.reason));
                } else {
                    LOGGER.info('Successfully sent {} email{}', promises.length, sIfMultiplePromises);
                }
            }
        } catch (err) {
            LOGGER.error('An error occurred when creating requests to email users about newly created scheduled streams from subscriptions: {}',
                err);
            await snsErrorPublisher.publish(err);
        }
    }

    lastTimeTriggered = thisTimeTriggered;

    LOGGER.debug(`${jobName} finished`);
});

module.exports = {jobName, job};