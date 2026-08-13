import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import type {
  CanonicalErrorEnvelope,
  ContentTemplateResponse,
  ContentVersionResponse,
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
import { FakeContentManagementRepository } from "./content-management-fakes.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerId = "30000000-0000-4000-8000-000000000001";
const ownerId = "40000000-0000-4000-8000-000000000001";
const managerId = "40000000-0000-4000-8000-000000000002";
const bidanId = "40000000-0000-4000-8000-000000000003";
const superAdminId = "40000000-0000-4000-8000-000000000004";
const password = "AmanSekali2026";

describe("content management integration (TASK-P4-009)", () => {
  let app: INestApplication;
  let repository: FakeContentManagementRepository;
  let auditRepository: FakeAuditRepository;

  beforeEach(async () => {
    const hasher = new PasswordHasher();
    const passwordHash = await hasher.hash(password);
    const staffAuthRepository = new FakeStaffAuthRepository();
    const users: Array<{
      id: string;
      identifier: string;
      role: StaffRole;
      healthCenterId: string | null;
    }> = [
      { id: ownerId, identifier: "owner.puskesmas", role: "PUSKESMAS", healthCenterId: centerId },
      {
        id: managerId,
        identifier: "manager.puskesmas",
        role: "PUSKESMAS",
        healthCenterId: centerId,
      },
      { id: bidanId, identifier: "bidan.kuncir", role: "BIDAN", healthCenterId: centerId },
      { id: superAdminId, identifier: "super.admin", role: "SUPER_ADMIN", healthCenterId: null },
    ];
    for (const user of users) {
      staffAuthRepository.seedUser({
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

    repository = new FakeContentManagementRepository();
    repository.clinicalOwnerIds.add(ownerId);
    auditRepository = new FakeAuditRepository();
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository,
      contentManagementRepository: repository,
      idempotencyService: new FakeIdempotencyService() as unknown as IdempotencyService,
      clock: () => new Date("2026-08-13T05:00:00.000Z"),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("runs DRAFT -> REVIEW -> APPROVED -> PUBLISHED -> ARCHIVED with owner governance", async () => {
    const managerToken = await login("manager.puskesmas");
    const ownerToken = await login("owner.puskesmas");
    const created = await createWameDraft(managerToken);
    const draft = created.versions[0];
    expect(draft?.status).toBe("DRAFT");
    expect(draft?.placeholder_keys).toEqual(["milestone_code", "facility_name"]);

    const replay = await createWameDraft(managerToken);
    expect(replay.id).toBe(created.id);
    expect(
      auditRepository.events.filter((event) => event.action === "CONTENT_TEMPLATE_DRAFT_CREATED"),
    ).toHaveLength(1);

    const review = await transition(managerToken, draft!.id, "submit-review", key(2));
    expect(review.status).toBe("REVIEW");

    const denied = await request(server())
      .post(`/api/v1/content/versions/${draft!.id}/approve`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ idempotency_key: key(3), approval_reference: "APPROVAL-SYNTHETIC-001" });
    expect(denied.status).toBe(403);

    const approvedResponse = await request(server())
      .post(`/api/v1/content/versions/${draft!.id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ idempotency_key: key(4), approval_reference: "APPROVAL-SYNTHETIC-001" });
    expect(approvedResponse.status).toBe(201);
    expect((approvedResponse.body as ContentVersionResponse).status).toBe("APPROVED");

    const published = await transition(ownerToken, draft!.id, "publish", key(5));
    expect(published.status).toBe("PUBLISHED");
    expect(published.production_eligible).toBe(true);

    const listResponse = await request(server())
      .get("/api/v1/content/templates")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(listResponse.status).toBe(200);
    expect((listResponse.body as { total: number }).total).toBe(1);
    expect(
      (
        listResponse.body as {
          capabilities: { can_approve_publish_archive: boolean };
        }
      ).capabilities.can_approve_publish_archive,
    ).toBe(false);

    const ownerListResponse = await request(server())
      .get("/api/v1/content/templates")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerListResponse.status).toBe(200);
    expect(
      (
        ownerListResponse.body as {
          capabilities: { can_approve_publish_archive: boolean };
        }
      ).capabilities.can_approve_publish_archive,
    ).toBe(true);

    const archived = await transition(ownerToken, draft!.id, "archive", key(6));
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.production_eligible).toBe(false);
    expect(
      auditRepository.events
        .map((event) => event.action)
        .filter((action) => action.startsWith("CONTENT_")),
    ).toEqual([
      "CONTENT_TEMPLATE_DRAFT_CREATED",
      "CONTENT_VERSION_SUBMITTED_REVIEW",
      "CONTENT_VERSION_APPROVED",
      "CONTENT_VERSION_PUBLISHED",
      "CONTENT_VERSION_ARCHIVED",
    ]);
  });

  it("rejects sensitive or malformed content before persistence", async () => {
    const token = await login("manager.puskesmas");
    const invalidBodies = [
      "NIK ibu: {{nik}}",
      "Hasil: {{lab_result}}",
      "<strong>Pengingat {{milestone_code}}</strong>",
    ];
    for (const [index, body] of invalidBodies.entries()) {
      const response = await request(server())
        .post("/api/v1/content/templates")
        .set("Authorization", `Bearer ${token}`)
        .send({
          idempotency_key: key(index + 20),
          template_key: "anc.wame-reminder",
          content_type: "WAME_REMINDER",
          title: "Pengingat ANC",
          body,
          source_reference: "SOP-ANC-SYNTHETIC-001",
        });
      expect(response.status).toBe(400);
    }
    expect(await repository.listTemplates(centerId)).toHaveLength(0);
  });

  it.each(["bidan.kuncir", "super.admin"])(
    "denies content governance to %s",
    async (identifier) => {
      const token = await login(identifier);
      const response = await request(server())
        .get("/api/v1/content/templates")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(403);
    },
  );

  it("rejects an invalid lifecycle jump with a canonical conflict", async () => {
    const ownerToken = await login("owner.puskesmas");
    const draft = (await createWameDraft(ownerToken)).versions[0]!;
    const response = await request(server())
      .post(`/api/v1/content/versions/${draft.id}/publish`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ idempotency_key: key(8) });
    expect(response.status).toBe(409);
    expect((response.body as CanonicalErrorEnvelope).error.code).toBe("CONTENT_INVALID_TRANSITION");
  });

  function server(): Parameters<typeof request>[0] {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  async function login(identifier: string): Promise<string> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password });
    expect(response.status).toBe(200);
    return (response.body as { access_token: string }).access_token;
  }

  async function createWameDraft(token: string): Promise<ContentTemplateResponse> {
    const response = await request(server())
      .post("/api/v1/content/templates")
      .set("Authorization", `Bearer ${token}`)
      .send({
        idempotency_key: key(1),
        template_key: "anc.wame-reminder",
        content_type: "WAME_REMINDER",
        title: "Pengingat ANC",
        body: "Pengingat {{milestone_code}} dari {{facility_name}}. Silakan hubungi Puskesmas.",
        source_reference: "SOP-ANC-SYNTHETIC-001",
      });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as ContentTemplateResponse;
  }

  async function transition(
    token: string,
    versionId: string,
    action: "submit-review" | "publish" | "archive",
    idempotencyKey: string,
  ): Promise<ContentVersionResponse> {
    const response = await request(server())
      .post(`/api/v1/content/versions/${versionId}/${action}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotency_key: idempotencyKey });
    expect(response.status).toBe(201);
    return response.body as ContentVersionResponse;
  }
});

function key(sequence: number): string {
  return `8b26fdbd-6306-4bbf-9765-${sequence.toString().padStart(12, "0")}`;
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
    const keyValue = `${input.actor.staffUserId}:${input.operation}:${input.idempotencyKey}`;
    const identity = JSON.stringify(input.requestIdentity);
    const existing = this.outcomes.get(keyValue);
    const client = {} as TransactionClient;
    if (existing !== undefined) {
      if (existing.identity !== identity) {
        throw new ApiException({
          status: 409,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Kunci idempotensi telah digunakan untuk permintaan yang berbeda.",
        });
      }
      return {
        ...existing.resource,
        replayed: true,
        value: await replay(client, existing.resource),
      };
    }
    const executed = await execute(client);
    const resource = { resourceType: executed.resourceType, resourceId: executed.resourceId };
    this.outcomes.set(keyValue, { resource, identity });
    return { ...resource, replayed: false, value: executed.value };
  }
}
