export declare enum LogLevelNumber {
    off = 0,
    error = 1,
    warn = 2,
    log = 3,
    info = 4,
    debug = 5,
    trace = 6
}
export type LogLevel = number | 'off' | 'error' | 'warn' | 'log' | 'info' | 'debug' | 'trace';
export declare class Logger {
    logLevel: LogLevelNumber;
    constructor(logLevelName?: LogLevel);
    log(...params: any[]): void;
    debug(...params: any[]): void;
    error(...params: any[]): void;
}
