const {CronTime} = require('cron');
const config = require('../../../mainroom.config');
const {sleep} = require('../../testUtils');
const moment = require('moment');

const SUBSCRIPTION_ID = 0;
const STARTING_IN = 60;
const USERNAME = 'foo';
const DISPLAY_NAME = 'bar';
const EMAIL = 'foo@bar.com';

const mockSubscribedStream = {
    user: {_id: SUBSCRIPTION_ID},
    startTime: new Date(2020, 8, 17, 16),
    endTime: new Date(2020, 8, 17, 17),
    title: 'Test Stream',
    genre: 'Drum & Bass',
    category: 'DJ Set'
};

const mockNonSubscribedStream = {
    user: {_id: 1},
    startTime: moment().add(STARTING_IN, 'minutes').add(30, 'seconds'), // offset by some time later than cron job trigger
    endTime: moment().add(STARTING_IN, 'minutes').add(1, 'hour'),
    title: 'Another Test Stream',
    genre: 'Techno',
    category: 'Production'
};

const mockUser = {
    username: USERNAME,
    displayName: DISPLAY_NAME,
    email: EMAIL,
    emailSettings: {
        subscriptionScheduledStreamStartingIn: STARTING_IN
    },
    subscriptions: [{
        user: {_id: SUBSCRIPTION_ID}
    }],
    nonSubscribedScheduledStreams: [mockNonSubscribedStream]
};

const expectedUserData = {
    email: EMAIL,
    displayName: DISPLAY_NAME,
    username: USERNAME
};

const expectedStreams = [mockSubscribedStream, mockNonSubscribedStream];

jest.mock('../../../server/model/schemas', () => ({
    User: {
        find: () => ({
            select: () => ({
                populate: () => ({
                    exec: () => [mockUser]
                })
            })
        })
    },
    ScheduledStream: {
        find: () => ({
            select: () => ({
                populate: () => ({
                        exec: () => [mockSubscribedStream]
                })
            })
        })
    }
}));

const mockNotifyUserOfSubscriptionsStreamsStartingSoon = jest.fn();

jest.mock('../../../server/aws/sesEmailSender', () => ({
    notifyUserOfSubscriptionsStreamsStartingSoon: mockNotifyUserOfSubscriptionsStreamsStartingSoon
}));

const originalEmailEnabled = config.email.enabled;
let job;

beforeAll(() => {
    config.email.enabled = true;
    job = require('../../../server/cron/upcomingScheduledStreamEmailer').job;
});

afterAll(() => {
    config.email.enabled = originalEmailEnabled;
});

describe('upcomingScheduledStreamEmailer', () => {
    it('should send emails to required users about streams starting soon when cron job triggers', async() => {
        // given
        job.setTime(new CronTime('* * * * * *'));

        // when
        job.start();
        expect(job.running).toBe(true);
        await sleep(1000);

        // then
        job.stop();
        expect(mockNotifyUserOfSubscriptionsStreamsStartingSoon).toHaveBeenCalledWith(expectedUserData, expectedStreams);
    });
});
