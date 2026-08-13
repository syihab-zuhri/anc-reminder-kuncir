/* eslint-disable @typescript-eslint/require-await -- in-memory port intentionally satisfies async interface */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import type { ReminderSummaryResponse } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import type { ReminderOperationsRepository } from "../src/reminder-operations/reminder-operations.repository.js";
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
const generatedAt = new Date("2026-08-13T03:00:00.000Z");

class FakeReminderOperationsRepository implements ReminderOperationsRepository {
  public readonly calls: Array<{
    healthCenterId: string;
    generatedAt: Date;
    fallbackSlaHours: number;
  }> = [];

  public async getSummary(
    healthCenterId: string,
    requestedAt: Date,
    fallbackSlaHours: number,
  ): Promise<ReminderSummaryResponse> {
    this.calls.push({ healthCenterId, generatedAt: requestedAt, fallbackSlaHours });
    return {
      generated_at: requestedAt.toISOString(),
      fallback_sla_hours: fallbackSlaHours,
      summary: {
        active_cycles_count: 5,
        pending_push_attempts_count: 1,
        retryable_push_failures_count: 2,
        terminal_push_failures_count: 1,
        unresolved_fallbacks_count: 2,
        escalated_fallbacks_count: 1,
        unreachable_fallbacks_count: 1,
      },
      oldest_pending_push_attempt_at: "2026-08-13T01:00:00.000Z",
      oldest_unresolved_fallback_at: "2026-08-11T03:00:00.000Z",
      fallback_queue: [
        {
          fallback_id: "91000000-0000-4000-8000-000000000001",
          reminder_cycle_id: "90000000-0000-4000-8000-000000000001",
          mother_id: "60000000-0000-4000-8000-000000000001",
          mother_full_name: "Siti Aminah",
          phone_number_masked: "0812****7890",
          village_name: "Desa Kuncir",
          milestone_code: "K2",
          push_failure_summary: "TERMINAL_FAILURE",
          latest_push_attempt_status: "TERMINAL_FAILURE",
          push_attempt_count: 3,
          fallback_status: "READY",
          fallback_created_at: "2026-08-11T03:00:00.000Z",
          fallback_age_hours: 48,
          escalated: true,
        },
      ],
      whatsapp_delivery_status: "UNKNOWN",
    };
  }
}

describe("reminder operations integration (API-REM-007)", () => {
  let app: INestApplication;
  let repository: FakeReminderOperationsRepository;
  let puskesmasToken: string;
  let bidanToken: string;

  beforeEach(async () => {
    const hasher = new PasswordHasher();
    const staffAuthRepository = new FakeStaffAuthRepository();
    for (const user of [
      {
        id: puskesmasId,
        loginIdentifier: "puskesmas.kuncir",
        displayName: "Puskesmas Kuncir",
        role: "PUSKESMAS" as const,
      },
      {
        id: bidanId,
        loginIdentifier: "bidan.kuncir",
        displayName: "Bidan Kuncir",
        role: "BIDAN" as const,
      },
    ]) {
      staffAuthRepository.seedUser({
        ...user,
        healthCenterId: centerId,
        passwordHash: await hasher.hash(password),
        status: "ACTIVE",
        assignments: [],
      });
    }

    repository = new FakeReminderOperationsRepository();
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository: new FakeAuditRepository(),
      reminderOperationsRepository: repository,
      clock: () => generatedAt,
    });
    await app.init();

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    puskesmasToken = await login(server, "puskesmas.kuncir");
    bidanToken = await login(server, "bidan.kuncir");
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns a scoped, server-derived failure summary without WhatsApp delivery claims", async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/api/v1/reminders/summary")
      .set("Authorization", `Bearer ${puskesmasToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.body as ReminderSummaryResponse;
    expect(body.summary.terminal_push_failures_count).toBe(1);
    expect(body.fallback_queue[0]?.fallback_age_hours).toBe(48);
    expect(body.whatsapp_delivery_status).toBe("UNKNOWN");
    expect(JSON.stringify(body)).not.toMatch(/DELIVERED|SENT/u);
    expect(repository.calls).toEqual([
      { healthCenterId: centerId, generatedAt, fallbackSlaHours: 24 },
    ]);
  });

  it("denies the Puskesmas-wide summary to Bidan", async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/api/v1/reminders/summary")
      .set("Authorization", `Bearer ${bidanToken}`);

    expect(response.status).toBe(403);
    expect(repository.calls).toHaveLength(0);
  });
});

async function login(server: Parameters<typeof request>[0], identifier: string): Promise<string> {
  const response = await request(server)
    .post("/api/v1/staff/auth/login")
    .send({ login_identifier: identifier, password });
  return (response.body as { access_token: string }).access_token;
}
