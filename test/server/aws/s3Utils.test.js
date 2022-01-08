const BUCKET = 'testBucket';
const KEY = 'testKey'
const BUCKET_WITH_CLOUDFRONT_DISTRIBUTION = 'testCloudfrontBucket';
const CLOUDFRONT_URL_FOR_BUCKET = 'testCloudfrontUrl';
const UPLOAD_ID = 'someUploadId';

const MOCK_S3_CLIENT_SEND = jest.fn();
const MOCK_DELETE_OBJECT_COMMAND = jest.fn();
const MOCK_CREATE_MULTIPART_UPLOAD_COMMAND = jest.fn();
const MOCK_UPLOAD_PART_COMMAND = jest.fn();
const MOCK_COMPLETE_MULTIPART_UPLOAD_COMMAND = jest.fn();
const MOCK_ABORT_MULTIPART_UPLOAD_COMMAND = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => ({
        send: MOCK_S3_CLIENT_SEND
    })),
    DeleteObjectCommand: MOCK_DELETE_OBJECT_COMMAND,
    CreateMultipartUploadCommand: MOCK_CREATE_MULTIPART_UPLOAD_COMMAND,
    UploadPartCommand: MOCK_UPLOAD_PART_COMMAND,
    CompleteMultipartUploadCommand: MOCK_COMPLETE_MULTIPART_UPLOAD_COMMAND,
    AbortMultipartUploadCommand: MOCK_ABORT_MULTIPART_UPLOAD_COMMAND
}));

const MOCK_GET_SIGNED_URL = jest.fn(async (client, command, options) => {});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: MOCK_GET_SIGNED_URL
}));

jest.mock('../../../mainroom.config', () => ({
    storage: {
        cloudfront: {
            [BUCKET_WITH_CLOUDFRONT_DISTRIBUTION]: CLOUDFRONT_URL_FOR_BUCKET
        },
        s3: {
            upload: {
                signedURLExpiryInSeconds: 0
            }
        }
    }
}))

const S3_UTILS = require('../../../server/aws/s3Utils');

beforeEach(() => jest.clearAllMocks());

describe('s3Utils', () => {
    describe('deleteObject', () => {
        it('should send DeleteObjectCommand to S3Client using given bucket and key', async () => {
            // when
            await S3_UTILS.deleteObject({
                Bucket: BUCKET,
                Key: KEY
            });

            // then
            expect(MOCK_DELETE_OBJECT_COMMAND.mock.calls[0][0]).toStrictEqual({
                Bucket: BUCKET,
                Key: KEY
            });
            expect(MOCK_S3_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should reject if error is thrown', async () => {
            // given
            const error = new Error();
            MOCK_S3_CLIENT_SEND.mockRejectedValueOnce(error);

            // when
            const callToFunction = async () => await S3_UTILS.deleteObject({
                Bucket: BUCKET,
                Key: KEY
            });

            // then
            await expect(callToFunction).rejects.toThrow(error);
        });
    });

    describe('resolveObjectURL', () => {
        it('should return Cloudfront URL for object in bucket with configured Cloudfront distribution', () => {
            // when
            const actualObjectURL = S3_UTILS.resolveObjectURL({
                Bucket: BUCKET_WITH_CLOUDFRONT_DISTRIBUTION,
                Key: KEY
            });

            // then
            const expectedObjectURL = `https://${CLOUDFRONT_URL_FOR_BUCKET}/${KEY}`;
            expect(actualObjectURL).toEqual(expectedObjectURL);
        });

        it('should return S3 URL for object in bucket with no configured Cloudfront distribution', () => {
            // when
            const actualObjectURL = S3_UTILS.resolveObjectURL({
                Bucket: BUCKET,
                Key: KEY
            });

            // then
            const expectedObjectURL = `https://${BUCKET}.s3.amazonaws.com/${KEY}`;
            expect(actualObjectURL).toEqual(expectedObjectURL);
        });
    });

    describe('createMultipartUpload', () => {
        it('should send CreateMultipartUploadCommand to S3Client using given bucket and key, and return the UploadId', async () => {
            // given
            MOCK_S3_CLIENT_SEND.mockReturnValueOnce({UploadId: UPLOAD_ID});

            // when
            const returnedUploadId = await S3_UTILS.createMultipartUpload({
                Bucket: BUCKET,
                Key: KEY
            });

            // then
            expect(MOCK_CREATE_MULTIPART_UPLOAD_COMMAND.mock.calls[0][0]).toStrictEqual({
                Bucket: BUCKET,
                Key: KEY
            });
            expect(MOCK_S3_CLIENT_SEND).toHaveBeenCalledTimes(1);
            expect(returnedUploadId).toEqual(UPLOAD_ID);
        });

        it('should reject if any error is thrown', async () => {
            // given
            const error = new Error();
            MOCK_S3_CLIENT_SEND.mockRejectedValueOnce(error);

            // when
            const callToFunction = async () => await S3_UTILS.createMultipartUpload({
                Bucket: BUCKET,
                Key: KEY
            });

            // then
            await expect(callToFunction).rejects.toThrow(error);
        });
    });

    describe('getUploadPartSignedURLs', () => {
        it('should send a number of UploadPartCommands to s3-request-presigner equal to the given number of parts', async () => {
            // given
            const NumberOfParts = 3;
            const expectedSignedURLs = [];
            for (let i = 0; i < NumberOfParts; i++) {
                const signedURL = `https://some.url/${i}`;
                MOCK_GET_SIGNED_URL.mockReturnValueOnce(signedURL);
                expectedSignedURLs.push(signedURL);
            }

            // when
            const signedURLs = await S3_UTILS.getUploadPartSignedURLs({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID,
                NumberOfParts
            });

            // then
            expect(MOCK_UPLOAD_PART_COMMAND).toHaveBeenCalledTimes(NumberOfParts);
            for (let j = 0; j < NumberOfParts; j++) {
                expect(MOCK_UPLOAD_PART_COMMAND.mock.calls[j][0]).toStrictEqual({
                    Bucket: BUCKET,
                    Key: KEY,
                    UploadId: UPLOAD_ID,
                    PartNumber: j + 1
                });
            }
            expect(MOCK_GET_SIGNED_URL).toHaveBeenCalledTimes(NumberOfParts);
            expect(signedURLs).toEqual(expectedSignedURLs);
        });

        it('should reject if error is thrown', async () => {
            // given
            const error = new Error();
            MOCK_GET_SIGNED_URL.mockRejectedValueOnce(error);

            // when
            const callToFunction = async () => await S3_UTILS.getUploadPartSignedURLs({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID,
                NumberOfParts: 1
            });

            // then
            await expect(callToFunction).rejects.toThrow(error);
        });
    });

    describe('completeMultipartUpload', () => {
        it('should send CompleteMultipartUploadCommand to S3Client using given bucket and key', async () => {
            // when
            await S3_UTILS.completeMultipartUpload({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID,
                Parts: []
            });

            // then
            expect(MOCK_COMPLETE_MULTIPART_UPLOAD_COMMAND.mock.calls[0][0]).toStrictEqual({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID,
                MultipartUpload: {
                    Parts: []
                }
            });
            expect(MOCK_S3_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should reject if error is thrown', async () => {
            // given
            const error = new Error();
            MOCK_S3_CLIENT_SEND.mockRejectedValueOnce(error);

            // when
            const callToFunction = async () => await S3_UTILS.completeMultipartUpload({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID,
                Parts: []
            });

            // then
            await expect(callToFunction).rejects.toThrow(error);
        });
    });

    describe('abortMultipartUpload', () => {
        it('should send AbortMultipartUploadCommand to S3Client using given bucket and key', async () => {
            // when
            await S3_UTILS.abortMultipartUpload({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID
            });

            // then
            expect(MOCK_ABORT_MULTIPART_UPLOAD_COMMAND.mock.calls[0][0]).toStrictEqual({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID
            });
            expect(MOCK_S3_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should reject if error is thrown', async () => {
            // given
            const error = new Error();
            MOCK_S3_CLIENT_SEND.mockRejectedValueOnce(error);

            // when
            const callToFunction = async () => await S3_UTILS.abortMultipartUpload({
                Bucket: BUCKET,
                Key: KEY,
                UploadId: UPLOAD_ID
            });

            // then
            await expect(callToFunction).rejects.toThrow(error);
        });
    });
});