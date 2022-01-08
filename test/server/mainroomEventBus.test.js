import {overrideEnvironmentVariables} from '../testUtils';

const EVENT = 'testEvent';
const ARGS = {
    foo: 'bar'
};
const FAIL_ARGS = {
    fail: true
};

const ERROR = new Error();

const mockPm2SendDataToProcessId = jest.fn((id, packet, cb) => {
    cb(packet.data === FAIL_ARGS ? ERROR : undefined);
});

const mockSnsErrorPublisherPublish = jest.fn();

jest.mock('pm2', () => ({
    sendDataToProcessId: mockPm2SendDataToProcessId
}));

jest.mock('../../server/aws/snsErrorPublisher', () => ({
    publish: mockSnsErrorPublisherPublish
}));

beforeEach(() => {
    jest.clearAllMocks();
})

describe('mainroomEventBus', () => {
    describe('send', () => {
        it('should send event to pm2 God process when NODE_ENV is set to production', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'production'}).andDo(() => {
                const mainroomEventBus = require('../../server/mainroomEventBus');
                const spy = spyOn(mainroomEventBus, 'emit');
                // when
                mainroomEventBus.send(EVENT, ARGS);
                // then
                const packet = mockPm2SendDataToProcessId.mock.calls[0][1];
                const event = packet.type;
                const args = packet.data;
                expect(event).toEqual(EVENT);
                expect(args).toEqual(ARGS);
                expect(spy).not.toHaveBeenCalled();
            });
        });

        it('should emit event using EventEmitter when NODE_ENV is not set to production', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'development'}).andDo(() => {
                const mainroomEventBus = require('../../server/mainroomEventBus');
                const spy = spyOn(mainroomEventBus, 'emit');
                // when
                mainroomEventBus.send(EVENT, ARGS);
                // then
                expect(spy).toHaveBeenCalledWith(EVENT, ARGS);
                expect(mockPm2SendDataToProcessId).not.toHaveBeenCalled();
            });
        });
    });

    describe('sendToGodProcess', () => {
        it('should send event to pm2 God process when NODE_ENV is set to production', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'production'}).andDo(() => {
                // given
                const mainroomEventBus = require('../../server/mainroomEventBus');
                const spy = spyOn(mainroomEventBus, 'emit');
                // when
                mainroomEventBus.sendToGodProcess(EVENT, ARGS);
                // then
                const packet = mockPm2SendDataToProcessId.mock.calls[0][1];
                const event = packet.type;
                const args = packet.data;
                expect(event).toEqual(EVENT);
                expect(args).toEqual(ARGS);
                expect(spy).not.toHaveBeenCalled();
            });
        });

        it('should publish error to SNS when an event fails to send to pm2 God process', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'production'}).andDo(() => {
                // given
                const mainroomEventBus = require('../../server/mainroomEventBus');
                const spy = spyOn(mainroomEventBus, 'emit');
                // when
                mainroomEventBus.sendToGodProcess(EVENT, FAIL_ARGS);
                // then
                const packet = mockPm2SendDataToProcessId.mock.calls[0][1];
                const event = packet.type;
                const args = packet.data;
                expect(event).toEqual(EVENT);
                expect(args).toEqual(FAIL_ARGS);
                expect(spy).not.toHaveBeenCalled();
                expect(mockSnsErrorPublisherPublish).toHaveBeenCalledWith(ERROR);
            });
        });

        it('should not send event to pm2 God process when NODE_ENV is not set to production', async () => {
            await overrideEnvironmentVariables({NODE_ENV: 'development'}).andDo(() => {
                const mainroomEventBus = require('../../server/mainroomEventBus');
                const spy = spyOn(mainroomEventBus, 'emit');
                // when
                mainroomEventBus.sendToGodProcess(EVENT, ARGS);
                // then
                expect(mockPm2SendDataToProcessId).not.toHaveBeenCalled();
                expect(spy).not.toHaveBeenCalled();
            });
        });
    });
});
