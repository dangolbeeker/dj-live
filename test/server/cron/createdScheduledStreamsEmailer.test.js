const {CronTime} = require('cron');
const config = require('../../../mainroom.config');
const {sleep} = require('../../testUtils');

const USER_ID_MOCK_STREAM_1 = 1;
const USER_ID_MOCK_STREAM_2 = 2;
const USER_ID_MOCK_STREAM_3 = 3;

const mockStream1 = {
    user: {_id: USER_ID_MOCK_STREAM_1},
    startTime: new Date(2021, 2, 4, 16),
    endTime: new Date(2021, 2, 4, 17),
    title: 'Test Stream',
    genre: 'Drum & Bass',
    category: 'DJ Set'
};

const mockStream2 = {
    user: {_id: USER_ID_MOCK_STREAM_2},
    startTime: new Date(2021, 2, 4, 18),
    endTime: new Date(2021, 2, 4, 19),
    title: 'Another Test Stream',
    genre: 'Techno',
    category: 'Production'
};

const mockStream3 = {
    user: {_id: USER_ID_MOCK_STREAM_3},
    startTime: new Date(2021, 2, 4, 20),
    endTime: new Date(2021, 2, 4, 21),
    title: 'One More Test Stream',
    genre: 'Rock',
    category: 'Live Set'
};

const mockUser1 = {
    _id: 3,
    username: 'foo',
    displayName: 'bar',
    email: 'foo@bar.com',
    subscriptions: [
        {user: USER_ID_MOCK_STREAM_1},
        {user: USER_ID_MOCK_STREAM_2}
    ]
};

const mockUser1ExpectedStreams = [mockStream1, mockStream2];

const mockUser2 = {
    _id: 4,
    username: 'test',
    displayName: 'Test User',
    email: 'test@email.com',
    subscriptions: [
        {user: USER_ID_MOCK_STREAM_3}
    ]
};

const mockUser2ExpectedStreams = [mockStream3];

jest.mock('../../../server/model/schemas', () => ({
    ScheduledStream: {
        find: () => ({
            select: () => ({
                populate: () => ({
                    exec: () => [mockStream1, mockStream2, mockStream3]
                })
            })
        })
    },
    User: {
        find: () => ({
            select: () => ({
                exec: () => [mockUser1, mockUser2]
            })
        })
    }
}));

const mockNotifyUserSubscriptionsCreatedScheduledStreams = jest.fn();

jest.mock('../../../server/aws/sesEmailSender', () => {
    return {
        notifyUserSubscriptionsCreatedScheduledStreams: mockNotifyUserSubscriptionsCreatedScheduledStreams
    };
});

const originalEmailEnabled = config.email.enabled;
let job;

beforeAll(() => {
    config.email.enabled = true;
    job = require('../../../server/cron/createdScheduledStreamsEmailer').job;
});

afterAll(() => {
    config.email.enabled = originalEmailEnabled;
});

describe('createdScheduledStreamsEmailer', () => {
    it('should send emails to required users about new subscriber-created scheduled streams when cron job triggers', async () => {
        // given
        job.setTime(new CronTime('* * * * * *'));

        // when
        job.start();
        expect(job.running).toBe(true);
        await sleep(1000);

        // then
        job.stop();
        expect(mockNotifyUserSubscriptionsCreatedScheduledStreams).toHaveBeenCalledWith(mockUser1, mockUser1ExpectedStreams);
        expect(mockNotifyUserSubscriptionsCreatedScheduledStreams).toHaveBeenCalledWith(mockUser2, mockUser2ExpectedStreams);
    });
});