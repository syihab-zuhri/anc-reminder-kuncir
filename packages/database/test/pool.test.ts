import { describe, expect, it, vi } from "vitest";

import { checkDatabaseReadiness, closeDatabasePool, createDatabasePool } from "../src/index.js";

describe("database pool", () => {
  it("creates a pg pool from either a URL or explicit wrapper configuration", async () => {
    const fromUrl = createDatabasePool("postgresql://anc:secret@localhost:5432/anc_test");
    const fromConfig = createDatabasePool({
      connectionString: "postgresql://anc:secret@localhost:5432/anc_test",
      applicationName: "anc-api-test",
      max: 4,
    });

    expect(fromUrl).toBeDefined();
    expect(fromConfig.options.application_name).toBe("anc-api-test");
    expect(fromConfig.options.max).toBe(4);

    await Promise.all([closeDatabasePool(fromUrl), closeDatabasePool(fromConfig)]);
  });

  it("reports a successful readiness query without leaking connection data", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] });
    const readiness = await checkDatabaseReadiness({ query });

    expect(query).toHaveBeenCalledWith("SELECT 1::int AS ready");
    expect(readiness.ready).toBe(true);
    expect(readiness).not.toHaveProperty("databaseUrl");
  });

  it("returns a safe failure reason when PostgreSQL is unavailable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("secret connection details"));
    const readiness = await checkDatabaseReadiness({ query });

    expect(readiness).toMatchObject({
      ready: false,
      reason: "QUERY_FAILED",
    });
    expect(readiness).not.toHaveProperty("error");
  });

  it("rejects an unexpected readiness row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const readiness = await checkDatabaseReadiness({ query });

    expect(readiness).toMatchObject({
      ready: false,
      reason: "UNEXPECTED_RESULT",
    });
  });
});
