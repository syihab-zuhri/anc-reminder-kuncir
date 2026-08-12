import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type {
  CanonicalErrorEnvelope,
  ProgramRuleVersionResponse,
  ProgramStatusHistoryResponse,
  ProgramStatusResponse,
  StaffRole,
} from "@anc/contracts";
import type { DatabasePool, IdempotencyResourceReference, TransactionClient } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { ApiException } from "../src/errors/api.exception.js";
import type { IdempotencyService } from "../src/idempotency/idempotency.service.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import { ProgramStatusService } from "../src/program-status/program-status.service.js";
import { apiConfigFixture } from "./fixtures.js";
import { FakeProgramStatusRepository } from "./program-status-fakes.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerId = "30000000-0000-4000-8000-000000000001";
const otherCenterId = "30000000-0000-4000-8000-000000000002";
const ownerStaffId = "40000000-0000-4000-8000-000000000001";
const staffPuskesmasId = "40000000-0000-4000-8000-000000000002";
const bidanId = "40000000-0000-4000-8000-000000000003";
const superAdminId = "40000000-0000-4000-8000-000000000004";
const crossCenterId = "40000000-0000-4000-8000-000000000005";
const motherId = "60000000-0000-4000-8000-000000000001";
const unreachableMotherId = "60000000-0000-4000-8000-000000000002";
const pregnancyId = "70000000-0000-4000-8000-000000000001";
const unreachablePregnancyId = "70000000-0000-4000-8000-000000000002";
const password = "AmanSekali2026";

const defaultRequirements = [
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K1" },
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K4" },
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K5" },
  { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K6" },
] as const;

describe("TASK-P2-014 Program Status Integration Tests", () => {
  let app: INestApplication;
  let programRepo: FakeProgramStatusRepository;
  let scopedAccessRepo: FakeScopedAccessRepository;
  let auditRepo: FakeAuditRepository;

  beforeEach(async () => {
    const passwordHasher = new PasswordHasher();
    const passwordHash = await passwordHasher.hash(password);

    const staffAuthRepo = new FakeStaffAuthRepository();
    const users: {
      readonly id: string;
      readonly identifier: string;
      readonly role: StaffRole;
      readonly healthCenterId: string | null;
    }[] = [
      {
        id: ownerStaffId,
        identifier: "owner.puskesmas",
        role: "PUSKESMAS",
        healthCenterId: centerId,
      },
      {
        id: staffPuskesmasId,
        identifier: "staff.puskesmas",
        role: "PUSKESMAS",
        healthCenterId: centerId,
      },
      { id: bidanId, identifier: "bidan.kuncir", role: "BIDAN", healthCenterId: centerId },
      { id: superAdminId, identifier: "super.admin", role: "SUPER_ADMIN", healthCenterId: null },
      {
        id: crossCenterId,
        identifier: "cross.puskesmas",
        role: "PUSKESMAS",
        healthCenterId: otherCenterId,
      },
    ];
    for (const user of users) {
      staffAuthRepo.seedUser({
        id: user.id,
        healthCenterId: user.healthCenterId,
        loginIdentifier: user.identifier,
        passwordHash,
        displayName: user.identifier,
        role: user.role,
        status: "ACTIVE",
        assignments: [],
      });
    }

    programRepo = new FakeProgramStatusRepository();
    programRepo.clinicalOwnerIds.add(ownerStaffId);
    programRepo.pregnancies.set(pregnancyId, { motherId, healthCenterId: centerId });
    programRepo.pregnancies.set(unreachablePregnancyId, {
      motherId: unreachableMotherId,
      healthCenterId: centerId,
    });

    scopedAccessRepo = new FakeScopedAccessRepository();
    scopedAccessRepo.allowedMotherIds.add(motherId);

    auditRepo = new FakeAuditRepository();

    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository: staffAuthRepo,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: scopedAccessRepo,
      auditRepository: auditRepo,
      programStatusRepository: programRepo,
      idempotencyService: new FakeIdempotencyService() as unknown as IdempotencyService,
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

  async function createApproveActivateRule(
    token: string,
    effectiveFrom = "2026-01-01",
  ): Promise<ProgramRuleVersionResponse> {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const create = await request(server)
      .post("/api/v1/program-rules/versions")
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: randomUUID(),
        source_reference: "SYNTHETIC_TEST_RULE_NOT_CLINICAL_ADVICE",
        requirements: [...defaultRequirements],
      });
    expect(create.status).toBe(201);
    const rule = create.body as ProgramRuleVersionResponse;

    const approve = await request(server)
      .post(`/api/v1/program-rules/versions/${rule.id}/approve`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: randomUUID(),
        approval_reference: "SYNTHETIC_APPROVAL_REF",
        effective_from: effectiveFrom,
      });
    expect(approve.status).toBe(201);

    const activate = await request(server)
      .post(`/api/v1/program-rules/versions/${rule.id}/activate`)
      .set("authorization", `Bearer ${token}`)
      .send({ idempotency_key: randomUUID() });
    expect(activate.status).toBe(201);
    return activate.body as ProgramRuleVersionResponse;
  }

  describe("program rule governance", () => {
    it("returns 404 when no active program rule exists", async () => {
      const token = await loginAs("staff.puskesmas");
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .get("/api/v1/program-rules/active")
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect((res.body as CanonicalErrorEnvelope).error.code).toBe("PROGRAM_RULE_NOT_AVAILABLE");
    });

    it("denies rule draft creation for Bidan, Super Admin, and non-owner Puskesmas", async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      for (const identifier of ["bidan.kuncir", "super.admin", "staff.puskesmas"]) {
        const token = await loginAs(identifier);
        const res = await request(server)
          .post("/api/v1/program-rules/versions")
          .set("authorization", `Bearer ${token}`)
          .send({
            idempotency_key: randomUUID(),
            source_reference: "SYNTHETIC_TEST_RULE",
            requirements: [...defaultRequirements],
          });
        expect(res.status).toBe(403);
      }
    });

    it("rejects invalid requirement payloads", async () => {
      const token = await loginAs("owner.puskesmas");
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const missingFieldKey = await request(server)
        .post("/api/v1/program-rules/versions")
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: randomUUID(),
          source_reference: "SYNTHETIC_TEST_RULE",
          requirements: [{ requirement_type: "FIELD_PRESENT", milestone_code: "K1" }],
        });
      expect(missingFieldKey.status).toBe(400);
      expect((missingFieldKey.body as CanonicalErrorEnvelope).error.code).toBe("VALIDATION_ERROR");

      const k7Code = await request(server)
        .post("/api/v1/program-rules/versions")
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: randomUUID(),
          source_reference: "SYNTHETIC_TEST_RULE",
          requirements: [{ requirement_type: "MILESTONE_VALIDATED", milestone_code: "K7" }],
        });
      expect(k7Code.status).toBe(400);

      const duplicates = await request(server)
        .post("/api/v1/program-rules/versions")
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: randomUUID(),
          source_reference: "SYNTHETIC_TEST_RULE",
          requirements: [
            { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K1" },
            { requirement_type: "MILESTONE_VALIDATED", milestone_code: "K1" },
          ],
        });
      expect(duplicates.status).toBe(400);
    });

    it("creates, approves, and activates a rule version only for the clinical owner", async () => {
      const token = await loginAs("owner.puskesmas");
      const rule = await createApproveActivateRule(token);

      expect(rule.status).toBe("ACTIVE");
      expect(rule.production_eligible).toBe(true);
      expect(rule.requirements).toHaveLength(4);
      expect(auditRepo.events.map((event) => event.action)).toEqual(
        expect.arrayContaining([
          "PROGRAM_RULE_DRAFT_CREATED",
          "PROGRAM_RULE_APPROVED",
          "PROGRAM_RULE_ACTIVATED",
        ]),
      );

      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const active = await request(server)
        .get("/api/v1/program-rules/active")
        .set("authorization", `Bearer ${token}`);
      expect(active.status).toBe(200);
      expect((active.body as ProgramRuleVersionResponse).id).toBe(rule.id);
    });

    it("replays idempotent draft creation and rejects reused keys with different payloads", async () => {
      const token = await loginAs("owner.puskesmas");
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const idempotencyKey = randomUUID();
      const body = {
        idempotency_key: idempotencyKey,
        source_reference: "SYNTHETIC_TEST_RULE",
        requirements: [{ requirement_type: "MILESTONE_VALIDATED", milestone_code: "K1" }],
      };

      const first = await request(server)
        .post("/api/v1/program-rules/versions")
        .set("authorization", `Bearer ${token}`)
        .send(body);
      expect(first.status).toBe(201);

      const replay = await request(server)
        .post("/api/v1/program-rules/versions")
        .set("authorization", `Bearer ${token}`)
        .send(body);
      expect(replay.status).toBe(201);
      expect((replay.body as ProgramRuleVersionResponse).id).toBe(
        (first.body as ProgramRuleVersionResponse).id,
      );

      const conflict = await request(server)
        .post("/api/v1/program-rules/versions")
        .set("authorization", `Bearer ${token}`)
        .send({ ...body, source_reference: "SYNTHETIC_OTHER_RULE" });
      expect(conflict.status).toBe(409);
      expect((conflict.body as CanonicalErrorEnvelope).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("enforces lifecycle transitions and effective date", async () => {
      const token = await loginAs("owner.puskesmas");
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const create = await request(server)
        .post("/api/v1/program-rules/versions")
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: randomUUID(),
          source_reference: "SYNTHETIC_TEST_RULE",
          requirements: [...defaultRequirements],
        });
      const rule = create.body as ProgramRuleVersionResponse;

      const activateBeforeApproval = await request(server)
        .post(`/api/v1/program-rules/versions/${rule.id}/activate`)
        .set("authorization", `Bearer ${token}`)
        .send({ idempotency_key: randomUUID() });
      expect(activateBeforeApproval.status).toBe(409);
      expect((activateBeforeApproval.body as CanonicalErrorEnvelope).error.code).toBe(
        "PROGRAM_RULE_INVALID_TRANSITION",
      );

      await request(server)
        .post(`/api/v1/program-rules/versions/${rule.id}/approve`)
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: randomUUID(),
          approval_reference: "SYNTHETIC_APPROVAL_REF",
          effective_from: "2027-12-31",
        })
        .expect(201);

      const tooEarly = await request(server)
        .post(`/api/v1/program-rules/versions/${rule.id}/activate`)
        .set("authorization", `Bearer ${token}`)
        .send({ idempotency_key: randomUUID() });
      expect(tooEarly.status).toBe(409);
      expect((tooEarly.body as CanonicalErrorEnvelope).error.code).toBe(
        "PROGRAM_RULE_NOT_EFFECTIVE",
      );

      const reapprove = await request(server)
        .post(`/api/v1/program-rules/versions/${rule.id}/approve`)
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: randomUUID(),
          approval_reference: "SYNTHETIC_APPROVAL_REF_AGAIN",
          effective_from: "2026-01-01",
        });
      expect(reapprove.status).toBe(409);
    });

    it("archives the previous active version when a new one activates", async () => {
      const token = await loginAs("owner.puskesmas");
      const first = await createApproveActivateRule(token);
      const second = await createApproveActivateRule(token);

      expect(second.version_no).toBe(first.version_no + 1);
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const active = await request(server)
        .get("/api/v1/program-rules/active")
        .set("authorization", `Bearer ${token}`);
      expect((active.body as ProgramRuleVersionResponse).id).toBe(second.id);
    });
  });

  describe("API-PROGRAM-001 GET program status", () => {
    it("returns NOT_EVALUATED with an operational notice while no rule is active", async () => {
      const token = await loginAs("staff.puskesmas");
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .get(`/api/v1/pregnancies/${pregnancyId}/program-status`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body as ProgramStatusResponse;
      expect(body.sigizi_kesga_recording_status).toBe("NOT_EVALUATED");
      expect(body.fetal_rights_status).toBe("NOT_EVALUATED");
      expect(body.rule_version_id).toBeNull();
      expect(body.evidence).toBeNull();
      expect(body.notice).toBeTruthy();
    });

    it("does not grant labels from K6 validation alone (AC-PROG-001)", async () => {
      const token = await loginAs("owner.puskesmas");
      await createApproveActivateRule(token);
      programRepo.evidenceByPregnancy.set(pregnancyId, {
        validatedMilestones: ["K6"],
        recordFields: new Map(),
      });

      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .get(`/api/v1/pregnancies/${pregnancyId}/program-status`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body as ProgramStatusResponse;
      expect(body.sigizi_kesga_recording_status).toBe("IN_PROGRESS");
      expect(body.fetal_rights_status).toBe("NOT_YET_MET");
      expect(body.evidence?.missing_milestones).toEqual(["K1", "K4", "K5"]);
    });

    it("reports COMPLETE/MET only under an approved active rule with full evidence (AC-PROG-002)", async () => {
      const token = await loginAs("owner.puskesmas");
      await createApproveActivateRule(token);
      programRepo.evidenceByPregnancy.set(pregnancyId, {
        validatedMilestones: ["K1", "K4", "K5", "K6"],
        recordFields: new Map(),
      });

      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .get(`/api/v1/pregnancies/${pregnancyId}/program-status`)
        .set("authorization", `Bearer ${token}`);
      const body = res.body as ProgramStatusResponse;
      expect(body.sigizi_kesga_recording_status).toBe("COMPLETE");
      expect(body.fetal_rights_status).toBe("MET");
      expect(body.stored).toBe(false);
      expect(body.rule_status).toBe("ACTIVE");
    });

    it("allows scoped Bidan reads but denies unreachable mothers and out-of-scope pregnancies", async () => {
      const token = await loginAs("bidan.kuncir");
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const allowed = await request(server)
        .get(`/api/v1/pregnancies/${pregnancyId}/program-status`)
        .set("authorization", `Bearer ${token}`);
      expect(allowed.status).toBe(200);

      const unreachable = await request(server)
        .get(`/api/v1/pregnancies/${unreachablePregnancyId}/program-status`)
        .set("authorization", `Bearer ${token}`);
      expect(unreachable.status).toBe(403);

      const unknown = await request(server)
        .get(`/api/v1/pregnancies/${randomUUID()}/program-status`)
        .set("authorization", `Bearer ${token}`);
      expect(unknown.status).toBe(403);
    });

    it("denies Super Admin program status reads", async () => {
      const token = await loginAs("super.admin");
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .get(`/api/v1/pregnancies/${pregnancyId}/program-status`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  describe("API-PROGRAM-002 POST recalculate", () => {
    it("requires an active rule before storing assessments", async () => {
      const token = await loginAs("staff.puskesmas");
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .post(`/api/v1/pregnancies/${pregnancyId}/program-status/recalculate`)
        .set("authorization", `Bearer ${token}`)
        .send({ idempotency_key: randomUUID() });
      expect(res.status).toBe(409);
      expect((res.body as CanonicalErrorEnvelope).error.code).toBe("PROGRAM_RULE_NOT_ACTIVE");
      expect(programRepo.assessments).toHaveLength(0);
    });

    it("denies Bidan, Super Admin, and cross-center Puskesmas (AC-PROG-004 role boundaries)", async () => {
      const ownerToken = await loginAs("owner.puskesmas");
      await createApproveActivateRule(ownerToken);
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      for (const identifier of ["bidan.kuncir", "super.admin", "cross.puskesmas"]) {
        const token = await loginAs(identifier);
        const res = await request(server)
          .post(`/api/v1/pregnancies/${pregnancyId}/program-status/recalculate`)
          .set("authorization", `Bearer ${token}`)
          .send({ idempotency_key: randomUUID() });
        expect(res.status).toBe(403);
      }
      expect(programRepo.assessments).toHaveLength(0);
    });

    it("stores a STAFF assessment and audits recalculation and status change", async () => {
      const token = await loginAs("staff.puskesmas");
      const ownerToken = await loginAs("owner.puskesmas");
      await createApproveActivateRule(ownerToken);
      programRepo.evidenceByPregnancy.set(pregnancyId, {
        validatedMilestones: ["K1"],
        recordFields: new Map(),
      });

      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const idempotencyKey = randomUUID();
      const res = await request(server)
        .post(`/api/v1/pregnancies/${pregnancyId}/program-status/recalculate`)
        .set("authorization", `Bearer ${token}`)
        .send({ idempotency_key: idempotencyKey, reason: "Validasi K1 selesai dicatat" });
      expect(res.status).toBe(201);
      const body = res.body as ProgramStatusResponse;
      expect(body.stored).toBe(true);
      expect(body.evaluated_by_type).toBe("STAFF");
      expect(body.evaluated_by_staff_id).toBe(staffPuskesmasId);
      expect(body.sigizi_kesga_recording_status).toBe("IN_PROGRESS");

      const replay = await request(server)
        .post(`/api/v1/pregnancies/${pregnancyId}/program-status/recalculate`)
        .set("authorization", `Bearer ${token}`)
        .send({ idempotency_key: idempotencyKey, reason: "Validasi K1 selesai dicatat" });
      expect(replay.status).toBe(201);
      expect(programRepo.assessments).toHaveLength(1);

      const actions = auditRepo.events.map((event) => event.action);
      expect(actions).toContain("PROGRAM_ASSESSMENT_RECALCULATED");
      expect(actions).toContain("PROGRAM_STATUS_CHANGED");
      const recalcEvent = auditRepo.events.find(
        (event) => event.action === "PROGRAM_ASSESSMENT_RECALCULATED",
      );
      expect(recalcEvent?.metadata["reason"]).toBe("Validasi K1 selesai dicatat");
    });
  });

  describe("API-PROGRAM-003 GET history", () => {
    it("keeps historical assessments intact across evidence and rule changes (AC-PROG-003)", async () => {
      const ownerToken = await loginAs("owner.puskesmas");
      const firstRule = await createApproveActivateRule(ownerToken);
      programRepo.evidenceByPregnancy.set(pregnancyId, {
        validatedMilestones: ["K1"],
        recordFields: new Map(),
      });

      const server = app.getHttpServer() as Parameters<typeof request>[0];
      await request(server)
        .post(`/api/v1/pregnancies/${pregnancyId}/program-status/recalculate`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ idempotency_key: randomUUID() })
        .expect(201);

      programRepo.evidenceByPregnancy.set(pregnancyId, {
        validatedMilestones: ["K1", "K4", "K5", "K6"],
        recordFields: new Map(),
      });
      await request(server)
        .post(`/api/v1/pregnancies/${pregnancyId}/program-status/recalculate`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ idempotency_key: randomUUID() })
        .expect(201);

      const secondRule = await createApproveActivateRule(ownerToken);

      const res = await request(server)
        .get(`/api/v1/pregnancies/${pregnancyId}/program-status/history`)
        .set("authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      const body = res.body as ProgramStatusHistoryResponse;
      expect(body.assessments).toHaveLength(2);
      expect(body.assessments[0]?.sigizi_kesga_recording_status).toBe("COMPLETE");
      expect(body.assessments[1]?.sigizi_kesga_recording_status).toBe("IN_PROGRESS");
      for (const assessment of body.assessments) {
        expect(assessment.rule_version_id).toBe(firstRule.id);
        expect(assessment.rule_version_no).toBe(firstRule.version_no);
      }
      expect(secondRule.id).not.toBe(firstRule.id);
    });

    it("denies history access to Bidan", async () => {
      const token = await loginAs("bidan.kuncir");
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .get(`/api/v1/pregnancies/${pregnancyId}/program-status/history`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  describe("SYSTEM evaluation after evidence changes", () => {
    it("stores a SYSTEM assessment when an active rule exists", async () => {
      const ownerToken = await loginAs("owner.puskesmas");
      await createApproveActivateRule(ownerToken);
      programRepo.milestonePregnancies.set("80000000-0000-4000-8000-000000000001", pregnancyId);
      programRepo.evidenceByPregnancy.set(pregnancyId, {
        validatedMilestones: ["K1", "K4", "K5", "K6"],
        recordFields: new Map(),
      });

      const service = app.get(ProgramStatusService);
      await service.evaluateSystemForMilestone("80000000-0000-4000-8000-000000000001");

      expect(programRepo.assessments).toHaveLength(1);
      expect(programRepo.assessments[0]?.evaluated_by_type).toBe("SYSTEM");
      expect(programRepo.assessments[0]?.evaluated_by_staff_id).toBeNull();
      expect(programRepo.assessments[0]?.sigizi_kesga_recording_status).toBe("COMPLETE");
      const systemEvents = auditRepo.events.filter((event) => event.actorType === "SYSTEM");
      expect(systemEvents.map((event) => event.action)).toEqual(
        expect.arrayContaining(["PROGRAM_ASSESSMENT_RECALCULATED", "PROGRAM_STATUS_CHANGED"]),
      );
    });

    it("stays a no-op before any rule is approved (no clinical approval yet)", async () => {
      programRepo.milestonePregnancies.set("80000000-0000-4000-8000-000000000002", pregnancyId);

      const service = app.get(ProgramStatusService);
      await service.evaluateSystemForMilestone("80000000-0000-4000-8000-000000000002");

      expect(programRepo.assessments).toHaveLength(0);
      expect(auditRepo.events).toHaveLength(0);
    });
  });
});

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
