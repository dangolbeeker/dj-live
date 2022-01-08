import React from 'react';
import {render, unmountComponentAtNode} from 'react-dom';
import {act} from 'react-dom/test-utils'
import Schedule from '../../../client/pages/Schedule';
import moment from 'moment';

const MOCK_OWN_STREAMS_GROUP_TITLE = 'My Streams';
const MOCK_OWN_USERNAME = 'ownUser';
const MOCK_USERNAME_1 = 'user1';
const MOCK_USERNAME_2 = 'user2';
const MOCK_USERNAME_3 = 'user3';
const MOCK_START_TIME = moment().add(12, 'hour');
const MOCK_END_TIME = moment().add(13, 'hour');

jest.mock('axios', () => {
    return {
        get: jest.fn(async url => {
            if (url === '/api/logged-in-user') {
                return {
                    data: {
                        username: MOCK_OWN_USERNAME
                    }
                };
            }
            if (url === `/api/users/${MOCK_OWN_USERNAME}/schedule`) {
                return {
                    data: {
                        scheduleGroups: [
                            mockBuildScheduleGroup(0, MOCK_OWN_STREAMS_GROUP_TITLE),
                            mockBuildScheduleGroup(1, MOCK_USERNAME_1),
                            mockBuildScheduleGroup(2, MOCK_USERNAME_2),
                            mockBuildScheduleGroup(3, MOCK_USERNAME_3)
                        ],
                        scheduleItems: [
                            mockBuildScheduleItem(0, 0, MOCK_OWN_USERNAME),
                            mockBuildScheduleItem(1, 1, MOCK_USERNAME_1),
                            mockBuildScheduleItem(2, 2, MOCK_USERNAME_2),
                            mockBuildScheduleItem(3, 3, MOCK_USERNAME_3)
                        ]
                    }
                };
            }
        })
    };
});

let container = null;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    jest.clearAllMocks();
});

afterEach(() => {
    unmountComponentAtNode(container);
    container.remove();
    container = null;
});

describe('Schedule', () => {
    it('should build schedule when component gets mounted', async () => {
        await act(async () => render(<Schedule/>, container));
        const groups = container.getElementsByClassName('rct-sidebar-row');
        const groupNames = Array.from(groups).map(group => group.textContent);
        const items = container.getElementsByClassName('rct-item');
        const itemValues = Array.from(items).map(item => item.textContent);
        expect(groupNames).toEqual([MOCK_OWN_STREAMS_GROUP_TITLE, MOCK_USERNAME_1, MOCK_USERNAME_2, MOCK_USERNAME_3]);
        expect(itemValues).toEqual([MOCK_OWN_USERNAME, MOCK_USERNAME_1, MOCK_USERNAME_2, MOCK_USERNAME_3]);
    });
});

function mockBuildScheduleGroup(id, title) {
    return {id, title};
}

function mockBuildScheduleItem(id, group, username) {
    return {
        id,
        group,
        title: username,
        start_time: MOCK_START_TIME,
        end_time: MOCK_END_TIME
    };
}