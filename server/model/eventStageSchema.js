const {Schema} = require('mongoose');
const {
    defaultEventStageName,
    storage: {s3: {defaultEventStageSplashThumbnail}},
    validation: {streamSettings: {titleMaxLength, tagsMaxAmount}, eventStage: {stageNameMaxLength}}
} = require('../../mainroom.config');
const nanoid = require('nanoid');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const CompositeError = require('../errors/CompositeError');
const {deleteObject} = require('../aws/s3Utils');
const {resolveObjectURL} = require('../aws/s3Utils');
const {ScheduledStream, User} = require('./schemas');
const mongoosePaginate = require('mongoose-paginate-v2');
const {ThumbnailGenerationStatus} = require('../aws/s3ThumbnailGenerator');
const LOGGER = require('../../logger')('./server/model/eventStageSchema.js');

const EventStageSchema = new Schema({
    event: {type: Schema.Types.ObjectId, ref: 'Event'},
    stageName: {type: String, default: defaultEventStageName, maxlength: stageNameMaxLength},
    splashThumbnail: {
        bucket: {type: String, default: defaultEventStageSplashThumbnail.bucket},
        key: {type: String, default: defaultEventStageSplashThumbnail.key}
    },
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
    }
});

EventStageSchema.plugin(mongoosePaginate);

EventStageSchema.statics.generateStreamKey = nanoid;

EventStageSchema.methods.getSplashThumbnailURL = function () {
    return resolveObjectURL({
        Bucket: this.splashThumbnail.bucket,
        Key: this.splashThumbnail.key
    });
};


EventStageSchema.pre('findOneAndDelete', async function() {
    const eventStage = await this.model.findOne(this.getQuery());
    if (eventStage) {
        await Promise.all([
            deleteSplashThumbnail(eventStage),
            deleteScheduledStreams(eventStage)
        ])
        LOGGER.debug('Deleting EventStage (_id: {})', eventStage._id);
    }
});

EventStageSchema.post('findOneAndDelete', async function() {
    LOGGER.debug('Successfully deleted EventStage (_id: {})', this.getQuery()._id);
});

async function deleteSplashThumbnail(eventStage) {
    const splashThumbnail = eventStage.splashThumbnail;

    if (!(splashThumbnail.bucket === defaultEventStageSplashThumbnail.bucket
        && splashThumbnail.key === defaultEventStageSplashThumbnail.key)) {

        LOGGER.debug('Deleting splash thumbnail (bucket: {}, key: {}) in S3 for EventStage (_id: {})',
            splashThumbnail.bucket, splashThumbnail.key, eventStage._id);

        try {
            await deleteObject({
                Bucket: splashThumbnail.bucket,
                Key: splashThumbnail.key
            });
            LOGGER.debug('Successfully deleted splash thumbnail in S3 for EventStage (_id: {})', eventStage._id);
        } catch (err) {
            LOGGER.error(`Failed to delete splash thumbnail (bucket: {}, key: {}) in S3 for EventStage (_id: {}). Error: {}`,
                splashThumbnail.bucket, splashThumbnail.key, eventStage._id, err);
            await snsErrorPublisher.publish(err);
        }
    }
}

async function deleteScheduledStreams(eventStage) {
    // deletion must be done in for-each loop so references to ScheduledStreams being deleted
    // can be pulled from other Users' nonSubscribedScheduledStreams array, which can't be done
    // using mongoose middleware due to the ordering of imports in ./server/model/schemas.js,
    // and so that prerecorded videos can be deleted from S3

    const streams = await ScheduledStream.find({eventStage}).select( '_id').exec();
    if (streams.length) {
        LOGGER.debug('Deleting {} ScheduledStream{} for EventStage (_id: {})',
            streams.length, streams.length === 1 ? '' : 's', eventStage._id);
        let deleted = 0;
        const errors = [];
        for (const stream of streams) {
            const pullReferences = User.updateMany({nonSubscribedScheduledStreams: stream._id}, {$pull: {nonSubscribedScheduledStreams: stream._id}}).exec();
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
            LOGGER.error(`{} out of {} ScheduledStream{} failed to delete for EventStage (_id: {}). Error: {}`,
                errors.length, streams.length, errors.length === 1 ? '' : 's', eventStage._id, err);
            await snsErrorPublisher.publish(err);
        } else {
            LOGGER.debug('Successfully deleted {} ScheduledStream{} for EventStage (_id: {})',
                deleted, deleted.length === 1 ? '' : 's', eventStage._id);
        }
    }
}

module.exports = EventStageSchema;