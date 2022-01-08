let mockCreatedScheduledStreamsEmailerRunning = false;
let mockEventChatManagerRunning = false;
let mockExpiredScheduledStreamsRemoverRunning = false;
let mockNewSubscribersEmailerRunning = false;
let mockStreamSchedulerRunning = false;
let mockUpcomingScheduledStreamEmailerRunning = false;

jest.mock('../../../server/cron/createdScheduledStreamsEmailer', () => ({
    job: ({
        running: mockCreatedScheduledStreamsEmailerRunning,
        start: () => {
            mockCreatedScheduledStreamsEmailerRunning = true;
        }
    })
}));

jest.mock('../../../server/cron/eventChatManager', () => ({
    job: ({
        running: mockEventChatManagerRunning,
        start: () => {
            mockEventChatManagerRunning = true;
        }
    })
}));

jest.mock('../../../server/cron/expiredScheduledStreamsRemover', () => ({
    job: ({
        running: mockExpiredScheduledStreamsRemoverRunning,
        start: () => {
            mockExpiredScheduledStreamsRemoverRunning = true;
        }
    })
}));

jest.mock('../../../server/cron/newSubscribersEmailer', () => ({
    job: ({
        running: mockNewSubscribersEmailerRunning,
        start: () => {
            mockNewSubscribersEmailerRunning = true;
        }
    })
}));

jest.mock('../../../server/cron/streamScheduler', () => ({
    job: ({
        running: mockStreamSchedulerRunning,
        start: () => {
            mockStreamSchedulerRunning = true;
        }
    })
}));

jest.mock('../../../server/cron/upcomingScheduledStreamEmailer', () => ({
    job: ({
        running: mockUpcomingScheduledStreamEmailerRunning,
        start: () => {
            mockUpcomingScheduledStreamEmailerRunning = true;
        }
    })
}));



describe('cronJobs', () => {
    it('should start all cron jobs', async () => {
        // given
        const cronJobs = require('../../../server/cron/cronJobs');

        // when
        cronJobs.startAll();

        // then
        expect(mockCreatedScheduledStreamsEmailerRunning).toBe(true);
        expect(mockEventChatManagerRunning).toBe(true);
        expect(mockExpiredScheduledStreamsRemoverRunning).toBe(true);
        expect(mockNewSubscribersEmailerRunning).toBe(true);
        expect(mockStreamSchedulerRunning).toBe(true);
        expect(mockUpcomingScheduledStreamEmailerRunning).toBe(true);
    });
});