export var LogLevelNumber;
(function (LogLevelNumber) {
    LogLevelNumber[LogLevelNumber["off"] = 0] = "off";
    LogLevelNumber[LogLevelNumber["error"] = 1] = "error";
    LogLevelNumber[LogLevelNumber["warn"] = 2] = "warn";
    LogLevelNumber[LogLevelNumber["log"] = 3] = "log";
    LogLevelNumber[LogLevelNumber["info"] = 4] = "info";
    LogLevelNumber[LogLevelNumber["debug"] = 5] = "debug";
    LogLevelNumber[LogLevelNumber["trace"] = 6] = "trace";
})(LogLevelNumber || (LogLevelNumber = {}));
const RokuBuilderLogPrefix = '[RokuBuilder]';
function getLogLevelNumeric(logLevelName) {
    if (typeof logLevelName === 'string') {
        return LogLevelNumber[logLevelName.toLowerCase()] ?? LogLevelNumber.error;
    }
    if (typeof logLevelName === 'number') {
        let keys = Object.keys(LogLevelNumber).filter(x => LogLevelNumber[x] == logLevelName);
        return keys.length > 0 ? LogLevelNumber[keys[0]] : LogLevelNumber.error;
    }
    return LogLevelNumber.error;
}
export class Logger {
    logLevel = LogLevelNumber.error;
    constructor(logLevelName = 'error') {
        this.logLevel = getLogLevelNumeric(logLevelName);
    }
    log(...params) {
        if (this.logLevel >= LogLevelNumber.log) {
            console.log(RokuBuilderLogPrefix, ...params);
        }
    }
    debug(...params) {
        if (this.logLevel >= LogLevelNumber.debug) {
            console.debug(RokuBuilderLogPrefix, ...params);
        }
    }
    error(...params) {
        if (this.logLevel >= LogLevelNumber.error) {
            console.error(RokuBuilderLogPrefix, ...params);
        }
    }
}
//# sourceMappingURL=logger.js.map