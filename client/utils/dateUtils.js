import moment from 'moment';
import {dateFormat, timeFormat} from '../../mainroom.config';

const YEAR_IN_SECONDS = 31536000;
const MONTH_IN_SECONDS = 2592000;
const DAY_IN_SECONDS = 86400;
const HOUR_IN_SECONDS = 3600;
const MINUTE_IN_SECONDS = 60;

export const convertUTCToLocal = date => moment.utc(date).local();
export const convertLocalToUTC = date => moment(date).utc();

export const timeSince = date => {
    const diffInSeconds = Math.floor((moment().valueOf() / 1000) - (convertUTCToLocal(date).valueOf()) / 1000);

    let interval = diffInSeconds / YEAR_IN_SECONDS;
    if (interval >= 1) {
        return pluraliseTimeAgo(Math.floor(interval), 'year');
    }

    interval = diffInSeconds / MONTH_IN_SECONDS;
    if (interval >= 1) {
        return pluraliseTimeAgo(Math.floor(interval), 'month');
    }

    interval = diffInSeconds / DAY_IN_SECONDS;
    if (interval >= 1) {
        return pluraliseTimeAgo(Math.floor(interval), 'day');
    }

    interval = diffInSeconds / HOUR_IN_SECONDS;
    if (interval >= 1) {
        return pluraliseTimeAgo(Math.floor(interval), 'hour');
    }

    interval = diffInSeconds / MINUTE_IN_SECONDS;
    if (interval >= 1) {
        return pluraliseTimeAgo(Math.floor(interval), 'minute');
    }

    if (diffInSeconds > 0) {
        return pluraliseTimeAgo(Math.floor(diffInSeconds), 'second');
    }
    return 'just now';
};

const pluraliseTimeAgo = (value, singularMeasurement) => {
    return `${value} ${singularMeasurement}${value === 1 ? '' : 's'} ago`;
}

export const formatDate = timestamp => convertUTCToLocal(timestamp).format(dateFormat);

const formatTime = timestamp => convertUTCToLocal(timestamp).format(timeFormat);

const isSameDay = (firstTimestamp, secondTimestamp) => {
    return moment(firstTimestamp).isSame(moment(secondTimestamp), 'day');
};

export const formatDateRange = ({start, end}) => {
    const startFormatted = formatDate(start);
    const endFormatted = isSameDay(start, end) ? `-${formatTime(end)}` : ` - ${formatDate(end)}`;
    return `${startFormatted}${endFormatted}`;
}

export const isTimeBetween = ({time, start, end}) => {
    const localTime = convertUTCToLocal(time);
    const startTime = convertUTCToLocal(start);
    const endTime = convertUTCToLocal(end);
    return moment(localTime).isBetween(startTime, endTime, undefined, '[]');
}

export const getDurationTimestamp = seconds => {
    seconds = Math.ceil(seconds);
    let minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    minutes = ('0' + minutes).slice(-2);
    seconds = seconds % 60;
    seconds = ('0' + seconds).slice(-2);
    return `${hours}:${minutes}:${seconds}`;
}
