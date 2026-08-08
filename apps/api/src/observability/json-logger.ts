import type { LoggerService } from "@nestjs/common";
import { currentRequestId } from "./request-context.js";
import { redactSensitiveData, redactSensitiveText } from "./redaction.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly message: string;
  readonly request_id?: string;
  readonly context?: string;
  readonly data?: unknown;
}

export type LogSink = (record: LogRecord) => void;

export interface JsonLoggerOptions {
  readonly service: string;
  readonly level: string;
  readonly sink?: LogSink;
  readonly clock?: () => Date;
}

const levelPriority: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function normalizeLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case "trace":
    case "debug":
      return "debug";
    case "warn":
    case "warning":
      return "warn";
    case "error":
      return "error";
    case "fatal":
      return "fatal";
    default:
      return "info";
  }
}

function defaultSink(record: LogRecord): void {
  const output = `${JSON.stringify(record) ?? "{}"}\n`;
  if (record.level === "error" || record.level === "fatal") {
    process.stderr.write(output);
    return;
  }
  process.stdout.write(output);
}

function printableMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof Error) {
    return message.name;
  }
  return "Structured log event";
}

export class JsonLogger implements LoggerService {
  readonly #service: string;
  readonly #minimumLevel: LogLevel;
  readonly #sink: LogSink;
  readonly #clock: () => Date;

  public constructor(options: JsonLoggerOptions) {
    this.#service = options.service;
    this.#minimumLevel = normalizeLevel(options.level);
    this.#sink = options.sink ?? defaultSink;
    this.#clock = options.clock ?? (() => new Date());
  }

  public write(level: LogLevel, message: string, data?: unknown, context?: string): void {
    if (levelPriority[level] < levelPriority[this.#minimumLevel]) {
      return;
    }

    const requestId = currentRequestId();
    const record: LogRecord = {
      timestamp: this.#clock().toISOString(),
      level,
      service: this.#service,
      message: redactSensitiveText(message),
      ...(requestId === undefined ? {} : { request_id: requestId }),
      ...(context === undefined ? {} : { context: redactSensitiveText(context) }),
      ...(data === undefined ? {} : { data: redactSensitiveData(data) }),
    };
    this.#sink(record);
  }

  public log(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog("info", message, optionalParams);
  }

  public error(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog("error", message, optionalParams);
  }

  public warn(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog("warn", message, optionalParams);
  }

  public debug(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog("debug", message, optionalParams);
  }

  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog("debug", message, optionalParams);
  }

  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog("fatal", message, optionalParams);
  }

  private writeNestLog(
    level: LogLevel,
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    const finalParameter = optionalParams.at(-1);
    const context = typeof finalParameter === "string" ? finalParameter : undefined;
    const parameters = context === undefined ? optionalParams : optionalParams.slice(0, -1);
    const data =
      typeof message === "object" && message !== null
        ? message
        : parameters.length === 0
          ? undefined
          : parameters;
    this.write(level, printableMessage(message), data, context);
  }
}
