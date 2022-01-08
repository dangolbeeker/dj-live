const {Schema} = require('mongoose');
const {
    storage: {s3: {defaultEventThumbnail}},
    validation: {event: {eventNameMaxLength, stagesMaxAmount, tagsMaxAmount}}
} = require('../../mainroom.config');
const {resolveObjectURL} = require('../aws/s3Utils');
const mongoosePaginate = require('mongoose-paginate-v2');
const CompositeError = require('../errors/CompositeError');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const {deleteObject} = require('../aws/s3Utils');
const {EventStage, User} = require('./schemas');
const LOGGER = require('../../logger')('./server/model/eventSchema.js');

const EventSchema = new Schema({
    eventName: {type: String, maxlength: eventNameMaxLength},
    createdBy: {type: Schema.Types.ObjectId, ref: 'User'},
    startTime: Date,
    endTime: Date,
    bannerPic: {
        bucket: String,
        key: String
    },
    thumbnail: {
        bucket: {type: String, default: defaultEventThumbnail.bucket},
        key: {type: String, default: defaultEventThumbnail.key}
    },
    stages: {type: [{type: Schema.Types.ObjectId, ref: 'EventStage'}], validate: stages => stages.length <= stagesMaxAmount},
    tags: {type: [String], validate: tags => tags.length <= tagsMaxAmount},
    subscribers: [{
        user: {type: Schema.Types.ObjectId, ref: 'User'},
        subscribedAt: {type: Date, default: () => new Date()}
    }]
});

EventSchema.methods.getBannerPicURL = function () {
    return !this.bannerPic || !this.bannerPic.bucket || !this.bannerPic.bucket
        ? undefined
        : resolveObjectURL({
            Bucket: this.bannerPic.bucket,
            Key: this.bannerPic.key
        });
};

EventSchema.methods.getThumbnailURL = function () {
    return resolveObjectURL({
        Bucket: this.thumbnail.bucket,
        Key: this.thumbnail.key
    });
};

EventSchema.pre('findOneAndDelete', async function() {
    const event = await this.model.findOne(this.getQuery());
    if (event) {
        await Promise.all([
            deleteBannerPicAndThumbnail(event),
            deleteStages(event),
            pullEventFromUserSubscriptions(event)
        ])
        LOGGER.debug('Deleting Event (_id: {})', event._id);
    }
});

EventSchema.post('findOneAndDelete', async function() {
    LOGGER.debug('Successfully deleted Event (_id: {})', this.getQuery()._id);
});

async function deleteBannerPicAndThumbnail(event) {
    const bannerPic = event.bannerPic;
    const thumbnail = event.thumbnail;

    const promises = []

    if (bannerPic && bannerPic.bucket && bannerPic.key) {
        LOGGER.debug('Deleting banner pic (bucket: {}, key: {}) in S3 for Event (_id: {})',
            bannerPic.bucket, bannerPic.key, event._id);

        const deleteBannerPicPromise = deleteObject({
            Bucket: bannerPic.bucket,
            Key: bannerPic.key
        });
        promises.push(deleteBannerPicPromise);
    }

    if (!(thumbnail.bucket === defaultEventThumbnail.bucket
        && thumbnail.key === defaultEventThumbnail.key)) {

        LOGGER.debug('Deleting thumbnail (bucket: {}, key: {}) in S3 for Event (_id: {})',
            thumbnail.bucket, thumbnail.key, event._id);

        const deleteThumbnailPromise = deleteObject({
            Bucket: thumbnail.bucket,
            Key: thumbnail.key
        });
        promises.push(deleteThumbnailPromise);
    }

    if (!promises.length) return;

    const promiseResults = await Promise.allSettled(promises);
    const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');

    if (rejectedPromises.length) {
        const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
        LOGGER.error(`Failed to delete banner pic (bucket: {}, key: {}) and thumbnail (bucket: {}, key: {}) in S3 for Event (_id: {}). Error: {}`,
            bannerPic.bucket, bannerPic.key, thumbnail.bucket, thumbnail.key, event._id, err);
        await snsErrorPublisher.publish(err);
    }
}

async function deleteStages(event) {
    // deletion must be done in for-each loop and using findByIdAndDelete
    // to trigger pre-findOneAndDelete middleware in EventStageSchema
    // that deletes splash thumbnail in S3

    const eventStages = await EventStage.find({event}).select( '_id').exec();
    if (eventStages.length) {
        LOGGER.debug('Deleting {} EventStage{} for Event (_id: {})',
            eventStages.length, eventStages.length === 1 ? '' : 's', event._id);

        let deleted = 0;
        const errors = [];
        for (const eventStage of eventStages) {
            try {
                await EventStage.findByIdAndDelete(eventStage._id);
                deleted++;
            } catch (err) {
                errors.push(err);
            }
        }
        if (errors.length) {
            const err = new CompositeError(errors);
            LOGGER.error(`{} out of {} EventStages{} failed to delete for Event (_id: {}). Error: {}`,
                errors.length, eventStages.length, errors.length === 1 ? '' : 's', event._id, err);
            await snsErrorPublisher.publish(err);
        } else {
            LOGGER.debug('Successfully deleted {} EventStage{} for Event (_id: {})',
                deleted, deleted.length === 1 ? '' : 's', event._id);
        }
    }
}

async function pullEventFromUserSubscriptions(event) {
    try {
        const res = await User.updateMany(
            {'subscribedEvents.event': event._id},
            {$pull: {subscribedEvents: {event: event._id}}}
        ).exec();

        LOGGER.debug('Successfully removed Event (_id: {}) from {} subscribedEvents lists',
            event._id, res.nModified);
    } catch (err) {
        LOGGER.error(`Failed to remove Event (_id: {}) from subscribedEvents lists. Error: {}`, event._id, err);
        await snsErrorPublisher.publish(err);
    }
}

EventSchema.plugin(mongoosePaginate);

module.exports = EventSchema;