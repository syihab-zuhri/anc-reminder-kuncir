export type WorkerLogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface WorkerLogRecord {
  readonly timestamp: string;
  readonly level: WorkerLogLevel;
  readonly service: "anc-worker";
  readonly message: string;
  readonly data?: unknown;
}

export interface WorkerLogger {
  write(level: WorkerLogLevel, message: string, data?: unknown): void;
}

export interface JsonWorkerLoggerOptions {
  readonly level: string;
  readonly sink?: (record: WorkerLogRecord) => void;
  readonly clock?: () => Date;
}

const REDACTED = "[REDACTED]";
const sensitiveKeyPattern =
  /(?:^|_)(?:nik|full_?name|address|phone(?:_?number|_?normalized)?|access_?code|authorization|cookie|password|passcode|token|secret|session|fcm_?service_?account(?:_?json)?|diagnosis|lab_?result|risk_?category|record_?payload|raw_?message|wa_?message)(?:$|_)/i;
const compactSensitiveKeyPattern =
  /^(?:accesstoken|refreshtoken|sessiontoken|sessionsecret|mothersessionsecret|fcmserviceaccountjson|recordpayload|rawmessage|wamessage|phonenumber|phonenormalized|fullname)$/i;

const priorities: Readonly<Record<WorkerLogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function normalizedLevel(level: string): WorkerLogLevel {
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

function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, "Bearer [REDACTED]")
    .replace(/\b(postgres(?:ql)?):\/\/([^\s:/@]+):([^\s@]+)@/giu, "$1://[REDACTED]:[REDACTED]@")
    .replace(/\b\d{16}\b/gu, REDACTED)
    .replace(
      /\b(nik|access_?code|password|token|secret|session)\s*[=:]\s*[^\s,;]+/giu,
      "$1=[REDACTED]",
    );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replaceAll("-", "_");
  return (
    sensitiveKeyPattern.test(normalized) ||
    compactSensitiveKeyPattern.test(normalized.replaceAll("_", ""))
  );
}

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return "[FUNCTION]";
  }
  if (typeof value === "symbol") {
    return value.description === undefined ? "[SYMBOL]" : `[SYMBOL:${value.description}]`;
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redact(nested, seen);
  }
  return output;
}

function defaultSink(record: WorkerLogRecord): void {
  const line = `${JSON.stringify(record) ?? "{}"}\n`;
  if (record.level === "error" || record.level === "fatal") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

export class JsonWorkerLogger implements WorkerLogger {
  readonly #minimumLevel: WorkerLogLevel;
  readonly #sink: (record: WorkerLogRecord) => void;
  readonly #clock: () => Date;

  public constructor(options: JsonWorkerLoggerOptions) {
    this.#minimumLevel = normalizedLevel(options.level);
    this.#sink = options.sink ?? defaultSink;
    this.#clock = options.clock ?? (() => new Date());
  }

  public write(level: WorkerLogLevel, message: string, data?: unknown): void {
    if (priorities[level] < priorities[this.#minimumLevel]) {
      return;
    }

    this.#sink({
      timestamp: this.#clock().toISOString(),
      level,
      service: "anc-worker",
      message: redactText(message),
      ...(data === undefined ? {} : { data: redact(data) }),
    });
  }
}
