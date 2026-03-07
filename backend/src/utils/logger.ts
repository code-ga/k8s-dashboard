import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface ILogger {
  debug(message: any, ...args: any[]): void;
  info(message: any, ...args: any[]): void;
  warn(message: any, ...args: any[]): void;
  error(message: any, ...args: any[]): void;
  fatal(message: any, ...args: any[]): void;
  
  child(context: Record<string, any>): ILogger;
}

class PinoLogger implements ILogger {
  private pinoInstance: pino.Logger;

  constructor(instance?: pino.Logger) {
    if (instance) {
      this.pinoInstance = instance;
    } else {
      const isDev = process.env.NODE_ENV !== 'production';
      this.pinoInstance = pino({
        level: isDev ? 'debug' : 'info',
        transport: isDev
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                ignore: 'pid,hostname',
                translateTime: 'SYS:standard',
                messageFormat: '{caller} {msg}',
              },
            }
          : undefined,
      });
    }
  }

  private getCallerInfo(): string {
    const error = new Error();
    const stack = error.stack;
    if (!stack) return 'unknown';

    // The stack trace looks like:
    // Error
    //     at PinoLogger.getCallerInfo (logger.ts:...)
    //     at PinoLogger.handleLog (logger.ts:...)
    //     at PinoLogger.info (logger.ts:...)
    //     at caller (file.ts:line:column)
    const lines = stack.split('\n');
    // We want the line after handleLog and info/error/etc.
    // Usually, 0 is Error, 1 is getCallerInfo, 2 is handleLog, 3 is the public method (info, error, etc.), 4 is the caller.
    const callerLine = lines[4];
    if (!callerLine) return 'unknown';

    const match = callerLine.match(/at\s+(.*)\s+\((.*)\)|at\s+(.*)/);
    if (!match) return 'unknown';

    // Group 2 is usually the path (full path:line:column)
    // Group 3 is for cases like "at file.ts:line:column" (no function name)
    const fullPath = match[2] || match[3] || match[1];
    if (!fullPath) return 'unknown';

    // Extract just the filename and line number for brevity
    const parts = fullPath.split(/[\\/]/);
    const fileName = parts[parts.length - 1];
    return fileName || 'unknown';
  }

  private serializeError(err: unknown): Record<string, any> {
    if (err instanceof Error) {
      return {
        message: err.message,
        name: err.name,
        stack: err.stack,
      };
    }
    return { message: String(err) };
  }

  private handleLog(level: pino.Level, message: any, ...args: any[]) {
    const caller = this.getCallerInfo();
    const logData: Record<string, any> = { caller };

    if (typeof message === 'string') {
      if (args.length > 0) {
        const contextArg = args[0];
        if (contextArg instanceof Error) {
          this.pinoInstance[level]({ ...logData, err: this.serializeError(contextArg) }, message, ...args.slice(1));
        } else if (typeof contextArg === 'object' && contextArg !== null) {
          this.pinoInstance[level]({ ...logData, ...contextArg }, message, ...args.slice(1));
        } else {
          this.pinoInstance[level](logData, message, ...args);
        }
      } else {
        this.pinoInstance[level](logData, message);
      }
    } else {
      if (message instanceof Error) {
        this.pinoInstance[level]({ ...logData, err: this.serializeError(message) }, ...args);
      } else if (typeof message === 'object' && message !== null) {
        this.pinoInstance[level]({ ...logData, ...message }, ...args);
      } else {
        this.pinoInstance[level](logData, message, ...args);
      }
    }
  }

  debug(message: any, ...args: any[]): void { this.handleLog('debug', message, ...args); }
  info(message: any, ...args: any[]): void { this.handleLog('info', message, ...args); }
  warn(message: any, ...args: any[]): void { this.handleLog('warn', message, ...args); }
  error(message: any, ...args: any[]): void { this.handleLog('error', message, ...args); }
  fatal(message: any, ...args: any[]): void { this.handleLog('fatal', message, ...args); }

  child(context: Record<string, any>): ILogger {
    return new PinoLogger(this.pinoInstance.child(context));
  }
}

// Export a singleton instance
export const logger: ILogger = new PinoLogger();
