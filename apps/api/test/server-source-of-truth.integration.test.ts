import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import type { DatabasePool } from "@anc/database";
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
const bidanId = "40000000-0000-4000-8000-000000000002";
const milestoneId = "90000000-0000-4000-8000-000000000001";
const password = "AmanSekali2026";

describe("Server-Source-of-Truth Enforcement (TASK-P6-006)", () => {
  let app: INestApplication;
  let staffAuthRepo: FakeStaffAuthRepository;
  let bidanToken: string;

  beforeEach(async () => {
    const hasher = new PasswordHasher();
    const config = apiConfigFixture();

    staffAuthRepo = new FakeStaffAuthRepository();
    staffAuthRepo.seedUser({
      id: bidanId,
      healthCenterId: centerId,
      loginIdentifier: "bidan.kuncir",
      passwordHash: await hasher.hash(password),
      displayName: "Bidan Desa Kuncir",
      role: "BIDAN",
      status: "ACTIVE",
      assignments: [],
    });

    app = await createApiApplication({
      config,
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository: staffAuthRepo,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository: new FakeAuditRepository(),
    });

    await app.init();

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const loginRes = await request(server)
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: "bidan.kuncir", password });
    bidanToken = (loginRes.body as { access_token: string }).access_token;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("ignores client attempts to inject fake gestational age or trimester labels during mother registration", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    // Attempting to register mother with client-injected gestational age parameters
    const res = await request(server)
      .post("/api/v1/mothers")
      .set("Authorization", `Bearer ${bidanToken}`)
      .send({
        full_name: "Ibu Siti Server Truth",
        nik: "3603010101010099",
        phone_number: "081234567890",
        address_line: "Jl. Server Truth No. 1",
        last_menstrual_period_date: "2026-01-01",
        // Fake client-side properties that MUST be rejected or stripped by Zod strict validation
        completed_weeks: 40,
        trimester_label: "Trimester 3",
        milestone_eligibility: ["K8"],
      });

    // Zod strict schema validation MUST reject extra client-supplied domain properties with 400 Bad Request
    expect(res.status).toBe(400);
  });

  it("prevents client-side manipulation of visit confirmation status without server validation", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    // Client attempting to post invalid confirmation payload to milestone confirmation endpoint
    const res = await request(server)
      .post(`/api/v1/milestones/${milestoneId}/confirm`)
      .set("Authorization", `Bearer ${bidanToken}`)
      .send({
        milestone_code: "K1",
        visit_status: "CONFIRMED",
        // Missing idempotency_key, occurred_on, facility_id
      });

    expect(res.status).toBe(400);
  });
});
