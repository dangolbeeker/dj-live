const {CronTime} = require('cron');
const {sleep} = require('../../testUtils');

const mockUserStream = {
    user: {_id: 0},
    startTime: new Date(2020, 8, 17, 16),
    endTime: new Date(2020, 8, 17, 17),
    title: 'Test Stream',
    genre: 'Drum & Bass',
    category: 'DJ Set',
    tags: ['test', 'stream']
};

const mockEventStream = {
    user: {_id: 1},
    eventStage: {_id: 2},
    startTime: new Date(2020, 8, 17, 18),
    endTime: new Date(2020, 8, 17, 19),
    title: 'Test Event Stream',
    genre: 'Techno',
    category: 'Live Set',
    tags: ['event', 'stream'],
    getPrerecordedVideoFileURL: () => undefined
};

const mockEventStageSave = jest.fn();

const mockEventStage = {
    streamInfo: {},
    save: mockEventStageSave
};

const mockUserFindByIdAndUpdate = jest.fn();

const mockEventFindById = jest.fn(() => ({
    select: () => ({
        exec: () => mockEventStage
    })
}));

jest.mock('../../../server/model/schemas', () => ({
    ScheduledStream: {
        find: () => ({
            select: () => ({
                populate: () => ({
                    populate: () => ({
                        exec: () => [mockUserStream, mockEventStream]
                    })
                })
            })
        })
    },
    User: {
        findByIdAndUpdate: mockUserFindByIdAndUpdate
    },
    EventStage: {
        findById: mockEventFindById
    }
}));

const {job} = require('../../../server/cron/streamScheduler');

describe('streamScheduler', () => {
    it('should send update query to MongoDB when cron job triggers', async () => {
        // given
        job.setTime(new CronTime('* * * * * *'));

        // when
        job.start();
        expect(job.running).toBe(true);
        await sleep(1000);

        // then
        job.stop();

        expect(mockUserFindByIdAndUpdate.mock.calls[0][0]).toEqual(mockUserStream.user._id);
        expect(mockUserFindByIdAndUpdate.mock.calls[0][1]).toEqual({
            'streamInfo.title': mockUserStream.title,
            'streamInfo.genre': mockUserStream.genre,
            'streamInfo.category': mockUserStream.category,
            'streamInfo.tags': mockUserStream.tags
        });

        expect(mockEventFindById).toHaveBeenCalledWith(mockEventStream.eventStage._id);
        expect(mockEventStageSave).toHaveBeenCalledTimes(1);
    });
});
