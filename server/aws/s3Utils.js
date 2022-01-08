const {
    S3Client,
    DeleteObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');
const {storage: {cloudfront, s3: {upload: {signedURLExpiryInSeconds}}}} = require('../../mainroom.config');
const LOGGER = require('../../logger')('./server/aws/s3Utils.js');

const S3_CLIENT = new S3Client({});

async function deleteObject({Bucket, Key}) {
    try {
        LOGGER.debug('Deleting object in S3 (bucket: {}, key: {})', Bucket, Key);
        const deleteObjectCommand = new DeleteObjectCommand({Bucket, Key});
        await S3_CLIENT.send(deleteObjectCommand);
    } catch (err) {
        LOGGER.error('An error occurred when deleting object in S3 (bucket: {}, key: {}): {}', Bucket, Key, err);
        throw err;
    }
}

function resolveObjectURL({Bucket, Key}) {
    if (cloudfront[Bucket]) {
        return `https://${cloudfront[Bucket]}/${Key}`;
    }
    LOGGER.info(`Cloudfront distribution not configured for bucket '{}', returning S3 URL`, Bucket);
    return `https://${Bucket}.s3.amazonaws.com/${Key}`;
}

async function createMultipartUpload({Bucket, Key}) {
    try {
        const createMultipartUploadCommand = new CreateMultipartUploadCommand({Bucket, Key});
        const response = await S3_CLIENT.send(createMultipartUploadCommand);
        return response.UploadId;
    } catch (err) {
        LOGGER.error('An error occurred when creating multipart upload in S3 (bucket: {}, key: {}): {}',
            Bucket, Key, err);
        throw err;
    }
}

async function getUploadPartSignedURLs({Bucket, Key, UploadId, NumberOfParts}) {
    try {
        const promises = [];
        for (let PartNumber = 1; PartNumber <= NumberOfParts; PartNumber++) {
            const uploadPartCommand = new UploadPartCommand({Bucket, Key, UploadId, PartNumber});
            promises.push(getSignedUrl(S3_CLIENT, uploadPartCommand, { expiresIn: signedURLExpiryInSeconds }));
        }
        return await Promise.all(promises);
    } catch (err) {
        LOGGER.error('An error occurred when signing URLs for UploadPartCommands to S3 (bucket: {}, key: {}): {}',
            Bucket, Key, err);
        throw err
    }
}

async function completeMultipartUpload({Bucket, Key, UploadId, Parts}) {
    try {
        const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
            Bucket, Key, UploadId, MultipartUpload: { Parts }
        });
        await S3_CLIENT.send(completeMultipartUploadCommand);
    } catch (err) {
        LOGGER.error('An error occurred when completing multipart upload in S3 (Bucket: {}, Key: {}, UploadId: {}): {}',
            Bucket, Key, UploadId, err);
        throw err;
    }
}

async function abortMultipartUpload({Bucket, Key, UploadId}) {
    try {
        const abortMultipartUploadCommand = new AbortMultipartUploadCommand({Bucket, Key, UploadId});
        await S3_CLIENT.send(abortMultipartUploadCommand);
    } catch (err) {
        LOGGER.error('An error occurred when aborting multipart upload in S3 (Bucket: {}, Key: {}, UploadId: {}): {}',
            Bucket, Key, UploadId, err);
        throw err
    }
}

module.exports = {
    deleteObject,
    resolveObjectURL,
    createMultipartUpload,
    getUploadPartSignedURLs,
    completeMultipartUpload,
    abortMultipartUpload
}
