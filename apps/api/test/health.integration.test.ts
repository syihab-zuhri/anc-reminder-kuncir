import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { requestIdSchema } from "@anc/contracts";
import type { DatabasePool, DatabaseReadiness } from "@anc/database";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApplication } from "../src/application.js";
import { JsonLogger, type LogRecord } from "../src/observability/json-logger.js";
import { apiConfigFixture } from "./fixtures.js";

const readyDatabase: DatabaseReadiness = {
  ready: true,
  checkedAt: "2026-08-08T00:00:00.000Z",
  latencyMs: 1,
};

describe("health endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  it("serves liveness without checking the database", async () => {
    const readinessCheck = vi.fn(() => Promise.resolve(readyDatabase));
    const closePool = vi.fn(() => Promise.resolve());
    const records: LogRecord[] = [];
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck,
      closePool,
      logger: loggerFor(records),
    });
    await app.init();

    const response = await request(httpServer(app))
      .get("/api/v1/health/live")
      .set("x-request-id", "550e8400-e29b-41d4-a716-446655440000")
      .expect(200);

    expect(responseBody(response)).toEqual({ status: "ok" });
    expect(responseHeader(response, "x-request-id")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(readinessCheck).not.toHaveBeenCalled();
    expect(records).toContainEqual(
      expect.objectContaining({
        request_id: "550e8400-e29b-41d4-a716-446655440000",
        message: "API request completed",
      }),
    );
  });

  it("reports readiness only when the database check succeeds", async () => {
    const readinessCheck = vi.fn(() => Promise.resolve(readyDatabase));
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck,
      closePool: vi.fn(() => Promise.resolve()),
      logger: loggerFor([]),
    });
    await app.init();

    const response = await request(httpServer(app)).get("/api/v1/health/ready").expect(200);

    expect(responseBody(response)).toEqual({
      status: "ready",
      checks: { database: "up" },
    });
    expect(readinessCheck).toHaveBeenCalledOnce();
  });

  it("returns a canonical 503 without exposing the database failure", async () => {
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() =>
        Promise.reject(new Error("postgresql://admin:password@private-db/anc")),
      ),
      closePool: vi.fn(() => Promise.resolve()),
      logger: loggerFor([]),
    });
    await app.init();

    const response = await request(httpServer(app)).get("/api/v1/health/ready").expect(503);

    const body = responseBody(response);
    expect(body).toEqual({
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Layanan sementara tidak tersedia.",
        request_id: responseHeader(response, "x-request-id"),
        details: { database: "unavailable" },
      },
    });
    expect(JSON.stringify(body)).not.toContain("private-db");
  });

  it("replaces an invalid inbound request ID and uses canonical errors", async () => {
    const untrustedRequestId = "nik-3201010101010001";
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() => Promise.resolve(readyDatabase)),
      closePool: vi.fn(() => Promise.resolve()),
      logger: loggerFor([]),
    });
    await app.init();

    const response = await request(httpServer(app))
      .get("/api/v1/does-not-exist")
      .set("x-request-id", untrustedRequestId)
      .expect(404);

    const responseRequestId = responseHeader(response, "x-request-id");
    expect(responseRequestId).toBeDefined();
    if (responseRequestId === undefined) {
      throw new Error("Expected x-request-id response header");
    }
    expect(responseRequestId).not.toBe(untrustedRequestId);
    expect(requestIdSchema.safeParse(responseRequestId).success).toBe(true);
    expect(responseBody(response)).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Sumber daya tidak ditemukan.",
        request_id: responseRequestId,
        details: null,
      },
    });
  });

  it("closes the database pool once during application shutdown", async () => {
    const closePool = vi.fn(() => Promise.resolve());
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() => Promise.resolve(readyDatabase)),
      closePool,
      logger: loggerFor([]),
    });
    await app.init();

    await app.close();
    app = undefined;

    expect(closePool).toHaveBeenCalledOnce();
  });
});

function loggerFor(records: LogRecord[]): JsonLogger {
  return new JsonLogger({
    service: "test-api",
    level: "debug",
    sink: (record) => records.push(record),
  });
}

function httpServer(application: INestApplication): Parameters<typeof request>[0] {
  return application.getHttpServer() as Parameters<typeof request>[0];
}

function responseBody(response: request.Response): unknown {
  return response.body as unknown;
}

function responseHeader(response: request.Response, name: string): string | undefined {
  const headers: unknown = response.headers;
  if (typeof headers !== "object" || headers === null) {
    return undefined;
  }
  const value = (headers as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}
