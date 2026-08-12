/* eslint-disable @typescript-eslint/require-await -- in-memory ports intentionally satisfy async interfaces */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import type { CanonicalErrorEnvelope, OrganizationReportResponse } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import type { ReportsRepository } from "../src/reports/reports.repository.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerId = "30000000-0000-4000-8000-000000000001";
const puskesmasStaffId = "40000000-0000-4000-8000-000000000001";
const superAdminId = "40000000-0000-4000-8000-000000000003";
const password = "AmanSekali2026";

class FakeReportsRepository implements ReportsRepository {
  public async getOrganizationSummary(
    healthCenterId: string,
    now: Date,
  ): Promise<OrganizationReportResponse> {
    return {
      health_center_id: healthCenterId,
      generated_at: now.toISOString(),
      total_mothers: 42,
      total_active_pregnancies: 18,
      total_confirmed_visits: 120,
      total_validated_records: 95,
      village_breakdown: [
        {
          village_id: "50000000-0000-4000-8000-000000000001",
          village_name: "Desa Kuncir",
          total_mothers: 22,
          active_pregnancies: 10,
          confirmed_visits: 65,
          validated_records: 50,
        },
        {
          village_id: "50000000-0000-4000-8000-000000000002",
          village_name: "Desa Sukamaju",
          total_mothers: 20,
          active_pregnancies: 8,
          confirmed_visits: 55,
          validated_records: 45,
        },
      ],
    };
  }
}

describe("API-REPORT-001 Organization Summary Report Integration Tests", () => {
  let app: INestApplication;
  let staffAuthRepo: FakeStaffAuthRepository;
  let reportsRepo: FakeReportsRepository;

  beforeEach(async () => {
    const passwordHasher = new PasswordHasher();
    const passwordHash = await passwordHasher.hash(password);

    staffAuthRepo = new FakeStaffAuthRepository();
    staffAuthRepo.seedUser({
      id: puskesmasStaffId,
      healthCenterId: centerId,
      loginIdentifier: "puskesmas.kuncir",
      passwordHash,
      displayName: "Dr. Puskesmas",
      role: "PUSKESMAS",
      status: "ACTIVE",
      assignments: [],
    });
    staffAuthRepo.seedUser({
      id: superAdminId,
      healthCenterId: null,
      loginIdentifier: "super.admin",
      passwordHash,
      displayName: "Super Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      assignments: [],
    });

    reportsRepo = new FakeReportsRepository();

    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository: staffAuthRepo,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository: new FakeAuditRepository(),
      reportsRepository: reportsRepo,
    });

    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function loginAs(identifier: string): Promise<string> {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server)
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password });

    expect(res.status).toBe(200);
    return (res.body as { access_token: string }).access_token;
  }

  it("allows Puskesmas staff to fetch organization summary report", async () => {
    const token = await loginAs("puskesmas.kuncir");
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const res = await request(server)
      .get("/api/v1/reports/summary")
      .set("authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as OrganizationReportResponse;
    expect(body).toMatchObject({
      health_center_id: centerId,
      total_mothers: 42,
      total_active_pregnancies: 18,
      total_confirmed_visits: 120,
      total_validated_records: 95,
    });
    expect(body.village_breakdown).toHaveLength(2);
  });

  it("denies Super Admin from fetching organization operational report", async () => {
    const token = await loginAs("super.admin");
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const res = await request(server)
      .get("/api/v1/reports/summary")
      .set("authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    const body = res.body as CanonicalErrorEnvelope;
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
