import type { ApiConfig } from "@anc/config";

export function apiConfigFixture(): ApiConfig {
  return {
    nodeEnv: "test",
    databaseUrl: "postgresql://anc:local-only@localhost:5432/anc_test",
    appBaseUrl: "http://localhost:3000",
    apiBaseUrl: "http://localhost:3001",
    apiHost: "127.0.0.1",
    apiPort: 3001,
    sessionSecret: "s".repeat(32),
    motherSessionSecret: "m".repeat(32),
    staffAccessTokenTtlMinutes: 15,
    staffRefreshTokenTtlDays: 7,
    staffLoginMaxFailures: 5,
    staffLoginLockMinutes: 15,
    reminderIntervalDays: 3,
    pushMaxAttempts: 3,
    pushBackoffSeconds: [30, 120, 300],
    waFallbackEscalationHours: 24,
    primaryTimezone: "Asia/Jakarta",
    logLevel: "info",
  };
}
