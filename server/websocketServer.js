const socketIO = require('socket.io');
const pm2 = require('pm2');
const mainroomEventBus = require('./mainroomEventBus');
const {User, EventStage} = require('./model/schemas');
const sanitise = require('mongo-sanitize');
const snsErrorPublisher = require('./aws/snsErrorPublisher');
const LOGGER = require('../logger')('./server/websocketServer.js');

class WebSocketServer {

    constructor(httpServer) {
        this.io = socketIO(httpServer);
    }

    async start() {
        // Register event listeners
        if (process.env.NODE_ENV === 'production') {
            // Send all messages to parent process in production environment.
            // This allows a clustered environment to share events
            process.on('message', packet => {
                LOGGER.debug(`Process received "message" event with args {}`, JSON.stringify(packet));
                process.send(packet);
            });

            try {
                // In production environment, listen for events from pm2 God process
                const bus = await launchPm2MessageBus();
                LOGGER.debug('pm2 message bus started');
                bus.on('liveStreamViewCount', ({data}) => emitLiveStreamViewCount(this.io, data));
                bus.on('chatMessage', ({data}) => emitChatMessage(this.io, data));
                bus.on('chatAlert', ({data}) => emitOnChatAlert(this.io, data));
                bus.on('chatOpened', ({data}) => emitChatOpened(this.io, data));
                bus.on('chatClosed', ({data}) => emitChatClosed(this.io, data));
                bus.on('streamStarted', ({data}) => emitStreamStarted(this.io, data));
                bus.on('streamEnded', ({data}) => emitStreamEnded(this.io, data));
                bus.on('streamInfoUpdated', ({data}) => emitStreamInfoUpdated(this.io, data));
            } catch (err) {
                LOGGER.error('An error occurred when launching pm2 message bus: {}', err);
                await snsErrorPublisher.publish(err);
            }
        } else {
            //In non-production environment, listen for events from MainroomEventBus
            mainroomEventBus.on('liveStreamViewCount', viewCountData => {
                emitLiveStreamViewCount(this.io, viewCountData);
            });

            mainroomEventBus.on('chatMessage', chatMessageData => {
                emitChatMessage(this.io, chatMessageData);
            });

            mainroomEventBus.on('chatAlert', alertData => {
                emitOnChatAlert(this.io, alertData)
            });

            mainroomEventBus.on('chatOpened', streamer => {
                emitChatOpened(this.io, streamer)
            });

            mainroomEventBus.on('chatClosed', streamer => {
                emitChatClosed(this.io, streamer)
            });

            mainroomEventBus.on('streamStarted', streamer => {
                emitStreamStarted(this.io, streamer);
            });

            mainroomEventBus.on('streamEnded', streamer => {
                emitStreamEnded(this.io, streamer);
            });

            mainroomEventBus.on('streamInfoUpdated', streamInfo => {
                emitStreamInfoUpdated(this.io, streamInfo);
            });
        }

        this.io.on('connection', socket => {
            // register listeners if connection is from live stream page
            if (socket.handshake.query.liveStreamUsername) {
                const streamUsername = sanitise(socket.handshake.query.liveStreamUsername.toLowerCase());

                let didIncrementUserViewCount = false;

                // increment view count on connection
                socket.on(`connection_${streamUsername}`, () => {
                    incrementUserViewCount(streamUsername);
                    didIncrementUserViewCount = true;
                });

                // decrement view count on disconnection
                socket.on('disconnect', () => {
                    if (didIncrementUserViewCount) {
                        decrementUserViewCount(streamUsername);
                    }
                });

                // emit livestream chat message to correct channel
                socket.on('chatMessage', ({sender, msg}) => {
                    mainroomEventBus.send('chatMessage', {recipient: streamUsername, sender, msg});
                });
            }
            // or register listeners if connection is from event stage stream page
            else if (socket.handshake.query.eventStageId) {
                const eventStageId = socket.handshake.query.eventStageId;

                let didIncrementEventStageViewCount = false;

                // increment view count on connection
                socket.on(`connection_${eventStageId}`, () => {
                    incrementEventStageViewCount(eventStageId);
                    didIncrementEventStageViewCount = true;
                });

                // decrement view count on disconnection
                socket.on('disconnect', () => {
                    if (didIncrementEventStageViewCount) {
                        decrementEventStageViewCount(eventStageId);
                    }
                });

                // emit livestream chat message to correct channel
                socket.on('chatMessage', ({sender, msg}) => {
                    mainroomEventBus.send('chatMessage', {recipient: eventStageId, sender, msg});
                });
            }
            // or register listeners if connection is from event page
            else if (socket.handshake.query.eventId) {
                const eventId = socket.handshake.query.eventId;

                // emit livestream chat message to correct channel
                socket.on('chatMessage', ({sender, msg}) => {
                    mainroomEventBus.send('chatMessage', {recipient: eventId, sender, msg});
                });
            }
        });
    }

}

function launchPm2MessageBus() {
    return new Promise((resolve, reject) => {
        pm2.launchBus((err, bus) => {
            if (err) {
                reject(err);
            } else {
                resolve(bus);
            }
        });
    });
}

function emitLiveStreamViewCount(io, {streamer, viewCount}) {
    LOGGER.debug(`Emitting "liveStreamViewCount_{}" event with args "{}" using socket.io`, streamer, viewCount);
    io.emit(`liveStreamViewCount_${streamer}`, viewCount);
}

function emitChatMessage(io, {recipient, sender, msg}) {
    const args = {sender, msg};
    LOGGER.debug(`Emitting "chatMessage_{}" event with args "{}" using socket.io`, recipient, JSON.stringify(args));
    io.emit(`chatMessage_${recipient}`, args);
}

function emitOnChatAlert(io, {recipient, alert}) {
    LOGGER.debug(`Emitting "chatAlert_{}" event with args "{}" using socket.io`, recipient, alert);
    io.emit(`chatAlert_${recipient}`, alert);
}

function emitChatOpened(io, streamer) {
    LOGGER.debug(`Emitting "chatOpened_{}" event using socket.io`, streamer);
    io.emit(`chatOpened_${streamer}`);
}

function emitChatClosed(io, streamer) {
    LOGGER.debug(`Emitting "chatClosed_{}" event using socket.io`, streamer);
    io.emit(`chatClosed_${streamer}`);
}

function emitStreamStarted(io, streamer) {
    LOGGER.debug(`Emitting "streamStarted_{}" event using socket.io`, streamer);
    io.emit(`streamStarted_${streamer}`);
}

function emitStreamEnded(io, streamer) {
    LOGGER.debug(`Emitting "streamEnded_{}" event using socket.io`, streamer);
    io.emit(`streamEnded_${streamer}`);
}

function emitStreamInfoUpdated(io, streamInfo) {
    const username = streamInfo.username;
    delete streamInfo.username;
    LOGGER.debug(`Emitting "streamInfoUpdated_{}" event with args "{}" using socket.io`, username, JSON.stringify(streamInfo));
    io.emit(`streamInfoUpdated_${username}`, streamInfo);
}

async function incrementUserViewCount(username) {
    await incUserViewCount(username, 1);
}

async function decrementUserViewCount(username) {
    await incUserViewCount(username, -1);
}

async function incUserViewCount(username, increment) {
    const $inc = {'streamInfo.viewCount': increment}
    if (increment > 0) {
        $inc['streamInfo.cumulativeViewCount'] = increment;
    }
    const options = {
        new: true,
        runValidators: true // run 'min: 0' validators on viewCount and cumulativeViewCount
    };
    try {
        const user = await User.findOneAndUpdate({username}, {$inc}, options);
        if (!user) {
            throw new Error(`Could not find user (username: ${username}) to update view count`);
        }
        mainroomEventBus.send('liveStreamViewCount', {
            streamer: username,
            viewCount: user.streamInfo.viewCount
        });
    } catch (err) {
        LOGGER.error(`An error occurred when updating live stream view count for user (username: {}): {}`,
            username, err);
        await snsErrorPublisher.publish(err);
    }
}

async function incrementEventStageViewCount(eventStageId) {
    await incEventStageViewCount(eventStageId, 1);
}

async function decrementEventStageViewCount(eventStageId) {
    await incEventStageViewCount(eventStageId, -1);
}

async function incEventStageViewCount(eventStageId, increment) {
    const $inc = {'streamInfo.viewCount': increment}
    if (increment > 0) {
        $inc['streamInfo.cumulativeViewCount'] = increment;
    }
    const options = {
        new: true,
        runValidators: true // run 'min: 0' validators on viewCount and cumulativeViewCount
    };
    try {
        const eventStage = await EventStage.findByIdAndUpdate(eventStageId, {$inc}, options);
        if (!eventStage) {
            throw new Error(`Could not find event stage (_id: ${eventStageId}) to update view count`);
        }
        mainroomEventBus.send('liveStreamViewCount', {
            streamer: eventStageId,
            viewCount: eventStage.streamInfo.viewCount
        });
    } catch (err) {
        LOGGER.error('An error occurred when updating live stream view count for event stage (_id: {}): {}',
            eventStageId, err);
        await snsErrorPublisher.publish(err);
    }
}

module.exports.startWebSocketServer = async httpServer => {
    const wsServer = new WebSocketServer(httpServer);
    await wsServer.start();
}
