const {CronJob} = require('cron');
const {cronTime} = require('../../mainroom.config');
const {Event} = require('../model/schemas');
const moment = require('moment');
const mainroomEventBus = require('../mainroomEventBus');
const CompositeError = require('../errors/CompositeError');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const LOGGER = require('../../logger')('./server/cron/eventChatManager.js');

const jobName = 'Event Chat Manager';

let lastTimeTriggered = Date.now();

const job = new CronJob(cronTime.eventChatManager, async () => {
    LOGGER.debug(`${jobName} triggered`);

    const thisTimeTriggered = job.lastDate().valueOf();

    const promiseResults = await Promise.allSettled([
        openChats(thisTimeTriggered),
        closeChats(thisTimeTriggered),
        sendClosureAlerts(thisTimeTriggered)
    ]);
    const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');
    if (rejectedPromises.length) {
        const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
        LOGGER.error('Errors occurred when opening/closing/alerting event chats: {}', err);
        await snsErrorPublisher.publish(err);
    }

    lastTimeTriggered = thisTimeTriggered;

    LOGGER.debug(`${jobName} finished`);
});

async function openChats(thisTimeTriggered) {
    let eventChatsToOpen;
    try {
        eventChatsToOpen = await Event.find({
            $and: [
                {startTime: {$gt: moment.utc(lastTimeTriggered).add(1, 'hour').toDate()}},
                {startTime: {$lte: moment.utc(thisTimeTriggered).add(1, 'hour').toDate()}}
            ]
        }).select('_id').exec();
    } catch (err) {
        LOGGER.error('An error occurred when getting events whose chats need to be opened: {}', err);
        throw err;
    }

    LOGGER.debug('Opening chat for {} event{}', eventChatsToOpen.length, eventChatsToOpen.length === 1 ? '' : 's');
    eventChatsToOpen.forEach(event => mainroomEventBus.send('chatOpened', event._id));
}

async function closeChats(thisTimeTriggered) {
    let eventChatsToClose;
    try {
        eventChatsToClose = await Event.find({
            $and: [
                {endTime: {$gt: moment.utc(lastTimeTriggered).subtract(1, 'hour').toDate()}},
                {endTime: {$lte: moment.utc(thisTimeTriggered).subtract(1, 'hour').toDate()}}
            ]
        }).select('_id').exec();
    } catch (err) {
        LOGGER.error('An error occurred when getting events whose chats need to be closed: {}', err);
        throw err;
    }

    LOGGER.debug('Closing chat for {} event{}', eventChatsToClose.length, eventChatsToClose.length === 1 ? '' : 's');
    eventChatsToClose.forEach(event => mainroomEventBus.send('chatClosed', event._id));
}

async function sendClosureAlerts(thisTimeTriggered) {
    const promises = [];
    for (let i = 1; i <= 10; i++) {
        promises.push(sendClosureAlert(thisTimeTriggered, i));
    }

    const promiseResults = await Promise.allSettled(promises);
    const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');
    if (rejectedPromises.length) {
        const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
        LOGGER.error('Errors occurred when sending alerts to event chats about imminent closure: {}', err);
        throw err;
    }
}

async function sendClosureAlert(thisTimeTriggered, minutesUntilClose) {
    const alertFilter = {
        $and: [
            {endTime: {$gt: moment.utc(lastTimeTriggered).subtract(60 - minutesUntilClose, 'minutes').toDate()}},
            {endTime: {$lte: moment.utc(thisTimeTriggered).subtract(60 - minutesUntilClose, 'minutes').toDate()}}
        ]
    };

    const eventsToAlert = await Event.find(alertFilter).select('_id').exec();

    LOGGER.debug('Alerting {} event chat{} about closure in {} minute{}', eventsToAlert.length,
        eventsToAlert.length === 1 ? '' : 's', minutesUntilClose, minutesUntilClose === 1 ? '' : 's');

    eventsToAlert.forEach(event => {
        mainroomEventBus.send('chatAlert', {
            recipient: event._id,
            alert: `*** CHAT CLOSES IN ${minutesUntilClose} MINUTE${minutesUntilClose === 1 ? '' : 'S'} ***`
        });
    });
}

module.exports = {jobName, job};