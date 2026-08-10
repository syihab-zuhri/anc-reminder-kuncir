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

  beforeEach(async () => {
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
      loginIdentifier: "puskesmas.kuncir",
      assignments: [],
    });
    authRepository.seedUser({
      id: bidanId,
      healthCenterId: centerA,
      displayName: "Bidan Kuncir",
      role: "BIDAN",
      status: "ACTIVE",
      passwordHash,
      loginIdentifier: "bidan.kuncir",
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
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() => Promise.resolve(readyDatabase)),
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: authRepository,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository,
      clock: () => new Date(now),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("logs in, exposes only safe staff identity, rotates tokens, and logs out", async () => {
    const first = await login("PUSKESMAS.KUNCIR", password);
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

  it("returns one generic failure shape and applies persistent lockout", async () => {
    const unknown = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: "not.registered", password: "wrong" })
      .expect(401);
    const wrong = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: "bidan.kuncir", password: "wrong" })
      .expect(401);
    expect(canonicalErrorEnvelopeSchema.parse(body(unknown)).error.code).toBe(
      "INVALID_CREDENTIALS",
    );
    expect(canonicalErrorEnvelopeSchema.parse(body(wrong)).error.code).toBe("INVALID_CREDENTIALS");

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await request(server())
        .post("/api/v1/staff/auth/login")
        .send({ login_identifier: "bidan.kuncir", password: "wrong" })
        .expect(401);
    }
    await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: "bidan.kuncir", password })
      .expect(401);
    expect(authRepository.users.get(bidanId)?.lockedUntil).toEqual(
      new Date("2026-08-08T08:15:00.000Z"),
    );
  }, 15_000);

  it("allows only one winner when the same refresh token is used concurrently", async () => {
    const tokens = await login("bidan.kuncir", password);
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
    const puskesmas = await login("puskesmas.kuncir", password);
    const bidan = await login("bidan.kuncir", password);
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
