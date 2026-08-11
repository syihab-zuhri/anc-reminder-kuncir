/* eslint-disable @typescript-eslint/require-await -- in-memory ports intentionally satisfy async interfaces */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  milestoneDueDateMutationResponseSchema,
  type MilestoneCode,
  type MilestoneDueDateMutationResponse,
  type VisitStatus,
} from "@anc/contracts";
import type { DatabasePool, IdempotencyResourceReference, TransactionClient } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { ApiException } from "../src/errors/api.exception.js";
import type { IdempotencyService } from "../src/idempotency/idempotency.service.js";
import {
  MilestoneDueDateBeforePregnancyError,
  MilestoneDueDateUnchangedError,
  MilestoneNotSchedulableError,
  MilestonePregnancyNotActiveError,
  MilestoneRescheduleReasonRequiredError,
  MilestoneScheduleChangedError,
  MilestoneScheduleTargetUnavailableError,
  type MilestoneScheduleRepository,
  type ScheduleMilestoneDueDateInput,
} from "../src/milestone-schedule/milestone-schedule.repository.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerId = "30000000-0000-4000-8000-000000000001";
const otherCenterId = "30000000-0000-4000-8000-000000000002";
const puskesmasId = "40000000-0000-4000-8000-000000000001";
const bidanId = "40000000-0000-4000-8000-000000000002";
const pregnancyId = "60000000-0000-4000-8000-000000000001";
const password = "AmanSekali2026";
const now = new Date("2026-08-11T09:00:00.000Z");

describe("milestone schedule/reschedule API", () => {
  let app: INestApplication | undefined;
  let schedules: FakeMilestoneScheduleRepository;
  let audit: FakeAuditRepository;

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    schedules = new FakeMilestoneScheduleRepository();
    audit = new FakeAuditRepository();
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
      scopedAccessRepository: new FakeScopedAccessRepository(),
      milestoneScheduleRepository: schedules,
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

  it("schedules, replays immutably, and reschedules with a reason", async () => {
    const token = await login("puskesmas");
    const firstRequest = {
      idempotency_key: "10000000-0000-4000-8000-000000000001",
      due_date: "2026-08-12",
      expected_due_date: null,
    };
    const firstResponse = await mutate(token, "K2", firstRequest, 200);
    const first = milestoneDueDateMutationResponseSchema.parse(firstResponse.body);
    expect(first).toMatchObject({
      action: "SCHEDULED",
      previous_due_date: null,
      due_date: "2026-08-12",
      due_at: "2026-08-11T17:00:00.000Z",
      timezone: "Asia/Jakarta",
    });

    const replay = await mutate(token, "K2", firstRequest, 200);
    expect(replay.body).toEqual(firstResponse.body);

    await mutate(
      token,
      "K2",
      {
        idempotency_key: "10000000-0000-4000-8000-000000000002",
        due_date: "2026-08-14",
        expected_due_date: "2026-08-12",
      },
      422,
    );
    const changed = await mutate(
      token,
      "K2",
      {
        idempotency_key: "10000000-0000-4000-8000-000000000003",
        due_date: "2026-08-14",
        expected_due_date: "2026-08-12",
        reason: "Jadwal disepakati ulang dalam fixture sintetis",
      },
      200,
    );
    expect(milestoneDueDateMutationResponseSchema.parse(changed.body)).toMatchObject({
      action: "RESCHEDULED",
      previous_due_date: "2026-08-12",
      due_date: "2026-08-14",
    });
    expect(schedules.events).toHaveLength(2);
    expect(audit.events.map((event) => event.action)).toEqual([
      "STAFF_LOGIN_SUCCESS",
      "MILESTONE_SCHEDULED",
      "MILESTONE_RESCHEDULED",
    ]);
  });

  it("enforces role, scope, pregnancy, terminal-state, and date guards", async () => {
    const bidanToken = await login("bidan");
    await mutate(
      bidanToken,
      "K3",
      {
        idempotency_key: "10000000-0000-4000-8000-000000000004",
        due_date: "2026-08-12",
        expected_due_date: null,
      },
      403,
    );

    const token = await login("puskesmas");
    const beforePregnancy = await mutate(
      token,
      "K3",
      {
        idempotency_key: "10000000-0000-4000-8000-000000000005",
        due_date: "2026-07-31",
        expected_due_date: null,
      },
      422,
    );
    expect(errorCode(beforePregnancy.body as unknown)).toBe("MILESTONE_DUE_DATE_BEFORE_PREGNANCY");

    schedules.visitStatus = "CONFIRMED";
    const terminal = await mutate(
      token,
      "K3",
      {
        idempotency_key: "10000000-0000-4000-8000-000000000006",
        due_date: "2026-08-12",
        expected_due_date: null,
      },
      409,
    );
    expect(errorCode(terminal.body as unknown)).toBe("MILESTONE_NOT_SCHEDULABLE");

    schedules.visitStatus = "UPCOMING";
    schedules.pregnancyStatus = "CLOSED";
    const closed = await mutate(
      token,
      "K3",
      {
        idempotency_key: "10000000-0000-4000-8000-000000000007",
        due_date: "2026-08-12",
        expected_due_date: null,
      },
      409,
    );
    expect(errorCode(closed.body as unknown)).toBe("PREGNANCY_NOT_ACTIVE");

    schedules.pregnancyStatus = "ACTIVE";
    schedules.healthCenterId = otherCenterId;
    await mutate(
      token,
      "K3",
      {
        idempotency_key: "10000000-0000-4000-8000-000000000008",
        due_date: "2026-08-12",
        expected_due_date: null,
      },
      403,
    );
  });

  it("lets exactly one concurrent writer win from the same expected state", async () => {
    const token = await login("puskesmas");
    const [left, right] = await Promise.all([
      mutate(token, "K4", {
        idempotency_key: "10000000-0000-4000-8000-000000000009",
        due_date: "2026-08-20",
        expected_due_date: null,
      }),
      mutate(token, "K4", {
        idempotency_key: "10000000-0000-4000-8000-000000000010",
        due_date: "2026-08-21",
        expected_due_date: null,
      }),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const conflict = left.status === 409 ? left : right;
    expect(errorCode(conflict.body as unknown)).toBe("MILESTONE_SCHEDULE_CHANGED");
    expect(schedules.events).toHaveLength(1);
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

  function mutate(
    token: string,
    code: MilestoneCode,
    body: Readonly<Record<string, unknown>>,
    expectedStatus?: number,
  ): request.Test {
    const operation = request(server())
      .patch(`/api/v1/pregnancies/${pregnancyId}/milestones/${code}/due-date`)
      .set("authorization", `Bearer ${token}`)
      .send(body);
    return expectedStatus === undefined ? operation : operation.expect(expectedStatus);
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

function errorCode(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = (body as Readonly<Record<string, unknown>>)["error"];
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return (error as Readonly<Record<string, unknown>>)["code"];
}

class FakeMilestoneScheduleRepository implements MilestoneScheduleRepository {
  public healthCenterId = centerId;
  public pregnancyStatus: "ACTIVE" | "CLOSED" = "ACTIVE";
  public visitStatus: VisitStatus = "UPCOMING";
  public currentDueDate: string | null = null;
  public readonly events: MilestoneDueDateMutationResponse[] = [];
  private queue: Promise<void> = Promise.resolve();

  public scheduleDueDate(
    client: TransactionClient,
    input: ScheduleMilestoneDueDateInput,
  ): Promise<MilestoneDueDateMutationResponse> {
    void client;
    return this.withLock(async () => {
      if (input.pregnancyId !== pregnancyId || input.healthCenterId !== this.healthCenterId) {
        throw new MilestoneScheduleTargetUnavailableError();
      }
      if (this.pregnancyStatus !== "ACTIVE") throw new MilestonePregnancyNotActiveError();
      if (["CONFIRMED", "CANCELLED", "NOT_APPLICABLE"].includes(this.visitStatus)) {
        throw new MilestoneNotSchedulableError();
      }
      if (input.dueDate < "2026-08-01") throw new MilestoneDueDateBeforePregnancyError();
      if (input.expectedDueDate !== this.currentDueDate) throw new MilestoneScheduleChangedError();
      if (input.dueDate === this.currentDueDate) throw new MilestoneDueDateUnchangedError();
      const action = this.currentDueDate === null ? "SCHEDULED" : "RESCHEDULED";
      if (action === "RESCHEDULED" && input.reason === null) {
        throw new MilestoneRescheduleReasonRequiredError();
      }
      const result: MilestoneDueDateMutationResponse = {
        event_id: input.eventId,
        pregnancy_id: input.pregnancyId,
        milestone_id: `70000000-0000-4000-8000-00000000000${input.code.slice(1)}`,
        code: input.code,
        action,
        previous_due_date: this.currentDueDate,
        due_date: input.dueDate,
        due_at: input.dueAt.toISOString(),
        timezone: input.timezone,
        reason: input.reason,
        occurred_at: input.occurredAt.toISOString(),
      };
      this.currentDueDate = input.dueDate;
      this.events.push(result);
      return result;
    });
  }

  public async findScheduleMutation(
    client: TransactionClient,
    eventId: string,
    targetHealthCenterId: string,
  ): Promise<MilestoneDueDateMutationResponse | null> {
    void client;
    if (targetHealthCenterId !== this.healthCenterId) return null;
    return this.events.find((event) => event.event_id === eventId) ?? null;
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release = (): void => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
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
      return {
        ...existing.resource,
        replayed: true,
        value: await replay(client, existing.resource),
      };
    }
    const executed = await execute(client);
    const resource = { resourceType: executed.resourceType, resourceId: executed.resourceId };
    this.outcomes.set(key, { resource, identity });
    return { ...resource, replayed: false, value: executed.value };
  }
}
