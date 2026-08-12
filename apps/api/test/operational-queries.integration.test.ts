/* eslint-disable @typescript-eslint/require-await -- in-memory ports satisfy async interface */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  motherDetailResponseSchema,
  motherListResponseSchema,
  operationalMilestonesResponseSchema,
  type MotherDetailResponse,
  type MotherListQuery,
  type MotherListResponse,
  type MotherSummary,
  type OperationalMilestoneItem,
  type OperationalMilestonesQuery,
  type OperationalMilestonesResponse,
} from "@anc/contracts";
import type { DatabasePool } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import type { OperationalQueriesRepository } from "../src/operational-queries/operational-queries.repository.js";
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
const superAdminId = "40000000-0000-4000-8000-000000000003";

const villageKuncirId = "50000000-0000-4000-8000-000000000001";
const villageSukaId = "50000000-0000-4000-8000-000000000002";

const mother1Id = "60000000-0000-4000-8000-000000000001";
const mother2Id = "60000000-0000-4000-8000-000000000002";
const mother3Id = "60000000-0000-4000-8000-000000000003";

const password = "AmanSekali2026";
const now = new Date("2026-08-12T09:00:00.000Z");

class FakeOperationalQueriesRepository implements OperationalQueriesRepository {
  public mothers: MotherSummary[] = [];
  public milestones: OperationalMilestoneItem[] = [];

  public async findMothers(
    actor: StaffActor,
    query: MotherListQuery,
    _now: Date,
    _timezone: string,
  ): Promise<MotherListResponse> {
    if (actor.healthCenterId === null || actor.role === "SUPER_ADMIN") {
      return { items: [], next_cursor: null, has_more: false };
    }

    let filtered = this.mothers.filter((m) => m.health_center_id === actor.healthCenterId);

    if (actor.role === "BIDAN") {
      filtered = filtered.filter((m) => m.village_id === villageKuncirId || m.id === mother1Id);
    }

    if (query.search) {
      const search = query.search.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.full_name.toLowerCase().includes(search) || m.phone_masked.toLowerCase().includes(search),
      );
    }

    if (query.village_id) {
      filtered = filtered.filter((m) => m.village_id === query.village_id);
    }

    if (query.pregnancy_status) {
      filtered = filtered.filter(
        (m) => m.active_pregnancy?.status === query.pregnancy_status,
      );
    }

    const limit = query.limit ?? 20;
    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    return {
      items,
      next_cursor: hasMore ? "next-page-cursor" : null,
      has_more: hasMore,
    };
  }

  public async findMotherById(
    actor: StaffActor,
    motherId: string,
    _now: Date,
    _timezone: string,
  ): Promise<MotherDetailResponse | null> {
    if (actor.healthCenterId === null || actor.role === "SUPER_ADMIN") {
      return null;
    }

    const mother = this.mothers.find(
      (m) => m.id === motherId && m.health_center_id === actor.healthCenterId,
    );
    if (!mother) return null;

    if (actor.role === "BIDAN" && mother.village_id !== villageKuncirId && mother.id !== mother1Id) {
      return null;
    }

    return { mother };
  }

  public async findOperationalMilestones(
    actor: StaffActor,
    query: OperationalMilestonesQuery,
    _now: Date,
    _timezone: string,
  ): Promise<OperationalMilestonesResponse> {
    if (actor.healthCenterId === null || actor.role === "SUPER_ADMIN") {
      return { items: [], next_cursor: null, has_more: false };
    }

    let filtered = this.milestones;

    if (actor.role === "BIDAN") {
      filtered = filtered.filter(
        (item) => item.village_id === villageKuncirId || item.mother_id === mother1Id,
      );
    }

    if (query.status) {
      filtered = filtered.filter((item) => item.visit_status === query.status);
    }

    if (query.milestone_code) {
      filtered = filtered.filter((item) => item.milestone_code === query.milestone_code);
    }

    if (query.village_id) {
      filtered = filtered.filter((item) => item.village_id === query.village_id);
    }

    if (query.due_date_from) {
      filtered = filtered.filter(
        (item) => item.expected_due_date !== null && item.expected_due_date >= query.due_date_from!,
      );
    }

    if (query.due_date_to) {
      filtered = filtered.filter(
        (item) => item.expected_due_date !== null && item.expected_due_date <= query.due_date_to!,
      );
    }

    const limit = query.limit ?? 20;
    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    return {
      items,
      next_cursor: hasMore ? "next-milestone-cursor" : null,
      has_more: hasMore,
    };
  }
}

describe("Operational queries API", () => {
  let app: INestApplication | undefined;
  let queriesRepo: FakeOperationalQueriesRepository;

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
    staffRepo.seedUser({
      id: superAdminId,
      healthCenterId: null,
      loginIdentifier: "admin.super",
      displayName: "Super Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      passwordHash,
      assignments: [],
    });

    queriesRepo = new FakeOperationalQueriesRepository();
    queriesRepo.mothers = [
      {
        id: mother1Id,
        health_center_id: centerId,
        full_name: "Siti Aminah",
        phone_masked: "0812****5678",
        address: "Jl. Kuncir No. 1",
        village_id: villageKuncirId,
        village_name: "Desa Kuncir",
        created_at: "2026-08-12T10:00:00.000Z",
        active_pregnancy: {
          id: "70000000-0000-4000-8000-000000000001",
          dating_date: "2026-05-01",
          status: "ACTIVE",
          completed_weeks: 14,
          completed_days: 5,
          trimester_label: "Trimester 2",
        },
      },
      {
        id: mother2Id,
        health_center_id: centerId,
        full_name: "Budi Ani",
        phone_masked: "0813****1234",
        address: "Jl. Suka No. 2",
        village_id: villageSukaId,
        village_name: "Desa Suka",
        created_at: "2026-08-11T10:00:00.000Z",
        active_pregnancy: {
          id: "70000000-0000-4000-8000-000000000002",
          dating_date: "2026-06-01",
          status: "ACTIVE",
          completed_weeks: 10,
          completed_days: 2,
          trimester_label: "Trimester 1",
        },
      },
      {
        id: mother3Id,
        health_center_id: centerId,
        full_name: "Cinta Laura",
        phone_masked: "0814****9999",
        address: "Jl. Suka No. 3",
        village_id: villageSukaId,
        village_name: "Desa Suka",
        created_at: "2026-08-10T10:00:00.000Z",
        active_pregnancy: null,
      },
    ];

    queriesRepo.milestones = [
      {
        milestone_id: "80000000-0000-4000-8000-000000000001",
        pregnancy_id: "70000000-0000-4000-8000-000000000001",
        mother_id: mother1Id,
        mother_full_name: "Siti Aminah",
        mother_phone_masked: "0812****5678",
        village_id: villageKuncirId,
        village_name: "Desa Kuncir",
        milestone_code: "K2",
        visit_status: "DUE",
        record_validation_status: "INCOMPLETE",
        due_at: "2026-08-15",
        expected_due_date: "2026-08-15",
        occurred_on: null,
        completed_weeks: 14,
        completed_days: 5,
        trimester_label: "Trimester 2",
      },
      {
        milestone_id: "80000000-0000-4000-8000-000000000002",
        pregnancy_id: "70000000-0000-4000-8000-000000000002",
        mother_id: mother2Id,
        mother_full_name: "Budi Ani",
        mother_phone_masked: "0813****1234",
        village_id: villageSukaId,
        village_name: "Desa Suka",
        milestone_code: "K1",
        visit_status: "OVERDUE",
        record_validation_status: "INCOMPLETE",
        due_at: "2026-08-01",
        expected_due_date: "2026-08-01",
        occurred_on: null,
        completed_weeks: 10,
        completed_days: 2,
        trimester_label: "Trimester 1",
      },
    ];

    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: staffRepo,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      operationalQueriesRepository: queriesRepo,
      auditRepository: new FakeAuditRepository(),
      clock: () => now,
    });
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function login(identifier: string): Promise<string> {
    const server = app!.getHttpServer();
    const response = await request(server)
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password })
      .expect(200);
    const body = response.body as Readonly<Record<string, unknown>>;
    if (typeof body["access_token"] !== "string") throw new Error("Missing access token");
    return body["access_token"];
  }

  it("allows Puskesmas to query all mothers in health center", async () => {
    const token = await login("puskesmas.kuncir");

    const response = await request(app!.getHttpServer())
      .get("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const parsed = motherListResponseSchema.parse(response.body);

    expect(parsed.items).toHaveLength(3);
    expect(parsed.items.map((m) => m.full_name)).toEqual([
      "Siti Aminah",
      "Budi Ani",
      "Cinta Laura",
    ]);
  });

  it("limits Bidan to assigned area mothers", async () => {
    const token = await login("bidan.kuncir");

    const response = await request(app!.getHttpServer())
      .get("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const parsed = motherListResponseSchema.parse(response.body);

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.full_name).toBe("Siti Aminah");
  });

  it("supports search, village, and pregnancy status filters", async () => {
    const token = await login("puskesmas.kuncir");

    // Search filter
    const searchRes = await request(app!.getHttpServer())
      .get("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .query({ search: "Budi" })
      .expect(200);
    const searchParsed = motherListResponseSchema.parse(searchRes.body);
    expect(searchParsed.items).toHaveLength(1);
    expect(searchParsed.items[0]?.full_name).toBe("Budi Ani");

    // Village filter
    const villageRes = await request(app!.getHttpServer())
      .get("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .query({ village_id: villageSukaId })
      .expect(200);
    const villageParsed = motherListResponseSchema.parse(villageRes.body);
    expect(villageParsed.items).toHaveLength(2);

    // Active pregnancy filter
    const activeRes = await request(app!.getHttpServer())
      .get("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .query({ pregnancy_status: "ACTIVE" })
      .expect(200);
    const activeParsed = motherListResponseSchema.parse(activeRes.body);
    expect(activeParsed.items).toHaveLength(2);
  });

  it("returns single mother detail for scoped staff", async () => {
    const token = await login("puskesmas.kuncir");

    const response = await request(app!.getHttpServer())
      .get(`/api/v1/mothers/${mother1Id}`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const parsed = motherDetailResponseSchema.parse(response.body);
    expect(parsed.mother.full_name).toBe("Siti Aminah");
  });

  it("returns 404 for Bidan querying unassigned mother without leaking existence", async () => {
    const token = await login("bidan.kuncir");

    await request(app!.getHttpServer())
      .get(`/api/v1/mothers/${mother2Id}`)
      .set("authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("returns scoped operational milestones list with status and milestone filters", async () => {
    const token = await login("puskesmas.kuncir");

    const response = await request(app!.getHttpServer())
      .get("/api/v1/operational/milestones")
      .set("authorization", `Bearer ${token}`)
      .query({ status: "DUE" })
      .expect(200);

    const parsed = operationalMilestonesResponseSchema.parse(response.body);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.milestone_code).toBe("K2");
    expect(parsed.items[0]?.visit_status).toBe("DUE");
  });

  it("denies Super Admin access to routine health queries", async () => {
    const token = await login("admin.super");

    await request(app!.getHttpServer())
      .get("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .expect(403);
    await request(app!.getHttpServer())
      .get(`/api/v1/mothers/${mother1Id}`)
      .set("authorization", `Bearer ${token}`)
      .expect(403);
    await request(app!.getHttpServer())
      .get("/api/v1/operational/milestones")
      .set("authorization", `Bearer ${token}`)
      .expect(403);
  });
});
