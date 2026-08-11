/* eslint-disable @typescript-eslint/require-await -- in-memory ports intentionally satisfy async interfaces */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  ancPlanResponseSchema,
  milestoneCodeSchema,
  pregnancyMilestoneListResponseSchema,
  pregnancyNextMilestoneResponseSchema,
  type AncPlanResponse,
  type AncPlanRuleInput,
  type MilestoneCode,
} from "@anc/contracts";
import type { DatabasePool, IdempotencyResourceReference, TransactionClient } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ActivateAncPlanInput,
  AncPlanRepository,
  ApproveAncPlanInput,
  CreateAncPlanDraftInput,
} from "../src/anc-plan/anc-plan.repository.js";
import {
  AncPlanEffectiveDateError,
  AncPlanNotFoundError,
  AncPlanTransitionError,
} from "../src/anc-plan/anc-plan.repository.js";
import type { PregnancyMilestoneSnapshot } from "../src/anc-plan/anc-derived-state.js";
import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { ApiException } from "../src/errors/api.exception.js";
import type { IdempotencyService } from "../src/idempotency/idempotency.service.js";
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
const motherId = "50000000-0000-4000-8000-000000000001";
const pregnancyId = "60000000-0000-4000-8000-000000000001";
const syntheticPlanId = "70000000-0000-4000-8000-000000000001";
const password = "AmanSekali2026";
const now = new Date("2026-08-11T09:00:00.000Z");

describe("ANC plan and K1-K8 milestone API", () => {
  let app: INestApplication | undefined;
  let plans: FakeAncPlanRepository;
  let audit: FakeAuditRepository;
  let scope: FakeScopedAccessRepository;

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    plans = new FakeAncPlanRepository();
    plans.governorIds.add(puskesmasId);
    audit = new FakeAuditRepository();
    scope = new FakeScopedAccessRepository();
    scope.allowedMotherIds.add(motherId);

    const passwordHash = await new PasswordHasher().hash(password);
    for (const [id, role, loginIdentifier] of [
      [puskesmasId, "PUSKESMAS", "puskesmas"],
      [bidanId, "BIDAN", "bidan"],
    ] as const) {
      auth.seedUser({
        id,
        healthCenterId: centerId,
        displayName: `${role} DUMMY`,
        role,
        status: "ACTIVE",
        passwordHash,
        loginIdentifier,
        assignments: [],
      });
    }

    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() =>
        Promise.resolve({ ready: true, checkedAt: now.toISOString(), latencyMs: 1 }),
      ),
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: auth,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: scope,
      ancPlanRepository: plans,
      auditRepository: audit,
      idempotencyService: new FakeIdempotencyService() as unknown as IdempotencyService,
      clock: () => new Date(now),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("keeps synthetic fixtures draft/non-production and denies Bidan plan mutation", async () => {
    const bidanToken = await login("bidan");
    const active = await request(server())
      .get("/api/v1/anc-plan/active")
      .set("authorization", `Bearer ${bidanToken}`)
      .expect(200);
    expect(ancPlanResponseSchema.parse(active.body)).toMatchObject({
      plan_kind: "SYNTHETIC",
      status: "DRAFT",
      production_eligible: false,
    });

    await request(server())
      .post("/api/v1/anc-plan/versions")
      .set("authorization", `Bearer ${bidanToken}`)
      .send(createPlanRequest("10000000-0000-4000-8000-000000000001"))
      .expect(403);
    expect(plans.plans).toHaveLength(1);
  });

  it("creates, approves, and activates a complete clinical plan with audit evidence", async () => {
    const token = await login("puskesmas");
    const createRequest = createPlanRequest("10000000-0000-4000-8000-000000000002");
    const createdResponse = await request(server())
      .post("/api/v1/anc-plan/versions")
      .set("authorization", `Bearer ${token}`)
      .send(createRequest)
      .expect(201);
    const created = ancPlanResponseSchema.parse(createdResponse.body);
    expect(created).toMatchObject({ plan_kind: "CLINICAL", status: "DRAFT" });
    expect(created.rules).toHaveLength(8);

    const replay = await request(server())
      .post("/api/v1/anc-plan/versions")
      .set("authorization", `Bearer ${token}`)
      .send(createRequest)
      .expect(201);
    expect(replay.body).toEqual(createdResponse.body);

    const approvedResponse = await request(server())
      .post(`/api/v1/anc-plan/versions/${created.id}/approve`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "10000000-0000-4000-8000-000000000003",
        approval_reference: "CLIN-APPROVAL-DUMMY-DO-NOT-USE-IN-PRODUCTION",
        effective_from: "2026-08-11",
      })
      .expect(201);
    expect(ancPlanResponseSchema.parse(approvedResponse.body).status).toBe("APPROVED");

    const activatedResponse = await request(server())
      .post(`/api/v1/anc-plan/versions/${created.id}/activate`)
      .set("authorization", `Bearer ${token}`)
      .send({ idempotency_key: "10000000-0000-4000-8000-000000000004" })
      .expect(201);
    expect(ancPlanResponseSchema.parse(activatedResponse.body)).toMatchObject({
      status: "ACTIVE",
      plan_kind: "CLINICAL",
      production_eligible: true,
    });
    expect(audit.events.map((event) => event.action)).toEqual([
      "STAFF_LOGIN_SUCCESS",
      "ANC_PLAN_DRAFT_CREATED",
      "ANC_PLAN_APPROVED",
      "ANC_PLAN_ACTIVATED",
    ]);
  });

  it("requires an explicit clinical-program-owner grant for approval", async () => {
    const token = await login("puskesmas");
    const createdResponse = await request(server())
      .post("/api/v1/anc-plan/versions")
      .set("authorization", `Bearer ${token}`)
      .send(createPlanRequest("10000000-0000-4000-8000-000000000005"))
      .expect(201);
    const created = ancPlanResponseSchema.parse(createdResponse.body);

    plans.governorIds.delete(puskesmasId);
    await request(server())
      .post(`/api/v1/anc-plan/versions/${created.id}/approve`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "10000000-0000-4000-8000-000000000006",
        approval_reference: "DUMMY APPROVAL MUST NOT PASS WITHOUT OWNER GRANT",
        effective_from: "2026-08-11",
      })
      .expect(403);
    expect(plans.plans.find((plan) => plan.id === created.id)?.status).toBe("DRAFT");
  });

  it("returns eight own-scope milestones and fails closed outside scope", async () => {
    const token = await login("puskesmas");
    const response = await request(server())
      .get(`/api/v1/pregnancies/${pregnancyId}/milestones`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const timeline = pregnancyMilestoneListResponseSchema.parse(response.body);
    expect(timeline.milestones.map((milestone) => milestone.code)).toEqual(
      milestoneCodeSchema.options,
    );
    expect(
      timeline.milestones
        .slice(0, 6)
        .every((item) => item.record_validation_status === "INCOMPLETE"),
    ).toBe(true);
    expect(timeline).toMatchObject({
      as_of_date: "2026-08-11",
      gestational_age: { total_days: 14, completed_weeks: 2, additional_days: 0 },
      next_milestone_code: "K2",
      trimester_label: "SYNTHETIC_DEV_ONLY",
    });
    expect(timeline.milestones[1]).toMatchObject({
      code: "K2",
      target_date_start: "2026-08-11",
      target_date_end: "2026-08-17",
      schedule_source: "RULE_WINDOW",
      visit_status: "DUE",
      reminder_eligible: true,
    });

    const nextResponse = await request(server())
      .get(`/api/v1/pregnancies/${pregnancyId}/milestones/next`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const next = pregnancyNextMilestoneResponseSchema.parse(nextResponse.body);
    expect(next.next_milestone).toMatchObject({ code: "K2", visit_status: "DUE" });
    expect(
      timeline.milestones
        .slice(6)
        .every((item) => item.record_validation_status === "NOT_REQUIRED"),
    ).toBe(true);

    scope.allowedMotherIds.delete(motherId);
    await request(server())
      .get(`/api/v1/pregnancies/${pregnancyId}/milestones`)
      .set("authorization", `Bearer ${token}`)
      .expect(403);
  });

  async function login(identifier: string): Promise<string> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password })
      .expect(200);
    const body = response.body as Readonly<Record<string, unknown>>;
    if (typeof body["access_token"] !== "string") throw new Error("Missing access token");
    return body["access_token"];
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

class FakeAncPlanRepository implements AncPlanRepository {
  public readonly plans: AncPlanResponse[] = [
    planFixture(syntheticPlanId, 1, "SYNTHETIC", "DRAFT"),
  ];
  public readonly governorIds = new Set<string>();
  private readonly timeline = milestoneTimelineFixture();

  public async isClinicalProgramOwner(staffUserId: string): Promise<boolean> {
    return this.governorIds.has(staffUserId);
  }

  public async findAssignable(): Promise<AncPlanResponse | null> {
    return (
      this.plans.find((plan) => plan.plan_kind === "CLINICAL" && plan.status === "ACTIVE") ??
      this.plans.find((plan) => plan.plan_kind === "SYNTHETIC" && plan.status === "DRAFT") ??
      null
    );
  }

  public async findById(
    client: TransactionClient,
    planId: string,
  ): Promise<AncPlanResponse | null> {
    void client;
    return this.plans.find((plan) => plan.id === planId) ?? null;
  }

  public async createDraft(
    client: TransactionClient,
    input: CreateAncPlanDraftInput,
  ): Promise<AncPlanResponse> {
    void client;
    const plan: AncPlanResponse = {
      id: input.planId,
      version_no: this.plans.length + 1,
      plan_kind: "CLINICAL",
      status: "DRAFT",
      source_reference: input.sourceReference,
      approval_reference: null,
      effective_from: null,
      approved_by_staff_id: null,
      approved_at: null,
      activated_at: null,
      production_eligible: false,
      rules: input.rules.map((rule) => ({
        ...rule,
        plan_version_id: input.planId,
        reminder_interval_days: 3,
      })),
    };
    this.plans.push(plan);
    return plan;
  }

  public async approve(
    client: TransactionClient,
    input: ApproveAncPlanInput,
  ): Promise<AncPlanResponse> {
    void client;
    const index = this.planIndex(input.planId);
    const existing = this.plans[index];
    if (existing?.plan_kind !== "CLINICAL" || existing.status !== "DRAFT") {
      throw new AncPlanTransitionError();
    }
    const plan: AncPlanResponse = {
      ...existing,
      status: "APPROVED",
      approval_reference: input.approvalReference,
      effective_from: input.effectiveFrom,
      approved_by_staff_id: input.actorStaffId,
      approved_at: input.approvedAt.toISOString(),
    };
    this.plans[index] = plan;
    return plan;
  }

  public async activate(
    client: TransactionClient,
    input: ActivateAncPlanInput,
  ): Promise<AncPlanResponse> {
    void client;
    const index = this.planIndex(input.planId);
    const existing = this.plans[index];
    if (existing?.plan_kind !== "CLINICAL" || existing.status !== "APPROVED") {
      throw new AncPlanTransitionError();
    }
    if (existing.effective_from === null || existing.effective_from > input.effectiveDate) {
      throw new AncPlanEffectiveDateError();
    }
    for (let position = 0; position < this.plans.length; position += 1) {
      const candidate = this.plans[position];
      if (candidate?.status === "ACTIVE") {
        this.plans[position] = { ...candidate, status: "ARCHIVED", production_eligible: false };
      }
    }
    const plan: AncPlanResponse = {
      ...existing,
      status: "ACTIVE",
      activated_at: input.activatedAt.toISOString(),
      production_eligible: true,
    };
    this.plans[index] = plan;
    return plan;
  }

  public async findPregnancyMotherId(targetPregnancyId: string): Promise<string | null> {
    return targetPregnancyId === pregnancyId ? motherId : null;
  }

  public async listPregnancyMilestones(
    targetPregnancyId: string,
  ): Promise<PregnancyMilestoneSnapshot | null> {
    return targetPregnancyId === pregnancyId ? this.timeline : null;
  }

  private planIndex(planId: string): number {
    const index = this.plans.findIndex((plan) => plan.id === planId);
    if (index < 0) throw new AncPlanNotFoundError();
    return index;
  }
}

class FakeIdempotencyService {
  private readonly outcomes = new Map<
    string,
    { readonly resource: IdempotencyResourceReference; readonly identity: string }
  >();

  public async runForStaff<T>(
    input: {
      readonly actor: StaffActor;
      readonly operation: string;
      readonly idempotencyKey: string;
      readonly requestIdentity: unknown;
    },
    execute: (client: TransactionClient) => Promise<{
      readonly resourceType: string;
      readonly resourceId: string;
      readonly value: T;
    }>,
    replay: (client: TransactionClient, resource: IdempotencyResourceReference) => Promise<T>,
  ): Promise<{
    readonly resourceType: string;
    readonly resourceId: string;
    readonly replayed: boolean;
    readonly value: T;
  }> {
    const key = `${input.actor.staffUserId}:${input.operation}:${input.idempotencyKey}`;
    const identity = JSON.stringify(input.requestIdentity);
    const existing = this.outcomes.get(key);
    const client = {} as TransactionClient;
    if (existing !== undefined) {
      if (existing.identity !== identity) {
        throw new ApiException({
          status: 409,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Kunci idempotensi telah digunakan untuk permintaan yang berbeda.",
        });
      }
      const value = await replay(client, existing.resource);
      return { ...existing.resource, replayed: true, value };
    }
    const executed = await execute(client);
    const resource = { resourceType: executed.resourceType, resourceId: executed.resourceId };
    this.outcomes.set(key, { resource, identity });
    return { ...resource, replayed: false, value: executed.value };
  }
}

function createPlanRequest(idempotencyKey: string): Readonly<Record<string, unknown>> {
  return {
    idempotency_key: idempotencyKey,
    source_reference: "DUMMY CLINICAL SOURCE - REQUIRES REAL OWNER APPROVAL",
    rules: milestoneCodeSchema.options.map(ruleFor),
  };
}

function planFixture(
  id: string,
  versionNo: number,
  planKind: AncPlanResponse["plan_kind"],
  status: AncPlanResponse["status"],
): AncPlanResponse {
  return {
    id,
    version_no: versionNo,
    plan_kind: planKind,
    status,
    source_reference: "SYNTHETIC API FIXTURE - NOT CLINICAL GUIDANCE",
    approval_reference: null,
    effective_from: null,
    approved_by_staff_id: null,
    approved_at: null,
    activated_at: null,
    production_eligible: planKind === "CLINICAL" && status === "ACTIVE",
    rules: milestoneCodeSchema.options.map((code, index) => ({
      id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      plan_version_id: id,
      reminder_interval_days: 3,
      ...ruleFor(code),
    })),
  };
}

function milestoneTimelineFixture(): PregnancyMilestoneSnapshot {
  return {
    pregnancyId,
    carePlanVersionId: syntheticPlanId,
    planVersionNo: 1,
    planKind: "SYNTHETIC",
    planStatus: "DRAFT",
    datingBasis: "PREGNANCY_START_DATE",
    datingDate: "2026-07-28",
    pregnancyStatus: "ACTIVE",
    closedAt: null,
    milestones: milestoneCodeSchema.options.map((code, index) => ({
      id: `72000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      pregnancyId,
      ruleId: `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      code,
      trimesterLabel: "SYNTHETIC_DEV_ONLY",
      targetWeekStart: code === "K8" ? null : Number(code.slice(1)),
      targetWeekEnd: code === "K8" ? null : Number(code.slice(1)),
      milestoneCategory: code === "K8" ? "DELIVERY" : "ANC",
      requiredFacilityPolicy:
        code === "K8"
          ? "PONED_OR_RS_REQUIRED"
          : code === "K1" || code === "K4" || code === "K5"
            ? "PUSKESMAS_REQUIRED"
            : "FLEXIBLE",
      allowedFacilityTypes:
        code === "K8"
          ? ["PONED", "HOSPITAL"]
          : code === "K1" || code === "K4" || code === "K5"
            ? ["PUSKESMAS"]
            : ["PUSKESMAS", "MIDWIFE_PRACTICE"],
      reminderEnabled: code !== "K8",
      reminderIntervalDays: 3,
      dueAt: null,
      visitStatus: code === "K1" ? "CONFIRMED" : "UPCOMING",
      recordValidationStatus: index < 6 ? "INCOMPLETE" : "NOT_REQUIRED",
    })),
  };
}

function ruleFor(code: MilestoneCode): AncPlanRuleInput {
  if (code === "K8") {
    return {
      code,
      trimester_label: "SYNTHETIC_DEV_ONLY",
      target_week_start: null,
      target_week_end: null,
      milestone_category: "DELIVERY",
      required_facility_policy: "PONED_OR_RS_REQUIRED",
      allowed_facility_types: ["PONED", "HOSPITAL"],
      reminder_enabled: false,
    };
  }
  const position = Number(code.slice(1));
  const puskesmasRequired = code === "K1" || code === "K4" || code === "K5";
  return {
    code,
    trimester_label: "SYNTHETIC_DEV_ONLY",
    target_week_start: position,
    target_week_end: position,
    milestone_category: "ANC",
    required_facility_policy: puskesmasRequired ? "PUSKESMAS_REQUIRED" : "FLEXIBLE",
    allowed_facility_types: puskesmasRequired ? ["PUSKESMAS"] : ["PUSKESMAS", "MIDWIFE_PRACTICE"],
    reminder_enabled: true,
  };
}
