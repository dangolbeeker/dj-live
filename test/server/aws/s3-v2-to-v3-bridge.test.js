const S3V2ToV3Bridge = require('../../../server/aws/s3-v2-to-v3-bridge');

const mockParams = { Bucket: 'test-bucket', Key: 'helloWorld.txt' };
const mockCallback = () => {};
const mockResult = 'I PASSED!';
const mockError = new Error('I failed :(');
const mockEventListener = () => {};

let mockShouldUploadError;

const mockUploadOn = jest.fn();

jest.mock('@aws-sdk/lib-storage', () => ({
    Upload: jest.fn(() => ({
        done: () => {
            if (mockShouldUploadError){
                throw mockError;
            }
            return mockResult;
        },
        on: mockUploadOn
    }))
}));

const mockSend = jest.fn();
const mockDeleteObjectCommand = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => ({
        send: mockSend
    })),
    DeleteObjectCommand: jest.fn(() => mockDeleteObjectCommand)
}));

beforeEach(() => mockShouldUploadError = false);

describe('s3-v2-to-v3-bridge', () => {
    describe('upload', () => {
        it('should use the Upload class from @aws-sdk/lib-storage to carry out an upload', async () => {
            // given
            const bridge = new S3V2ToV3Bridge();
            // when
            const upload = bridge.upload(mockParams);
            // then
            await upload.send((err, result) => {
                expect(err).toBeNull();
                expect(result).toEqual(mockResult);
            });
        });

        it('should pass an error to the callback when @aws-sdk/lib-storage fails to carry out an upload', async () => {
            // given
            mockShouldUploadError = true;
            const bridge = new S3V2ToV3Bridge();
            // when
            const upload = bridge.upload(mockParams);
            // then
            await upload.send((err, result) => {
                expect(err).toEqual(mockError);
                expect(result).toEqual(null);
            });
        });

        it('should register a listener for httpUploadProgress events on the instance returned by upload', () => {
            // given
            const bridge = new S3V2ToV3Bridge();
            const upload = bridge.upload(mockParams);
            // when
            upload.on('httpUploadProgress', mockEventListener);
            // then
            expect(mockUploadOn).toBeCalledWith('httpUploadProgress', mockEventListener);
        });

        it('should not register listeners for events other than httpUploadProgress on the instance returned by upload', () => {
            // given
            const bridge = new S3V2ToV3Bridge();
            const upload = bridge.upload(mockParams);
            // when
            upload.on('someOtherEvent', mockEventListener);
            // then
            expect(mockUploadOn).not.toBeCalledWith('someOtherEvent', mockEventListener);
        })
    });

    describe('deleteObject', () => {
        it('should use the deleteObject method from the S3 class from @aws-sdk/client-s3 to delete an object', () => {
            // given
            const bridge = new S3V2ToV3Bridge();
            // when
            bridge.deleteObject(mockParams, mockCallback);
            // then
            expect(mockSend).toHaveBeenCalledWith(mockDeleteObjectCommand, mockCallback);
        });
    });
});
