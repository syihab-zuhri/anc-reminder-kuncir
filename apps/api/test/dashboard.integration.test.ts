/* eslint-disable @typescript-eslint/require-await -- in-memory ports satisfy async interface */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  bidanDashboardResponseSchema,
  bumilDashboardResponseSchema,
  puskesmasDashboardResponseSchema,
  type BidanDashboardResponse,
  type BumilDashboardResponse,
  type PuskesmasDashboardResponse,
} from "@anc/contracts";
import type { DatabasePool } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { DashboardRepository } from "../src/dashboard/dashboard.repository.js";
import type { MotherAuthRepository } from "../src/mother-access/mother-auth.repository.js";
import type { MotherActor } from "../src/mother-access/mother-auth.types.js";
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
const motherId = "60000000-0000-4000-8000-000000000001";

const villageKuncirId = "50000000-0000-4000-8000-000000000001";
const password = "AmanSekali2026";
const motherToken = "anc_mt_" + "a".repeat(43);
const now = new Date("2026-08-12T09:00:00.000Z");

class FakeMotherAuthRepository implements MotherAuthRepository {
  private readonly sessions = new Map<string, MotherActor>();

  public seedSession(sessionId: string, actor: MotherActor): void {
    this.sessions.set(sessionId, actor);
  }

  public async findCredentialCandidate(): Promise<null> {
    return null;
  }

  public async createSession(): Promise<boolean> {
    return true;
  }

  public async findActiveActorBySessionHash(
    _sessionHash: string,
    requestedAt: Date,
  ): Promise<MotherActor | null> {
    const active = [...this.sessions.values()].find(
      (actor) => actor.sessionExpiresAt > requestedAt,
    );
    return active ?? null;
  }

  public async revokeSession(sessionId: string): Promise<boolean> {
    this.sessions.delete(sessionId);
    return true;
  }

  public async rateLimitRetryAfterSeconds(): Promise<number> {
    return 0;
  }

  public async recordRateLimitFailure(): Promise<void> {}

  public async clearRateLimitBuckets(): Promise<void> {}
}

class FakeDashboardRepository implements DashboardRepository {
  public async getPuskesmasDashboard(): Promise<PuskesmasDashboardResponse> {
    return {
      summary: {
        total_active_pregnancies: 10,
        milestones_due_count: 3,
        milestones_overdue_count: 1,
        pending_validations_count: 2,
        unresolved_wa_fallbacks_count: 0,
      },
      priority_action_queue: [
        {
          mother_id: motherId,
          mother_full_name: "Siti Aminah",
          village_name: "Desa Kuncir",
          milestone_code: "K2",
          visit_status: "DUE",
          due_at: "2026-08-15",
          action_type: "CONFIRMATION_NEEDED",
        },
      ],
    };
  }

  public async getBidanDashboard(): Promise<BidanDashboardResponse> {
    return {
      summary: {
        assigned_mothers_count: 5,
        milestones_due_count: 2,
        milestones_overdue_count: 1,
        action_required_count: 3,
      },
      assigned_villages: [
        {
          village_id: villageKuncirId,
          village_name: "Desa Kuncir",
        },
      ],
      confirmation_queue: [
        {
          mother_id: motherId,
          mother_full_name: "Siti Aminah",
          mother_phone_masked: "0812****5678",
          village_name: "Desa Kuncir",
          milestone_code: "K2",
          visit_status: "DUE",
          due_at: "2026-08-15",
        },
      ],
    };
  }

  public async getBumilDashboard(): Promise<BumilDashboardResponse> {
    return {
      mother_info: {
        full_name: "Siti Aminah",
        address: "Jl. Kuncir No. 1",
        village_name: "Desa Kuncir",
      },
      active_pregnancy: {
        id: "70000000-0000-4000-8000-000000000001",
        dating_date: "2026-05-01",
        completed_weeks: 14,
        completed_days: 5,
        trimester_label: "Trimester 2",
        status: "ACTIVE",
      },
      next_milestone: {
        milestone_code: "K2",
        visit_status: "DUE",
        due_at: "2026-08-15",
        expected_due_date: "2026-08-15",
        recommended_facility_name: "Puskesmas Kuncir",
      },
      milestones: [
        {
          milestone_code: "K1",
          visit_status: "CONFIRMED",
          record_validation_status: "VALIDATED",
          due_at: "2026-06-01",
          occurred_on: "2026-05-28",
        },
      ],
    };
  }
}

describe("Dashboard API", () => {
  let app: INestApplication | undefined;
  let motherAuthRepo: FakeMotherAuthRepository;

  function server(): Parameters<typeof request>[0] {
    if (!app) throw new Error("Application not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  beforeEach(async () => {
    const passwordHasher = new PasswordHasher();
    const passwordHash = await passwordHasher.hash(password);

    const staffRepo = new FakeStaffAuthRepository();
    staffRepo.seedUser({
      id: puskesmasId,
      healthCenterId: centerId,
      loginIdentifier: "puskesmas.kuncir",
      displayName: "Operator Puskesmas",
      role: "PUSKESMAS",
      status: "ACTIVE",
      passwordHash,
      assignments: [],
    });
    staffRepo.seedUser({
      id: bidanId,
      healthCenterId: centerId,
      loginIdentifier: "bidan.kuncir",
      displayName: "Bidan Kuncir",
      role: "BIDAN",
      status: "ACTIVE",
      passwordHash,
      assignments: [],
    });

    motherAuthRepo = new FakeMotherAuthRepository();
    motherAuthRepo.seedSession(motherToken, {
      sessionId: "session-id-1",
      motherId,
      credentialId: "c0000000-0000-4000-8000-000000000001",
      displayName: "Siti Aminah",
      activePregnancyId: "70000000-0000-4000-8000-000000000001",
      sessionExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: staffRepo,
      motherAuthRepository: motherAuthRepo,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      dashboardRepository: new FakeDashboardRepository(),
      auditRepository: new FakeAuditRepository(),
      clock: () => now,
    });
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function staffLogin(identifier: string): Promise<string> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password })
      .expect(200);
    const body = response.body as Readonly<Record<string, unknown>>;
    if (typeof body["access_token"] !== "string") throw new Error("Missing access token");
    return body["access_token"];
  }

  it("returns Puskesmas dashboard for Puskesmas staff", async () => {
    const token = await staffLogin("puskesmas.kuncir");

    const response = await request(server())
      .get("/api/v1/dashboard/puskesmas")
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = puskesmasDashboardResponseSchema.parse(response.body);
    expect(parsed.summary.total_active_pregnancies).toBe(10);
    expect(parsed.priority_action_queue).toHaveLength(1);
  });

  it("returns Bidan dashboard for Bidan staff", async () => {
    const token = await staffLogin("bidan.kuncir");

    const response = await request(server())
      .get("/api/v1/dashboard/bidan")
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = bidanDashboardResponseSchema.parse(response.body);
    expect(parsed.summary.assigned_mothers_count).toBe(5);
    expect(parsed.assigned_villages).toHaveLength(1);
  });

  it("denies cross-role access between Puskesmas and Bidan dashboards", async () => {
    const puskesmasToken = await staffLogin("puskesmas.kuncir");
    const bidanToken = await staffLogin("bidan.kuncir");

    // Puskesmas accessing Bidan dashboard -> 403
    await request(server())
      .get("/api/v1/dashboard/bidan")
      .set("authorization", `Bearer ${puskesmasToken}`)
      .expect(403);

    // Bidan accessing Puskesmas dashboard -> 403
    await request(server())
      .get("/api/v1/dashboard/puskesmas")
      .set("authorization", `Bearer ${bidanToken}`)
      .expect(403);
  });

  it("returns Bumil dashboard for authenticated mother patient", async () => {
    const response = await request(server())
      .get("/api/v1/mother/me/dashboard")
      .set("authorization", `Bearer ${motherToken}`)
      .expect(200);

    const parsed = bumilDashboardResponseSchema.parse(response.body);
    expect(parsed.mother_info.full_name).toBe("Siti Aminah");
    expect(parsed.active_pregnancy?.completed_weeks).toBe(14);
    expect(parsed.next_milestone?.milestone_code).toBe("K2");
  });
});
