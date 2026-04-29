export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface ILogger {
	debug(message: any, ...args: any[]): void;
	info(message: any, ...args: any[]): void;
	warn(message: any, ...args: any[]): void;
	error(message: any, ...args: any[]): void;
	fatal(message: any, ...args: any[]): void;
}

class ConsoleLogger implements ILogger {
	private formatMessage(level: LogLevel, message: any, ...args: any[]) {
		// In production, we might want to suppress debug logs or send to a remote service.
		// E.g., if (import.meta.env.PROD && level === 'debug') return;

		const timestamp = new Date().toISOString();

		if (typeof message === "string") {
			console[level === "fatal" ? "error" : level](
				`[${timestamp}] [${level.toUpperCase()}] ${message}`,
				...args,
			);
		} else {
			console[level === "fatal" ? "error" : level](
				`[${timestamp}] [${level.toUpperCase()}]`,
				message,
				...args,
			);
		}
	}

	debug(message: any, ...args: any[]): void {
		this.formatMessage("debug", message, ...args);
	}
	info(message: any, ...args: any[]): void {
		this.formatMessage("info", message, ...args);
	}
	warn(message: any, ...args: any[]): void {
		this.formatMessage("warn", message, ...args);
	}
	error(message: any, ...args: any[]): void {
		this.formatMessage("error", message, ...args);
	}
	fatal(message: any, ...args: any[]): void {
		this.formatMessage("fatal", message, ...args);
	}
}

export const logger: ILogger = new ConsoleLogger();
