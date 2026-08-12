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
  public items: WaFallbackItem[] = [
    {
      id: fallbackId,
      reminder_cycle_id: "90000000-0000-4000-8000-000000000001",
      mother_id: "60000000-0000-4000-8000-000000000001",
      mother_full_name: "Siti Aminah",
      phone_number_masked: "0812****7890",
      milestone_code: "K2",
      due_at: "2026-09-01",
      status: "READY",
      wa_me_url: null,
      link_generated_at: null,
      resolved_at: null,
      resolved_by: null,
      manual_note: null,
    },
  ];

  public async getQueue(): Promise<WaFallbackItem[]> {
    return this.items.filter((i) => ["READY", "LINK_GENERATED"].includes(i.status));
  }

  public async getById(id: string): Promise<WaFallbackItem | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  public async updateWaLink(
    id: string,
    waMeUrl: string,
    generatedAt: string,
  ): Promise<WaFallbackItem | null> {
    const item = await this.getById(id);
    if (!item) return null;
    const updated: WaFallbackItem = {
      ...item,
      status: "LINK_GENERATED",
      wa_me_url: waMeUrl,
      link_generated_at: generatedAt,
    };
    this.items = this.items.map((i) => (i.id === id ? updated : i));
    return updated;
  }

  public async resolve(
    id: string,
    staffUserId: string,
    manualNote?: string,
  ): Promise<WaFallbackItem | null> {
    const item = await this.getById(id);
    if (!item) return null;
    const updated: WaFallbackItem = {
      ...item,
      status: "RESOLVED",
      resolved_at: new Date().toISOString(),
      resolved_by: staffUserId,
      manual_note: manualNote ?? null,
    };
    this.items = this.items.map((i) => (i.id === id ? updated : i));
    return updated;
  }
}

describe("wa-fallback integration (API-WA-001..003)", () => {
  let app: INestApplication;
  let staffAuthRepo: FakeStaffAuthRepository;
  let waFallbackRepo: FakeWaFallbackRepository;
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

    app = await createApiApplication({
      config,
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository: staffAuthRepo,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository: new FakeAuditRepository(),
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

    // 3. Resolve fallback
    const resolveRes = await request(server)
      .post(`/api/v1/wa-fallback/${fallbackId}/resolve`)
      .set("Authorization", `Bearer ${bidanToken}`)
      .send({ manual_note: "WA pengingat dikirim manual." });

    expect(resolveRes.status).toBe(200);
    const resolvedItem = resolveRes.body as WaFallbackItem;
    expect(resolvedItem.status).toBe("RESOLVED");
    expect(resolvedItem.manual_note).toBe("WA pengingat dikirim manual.");
  });

  it("denies Super Admin from accessing WhatsApp fallback operational queue", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const queueRes = await request(server)
      .get("/api/v1/wa-fallback/queue")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(queueRes.status).toBe(403);
  });
});
