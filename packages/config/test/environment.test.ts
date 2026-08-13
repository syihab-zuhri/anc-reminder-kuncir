import { describe, expect, it } from "vitest";

import { loadApiConfig, loadWorkerConfig } from "../src/index.js";

const commonEnvironment = {
  DATABASE_URL: "postgresql://anc:secret@localhost:5432/anc_test",
  PUSH_BACKOFF_SECONDS: "30, 120,600",
  WA_FALLBACK_ESCALATION_HOURS: "24",
  IDEMPOTENCY_SECRET: "synthetic-idempotency-test-secret-001",
  NIK_ENCRYPTION_KEY: Buffer.from("n".repeat(32)).toString("base64"),
  PUSH_TOKEN_ENCRYPTION_KEY: Buffer.from("p".repeat(32)).toString("base64"),
};

describe("loadApiConfig", () => {
  it("validates and maps API startup configuration", () => {
    const config = loadApiConfig({
      ...commonEnvironment,
      APP_BASE_URL: "http://localhost:3000",
      API_BASE_URL: "http://localhost:3001",
      SESSION_SECRET: "synthetic-api-test-secret-00000001",
      MOTHER_SESSION_SECRET: "synthetic-mother-test-secret-000001",
    });

    expect(config).toEqual({
      nodeEnv: "development",
      databaseUrl: commonEnvironment.DATABASE_URL,
      apiHost: "0.0.0.0",
      apiPort: 3001,
      appBaseUrl: "http://localhost:3000",
      apiBaseUrl: "http://localhost:3001",
      sessionSecret: "synthetic-api-test-secret-00000001",
      motherSessionSecret: "synthetic-mother-test-secret-000001",
      idempotencySecret: "synthetic-idempotency-test-secret-001",
      nikEncryptionKey: Buffer.from("n".repeat(32)).toString("base64"),
      pushTokenEncryptionKey: Buffer.from("p".repeat(32)).toString("base64"),
      staffAccessTokenTtlMinutes: 15,
      staffRefreshTokenTtlDays: 7,
      staffLoginMaxFailures: 5,
      staffLoginLockMinutes: 15,
      motherSessionTtlDays: 30,
      motherAccessIpMaxFailures: 10,
      motherAccessCodeMaxFailures: 5,
      motherAccessRateWindowMinutes: 15,
      motherAccessBlockMinutes: 15,
      reminderIntervalDays: 3,
      pushMaxAttempts: 3,
      pushBackoffSeconds: [30, 120, 600],
      waFallbackEscalationHours: 24,
      primaryTimezone: "Asia/Jakarta",
      logLevel: "info",
    });
  });

  it("rejects missing secrets, invalid URLs, and invalid retry values", () => {
    expect(() =>
      loadApiConfig({
        ...commonEnvironment,
        DATABASE_URL: "https://not-postgres.example",
        APP_BASE_URL: "not-a-url",
        API_BASE_URL: "http://localhost:3001",
        SESSION_SECRET: "",
        MOTHER_SESSION_SECRET: "synthetic-mother-test-secret-000001",
        PUSH_MAX_ATTEMPTS: "0",
      }),
    ).toThrow();
  });

  it("does not invent defaults for operational SLA values", () => {
    expect(() =>
      loadApiConfig({
        DATABASE_URL: commonEnvironment.DATABASE_URL,
        PUSH_BACKOFF_SECONDS: commonEnvironment.PUSH_BACKOFF_SECONDS,
        APP_BASE_URL: "http://localhost:3000",
        API_BASE_URL: "http://localhost:3001",
        SESSION_SECRET: "synthetic-api-test-secret-00000001",
        MOTHER_SESSION_SECRET: "synthetic-mother-test-secret-000001",
      }),
    ).toThrow();
  });

  it("requires distinct secrets and HTTPS outside local non-production URLs", () => {
    const sharedSecret = "synthetic-shared-secret-value-0001";
    expect(() =>
      loadApiConfig({
        ...commonEnvironment,
        NODE_ENV: "production",
        APP_BASE_URL: "http://example.test",
        API_BASE_URL: "http://api.example.test",
        SESSION_SECRET: sharedSecret,
        MOTHER_SESSION_SECRET: sharedSecret,
        IDEMPOTENCY_SECRET: sharedSecret,
      }),
    ).toThrow();
  });

  it("locks the confirmed reminder cadence to every three days", () => {
    expect(() =>
      loadApiConfig({
        ...commonEnvironment,
        REMINDER_INTERVAL_DAYS: "4",
        APP_BASE_URL: "http://localhost:3000",
        API_BASE_URL: "http://localhost:3001",
        SESSION_SECRET: "synthetic-api-test-secret-00000001",
        MOTHER_SESSION_SECRET: "synthetic-mother-test-secret-000001",
      }),
    ).toThrow();
  });

  it("requires positive staff and mother session/throttle controls", () => {
    expect(() =>
      loadApiConfig({
        ...commonEnvironment,
        APP_BASE_URL: "http://localhost:3000",
        API_BASE_URL: "http://localhost:3001",
        SESSION_SECRET: "synthetic-api-test-secret-00000001",
        MOTHER_SESSION_SECRET: "synthetic-mother-test-secret-000001",
        STAFF_ACCESS_TOKEN_TTL_MINUTES: "0",
        MOTHER_ACCESS_IP_MAX_FAILURES: "0",
      }),
    ).toThrow();
  });

  it("requires a dedicated push-token key distinct from every other secret", () => {
    expect(() =>
      loadApiConfig({
        ...commonEnvironment,
        PUSH_TOKEN_ENCRYPTION_KEY: commonEnvironment.NIK_ENCRYPTION_KEY,
        APP_BASE_URL: "http://localhost:3000",
        API_BASE_URL: "http://localhost:3001",
        SESSION_SECRET: "synthetic-api-test-secret-00000001",
        MOTHER_SESSION_SECRET: "synthetic-mother-test-secret-000001",
      }),
    ).toThrow("PUSH_TOKEN_ENCRYPTION_KEY");
  });

  it("requires TLS for a remote production database", () => {
    const productionEnvironment = {
      ...commonEnvironment,
      NODE_ENV: "production",
      APP_BASE_URL: "https://anc.example.id",
      API_BASE_URL: "https://api.anc.example.id",
      SESSION_SECRET: "synthetic-api-test-secret-00000001",
      MOTHER_SESSION_SECRET: "synthetic-mother-test-secret-000001",
    };

    expect(() =>
      loadApiConfig({
        ...productionEnvironment,
        DATABASE_URL: "postgresql://anc:secret@db.example.id:5432/anc",
      }),
    ).toThrow();

    expect(
      loadApiConfig({
        ...productionEnvironment,
        DATABASE_URL: "postgresql://anc:secret@db.example.id:5432/anc?sslmode=verify-full",
      }).nodeEnv,
    ).toBe("production");
  });
});

describe("loadWorkerConfig", () => {
  it("requires push credentials and maps retry configuration", () => {
    const config = loadWorkerConfig({
      ...commonEnvironment,
      FCM_PROJECT_ID: "anc-test-project",
      FCM_SERVICE_ACCOUNT_JSON: "secret://fcm/service-account",
      REMINDER_INTERVAL_DAYS: "3",
      PUSH_MAX_ATTEMPTS: "4",
      LOG_LEVEL: "warn",
    });

    expect(config.fcmProjectId).toBe("anc-test-project");
    expect(config.pushMaxAttempts).toBe(4);
    expect(config.pushBackoffSeconds).toEqual([30, 120, 600]);
    expect(config.logLevel).toBe("warn");
  });

  it("fails closed when a required push credential is blank", () => {
    expect(() =>
      loadWorkerConfig({
        ...commonEnvironment,
        FCM_PROJECT_ID: "anc-test-project",
        FCM_SERVICE_ACCOUNT_JSON: " ",
      }),
    ).toThrow();
  });
});
