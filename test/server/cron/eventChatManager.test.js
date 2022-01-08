const {CronTime} = require('cron');
const {sleep} = require('../../testUtils');

const MOCK_EVENT_ID = 0;
const MOCK_EVENT = {
    _id: MOCK_EVENT_ID
};

jest.mock('../../../server/model/schemas', () => ({
    Event: ({
        find: () => ({
            select: () => ({
                exec: () => [MOCK_EVENT]
            })
        })
    })
}));

const mockChatOpened = jest.fn();
const mockChatClosed = jest.fn();
const mockChatAlert = jest.fn();

jest.mock('../../../server/mainroomEventBus', () => ({
    send: (event, args) => {
        switch (event) {
            case 'chatOpened':
                mockChatOpened(args);
                break;
            case 'chatClosed':
                mockChatClosed(args);
                break;
            case 'chatAlert':
                mockChatAlert(args);
                break;
        }
    }
}));

const {job} = require('../../../server/cron/eventChatManager');

describe('eventChatManager', () => {
    it('should send events along mainroomEventBus that open/close/alert Event chats when cron job triggers', async () => {
        // given
        job.setTime(new CronTime('* * * * * *'));

        // when
        job.start();
        expect(job.running).toBe(true);
        await sleep(1000);

        // then
        job.stop();

        expect(mockChatOpened).toHaveBeenCalledTimes(1);
        expect(mockChatOpened).toHaveBeenCalledWith(MOCK_EVENT_ID);

        expect(mockChatClosed).toHaveBeenCalledTimes(1);
        expect(mockChatClosed).toHaveBeenCalledWith(MOCK_EVENT_ID);

        const expectedNumberOfAlerts = 10;
        expect(mockChatAlert).toHaveBeenCalledTimes(expectedNumberOfAlerts);
        for (let i = 1; i <= expectedNumberOfAlerts; i++) {
            expect(mockChatAlert).toHaveBeenCalledWith({
                recipient: MOCK_EVENT_ID,
                alert: `*** CHAT CLOSES IN ${i} MINUTE${i === 1 ? '' : 'S'} ***`
            });
        }
    });
});