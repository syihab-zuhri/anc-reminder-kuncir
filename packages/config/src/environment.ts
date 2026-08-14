import { z } from "zod";

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const requiredText = z.string().trim().min(1);

function base64EncryptionKey(label: string) {
  return requiredText.refine((value) => {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 && decoded.toString("base64") === value;
  }, `${label} must be a base64-encoded 32-byte key`);
}

const nikEncryptionKey = base64EncryptionKey("NIK_ENCRYPTION_KEY");
const pushTokenEncryptionKey = base64EncryptionKey("PUSH_TOKEN_ENCRYPTION_KEY");

const postgresUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "DATABASE_URL must use the postgres or postgresql protocol");

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use the http or https protocol");

function positiveInteger(defaultValue?: string) {
  const baseSchema = z.string().trim().regex(/^\d+$/, "Expected a positive integer");
  const schema = defaultValue === undefined ? baseSchema : baseSchema.default(defaultValue);

  return schema.transform(Number).pipe(z.number().int().positive());
}

const reminderIntervalDays = positiveInteger("3");

const apiPort = z
  .string()
  .trim()
  .regex(/^\d+$/, "API_PORT must be an integer")
  .default("3001")
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

const backoffSchedule = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.split(",").map((part) => part.trim()))
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^\d+$/, "Backoff entries must be positive integer seconds")
          .transform(Number),
      )
      .min(1)
      .refine((values) => values.every((value) => Number.isSafeInteger(value) && value > 0), {
        message: "Backoff entries must be positive integer seconds",
      }),
  );

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url().optional(),
);

const logLevelSchema = z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info");

const productionTlsModes = new Set(["require", "verify-ca", "verify-full"]);

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function requireProductionDatabaseTls(
  environment: { readonly NODE_ENV: string; readonly DATABASE_URL: string },
  context: z.RefinementCtx,
): void {
  if (environment.NODE_ENV !== "production") return;

  const url = new URL(environment.DATABASE_URL);
  if (isLoopbackHost(url.hostname)) return;

  const sslMode = url.searchParams.get("sslmode");
  if (sslMode === null || !productionTlsModes.has(sslMode)) {
    context.addIssue({
      code: "custom",
      message: "Production DATABASE_URL must require verified TLS",
      path: ["DATABASE_URL"],
    });
  }
}

const runtimeEnvironmentShape = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: postgresUrl,
  REMINDER_INTERVAL_DAYS: reminderIntervalDays,
  PUSH_MAX_ATTEMPTS: positiveInteger("3"),
  PUSH_BACKOFF_SECONDS: backoffSchedule,
  PUSH_TOKEN_ENCRYPTION_KEY: pushTokenEncryptionKey,
  WA_FALLBACK_ESCALATION_HOURS: positiveInteger(),
  PRIMARY_TIMEZONE: z.literal("Asia/Jakarta").default("Asia/Jakarta"),
  LOG_LEVEL: logLevelSchema,
  SENTRY_DSN: optionalUrl,
} as const;

export const apiEnvironmentSchema = z
  .object({
    ...runtimeEnvironmentShape,
    API_HOST: requiredText.default("0.0.0.0"),
    API_PORT: apiPort,
    APP_BASE_URL: httpUrl,
    API_BASE_URL: httpUrl,
    SESSION_SECRET: requiredText.min(32),
    MOTHER_SESSION_SECRET: requiredText.min(32),
    IDEMPOTENCY_SECRET: requiredText.min(32),
    NIK_ENCRYPTION_KEY: nikEncryptionKey,
    STAFF_ACCESS_TOKEN_TTL_MINUTES: positiveInteger("15"),
    STAFF_REFRESH_TOKEN_TTL_DAYS: positiveInteger("7"),
    STAFF_LOGIN_MAX_FAILURES: positiveInteger("5"),
    STAFF_LOGIN_LOCK_MINUTES: positiveInteger("15"),
    MOTHER_SESSION_TTL_DAYS: positiveInteger("30"),
    MOTHER_ACCESS_IP_MAX_FAILURES: positiveInteger("10"),
    MOTHER_ACCESS_CODE_MAX_FAILURES: positiveInteger("5"),
    MOTHER_ACCESS_RATE_WINDOW_MINUTES: positiveInteger("15"),
    MOTHER_ACCESS_BLOCK_MINUTES: positiveInteger("15"),
  })
  .superRefine((environment, context) => {
    requireProductionDatabaseTls(environment, context);

    if (environment.SESSION_SECRET === environment.MOTHER_SESSION_SECRET) {
      context.addIssue({
        code: "custom",
        message: "SESSION_SECRET and MOTHER_SESSION_SECRET must be distinct",
        path: ["MOTHER_SESSION_SECRET"],
      });
    }

    if (
      environment.IDEMPOTENCY_SECRET === environment.SESSION_SECRET ||
      environment.IDEMPOTENCY_SECRET === environment.MOTHER_SESSION_SECRET
    ) {
      context.addIssue({
        code: "custom",
        message: "IDEMPOTENCY_SECRET must be distinct from session secrets",
        path: ["IDEMPOTENCY_SECRET"],
      });
    }

    if (
      environment.NIK_ENCRYPTION_KEY === environment.SESSION_SECRET ||
      environment.NIK_ENCRYPTION_KEY === environment.MOTHER_SESSION_SECRET ||
      environment.NIK_ENCRYPTION_KEY === environment.IDEMPOTENCY_SECRET
    ) {
      context.addIssue({
        code: "custom",
        message: "NIK_ENCRYPTION_KEY must be distinct from session and idempotency secrets",
        path: ["NIK_ENCRYPTION_KEY"],
      });
    }

    if (
      environment.PUSH_TOKEN_ENCRYPTION_KEY === environment.NIK_ENCRYPTION_KEY ||
      environment.PUSH_TOKEN_ENCRYPTION_KEY === environment.SESSION_SECRET ||
      environment.PUSH_TOKEN_ENCRYPTION_KEY === environment.MOTHER_SESSION_SECRET ||
      environment.PUSH_TOKEN_ENCRYPTION_KEY === environment.IDEMPOTENCY_SECRET
    ) {
      context.addIssue({
        code: "custom",
        message: "PUSH_TOKEN_ENCRYPTION_KEY must be distinct from all other application secrets",
        path: ["PUSH_TOKEN_ENCRYPTION_KEY"],
      });
    }

    for (const key of ["APP_BASE_URL", "API_BASE_URL"] as const) {
      const url = new URL(environment[key]);
      const isLoopback = isLoopbackHost(url.hostname);
      if (url.protocol === "http:" && (environment.NODE_ENV === "production" || !isLoopback)) {
        context.addIssue({
          code: "custom",
          message: "HTTP is allowed only for loopback URLs outside production",
          path: [key],
        });
      }
    }
  })
  .transform((environment) => ({
    nodeEnv: environment.NODE_ENV,
    databaseUrl: environment.DATABASE_URL,
    apiHost: environment.API_HOST,
    apiPort: environment.API_PORT,
    appBaseUrl: environment.APP_BASE_URL,
    apiBaseUrl: environment.API_BASE_URL,
    sessionSecret: environment.SESSION_SECRET,
    motherSessionSecret: environment.MOTHER_SESSION_SECRET,
    idempotencySecret: environment.IDEMPOTENCY_SECRET,
    nikEncryptionKey: environment.NIK_ENCRYPTION_KEY,
    pushTokenEncryptionKey: environment.PUSH_TOKEN_ENCRYPTION_KEY,
    staffAccessTokenTtlMinutes: environment.STAFF_ACCESS_TOKEN_TTL_MINUTES,
    staffRefreshTokenTtlDays: environment.STAFF_REFRESH_TOKEN_TTL_DAYS,
    staffLoginMaxFailures: environment.STAFF_LOGIN_MAX_FAILURES,
    staffLoginLockMinutes: environment.STAFF_LOGIN_LOCK_MINUTES,
    motherSessionTtlDays: environment.MOTHER_SESSION_TTL_DAYS,
    motherAccessIpMaxFailures: environment.MOTHER_ACCESS_IP_MAX_FAILURES,
    motherAccessCodeMaxFailures: environment.MOTHER_ACCESS_CODE_MAX_FAILURES,
    motherAccessRateWindowMinutes: environment.MOTHER_ACCESS_RATE_WINDOW_MINUTES,
    motherAccessBlockMinutes: environment.MOTHER_ACCESS_BLOCK_MINUTES,
    reminderIntervalDays: environment.REMINDER_INTERVAL_DAYS,
    pushMaxAttempts: environment.PUSH_MAX_ATTEMPTS,
    pushBackoffSeconds: environment.PUSH_BACKOFF_SECONDS,
    waFallbackEscalationHours: environment.WA_FALLBACK_ESCALATION_HOURS,
    primaryTimezone: environment.PRIMARY_TIMEZONE,
    logLevel: environment.LOG_LEVEL,
    ...(environment.SENTRY_DSN === undefined ? {} : { sentryDsn: environment.SENTRY_DSN }),
  }));

export type ApiConfig = z.output<typeof apiEnvironmentSchema>;

export const workerEnvironmentSchema = z
  .object({
    ...runtimeEnvironmentShape,
    FCM_PROJECT_ID: requiredText,
    // Deployment injects the complete JSON through its secret store. Never
    // commit a service-account file or place the value in logs.
    FCM_SERVICE_ACCOUNT_JSON: requiredText,
  })
  .superRefine(requireProductionDatabaseTls)
  .transform((environment) => ({
    nodeEnv: environment.NODE_ENV,
    databaseUrl: environment.DATABASE_URL,
    fcmProjectId: environment.FCM_PROJECT_ID,
    fcmServiceAccountJson: environment.FCM_SERVICE_ACCOUNT_JSON,
    pushTokenEncryptionKey: environment.PUSH_TOKEN_ENCRYPTION_KEY,
    reminderIntervalDays: environment.REMINDER_INTERVAL_DAYS,
    pushMaxAttempts: environment.PUSH_MAX_ATTEMPTS,
    pushBackoffSeconds: environment.PUSH_BACKOFF_SECONDS,
    waFallbackEscalationHours: environment.WA_FALLBACK_ESCALATION_HOURS,
    primaryTimezone: environment.PRIMARY_TIMEZONE,
    logLevel: environment.LOG_LEVEL,
    ...(environment.SENTRY_DSN === undefined ? {} : { sentryDsn: environment.SENTRY_DSN }),
  }));

export type WorkerConfig = z.output<typeof workerEnvironmentSchema>;

export function loadApiConfig(environment: EnvironmentSource = process.env): ApiConfig {
  return apiEnvironmentSchema.parse(environment);
}

export function loadWorkerConfig(environment: EnvironmentSource = process.env): WorkerConfig {
  return workerEnvironmentSchema.parse(environment);
}
