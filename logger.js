const FORMAT_SPECIFIER = '{}';

const LOG_LEVELS = {
    NONE: 0,
    ERROR: 1,
    INFO: 2,
    DEBUG: 3
};

const DEFAULT_LOG_LEVEL = LOG_LEVELS.INFO;

class Logger {

    constructor(fileName) {
        this.fileName = fileName;
        this.logger = require('node-media-server/node_core_logger');
        this.logger.setLogType(resolveLogLevel());
    }

    info(format, ...args) {
        this.logger.log(`[${this.fileName}]`, formatLogMessage(format, ...args));
    }

    error(format, ...args) {
        if (args.length > 0) {
            const possibleError = args[args.length - 1];
            args[args.length - 1] = possibleError.stack || possibleError.toString();
        }
        this.logger.error(`[${this.fileName}]`, formatLogMessage(format, ...args));
    }

    debug(format, ...args) {
        this.logger.debug(`[${this.fileName}]`, formatLogMessage(format, ...args));
    }

}

function resolveLogLevel() {
    if (process.env.LOG_LEVEL) {
        const logLevelInt = parseInt(process.env.LOG_LEVEL);
        return !Number.isNaN(logLevelInt) ? logLevelInt
            : LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || DEFAULT_LOG_LEVEL;
    } else {
        return DEFAULT_LOG_LEVEL;
    }
}

function formatLogMessage(format, ...args) {
    args.forEach(arg => format = format.replace(FORMAT_SPECIFIER, arg));
    return format;
}

module.exports = fileName => new Logger(fileName);
module.exports.resolveLogLevel = resolveLogLevel;