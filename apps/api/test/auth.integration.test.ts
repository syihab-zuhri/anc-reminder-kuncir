import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  canonicalErrorEnvelopeSchema,
  staffMeResponseSchema,
  staffTokenResponseSchema,
  type StaffTokenResponse,
} from "@anc/contracts";
import type { DatabasePool, DatabaseReadiness } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { ApiConfig } from "@anc/config";
import { JsonLogger } from "../src/observability/json-logger.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerA = "10000000-0000-4000-8000-000000000001";
const centerB = "10000000-0000-4000-8000-000000000002";
const puskesmasId = "20000000-0000-4000-8000-000000000001";
const bidanId = "20000000-0000-4000-8000-000000000002";
const outsiderId = "20000000-0000-4000-8000-000000000003";
const password = "AmanSekali2026";
const now = new Date("2026-08-08T08:00:00.000Z");
const readyDatabase: DatabaseReadiness = {
  ready: true,
  checkedAt: now.toISOString(),
  latencyMs: 1,
};

describe("staff authentication API", () => {
  let app: INestApplication | undefined;
  let authRepository: FakeStaffAuthRepository;
  let auditRepository: FakeAuditRepository;
  let currentTime: Date;

  beforeEach(async () => {
    currentTime = new Date(now);
    authRepository = new FakeStaffAuthRepository();
    auditRepository = new FakeAuditRepository();
    const passwordHash = await new PasswordHasher().hash(password);
    authRepository.seedUser({
      id: puskesmasId,
      healthCenterId: centerA,
      displayName: "Puskesmas Kuncir",
      role: "PUSKESMAS",
      status: "ACTIVE",
      passwordHash,
      loginIdentifier: "puskesmas.contoh",
      assignments: [],
    });
    authRepository.seedUser({
      id: bidanId,
      healthCenterId: centerA,
      displayName: "Bidan Kuncir",
      role: "BIDAN",
      status: "ACTIVE",
      passwordHash,
      loginIdentifier: "bidan.contoh",
      assignments: [],
    });
    authRepository.seedUser({
      id: outsiderId,
      healthCenterId: centerB,
      displayName: "Bidan Luar",
      role: "BIDAN",
      status: "ACTIVE",
      passwordHash,
      loginIdentifier: "bidan.luar",
      assignments: [],
    });
    await startApp();
  });

  async function startApp(overrides: Partial<ApiConfig> = {}): Promise<void> {
    if (app !== undefined) await app.close();
    app = await createApiApplication({
      config: { ...apiConfigFixture(), ...overrides },
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() => Promise.resolve(readyDatabase)),
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: authRepository,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository,
      clock: () => new Date(currentTime),
    });
    await app.init();
  }

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("logs in, exposes only safe staff identity, rotates tokens, and logs out", async () => {
    const first = await login("PUSKESMAS.CONTOH", password);
    const me = await request(server())
      .get("/api/v1/staff/me")
      .set("authorization", `Bearer ${first.access_token}`)
      .expect(200);
    expect(staffMeResponseSchema.parse(body(me))).toEqual(
      expect.objectContaining({ id: puskesmasId, role: "PUSKESMAS", health_center_id: centerA }),
    );

    const refreshedResponse = await request(server())
      .post("/api/v1/staff/auth/refresh")
      .send({ refresh_token: first.refresh_token })
      .expect(200);
    const refreshed = staffTokenResponseSchema.parse(body(refreshedResponse));
    expect(refreshed.access_token).not.toBe(first.access_token);
    expect(refreshed.refresh_token).not.toBe(first.refresh_token);

    await request(server())
      .post("/api/v1/staff/auth/refresh")
      .send({ refresh_token: first.refresh_token })
      .expect(401);
    await request(server())
      .get("/api/v1/staff/me")
      .set("authorization", `Bearer ${first.access_token}`)
      .expect(401);

    await request(server())
      .post("/api/v1/staff/auth/logout")
      .set("authorization", `Bearer ${refreshed.access_token}`)
      .expect(204);
    await request(server())
      .get("/api/v1/staff/me")
      .set("authorization", `Bearer ${refreshed.access_token}`)
      .expect(401);

    expect(auditRepository.events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["STAFF_LOGIN_SUCCESS", "STAFF_SESSION_ROTATED", "STAFF_LOGOUT"]),
    );
    expect(JSON.stringify(auditRepository.events)).not.toContain(password);
    expect(JSON.stringify(auditRepository.events)).not.toContain(first.access_token);
  });

  it("returns one generic failure shape for unknown and wrong-password logins", async () => {
    const unknown = await loginFrom("203.0.113.1", "not.registered", "wrong", 401);
    const wrong = await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);

    expect(canonicalErrorEnvelopeSchema.parse(body(unknown)).error.code).toBe(
      "INVALID_CREDENTIALS",
    );
    expect(canonicalErrorEnvelopeSchema.parse(body(wrong)).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("blocks one account from one address without locking the operator out elsewhere", async () => {
    await startApp({ staffLoginMaxFailures: 3 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    }

    const blocked = await loginFrom("203.0.113.1", "bidan.contoh", password, 429);
    expect(errorShape(blocked)).toEqual({
      code: "RATE_LIMITED",
      message: "Terlalu banyak percobaan masuk. Silakan coba lagi nanti.",
      details: { retry_after_seconds: 900 },
    });

    // The real operator, on another address, is unaffected; so are other accounts here.
    await loginFrom("198.51.100.7", "bidan.contoh", password, 200);
    await loginFrom("203.0.113.1", "puskesmas.contoh", password, 200);
  }, 30_000);

  it("throttles unknown identifiers exactly like real ones", async () => {
    await startApp({ staffLoginMaxFailures: 2 });
    await loginFrom("203.0.113.1", "not.registered", "wrong", 401);
    await loginFrom("203.0.113.1", "not.registered", "wrong", 401);

    const blocked = await loginFrom("203.0.113.1", "not.registered", "wrong", 429);
    expect(canonicalErrorEnvelopeSchema.parse(body(blocked)).error.code).toBe("RATE_LIMITED");
  });

  it("stops a distributed guess against one account across many addresses", async () => {
    await startApp({ staffLoginMaxFailures: 2, staffLoginAccountMaxFailures: 4 });
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.2", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.2", "bidan.contoh", "wrong", 401);

    await loginFrom("203.0.113.3", "bidan.contoh", password, 429);
    await loginFrom("203.0.113.3", "puskesmas.contoh", password, 200);
  }, 30_000);

  it("stops one address spraying different accounts", async () => {
    await startApp({ staffLoginIpMaxFailures: 3 });
    await loginFrom("203.0.113.1", "akun.satu", "wrong", 401);
    await loginFrom("203.0.113.1", "akun.dua", "wrong", 401);
    await loginFrom("203.0.113.1", "akun.tiga", "wrong", 401);

    await loginFrom("203.0.113.1", "puskesmas.contoh", password, 429);
    await loginFrom("198.51.100.7", "puskesmas.contoh", password, 200);
  }, 30_000);

  it("cannot be evaded by rotating spoofed left-most X-Forwarded-For entries", async () => {
    await startApp({ staffLoginMaxFailures: 3 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await loginFrom(`${attempt.toString()}.66.66.66, 203.0.113.1`, "bidan.contoh", "wrong", 401);
    }

    await loginFrom("77.66.66.66, 203.0.113.1", "bidan.contoh", password, 429);
  }, 30_000);

  it("forgives the account-from-address counter after a successful login", async () => {
    await startApp({ staffLoginMaxFailures: 3 });
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.1", "bidan.contoh", password, 200);
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);

    // Without the reset these four failures would already have blocked the pair at three.
    await loginFrom("203.0.113.1", "bidan.contoh", password, 200);
  }, 30_000);

  it("recovers once the block window has passed", async () => {
    await startApp({ staffLoginMaxFailures: 2 });
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.1", "bidan.contoh", password, 429);

    currentTime = new Date(now.getTime() + 16 * 60_000);

    await loginFrom("203.0.113.1", "bidan.contoh", password, 200);
  }, 30_000);

  it("refuses a blocked source before hashing the password and without growing the audit log", async () => {
    await startApp({ staffLoginMaxFailures: 2 });
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);
    const failuresBefore = auditActions("STAFF_LOGIN_FAILURE");
    const verify = vi.spyOn(PasswordHasher.prototype, "verifyOrDummy");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await loginFrom("203.0.113.1", "bidan.contoh", password, 429);
    }

    expect(verify).not.toHaveBeenCalled();
    expect(auditActions("STAFF_LOGIN_FAILURE")).toBe(failuresBefore);
  }, 30_000);

  it("still honors a lock placed directly on the account", async () => {
    const bidan = authRepository.users.get(bidanId);
    if (bidan === undefined) throw new Error("Seed user missing");
    bidan.lockedUntil = new Date(now.getTime() + 10 * 60_000);

    const locked = await loginFrom("203.0.113.1", "bidan.contoh", password, 401);

    expect(canonicalErrorEnvelopeSchema.parse(body(locked)).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("stores only hashes in the throttle buckets", async () => {
    await loginFrom("203.0.113.1", "bidan.contoh", "wrong", 401);

    const keys = [...authRepository.loginRateLimits.keys()];
    expect(keys).toHaveLength(3);
    expect(keys.every((key) => /^[a-f0-9]{64}$/u.test(key))).toBe(true);
    expect(keys.join("")).not.toContain("bidan");
    expect(keys.join("")).not.toContain("203");
  });

  it("allows only one winner when the same refresh token is used concurrently", async () => {
    const tokens = await login("bidan.contoh", password);
    const attempts = await Promise.all([
      request(server())
        .post("/api/v1/staff/auth/refresh")
        .send({ refresh_token: tokens.refresh_token }),
      request(server())
        .post("/api/v1/staff/auth/refresh")
        .send({ refresh_token: tokens.refresh_token }),
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 401]);
  });

  it("allows scoped Puskesmas revocation while denying Bidan and cross-center targets", async () => {
    const puskesmas = await login("puskesmas.contoh", password);
    const bidan = await login("bidan.contoh", password);
    await login("bidan.luar", password);
    const bidanSession = authRepository.sessionForUser(bidanId);
    const outsiderSession = authRepository.sessionForUser(outsiderId);
    expect(bidanSession).toBeDefined();
    expect(outsiderSession).toBeDefined();
    if (bidanSession === undefined || outsiderSession === undefined) return;

    await request(server())
      .post("/api/v1/staff/sessions/revoke")
      .set("authorization", `Bearer ${bidan.access_token}`)
      .send({ session_id: outsiderSession.id, reason: "Tidak berwenang" })
      .expect(403);
    await request(server())
      .post("/api/v1/staff/sessions/revoke")
      .set("authorization", `Bearer ${puskesmas.access_token}`)
      .send({ session_id: outsiderSession.id, reason: "Lintas wilayah" })
      .expect(403);
    await request(server())
      .post("/api/v1/staff/sessions/revoke")
      .set("authorization", `Bearer ${puskesmas.access_token}`)
      .send({ session_id: bidanSession.id, reason: "Pergantian petugas" })
      .expect(204);
    await request(server())
      .get("/api/v1/staff/me")
      .set("authorization", `Bearer ${bidan.access_token}`)
      .expect(401);
    expect(auditRepository.events.map((event) => event.action)).toContain("AUTHZ_DENIED");
  });

  it("rejects malformed requests without echoing credentials", async () => {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: "x", password, unexpected: password })
      .expect(400);
    expect(JSON.stringify(body(response))).not.toContain(password);
  });

  async function loginFrom(
    forwardedFor: string,
    identifier: string,
    candidatePassword: string,
    status: number,
  ): Promise<request.Response> {
    return request(server())
      .post("/api/v1/staff/auth/login")
      .set("X-Forwarded-For", forwardedFor)
      .send({ login_identifier: identifier, password: candidatePassword })
      .expect(status);
  }

  function auditActions(action: string): number {
    return auditRepository.events.filter((event) => event.action === action).length;
  }

  async function login(identifier: string, candidatePassword: string): Promise<StaffTokenResponse> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password: candidatePassword })
      .expect(200);
    return staffTokenResponseSchema.parse(body(response));
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

function body(response: request.Response): unknown {
  return response.body as unknown;
}

function errorShape(response: request.Response): Readonly<Record<string, unknown>> {
  const { code, message, details } = canonicalErrorEnvelopeSchema.parse(body(response)).error;
  return { code, message, details };
}
