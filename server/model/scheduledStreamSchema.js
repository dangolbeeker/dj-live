const snsErrorPublisher = require('../aws/snsErrorPublisher');
const {deleteObject} = require('../aws/s3Utils');
const {Schema} = require('mongoose');
const {validation: {streamSettings: {titleMaxLength, tagsMaxAmount}}} = require('../../mainroom.config');
const {resolveObjectURL} = require('../aws/s3Utils');
const LOGGER = require('../../logger')('./server/model/scheduledStreamSchema.js');

const ScheduledStreamSchema = new Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User'},
    eventStage: {type: Schema.Types.ObjectId, ref: 'EventStage'},
    startTime: Date,
    endTime: Date,
    title: {type: String, maxlength: titleMaxLength},
    genre: String,
    category: String,
    tags: {type: [String], validate: tags => tags.length <= tagsMaxAmount},
    prerecordedVideoFile: {
        bucket: String,
        key: String
    }
}, {
    timestamps: true
});

ScheduledStreamSchema.methods.getPrerecordedVideoFileURL = function () {
    return !this.prerecordedVideoFile || !this.prerecordedVideoFile.bucket || !this.prerecordedVideoFile.key
        ? undefined
        : resolveObjectURL({
            Bucket: this.prerecordedVideoFile.bucket,
            Bey: this.prerecordedVideoFile.key
        });
};

ScheduledStreamSchema.methods.deletePrerecordedVideo = async function () {
    if (!this.prerecordedVideoFile || !this.prerecordedVideoFile.bucket || !this.prerecordedVideoFile.key) {
        return;
    }

    await deletePrerecordedVideo(this);
    this.prerecordedVideoFile = undefined;
    try {
        await this.save();
    } catch (err) {
        LOGGER.error('An error occurred when saving ScheduledStream (_id: {}). Error: {}', this._id, err);
        await snsErrorPublisher.publish(err);
    }
}

ScheduledStreamSchema.pre('findOneAndDelete', async function() {
    const scheduledStream = await this.model.findOne(this.getQuery());
    if (scheduledStream) {
        await deletePrerecordedVideo(scheduledStream)
        LOGGER.debug('Deleting ScheduledStream (_id: {})', scheduledStream._id);
    }
});

ScheduledStreamSchema.post('findOneAndDelete', async function() {
    LOGGER.debug('Successfully deleted ScheduledStream (_id: {})', this.getQuery()._id);
});

async function deletePrerecordedVideo(scheduledStream) {
    const prerecordedVideoFile = scheduledStream.prerecordedVideoFile;

    if (prerecordedVideoFile && prerecordedVideoFile.bucket && prerecordedVideoFile.key) {
        LOGGER.debug('Deleting prerecorded video (bucket: {}, key: {}) in S3 for ScheduledStream (_id: {})',
            prerecordedVideoFile.bucket, prerecordedVideoFile.key, scheduledStream._id);

        try {
            await deleteObject({
                Bucket: prerecordedVideoFile.bucket,
                Key: prerecordedVideoFile.key
            });
            LOGGER.debug('Successfully deleted prerecorded video in S3 for ScheduledStream (_id: {})', scheduledStream._id);
        } catch (err) {
            LOGGER.error(`Failed to delete prerecorded video (bucket: {}, key: {}) in S3 for ScheduledStream (_id: {}). Error: {}`,
                prerecordedVideoFile.bucket, prerecordedVideoFile.key, scheduledStream._id, err);
            await snsErrorPublisher.publish(err);
        }
    }
}

module.exports = ScheduledStreamSchema;