
export enum LogLevelNumber {
  off = 0,
  error = 1,
  warn = 2,
  log = 3,
  info = 4,
  debug = 5,
  trace = 6
}

export type LogLevel = number | 'off' | 'error' | 'warn' | 'log' | 'info' | 'debug' | 'trace';

const RokuBuilderLogPrefix = '[RokuBuilder]';


function getLogLevelNumeric(logLevelName: string | number): LogLevelNumber {
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

  logLevel: LogLevelNumber = LogLevelNumber.error

  constructor(logLevelName: LogLevel = 'error') {
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
