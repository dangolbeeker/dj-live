const {CronTime} = require('cron');
const config = require('../../../mainroom.config');
const {sleep} = require('../../testUtils');

const mockSubscriber1 = {
    user: {
        username: 'subscriber1',
        displayName: 'Subscriber 1',
        profilePicURL: 'https://s3.amazonaws.com/not-a-real-bucket/1.png'
    },
    subscribedAt: new Date(2021, 2, 4, 16)
};

const mockSubscriber2 = {
    user: {
        username: 'subscriber2',
        displayName: 'Subscriber 2',
        profilePicURL: 'https://s3.amazonaws.com/not-a-real-bucket/2.png'
    },
    subscribedAt: new Date(2021, 2, 4, 18)
};

const mockSubscriber3 = {
    user: {
        username: 'subscriber3',
        displayName: 'Subscriber 3',
        profilePicURL: 'https://s3.amazonaws.com/not-a-real-bucket/3.png'
    },
    subscribedAt: new Date(2021, 2, 4, 20)
};

const mockUser1 = {
    _id: 0,
    username: 'foo',
    displayName: 'bar',
    email: 'foo@bar.com',
    subscribers: [mockSubscriber1, mockSubscriber2]
};

const mockUser1ExpectedSubscribers = [mockSubscriber1.user, mockSubscriber2.user];

const mockUser2 = {
    _id: 1,
    username: 'test',
    displayName: 'Test User',
    email: 'test@email.com',
    subscribers: [mockSubscriber3]
};

const mockUser2ExpectedSubscribers = [mockSubscriber3.user];

jest.mock('../../../server/model/schemas', () => ({
    User: {
        find: () => ({
            select: () => ({
                populate: () => ({
                    exec: () => [mockUser1, mockUser2]
                })
            })
        })
    }
}));

const mockNotifyUserOfNewSubscribers = jest.fn();

jest.mock('../../../server/aws/sesEmailSender', () => ({
    notifyUserOfNewSubscribers: mockNotifyUserOfNewSubscribers
}));

const originalEmailEnabled = config.email.enabled;
let job;

beforeAll(() => {
    config.email.enabled = true;
    job = require('../../../server/cron/newSubscribersEmailer').job;
});

afterAll(() => {
    config.email.enabled = originalEmailEnabled;
});

describe('newSubscribersEmailer', () => {
    it('should send emails to required users about new subscribers when cron job triggers', async () => {
        // given
        job.setTime(new CronTime('* * * * * *'));

        // when
        job.start();
        expect(job.running).toBe(true);
        await sleep(1000);

        // then
        job.stop();
        expect(mockNotifyUserOfNewSubscribers).toHaveBeenCalledWith(mockUser1, mockUser1ExpectedSubscribers);
        expect(mockNotifyUserOfNewSubscribers).toHaveBeenCalledWith(mockUser2, mockUser2ExpectedSubscribers);
    });
});