const {SNSClient, PublishCommand} = require('@aws-sdk/client-sns');

const SNS_CLIENT = new SNSClient({});

const errorsToIgnore = ['ForbiddenError'];

module.exports.publish = async errorToPublish => {
    if (errorsToIgnore.includes(errorToPublish.name)) {
        return;
    }
    if (process.env.NODE_ENV !== 'production') {
        // throw if non-production environment
        throw errorToPublish;
    }
    const errorString = errorToPublish.stack || errorToPublish.toString();
    const publishCommand = new PublishCommand({
        TopicArn: process.env.ERROR_SNS_TOPIC_ARN,
        Subject: `${errorToPublish.name || 'Error'} occurred in Mainroom ${process.env.NODE_ENV} environment`,
        Message: errorString
    });
    const response = await SNS_CLIENT.send(publishCommand);
    if (!response.MessageId) {
        throw new Error(`No MessageId returned from SNSClient, so info about error will not be published. Original error: ${errorString}`);
    }
};
