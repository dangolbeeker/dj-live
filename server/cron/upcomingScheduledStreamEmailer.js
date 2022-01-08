const {CronJob} = require('cron');
const {cronTime, email} = require('../../mainroom.config');
const {ScheduledStream, User} = require('../model/schemas');
const moment = require('moment');
const CompositeError = require('../errors/CompositeError');
const sesEmailSender = require('../aws/sesEmailSender');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const LOGGER = require('../../logger')('./server/cron/upcomingScheduledStreamEmailer.js');

const jobName = 'Upcoming Scheduled Stream Emailer';

const job = new CronJob(cronTime.upcomingScheduledStreamEmailer, async () => {
    LOGGER.debug(`${jobName} triggered`);

    if (!email.enabled) {
        LOGGER.info('Email is not enabled, so will not send emails about upcoming scheduled streams');
    } else {
        let users;
        try {
            users = await User.find({emailSettings: {subscriptionScheduledStreamStartingIn: {$gte: 0}}})
                .select('username displayName email emailSettings.subscriptionScheduledStreamStartingIn subscriptions nonSubscribedScheduledStreams')
                .populate({
                    path: 'nonSubscribedScheduledStreams',
                    select: 'user title startTime endTime genre category',
                    populate: {
                        path: 'user',
                        select: 'username displayName profilePic.bucket profilePic.key'
                    }
                })
                .exec();
        } catch (err) {
            LOGGER.error('An error occurred when finding users to email about streams starting soon: {}', err);
            return await snsErrorPublisher.publish(err);
        }

        const promises = [];
        const errors = [];

        for (const user of users) {
            // cron job should be configured to trigger every minute, so startTime needs to cover
            // streams that are scheduled for non-zero seconds (e.g. triggered at 1pm = 13:00:00-13:00:59)
            const start = moment().add(user.emailSettings.subscriptionScheduledStreamStartingIn, 'minutes').valueOf();
            const end = moment().add(user.emailSettings.subscriptionScheduledStreamStartingIn + 1, 'minutes').valueOf();

            const subscriptionsIds = user.subscriptions.map(sub => sub.user._id);
            const filter = {
                user: {$in: subscriptionsIds},
                $and: [
                    {startTime: {$gte: start}},
                    {startTime: {$lt: end}}
                ]
            };

            try {
                const scheduledStreams = await ScheduledStream.find(filter)
                    .select('user title startTime endTime genre category')
                    .populate({
                        path: 'user',
                        select: 'username displayName profilePic.bucket profilePic.key'
                    })
                    .exec();

                const nonSubscribedScheduledStreams = user.nonSubscribedScheduledStreams.filter(stream => {
                    return stream.startTime >= start && stream.startTime < end;
                });

                const streams = [...scheduledStreams, ...nonSubscribedScheduledStreams];
                if (streams.length) {
                    const userData = {
                        email: user.email,
                        displayName: user.displayName,
                        username: user.username
                    };
                    promises.push(sesEmailSender.notifyUserOfSubscriptionsStreamsStartingSoon(userData, streams));
                }
            } catch (err) {
                errors.push(err);
            }
        }

        if (promises.length) {
            const promiseResults = await Promise.allSettled(promises);
            const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');

            const sIfMultiplePromises = promises.length === 1 ? '' : 's';
            if (rejectedPromises.length) {
                LOGGER.error('{} out of {} email{} failed to send',
                    rejectedPromises.length, promises.length, sIfMultiplePromises);
                rejectedPromises.forEach(promise => errors.push(promise.reason));
            } else {
                LOGGER.info('Successfully sent {} email{}', promises.length, sIfMultiplePromises);
            }
        } else {
            LOGGER.info('Sending 0 emails about streams starting soon');
        }

        if (errors.length) {
            const err = new CompositeError(errors);
            LOGGER.error('{} error{} occurred when emailing users about streams starting soon. Error: {}',
                errors.length, errors.length === 1 ? '' : 's', err);
            await snsErrorPublisher.publish(err);
        }
    }

    LOGGER.debug(`${jobName} finished`);
});

module.exports = {jobName, job};