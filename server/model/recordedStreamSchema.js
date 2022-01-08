const {Schema} = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const CompositeError = require('../errors/CompositeError');
const snsErrorPublisher = require('../aws/snsErrorPublisher');
const {deleteObject} = require('../aws/s3Utils');
const {
    storage: {s3: {streams, defaultStreamThumbnail}},
    validation: {streamSettings: {titleMaxLength, tagsMaxAmount}}
} = require('../../mainroom.config');
const {resolveObjectURL} = require('../aws/s3Utils');
const LOGGER = require('../../logger')('./server/model/recordedStreamSchema.js');

const RecordedStreamSchema = new Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User'},
    eventStage: {type: Schema.Types.ObjectId, ref: 'EventStage'},
    timestamp: Date,
    title: {type: String, maxlength: titleMaxLength},
    genre: String,
    category: String,
    tags: {type: [String], validate: tags => tags.length <= tagsMaxAmount},
    video: {
        bucket: {type: String, default: streams.bucketName},
        key: String
    },
    thumbnail: {
        bucket: {type: String, default: defaultStreamThumbnail.bucket},
        key: {type: String, default: defaultStreamThumbnail.key}
    },
    viewCount: {type: Number, default: 0},
    videoDuration: String
});

RecordedStreamSchema.methods.getVideoURL = function () {
    return resolveObjectURL({
        Bucket: this.video.bucket,
        Key: this.video.key
    });
};

RecordedStreamSchema.methods.getThumbnailURL = function () {
    return resolveObjectURL({
        Bucket: this.thumbnail.bucket,
        Key: this.thumbnail.key
    });
};

RecordedStreamSchema.pre('findOneAndDelete', async function() {
    const recordedStream = await this.model.findOne(this.getQuery());
    if (recordedStream) {
        await deleteVideoAndThumbnail(recordedStream);
        LOGGER.debug('Deleting RecordedStream (_id: {})', recordedStream._id);
    }
});

RecordedStreamSchema.post('findOneAndDelete', async function() {
    LOGGER.debug('Successfully deleted RecordedStream (_id: {})', this.getQuery()._id);
});

async function deleteVideoAndThumbnail(recordedStream) {
    const video = recordedStream.video;
    const thumbnail = recordedStream.thumbnail;

    LOGGER.debug('Deleting video (bucket: {}, key: {}) in S3 for RecordedStream (_id: {})',
        video.bucket, video.key, recordedStream._id);

    const promises = []

    const deleteVideoPromise = deleteObject({
        Bucket: video.bucket,
        Key: video.key
    });
    promises.push(deleteVideoPromise);

    if (!(thumbnail.bucket === defaultStreamThumbnail.bucket
        && thumbnail.key === defaultStreamThumbnail.key)) {

        LOGGER.debug('Deleting thumbnail (bucket: {}, key: {}) in S3 for RecordedStream (_id: {})',
            thumbnail.bucket, thumbnail.key, recordedStream._id);

        const deleteThumbnailPromise = deleteObject({
            Bucket: thumbnail.bucket,
            Key: thumbnail.key
        });
        promises.push(deleteThumbnailPromise);
    }

    const promiseResults = await Promise.allSettled(promises);
    const rejectedPromises = promiseResults.filter(res => res.status === 'rejected');

    if (rejectedPromises.length) {
        const err = new CompositeError(rejectedPromises.map(promise => promise.reason));
        LOGGER.error(`Failed to delete video (bucket: {}, key: {}) and thumbnail (bucket: {}, key: {}) in S3 for RecordedStream (_id: {}). Error: {}`,
            video.bucket, video.key, thumbnail.bucket, thumbnail.key, recordedStream._id, err);
        await snsErrorPublisher.publish(err);
    } else {
        LOGGER.debug('Successfully deleted video and thumbnail in S3 for RecordedStream (_id: {})', recordedStream._id);
    }
}

RecordedStreamSchema.plugin(mongoosePaginate);

module.exports = RecordedStreamSchema;