const {Schema} = require('mongoose');
const bcrypt = require('bcryptjs');
const mongoosePaginate = require('mongoose-paginate-v2');
const {
    chatColours,
    storage: {s3: {defaultProfilePic}},
    validation: {streamSettings: {titleMaxLength, tagsMaxAmount}}
} = require('../../mainroom.config');
const {RecordedStream, ScheduledStream} = require('./schemas');
const nanoid = require('nanoid');
const {deleteObject, resolveObjectURL} = require('../aws/s3Utils');
const CompositeError = require('../errors/CompositeError');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const {ThumbnailGenerationStatus} = require('../aws/s3ThumbnailGenerator');
const LOGGER = require('../../logger')('./server/model/userSchema.js');

const UserSchema = new Schema({
    username: {type: String, lowercase: true},
    email: String,
    password: {type: String, select: false},
    profilePic: {
        bucket: {type: String, default: defaultProfilePic.bucket},
        key: {type: String, default: defaultProfilePic.key}
    },
    displayName: String,
    location: String,
    bio: String,
    links: [{title: String, url: String}],
    streamInfo: {
        streamKey: {type: String, select: false},
        title: {type: String, maxlength: titleMaxLength},
        genre: String,
        category: String,
        tags: {type: [String], validate: tags => tags.length <= tagsMaxAmount},
        viewCount: {type: Number, default: 0, min: 0},
        cumulativeViewCount: {type: Number, default: 0, min: 0},
        startTime: Date,
        thumbnailGenerationStatus: {type: Number, default: ThumbnailGenerationStatus.READY}
    },
    subscribers: [{
        user: {type: Schema.Types.ObjectId, ref: 'User'},
        subscribedAt: {type: Date, default: () => new Date()}
    }],
    subscriptions: [{
        user: {type: Schema.Types.ObjectId, ref: 'User'},
        subscribedAt: {type: Date, default: () => new Date()}
    }],
    nonSubscribedScheduledStreams: [{type: Schema.Types.ObjectId, ref: 'ScheduledStream'}],
    subscribedEvents: [{
        event: {type: Schema.Types.ObjectId, ref: 'Event'},
        subscribedAt: {type: Date, default: () => new Date()}
    }],
    emailSettings: {
        newSubscribers: Boolean,
        subscriptionWentLive: Boolean,
        subscriptionsCreatedScheduledStreams: Boolean,
        subscriptionScheduledStreamStartingIn: Number
    },
    chatColour: {type: String, default: getRandomColour}
});

UserSchema.statics.generateHash = password => {
    return bcrypt.hashSync(password);
};

UserSchema.methods.checkPassword = function (password) {
    return bcrypt.compareSync(password, this.password);
};

UserSchema.statics.generateStreamKey = nanoid;

UserSchema.statics.getRandomChatColour = getRandomColour;

UserSchema.methods.getProfilePicURL = function () {
    return resolveObjectURL({
        Bucket: this.profilePic.bucket,
        Key: this.profilePic.key
    });
};

function getRandomColour() {
    const keys = Object.keys(chatColours);
    return chatColours[keys[keys.length * Math.random() << 0]];
}

UserSchema.plugin(mongoosePaginate);

UserSchema.pre('findOneAndDelete', async function() {
    const user = await this.model.findOne(this.getQuery());
    if (user) {
        await Promise.all([
            deleteProfilePic(user),
            deleteScheduledStreams(user, this.model),
            deleteRecordedStreams(user),
            removeFromSubscriptions(user, this.model)
        ]);
        LOGGER.debug('Deleting User (_id: {})', user._id);
    }
});

UserSchema.post('findOneAndDelete', async function() {
    LOGGER.info('Successfully deleted User (_id: {})', this.getQuery()._id);
});

async function deleteProfilePic(user) {
    const profilePic = user.profilePic;
    if (!(profilePic.bucket === defaultProfilePic.bucket
        && profilePic.key === defaultProfilePic.key)) {
        LOGGER.debug('Deleting profile picture in S3 (bucket: {}, key: {}) for User (_id: {})',
            profilePic.bucket, profilePic.key, user._id);
        try {
            await deleteObject({
                Bucket: profilePic.bucket,
                Key: profilePic.key
            });
            LOGGER.debug('Successfully deleted profile picture in S3 for User (_id: {})', user._id);
        } catch (err) {
            LOGGER.error(`Failed to delete profile picture (bucket: {}, key: {}) in S3 for User (_id: {}). Error: {}`,
                profilePic.bucket, profilePic.key, user._id, err);
            await snsErrorPublisher.publish(err);
        }
    }
}

async function deleteScheduledStreams(user, model) {
    // deletion must be done in for-each loop so references to ScheduledStreams being deleted
    // can be pulled from other Users' nonSubscribedScheduledStreams array, which can't be done
    // using mongoose middleware due to the ordering of imports in ./server/model/schemas.js

    const streams = await ScheduledStream.find({user}).select( '_id').exec();
    if (streams.length) {
        LOGGER.debug('Deleting {} ScheduledStreams for User (_id: {})', streams.length, user._id);
        let deleted = 0;
        const errors = [];
        for (const stream of streams) {
            const pullReferences = model.updateMany({nonSubscribedScheduledStreams: stream._id}, {$pull: {nonSubscribedScheduledStreams: stream._id}}).exec();
            const deleteStream = ScheduledStream.findByIdAndDelete(stream._id);
            const promiseResults = await Promise.allSettled([pullReferences, deleteStream]);
            const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');
            if (rejectedPromises.length) {
                rejectedPromises.forEach(promise => errors.push(promise.reason));
            } else {
                deleted++;
            }
        }
        if (errors.length) {
            const err = new CompositeError(errors);
            LOGGER.error(`{} out of {} ScheduledStream{} failed to delete for User (_id: {}). Error: {}`,
                errors.length, streams.length, errors.length === 1 ? '' : 's', user._id, err);
            await snsErrorPublisher.publish(err);
        } else {
            LOGGER.debug('Successfully deleted {} ScheduledStreams for User (_id: {})', deleted, user._id);
        }
    }
}

async function deleteRecordedStreams(user) {
    // deletion must be done in for-each loop and using findByIdAndDelete
    // to trigger pre-findOneAndDelete middleware in RecordedStreamSchema
    // that deletes video and thumbnail in S3

    const streams = await RecordedStream.find({user}).select( '_id').exec();
    if (streams.length) {
        LOGGER.debug('Deleting {} RecordedStreams for User (_id: {})', streams.length, user._id);
        let deleted = 0;
        const errors = [];
        for (const stream of streams) {
            try {
                await RecordedStream.findByIdAndDelete(stream._id);
                deleted++;
            } catch (err) {
                errors.push(err);
            }
        }
        if (errors.length) {
            const err = new CompositeError(errors);
            LOGGER.error(`{} out of {} RecordedStream{} failed to delete for User (_id: {}). Error: {}`,
                errors.length, streams.length, errors.length === 1 ? '' : 's', user._id, err);
            await snsErrorPublisher.publish(err);
        } else {
            LOGGER.debug('Successfully deleted {} RecordedStreams for User (_id: {})', deleted, user._id);
        }
    }
}

async function removeFromSubscriptions(user, model) {
    LOGGER.debug('Removing User (_id: {}) from subscribers/subscriptions lists', user._id);

    const subscribersIds = user.subscribers.map(sub => sub.user);
    const subscriptionsIds = user.subscriptions.map(sub => sub.user);

    const pullFromSubscribers = model.updateMany({_id: {$in: subscribersIds}}, {$pull: {subscribers: {user: user._id}}});
    const pullFromSubscriptions = model.updateMany({_id: {$in: subscriptionsIds}}, {$pull: {subscriptions: {user: user._id}}});

    const promiseResults = await Promise.all([pullFromSubscribers, pullFromSubscriptions]);
    const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');

    if (rejectedPromises.length) {
        const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
        LOGGER.error(`Failed to remove User (_id: {}) from subscribers/subscriptions lists. Error: {}`, user._id, err);
        await snsErrorPublisher.publish(err);
    } else {
        LOGGER.debug('Successfully removed User (_id: {}) from {} subscribers lists and {} subscriptions lists',
            user._id, promiseResults[0].nModified, promiseResults[1].nModified);
    }
}

module.exports = UserSchema;