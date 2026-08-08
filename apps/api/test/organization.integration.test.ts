import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { staffTokenResponseSchema } from "@anc/contracts";
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

const centerId = "30000000-0000-4000-8000-000000000001";
const puskesmasId = "40000000-0000-4000-8000-000000000001";
const bidanId = "40000000-0000-4000-8000-000000000002";
const password = "AmanSekali2026";
const now = new Date("2026-08-08T09:00:00.000Z");
const readyDatabase: DatabaseReadiness = {
  ready: true,
  checkedAt: now.toISOString(),
  latencyMs: 1,
};

describe("organization and assignment API", () => {
  let app: INestApplication | undefined;
  let organization: FakeOrganizationScopeRepository;
  let audit: FakeAuditRepository;

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    organization = new FakeOrganizationScopeRepository();
    audit = new FakeAuditRepository();
    const passwordHash = await new PasswordHasher().hash(password);
    auth.seedUser({
      id: puskesmasId,
      healthCenterId: centerId,
      displayName: "Puskesmas",
      role: "PUSKESMAS",
      status: "ACTIVE",
      passwordHash,
      loginIdentifier: "puskesmas",
      assignments: [],
    });
    auth.seedUser({
      id: bidanId,
      healthCenterId: centerId,
      displayName: "Bidan",
      role: "BIDAN",
      status: "ACTIVE",
      passwordHash,
      loginIdentifier: "bidan",
      assignments: [],
    });
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() => Promise.resolve(readyDatabase)),
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: auth,
      organizationScopeRepository: organization,
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository: audit,
      clock: () => new Date(now),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("supports scoped organization CRUD and assignment lifecycle for Puskesmas", async () => {
    const token = await login("puskesmas");
    const villageResponse = await request(server())
      .post("/api/v1/staff/organization/villages")
      .set("authorization", `Bearer ${token}`)
      .send({ code: "KNC-01", name: "Desa Kuncir" })
      .expect(201);
    const village = bodyRecord(villageResponse);
    const villageId = stringField(village, "id");

    await request(server())
      .post("/api/v1/staff/organization/facilities")
      .set("authorization", `Bearer ${token}`)
      .send({
        village_id: villageId,
        code: "POS-01",
        name: "Posyandu Kuncir",
        facility_type: "POSYANDU",
      })
      .expect(201);

    const staffResponse = await request(server())
      .post("/api/v1/staff/users")
      .set("authorization", `Bearer ${token}`)
      .send({
        login_identifier: "bidan.baru",
        display_name: "Bidan Baru",
        role: "BIDAN",
        password: "BidanBaru2026",
      })
      .expect(201);
    const staffId = stringField(bodyRecord(staffResponse), "id");
    expect(organization.passwordHashes.get(staffId)).not.toContain("BidanBaru2026");

    const assignmentResponse = await request(server())
      .post("/api/v1/staff/assignments")
      .set("authorization", `Bearer ${token}`)
      .send({ staff_user_id: staffId, scope_type: "AREA", scope_id: villageId })
      .expect(201);
    const assignmentId = stringField(bodyRecord(assignmentResponse), "id");

    await request(server())
      .delete(`/api/v1/staff/assignments/${assignmentId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ reason: "Rotasi wilayah" })
      .expect(204);
    expect(organization.assignments).toHaveLength(0);
    expect(audit.events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "VILLAGE_CREATED",
        "FACILITY_CREATED",
        "STAFF_USER_CREATED",
        "STAFF_ASSIGNMENT_CREATED",
        "STAFF_ASSIGNMENT_REVOKED",
      ]),
    );
  });

  it("denies Bidan management and rejects out-of-scope assignment without leakage", async () => {
    const bidanToken = await login("bidan");
    await request(server())
      .post("/api/v1/staff/organization/villages")
      .set("authorization", `Bearer ${bidanToken}`)
      .send({ code: "NO", name: "Tidak Boleh" })
      .expect(403);

    const puskesmasToken = await login("puskesmas");
    const target = await request(server())
      .post("/api/v1/staff/users")
      .set("authorization", `Bearer ${puskesmasToken}`)
      .send({
        login_identifier: "bidan.scope",
        display_name: "Bidan Scope",
        role: "BIDAN",
        password: "BidanScope2026",
      })
      .expect(201);
    await request(server())
      .post("/api/v1/staff/assignments")
      .set("authorization", `Bearer ${puskesmasToken}`)
      .send({
        staff_user_id: stringField(bodyRecord(target), "id"),
        scope_type: "AREA",
        scope_id: "50000000-0000-4000-8000-000000000099",
      })
      .expect(403);
  });

  async function login(identifier: string): Promise<string> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password })
      .expect(200);
    return staffTokenResponseSchema.parse(response.body).access_token;
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

function bodyRecord(response: request.Response): Readonly<Record<string, unknown>> {
  const value: unknown = response.body;
  if (typeof value !== "object" || value === null) throw new Error("Expected object response");
  return value as Readonly<Record<string, unknown>>;
}

function stringField(value: Readonly<Record<string, unknown>>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string") throw new Error(`Expected string field ${field}`);
  return candidate;
}
