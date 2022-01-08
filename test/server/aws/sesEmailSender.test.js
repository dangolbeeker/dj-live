const moment = require('moment');

const CompositeError = require('../../../server/errors/CompositeError');
const {overrideEnvironmentVariables} = require('../../testUtils');

const USER_WITH_DISPLAY_NAME_1 = {
    email: 'hasDisplayName1@email.com',
    displayName: 'Test Display Name 1',
    username: 'testUsername1',
    getProfilePicURL: () => 'testUsername1/profilePic.jpg',
    emailSettings: {
        subscriptionWentLive: true
    }
};

const USER_WITH_DISPLAY_NAME_2 = {
    email: 'hasDisplayName2@email.com',
    displayName: 'Test Display Name 2',
    username: 'testUsername2',
    getProfilePicURL: () => 'testUsername2/profilePic.jpg',
    emailSettings: {
        subscriptionWentLive: false
    }
};

const USER_WITHOUT_DISPLAY_NAME_1 = {
    email: 'hasNoDisplayName1@email.com',
    username: 'testUsername3',
    getProfilePicURL: () => 'testUsername3/profilePic.jpg',
    emailSettings: {
        subscriptionWentLive: true
    }
};

const USER_WITHOUT_DISPLAY_NAME_2 = {
    email: 'hasNoDisplayName2@email.com',
    username: 'testUsername4',
    getProfilePicURL: () => 'testUsername4/profilePic.jpg'
};

const USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME = {
    displayName: 'User with displayName and Subscriber with displayName',
    username: 'userWithSubscribers1',
    getProfilePicURL: () => 'userWithSubscribers1/profilePic.jpg',
    subscribers: [{user: USER_WITH_DISPLAY_NAME_1}]
};

const USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME = {
    username: 'userWithSubscribers2',
    getProfilePicURL: () => 'userWithSubscribers2/profilePic.jpg',
    subscribers: [{user: USER_WITH_DISPLAY_NAME_1}]
};

const USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME = {
    displayName: 'User with displayName and Subscriber without displayName',
    username: 'userWithSubscribers3',
    getProfilePicURL: () => 'userWithSubscribers3/profilePic.jpg',
    subscribers: [{user: USER_WITHOUT_DISPLAY_NAME_1}]
};

const USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME = {
    username: 'userWithSubscribers4',
    getProfilePicURL: () => 'userWithSubscribers4/profilePic.jpg',
    subscribers: [{user: USER_WITHOUT_DISPLAY_NAME_1}]
};

const USER_WITH_SUBSCRIBER_WITH_SUBSCRIPTION_WENT_LIVE_SETTING_TURNED_OFF = {
    displayName: 'User with Subscriber with subscriptionWentLive set to false',
    username: 'userWithSubscribers5',
    getProfilePicURL: () => 'userWithSubscribers5/profilePic.jpg',
    subscribers: [{user: USER_WITH_DISPLAY_NAME_2}]
};

const STREAM_BY_USER_WITH_DISPLAY_NAME = {
    user: USER_WITH_DISPLAY_NAME_1,
    title: 'Stream by User with displayName',
    genre: 'Drum & Bass',
    category: 'DJ Set',
    startTime: new Date(2021, 6, 22, 18, 30),
    endTime: new Date(2021, 6, 22, 19, 30)
}

const STREAM_BY_USER_WITHOUT_DISPLAY_NAME = {
    user: USER_WITHOUT_DISPLAY_NAME_1,
    title: 'Stream by User without displayName',
    genre: 'Techno',
    category: 'Live Set',
    startTime: new Date(2021, 6, 22, 20, 30),
    endTime: new Date(2021, 6, 22, 21, 30)
}

const STREAM_ENDING_ON_DIFFERENT_DAY = {
    user: USER_WITH_DISPLAY_NAME_1,
    title: 'Stream by User with displayName',
    genre: 'Drum & Bass',
    category: 'DJ Set',
    startTime: new Date(2021, 6, 22, 23, 30),
    endTime: new Date(2021, 6, 23, 0, 30)
}

const PASSWORD_RESET_TOKEN = 'blahblahblah';
const ERROR = new Error();

const MOCK_SES_CLIENT_SEND = jest.fn();
const MOCK_SEND_TEMPLATED_EMAIL_COMMAND = jest.fn();
const MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND = jest.fn();

jest.mock('@aws-sdk/client-ses', () => ({
    SESClient: jest.fn(() => ({
        send: MOCK_SES_CLIENT_SEND
    })),
    SendTemplatedEmailCommand: MOCK_SEND_TEMPLATED_EMAIL_COMMAND,
    SendBulkTemplatedEmailCommand: MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND
}));

const MOCK_NEW_SUBSCRIBERS_TEMPLATE_NAME = 'testNewSubscribers';
const MOCK_SUBSCRIPTION_WENT_LIVE_TEMPLATE_NAME = 'testSubscriptionWentLive';
const MOCK_SUBSCRIPTIONS_CREATED_SCHEDULED_STREAMS_TEMPLATE_NAME = 'testSubscriptionsCreatedScheduledStreams';
const MOCK_SUBSCRIPTION_SCHEDULED_STREAM_STARTING_IN_TEMPLATE_NAME = 'testSubscriptionScheduledStreamStartingIn';
const MOCK_RESET_PASSWORD_TEMPLATE_NAME = 'testResetPassword';
const MOCK_WELCOME_NEW_USER_TEMPLATE_NAME = 'testWelcomeNewUser';
const MOCK_SITE_NAME = 'Mainroom Test';
const MOCK_TIME_FORMAT = 'HH:mm';
const MOCK_DATE_FORMAT = `ddd, DD MMM, yyyy · ${MOCK_TIME_FORMAT}`;

jest.mock('../../../mainroom.config', () => ({
    email: {
        ses: {
            templateNames: {
                newSubscribers: MOCK_NEW_SUBSCRIBERS_TEMPLATE_NAME,
                subscriptionWentLive: MOCK_SUBSCRIPTION_WENT_LIVE_TEMPLATE_NAME,
                subscriptionsCreatedScheduledStreams: MOCK_SUBSCRIPTIONS_CREATED_SCHEDULED_STREAMS_TEMPLATE_NAME,
                subscriptionScheduledStreamStartingIn: MOCK_SUBSCRIPTION_SCHEDULED_STREAM_STARTING_IN_TEMPLATE_NAME,
                resetPassword: MOCK_RESET_PASSWORD_TEMPLATE_NAME,
                welcomeNewUser: MOCK_WELCOME_NEW_USER_TEMPLATE_NAME
            }
        }
    },
    siteName: MOCK_SITE_NAME,
    timeFormat: MOCK_TIME_FORMAT,
    dateFormat: MOCK_DATE_FORMAT
}));

const MOCK_SNS_ERROR_PUBLISHER_PUBLISH = jest.fn();

jest.mock('../../../server/aws/snsErrorPublisher', () => ({
    publish: MOCK_SNS_ERROR_PUBLISHER_PUBLISH
}));

const NO_REPLY_EMAIL = 'test@email.com';
const EXPECTED_SOURCE = `${MOCK_SITE_NAME} <${NO_REPLY_EMAIL}>`;

overrideEnvironmentVariables({NO_REPLY_EMAIL}).beforeAll();

beforeEach(() => jest.clearAllMocks());

describe('sesEmailSender', () => {
    describe('notifyUserOfNewSubscribers', () => {
        it("should send email using user's display name and subscriber's display name", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const subscribers = [USER_WITH_DISPLAY_NAME_2]

            // when
            await sesEmailSender.notifyUserOfNewSubscribers(USER_WITH_DISPLAY_NAME_1, subscribers);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_NEW_SUBSCRIBERS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_1.displayName,
                        username: USER_WITH_DISPLAY_NAME_1.username
                    },
                    newSubscribers: [{
                        displayName: USER_WITH_DISPLAY_NAME_2.displayName,
                        username: USER_WITH_DISPLAY_NAME_2.username,
                        profilePicURL: USER_WITH_DISPLAY_NAME_2.getProfilePicURL()
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's username and subscriber's display name", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const subscribers = [USER_WITH_DISPLAY_NAME_1]

            // when
            await sesEmailSender.notifyUserOfNewSubscribers(USER_WITHOUT_DISPLAY_NAME_1, subscribers);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destination: {
                    ToAddresses: [USER_WITHOUT_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_NEW_SUBSCRIBERS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_1.username,
                        username: USER_WITHOUT_DISPLAY_NAME_1.username
                    },
                    newSubscribers: [{
                        displayName: USER_WITH_DISPLAY_NAME_1.displayName,
                        username: USER_WITH_DISPLAY_NAME_1.username,
                        profilePicURL: USER_WITH_DISPLAY_NAME_1.getProfilePicURL()
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's display name and subscriber's username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const subscribers = [USER_WITHOUT_DISPLAY_NAME_1]

            // when
            await sesEmailSender.notifyUserOfNewSubscribers(USER_WITH_DISPLAY_NAME_1, subscribers);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_NEW_SUBSCRIBERS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_1.displayName,
                        username: USER_WITH_DISPLAY_NAME_1.username
                    },
                    newSubscribers: [{
                        displayName: USER_WITHOUT_DISPLAY_NAME_1.username,
                        username: USER_WITHOUT_DISPLAY_NAME_1.username,
                        profilePicURL: USER_WITHOUT_DISPLAY_NAME_1.getProfilePicURL()
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's username and subscriber's username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const subscribers = [USER_WITHOUT_DISPLAY_NAME_2]

            // when
            await sesEmailSender.notifyUserOfNewSubscribers(USER_WITHOUT_DISPLAY_NAME_1, subscribers);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destination: {
                    ToAddresses: [USER_WITHOUT_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_NEW_SUBSCRIBERS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_1.username,
                        username: USER_WITHOUT_DISPLAY_NAME_1.username
                    },
                    newSubscribers: [{
                        displayName: USER_WITHOUT_DISPLAY_NAME_2.username,
                        username: USER_WITHOUT_DISPLAY_NAME_2.username,
                        profilePicURL: USER_WITHOUT_DISPLAY_NAME_2.getProfilePicURL()
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should publish error to SNS when one is thrown', async () => {
            // given
            MOCK_SES_CLIENT_SEND.mockRejectedValueOnce(ERROR);
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const subscribers = [USER_WITHOUT_DISPLAY_NAME_2]

            // when
            await sesEmailSender.notifyUserOfNewSubscribers(USER_WITHOUT_DISPLAY_NAME_1, subscribers);

            // then
            expect(MOCK_SNS_ERROR_PUBLISHER_PUBLISH).toHaveBeenCalledWith(ERROR);
        });
    });

    describe('notifySubscribersUserWentLive', () => {
        it('should send email to subscriber with display name of user with display name', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.notifySubscribersUserWentLive(USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME);

            // then
            expect(MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destinations: [{
                    Destination: {
                        ToAddresses: [USER_WITH_DISPLAY_NAME_1.email]
                    },
                    ReplacementTemplateData: JSON.stringify({
                        subscriber: {
                            displayName: USER_WITH_DISPLAY_NAME_1.displayName
                        }
                    })
                }],
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_WENT_LIVE_TEMPLATE_NAME,
                DefaultTemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME.displayName,
                        username: USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME.username,
                        profilePicURL: USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME.getProfilePicURL()
                    }
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should send email to subscriber with display name of user without display name', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.notifySubscribersUserWentLive(USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME);

            // then
            expect(MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destinations: [{
                    Destination: {
                        ToAddresses: [USER_WITH_DISPLAY_NAME_1.email]
                    },
                    ReplacementTemplateData: JSON.stringify({
                        subscriber: {
                            displayName: USER_WITH_DISPLAY_NAME_1.displayName
                        }
                    })
                }],
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_WENT_LIVE_TEMPLATE_NAME,
                DefaultTemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME.username,
                        username: USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME.username,
                        profilePicURL: USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME.getProfilePicURL()
                    }
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should send email to subscriber without display name of user with display name', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.notifySubscribersUserWentLive(USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME);

            // then
            expect(MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destinations: [{
                    Destination: {
                        ToAddresses: [USER_WITHOUT_DISPLAY_NAME_1.email]
                    },
                    ReplacementTemplateData: JSON.stringify({
                        subscriber: {
                            displayName: USER_WITHOUT_DISPLAY_NAME_1.username
                        }
                    })
                }],
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_WENT_LIVE_TEMPLATE_NAME,
                DefaultTemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME.displayName,
                        username: USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME.username,
                        profilePicURL: USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME.getProfilePicURL()
                    }
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should send email to subscriber without display name of user without display name', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.notifySubscribersUserWentLive(USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME);

            // then
            expect(MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destinations: [{
                    Destination: {
                        ToAddresses: [USER_WITHOUT_DISPLAY_NAME_1.email]
                    },
                    ReplacementTemplateData: JSON.stringify({
                        subscriber: {
                            displayName: USER_WITHOUT_DISPLAY_NAME_1.username
                        }
                    })
                }],
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_WENT_LIVE_TEMPLATE_NAME,
                DefaultTemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME.username,
                        username: USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME.username,
                        profilePicURL: USER_WITHOUT_DISPLAY_NAME_AND_SUBSCRIBER_WITHOUT_DISPLAY_NAME.getProfilePicURL()
                    }
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should not send email if no subscribers have "subscriptionWentLive" setting set to true', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.notifySubscribersUserWentLive(USER_WITH_SUBSCRIBER_WITH_SUBSCRIPTION_WENT_LIVE_SETTING_TURNED_OFF);

            // then
            expect(MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND).not.toHaveBeenCalled();
            expect(MOCK_SES_CLIENT_SEND).not.toHaveBeenCalled();
        });

        it('should send a SendBulkTemplatedEmailCommand for each group of up to 50 subscribers', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const numberOfSubscribers = 120;
            const userWithAHundredSubscribers = Object.assign({}, USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME);
            for (let i = 1; i < numberOfSubscribers; i++) {
                userWithAHundredSubscribers.subscribers.push({user: USER_WITH_DISPLAY_NAME_1});
            }

            // when
            await sesEmailSender.notifySubscribersUserWentLive(userWithAHundredSubscribers);

            // then
            const expectedNumberOfCalls = Math.ceil(numberOfSubscribers / 50);
            expect(MOCK_SEND_BULK_TEMPLATED_EMAIL_COMMAND).toHaveBeenCalledTimes(expectedNumberOfCalls);
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(expectedNumberOfCalls);
        });

        it('should publish error to SNS when one is thrown', async () => {
            // given
            MOCK_SES_CLIENT_SEND.mockRejectedValueOnce(ERROR);
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.notifySubscribersUserWentLive(USER_WITH_DISPLAY_NAME_AND_SUBSCRIBER_WITH_DISPLAY_NAME);

            // then
            const actualError = MOCK_SNS_ERROR_PUBLISHER_PUBLISH.mock.calls[0][0];
            expect(actualError).toBeInstanceOf(CompositeError);
            expect(actualError.errors).toContain(ERROR);
        });
    });

    describe('notifyUserSubscriptionsCreatedScheduledStreams', () => {
        it("should send email using user's display name and stream creator's display name", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITH_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserSubscriptionsCreatedScheduledStreams(USER_WITH_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_2.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTIONS_CREATED_SCHEDULED_STREAMS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_2.displayName
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITH_DISPLAY_NAME.user.displayName,
                            username: STREAM_BY_USER_WITH_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITH_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITH_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITH_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITH_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's username and stream creator's display name", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITH_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserSubscriptionsCreatedScheduledStreams(USER_WITHOUT_DISPLAY_NAME_1, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITHOUT_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTIONS_CREATED_SCHEDULED_STREAMS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_1.username
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITH_DISPLAY_NAME.user.displayName,
                            username: STREAM_BY_USER_WITH_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITH_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITH_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITH_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITH_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's display name and stream creator's username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITHOUT_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserSubscriptionsCreatedScheduledStreams(USER_WITH_DISPLAY_NAME_1, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTIONS_CREATED_SCHEDULED_STREAMS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_1.displayName
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            username: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's username and stream creator's username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITHOUT_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserSubscriptionsCreatedScheduledStreams(USER_WITHOUT_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITHOUT_DISPLAY_NAME_2.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTIONS_CREATED_SCHEDULED_STREAMS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_2.username
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            username: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should format timeRange correctly if stream is scheduled to end on different day', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_ENDING_ON_DIFFERENT_DAY]

            // when
            await sesEmailSender.notifyUserSubscriptionsCreatedScheduledStreams(USER_WITH_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_2.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTIONS_CREATED_SCHEDULED_STREAMS_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_2.displayName
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_ENDING_ON_DIFFERENT_DAY.user.displayName,
                            username: STREAM_ENDING_ON_DIFFERENT_DAY.user.username,
                            profilePicURL: STREAM_ENDING_ON_DIFFERENT_DAY.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_ENDING_ON_DIFFERENT_DAY.title,
                            genre: STREAM_ENDING_ON_DIFFERENT_DAY.genre,
                            category: STREAM_ENDING_ON_DIFFERENT_DAY.category,
                            timeRange: `${moment(STREAM_ENDING_ON_DIFFERENT_DAY.startTime).format(MOCK_DATE_FORMAT)} - ${moment(STREAM_ENDING_ON_DIFFERENT_DAY.endTime).format(MOCK_DATE_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should publish error to SNS when one is thrown', async () => {
            // given
            MOCK_SES_CLIENT_SEND.mockRejectedValueOnce(ERROR);
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITH_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserSubscriptionsCreatedScheduledStreams(USER_WITH_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SNS_ERROR_PUBLISHER_PUBLISH).toHaveBeenCalledWith(ERROR);
        });
    });

    describe('notifyUserOfSubscriptionsStreamsStartingSoon', () => {
        it("should send email using user's display name and stream creator's display name", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITH_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserOfSubscriptionsStreamsStartingSoon(USER_WITH_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_2.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_SCHEDULED_STREAM_STARTING_IN_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_2.displayName
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITH_DISPLAY_NAME.user.displayName,
                            username: STREAM_BY_USER_WITH_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITH_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITH_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITH_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITH_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's username and stream creator's display name", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITH_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserOfSubscriptionsStreamsStartingSoon(USER_WITHOUT_DISPLAY_NAME_1, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITHOUT_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_SCHEDULED_STREAM_STARTING_IN_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_1.username
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITH_DISPLAY_NAME.user.displayName,
                            username: STREAM_BY_USER_WITH_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITH_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITH_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITH_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITH_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITH_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's display name and stream creator's username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITHOUT_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserOfSubscriptionsStreamsStartingSoon(USER_WITH_DISPLAY_NAME_1, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_SCHEDULED_STREAM_STARTING_IN_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_1.displayName
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            username: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's username and stream creator's username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITHOUT_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserOfSubscriptionsStreamsStartingSoon(USER_WITHOUT_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITHOUT_DISPLAY_NAME_2.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_SCHEDULED_STREAM_STARTING_IN_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_2.username
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            username: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.username,
                            profilePicURL: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.title,
                            genre: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.genre,
                            category: STREAM_BY_USER_WITHOUT_DISPLAY_NAME.category,
                            timeRange: `${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.startTime).format(MOCK_DATE_FORMAT)}-${moment(STREAM_BY_USER_WITHOUT_DISPLAY_NAME.endTime).format(MOCK_TIME_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should format timeRange correctly if stream is scheduled to end on different day', async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_ENDING_ON_DIFFERENT_DAY]

            // when
            await sesEmailSender.notifyUserOfSubscriptionsStreamsStartingSoon(USER_WITH_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_2.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_SUBSCRIPTION_SCHEDULED_STREAM_STARTING_IN_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_2.displayName
                    },
                    streams: [{
                        user: {
                            displayName: STREAM_ENDING_ON_DIFFERENT_DAY.user.displayName,
                            username: STREAM_ENDING_ON_DIFFERENT_DAY.user.username,
                            profilePicURL: STREAM_ENDING_ON_DIFFERENT_DAY.user.getProfilePicURL()
                        },
                        stream: {
                            title: STREAM_ENDING_ON_DIFFERENT_DAY.title,
                            genre: STREAM_ENDING_ON_DIFFERENT_DAY.genre,
                            category: STREAM_ENDING_ON_DIFFERENT_DAY.category,
                            timeRange: `${moment(STREAM_ENDING_ON_DIFFERENT_DAY.startTime).format(MOCK_DATE_FORMAT)} - ${moment(STREAM_ENDING_ON_DIFFERENT_DAY.endTime).format(MOCK_DATE_FORMAT)}`
                        }
                    }]
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should publish error to SNS when one is thrown', async () => {
            // given
            MOCK_SES_CLIENT_SEND.mockRejectedValueOnce(ERROR);
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const streams = [STREAM_BY_USER_WITH_DISPLAY_NAME]

            // when
            await sesEmailSender.notifyUserOfSubscriptionsStreamsStartingSoon(USER_WITH_DISPLAY_NAME_2, streams);

            // then
            expect(MOCK_SNS_ERROR_PUBLISHER_PUBLISH).toHaveBeenCalledWith(ERROR);
        });
    });

    describe('sendResetPasswordEmail', () => {
        it("should send email using user's display name", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.sendResetPasswordEmail(USER_WITH_DISPLAY_NAME_1, PASSWORD_RESET_TOKEN);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destination: {
                    ToAddresses: [USER_WITH_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_RESET_PASSWORD_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITH_DISPLAY_NAME_1.displayName
                    },
                    token: PASSWORD_RESET_TOKEN
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it("should send email using user's username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.sendResetPasswordEmail(USER_WITHOUT_DISPLAY_NAME_1, PASSWORD_RESET_TOKEN);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destination: {
                    ToAddresses: [USER_WITHOUT_DISPLAY_NAME_1.email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_RESET_PASSWORD_TEMPLATE_NAME,
                TemplateData: JSON.stringify({
                    user: {
                        displayName: USER_WITHOUT_DISPLAY_NAME_1.username
                    },
                    token: PASSWORD_RESET_TOKEN
                })
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should publish error to SNS when one is thrown', async () => {
            // given
            MOCK_SES_CLIENT_SEND.mockRejectedValueOnce(ERROR);
            const sesEmailSender = require('../../../server/aws/sesEmailSender');

            // when
            await sesEmailSender.sendResetPasswordEmail(USER_WITHOUT_DISPLAY_NAME_1, PASSWORD_RESET_TOKEN);

            // then
            expect(MOCK_SNS_ERROR_PUBLISHER_PUBLISH).toHaveBeenCalledWith(ERROR);
        });
    });

    describe('sendWelcomeEmail', () => {
        it("should send email using user's email address and username", async () => {
            // given
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const email = USER_WITH_DISPLAY_NAME_1.email;
            const username = USER_WITH_DISPLAY_NAME_1.username;

            // when
            await sesEmailSender.sendWelcomeEmail(email, username);

            // then
            expect(MOCK_SEND_TEMPLATED_EMAIL_COMMAND.mock.calls[0][0]).toStrictEqual({
                Destination: {
                    ToAddresses: [email]
                },
                Source: EXPECTED_SOURCE,
                Template: MOCK_WELCOME_NEW_USER_TEMPLATE_NAME,
                TemplateData: JSON.stringify({username})
            });
            expect(MOCK_SES_CLIENT_SEND).toHaveBeenCalledTimes(1);
        });

        it('should publish error to SNS when one is thrown', async () => {
            // given
            MOCK_SES_CLIENT_SEND.mockRejectedValueOnce(ERROR);
            const sesEmailSender = require('../../../server/aws/sesEmailSender');
            const email = USER_WITH_DISPLAY_NAME_1.email;
            const username = USER_WITH_DISPLAY_NAME_1.username;

            // when
            await sesEmailSender.sendWelcomeEmail(email, username);

            // then
            expect(MOCK_SNS_ERROR_PUBLISHER_PUBLISH).toHaveBeenCalledWith(ERROR);
        });
    });
});