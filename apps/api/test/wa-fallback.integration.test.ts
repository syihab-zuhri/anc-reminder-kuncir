/* eslint-disable @typescript-eslint/require-await -- in-memory ports intentionally satisfy async interfaces */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import type {
  GenerateWaLinkResponse,
  WaFallbackItem,
  WaFallbackQueueResponse,
} from "@anc/contracts";
import type { DatabasePool } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import type { WaFallbackRepository } from "../src/wa-fallback/wa-fallback.repository.js";
import type {
  WaFallbackQueueScope,
  WaFallbackTransitionResult,
} from "../src/wa-fallback/wa-fallback.repository.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerId = "30000000-0000-4000-8000-000000000001";
const bidanId = "40000000-0000-4000-8000-000000000002";
const superAdminId = "40000000-0000-4000-8000-000000000003";
const fallbackId = "91000000-0000-4000-8000-000000000001";
const password = "AmanSekali2026";

class FakeWaFallbackRepository implements WaFallbackRepository {
  public accessAllowed = true;
  private readonly phoneNormalized = "081234567890";
  public items: WaFallbackItem[] = [
    {
      id: fallbackId,
      reminder_cycle_id: "90000000-0000-4000-8000-000000000001",
      mother_id: "60000000-0000-4000-8000-000000000001",
      mother_full_name: "Siti Aminah",
      phone_number_masked: "0812****7890",
      milestone_code: "K2",
      due_at: "2026-09-01T00:00:00.000Z",
      status: "READY",
      wa_me_url: null,
      link_generated_at: null,
      link_opened_at: null,
      resolved_at: null,
      resolved_by: null,
      manual_note: null,
    },
  ];

  public async getQueue(_scope: WaFallbackQueueScope): Promise<WaFallbackItem[]> {
    void _scope;
    if (!this.accessAllowed) return [];
    return this.items.filter((i) => ["READY", "LINK_GENERATED", "LINK_OPENED"].includes(i.status));
  }

  public async getById(id: string): Promise<WaFallbackItem | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  public async getScopeTarget(
    id: string,
  ): Promise<{ healthCenterId: string; motherId: string } | null> {
    const item = await this.getById(id);
    return item === null ? null : { healthCenterId: centerId, motherId: item.mother_id };
  }

  public async getLinkTarget(id: string) {
    const item = await this.getById(id);
    return item === null
      ? null
      : {
          status: item.status,
          phoneNormalized: this.phoneNormalized,
          milestoneCode: item.milestone_code,
          linkGeneratedAt:
            item.link_generated_at === null ? null : new Date(item.link_generated_at),
        };
  }

  public async markLinkGenerated(
    id: string,
    generatedAt: Date,
  ): Promise<WaFallbackTransitionResult> {
    return this.transition(id, ["READY"], {
      status: "LINK_GENERATED",
      link_generated_at: generatedAt.toISOString(),
    });
  }

  public async markLinkOpened(id: string, openedAt: Date): Promise<WaFallbackTransitionResult> {
    return this.transition(id, ["LINK_GENERATED"], {
      status: "LINK_OPENED",
      link_opened_at: openedAt.toISOString(),
    });
  }

  public async markResolved(
    id: string,
    staffUserId: string,
    manualNote: string | null,
    resolvedAt: Date,
  ): Promise<WaFallbackTransitionResult> {
    return this.transition(id, ["READY", "LINK_GENERATED", "LINK_OPENED"], {
      status: "RESOLVED_MANUALLY",
      resolved_at: resolvedAt.toISOString(),
      resolved_by: staffUserId,
      manual_note: manualNote,
    });
  }

  public async canAccessMother(): Promise<boolean> {
    return this.accessAllowed;
  }

  private transition(
    id: string,
    allowedStatuses: readonly string[],
    patch: Partial<WaFallbackItem>,
  ): WaFallbackTransitionResult {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item === undefined) return "NOT_FOUND";
    if (!allowedStatuses.includes(item.status)) return "INVALID_STATE";
    this.items = this.items.map((candidate) =>
      candidate.id === id ? { ...candidate, ...patch } : candidate,
    );
    return "UPDATED";
  }
}

describe("wa-fallback integration (API-WA-001..003)", () => {
  let app: INestApplication;
  let staffAuthRepo: FakeStaffAuthRepository;
  let waFallbackRepo: FakeWaFallbackRepository;
  let auditRepo: FakeAuditRepository;
  let bidanToken: string;
  let superAdminToken: string;

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
    staffAuthRepo.seedUser({
      id: superAdminId,
      healthCenterId: null,
      loginIdentifier: "superadmin.kuncir",
      passwordHash: await hasher.hash(password),
      displayName: "Super Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      assignments: [],
    });

    waFallbackRepo = new FakeWaFallbackRepository();
    auditRepo = new FakeAuditRepository();

    app = await createApiApplication({
      config,
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository: staffAuthRepo,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository: auditRepo,
      waFallbackRepository: waFallbackRepo,
    });

    await app.init();

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const bidanLogin = await request(server)
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: "bidan.kuncir", password });
    bidanToken = (bidanLogin.body as { access_token: string }).access_token;

    const superAdminLogin = await request(server)
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: "superadmin.kuncir", password });
    superAdminToken = (superAdminLogin.body as { access_token: string }).access_token;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("allows Bidan to view queue, generate wa.me link with disclaimer, and resolve fallback item", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    // 1. Get queue
    const queueRes = await request(server)
      .get("/api/v1/wa-fallback/queue")
      .set("Authorization", `Bearer ${bidanToken}`);

    expect(queueRes.status).toBe(200);
    const queueData = queueRes.body as WaFallbackQueueResponse;
    expect(queueData.total).toBe(1);
    expect(queueData.items[0]?.milestone_code).toBe("K2");

    // 2. Generate wa.me link
    const linkRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/generate-link`)
      .set("Authorization", `Bearer ${bidanToken}`);

    expect(linkRes.status).toBe(200);
    const linkData = linkRes.body as GenerateWaLinkResponse;
    expect(linkData.wa_me_url).toContain("https://wa.me/");
    expect(linkData.disclaimer).toContain("Link wa.me ini adalah aksi manual Bidan");

    const repeatedLinkRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/generate-link`)
      .set("Authorization", `Bearer ${bidanToken}`);
    expect(repeatedLinkRes.status).toBe(200);
    expect((repeatedLinkRes.body as GenerateWaLinkResponse).generated_at).toBe(
      linkData.generated_at,
    );

    // 3. Mark the manual WhatsApp action as opened
    const openedRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/mark-opened`)
      .set("Authorization", `Bearer ${bidanToken}`);

    expect(openedRes.status).toBe(200);
    expect((openedRes.body as WaFallbackItem).status).toBe("LINK_OPENED");
    expect(
      (
        await request(server)
          .post(`/api/v1/wa-fallback/${fallbackId}/mark-opened`)
          .set("Authorization", `Bearer ${bidanToken}`)
      ).status,
    ).toBe(200);

    // 4. Resolve fallback
    const resolveRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/resolve`)
      .set("Authorization", `Bearer ${bidanToken}`)
      .send({ manual_note: "WA pengingat dikirim manual." });

    expect(resolveRes.status).toBe(200);
    const resolvedItem = resolveRes.body as WaFallbackItem;
    expect(resolvedItem.status).toBe("RESOLVED_MANUALLY");
    expect(resolvedItem.manual_note).toBe("WA pengingat dikirim manual.");
    expect(
      auditRepo.events
        .filter((event) => event.resourceId === fallbackId)
        .map((event) => event.action),
    ).toEqual(["WA_FALLBACK_LINK_GENERATED", "WA_FALLBACK_LINK_OPENED", "WA_FALLBACK_RESOLVED"]);
  });

  it("denies Super Admin from accessing WhatsApp fallback operational queue", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const queueRes = await request(server)
      .get("/api/v1/wa-fallback/queue")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(queueRes.status).toBe(403);
  });

  it("enforces wa.me contract requirements: phone normalization, URL encoding, no sensitive clinical detail, and safe status (TASK-P6-007)", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    // 1. Generate link and verify link contract
    const linkRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/generate-link`)
      .set("Authorization", `Bearer ${bidanToken}`);

    expect(linkRes.status).toBe(200);
    const linkData = linkRes.body as GenerateWaLinkResponse;

    // URL structure validation
    expect(linkData.wa_me_url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/u);
    expect(linkData.wa_me_url).toContain("wa.me/6281234567890");
    // Exclude unmasked NIK or private medical notes
    expect(linkData.wa_me_url).not.toContain("3603");
    expect(linkData.wa_me_url).not.toContain("NIK");
    // Ensure disclaimer prohibits false delivery claims
    expect(linkData.disclaimer).not.toContain("DELIVERED");
    expect(linkData.disclaimer).not.toContain("SENT");

    // 2. Reject non-existent fallback ID cleanly (404)
    const missingRes = await request(server)
      .post("/api/v1/wa-fallback/00000000-0000-4000-8000-000000000099/generate-link")
      .set("Authorization", `Bearer ${bidanToken}`);

    expect(missingRes.status).toBe(404);
  });

  it("rejects an unassigned Bidan and invalid state transitions", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    waFallbackRepo.accessAllowed = false;

    const forbiddenRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/generate-link`)
      .set("Authorization", `Bearer ${bidanToken}`);
    expect(forbiddenRes.status).toBe(403);

    waFallbackRepo.accessAllowed = true;
    await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/resolve`)
      .set("Authorization", `Bearer ${bidanToken}`)
      .send({});

    const conflictRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/generate-link`)
      .set("Authorization", `Bearer ${bidanToken}`);
    expect(conflictRes.status).toBe(409);
  });

  it("validates identifiers and resolve payloads at the HTTP boundary", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const invalidIdRes = await request(server)
      .post("/api/v1/wa-fallback/not-a-uuid/generate-link")
      .set("Authorization", `Bearer ${bidanToken}`);
    expect(invalidIdRes.status).toBe(400);

    const invalidPayloadRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/resolve`)
      .set("Authorization", `Bearer ${bidanToken}`)
      .send({ manual_note: "" });
    expect(invalidPayloadRes.status).toBe(400);
  });
});
