const {CronTime} = require('cron');
const {sleep} = require('../../testUtils');

const MOCK_STREAM_ID = 1;
const MOCK_STREAM = {
    _id: MOCK_STREAM_ID,
    deletePrerecordedVideo: jest.fn()
};

const MOCK_EVENT_STREAM_WITH_PRERECORDED_VIDEO_ID = 2;
const MOCK_EVENT_STREAM_WITH_PRERECORDED_VIDEO = {
    _id: MOCK_EVENT_STREAM_WITH_PRERECORDED_VIDEO_ID,
    eventStage: 1,
    prerecordedVideoFile: {
        bucket: 'test-bucket',
        key: 'test-key'
    },
    deletePrerecordedVideo: jest.fn()
};

const MOCK_EVENT_STREAM_ID = 3;
const MOCK_EVENT_STREAM = {
    _id: MOCK_EVENT_STREAM_ID,
    eventStage: 2,
    deletePrerecordedVideo: jest.fn()
};

const mockFindByIdAndDelete = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock('../../../server/model/schemas', () => ({
    ScheduledStream: {
        find: () => ({
            select: () => ({
                exec: () => [MOCK_STREAM, MOCK_EVENT_STREAM_WITH_PRERECORDED_VIDEO, MOCK_EVENT_STREAM]
            })
        }),
        findByIdAndDelete: mockFindByIdAndDelete
    },
    User: {
        updateMany: mockUpdateMany
    }
}));

const {job} = require('../../../server/cron/expiredScheduledStreamsRemover');

describe('expiredScheduledStreamsRemover', () => {
    it('should send delete queries to MongoDB when cron job triggers', async () => {
        // given
        job.setTime(new CronTime('* * * * * *'));

        // when
        job.start();
        expect(job.running).toBe(true);
        await sleep(1000);

        // then
        job.stop();
        expect(mockUpdateMany).toHaveBeenCalledTimes(1);
        expect(mockUpdateMany.mock.calls[0][0]).toEqual({nonSubscribedScheduledStreams: MOCK_STREAM_ID});
        expect(mockUpdateMany.mock.calls[0][1]).toEqual({$pull: {nonSubscribedScheduledStreams: MOCK_STREAM_ID}});
        expect(mockFindByIdAndDelete).toHaveBeenCalledWith(MOCK_STREAM_ID);
        expect(MOCK_STREAM.deletePrerecordedVideo).not.toHaveBeenCalled();
        expect(MOCK_EVENT_STREAM_WITH_PRERECORDED_VIDEO.deletePrerecordedVideo).toHaveBeenCalled();
        expect(MOCK_EVENT_STREAM.deletePrerecordedVideo).not.toHaveBeenCalled();
        expect(mockFindByIdAndDelete).not.toHaveBeenCalledWith(MOCK_EVENT_STREAM_WITH_PRERECORDED_VIDEO_ID, MOCK_EVENT_STREAM_ID);
    });
});