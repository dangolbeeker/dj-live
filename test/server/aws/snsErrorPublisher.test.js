import {overrideEnvironmentVariables} from '../../testUtils';

const ERROR = new Error();

const mockPublishCommand = jest.fn();
const mockSnsSend = jest.fn(() => ({
    MessageId: 'foo'
}));

jest.mock('@aws-sdk/client-sns', () => ({
    PublishCommand: mockPublishCommand,
    SNSClient: jest.fn(() => ({
        send: mockSnsSend
    }))
}));

const snsErrorPublisher = require('../../../server/aws/snsErrorPublisher');

beforeEach(() => jest.clearAllMocks());

describe('snsErrorPublisher', () => {
    describe('publish', () => {
        it('should throw error if NODE_ENV is not set to production', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'development'}).andDo(async () => {
                const callToPublisher = async () => await snsErrorPublisher.publish(ERROR);
                await expect(callToPublisher).rejects.toThrowError(ERROR);
                expect(mockSnsSend).not.toHaveBeenCalled();
            });
        });

        it('should publish error to SNS topic', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'production'}).andDo(async () => {
                await snsErrorPublisher.publish(ERROR);
                const publishCommandArgs = mockPublishCommand.mock.calls[0][0];
                expect(publishCommandArgs.Message).toEqual(ERROR.stack);
                expect(mockSnsSend).toHaveBeenCalledTimes(1);
            });
        });

        it('should throw an error if SNSClient does not return a MessageId', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'production'}).andDo(async () => {
                mockSnsSend.mockReturnValueOnce({});
                const callToPublisher = async () => await snsErrorPublisher.publish(ERROR);
                const expectedError = new Error(`No MessageId returned from SNSClient, so info about error will not be published. Original error: ${ERROR.stack}`);
                await expect(callToPublisher).rejects.toThrowError(expectedError);
                expect(mockSnsSend).toHaveBeenCalledTimes(1);
            });
        });
    });
});