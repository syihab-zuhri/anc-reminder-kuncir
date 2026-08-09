import { describe, expect, it } from "vitest";
import { JsonLogger, type LogRecord } from "../src/observability/json-logger.js";
import { REDACTED, redactSensitiveData } from "../src/observability/redaction.js";

describe("sensitive log redaction", () => {
  it("redacts restricted fields recursively without mutating safe fields", () => {
    const input = {
      event: "registration_rejected",
      nik: "3201010101010001",
      headers: {
        authorization: "Bearer secret-token",
      },
      mother: {
        fullName: "Nama Rahasia",
        phone_number: "081234567890",
        one_time_code: "ANC-2345-6789-ABCD-EFGH",
        safe_status: "invalid",
      },
    };

    expect(redactSensitiveData(input)).toEqual({
      event: "registration_rejected",
      nik: REDACTED,
      headers: {
        authorization: REDACTED,
      },
      mother: {
        fullName: REDACTED,
        phone_number: REDACTED,
        one_time_code: REDACTED,
        safe_status: "invalid",
      },
    });
    expect(input.nik).toBe("3201010101010001");
  });

  it("redacts sensitive values in messages, contexts, and nested data", () => {
    const records: LogRecord[] = [];
    const logger = new JsonLogger({
      service: "test-api",
      level: "debug",
      sink: (record) => records.push(record),
      clock: () => new Date("2026-08-08T00:00:00.000Z"),
    });

    logger.write(
      "error",
      "Failed for nik=3201010101010001 with Bearer abc.def",
      {
        database_url: "postgresql://real-user:real-password@db.internal/anc",
        recordPayload: { diagnosis: "restricted" },
      },
      "token=raw-context-token",
    );

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("3201010101010001");
    expect(serialized).not.toContain("abc.def");
    expect(serialized).not.toContain("real-user");
    expect(serialized).not.toContain("real-password");
    expect(serialized).not.toContain("restricted");
    expect(serialized).not.toContain("raw-context-token");
    expect(serialized).toContain(REDACTED);
  });
});
