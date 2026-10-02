import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import type {
  AnnouncementCreateResponse,
  AnnouncementListResponse,
  CanonicalErrorEnvelope,
  StaffRole,
} from "@anc/contracts";
import {
  DeviceTokenCrypto,
  type DatabasePool,
  type IdempotencyResourceReference,
  type TransactionClient,
} from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANNOUNCEMENT_SEND_CONCURRENCY } from "../src/announcements/announcement.service.js";
import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { ApiException } from "../src/errors/api.exception.js";
import type { IdempotencyService } from "../src/idempotency/idempotency.service.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import { FakeAnnouncementRepository, RecordingPushAdapter } from "./announcement-fakes.js";
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
const otherPuskesmasId = "40000000-0000-4000-8000-000000000002";
const bidanId = "40000000-0000-4000-8000-000000000003";
const superAdminId = "40000000-0000-4000-8000-000000000004";
const password = "AmanSekali2026";
const config = apiConfigFixture();

describe("announcement broadcast", () => {
  let app: INestApplication;
  let repository: FakeAnnouncementRepository;
  let adapter: RecordingPushAdapter;
  let auditRepository: FakeAuditRepository;
  const tokenCrypto = new DeviceTokenCrypto(config.pushTokenEncryptionKey);

  beforeEach(async () => {
    const passwordHash = await new PasswordHasher().hash(password);
    const staffAuthRepository = new FakeStaffAuthRepository();
    const users: ReadonlyArray<{
      id: string;
      identifier: string;
      role: StaffRole;
      healthCenterId: string | null;
    }> = [
      {
        id: puskesmasId,
        identifier: "puskesmas.contoh",
        role: "PUSKESMAS",
        healthCenterId: centerId,
      },
      {
        id: otherPuskesmasId,
        identifier: "puskesmas.lain",
        role: "PUSKESMAS",
        healthCenterId: otherCenterId,
      },
      { id: bidanId, identifier: "bidan.contoh", role: "BIDAN", healthCenterId: centerId },
      { id: superAdminId, identifier: "super.admin", role: "SUPER_ADMIN", healthCenterId: null },
    ];
    repository = new FakeAnnouncementRepository();
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
      if (user.healthCenterId !== null) {
        repository.staffCenters.set(user.id, user.healthCenterId);
        repository.staffUsernames.set(user.id, user.identifier);
      }
    }

    adapter = new RecordingPushAdapter();
    auditRepository = new FakeAuditRepository();
    app = await createApiApplication({
      config,
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "anc-api-test", level: "fatal", sink: () => undefined }),
      staffAuthRepository,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      auditRepository,
      announcementRepository: repository,
      pushDeliveryAdapter: adapter,
      idempotencyService: new FakeIdempotencyService() as unknown as IdempotencyService,
      clock: () => new Date("2026-08-13T05:00:00.000Z"),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("broadcasts only to devices of the sender's health center", async () => {
    addDevice("ibu-satu-token", centerId);
    addDevice("ibu-dua-token", centerId);
    addDevice("ibu-luar-wilayah", otherCenterId);
    const token = await login("puskesmas.contoh");

    const response = await createAnnouncement(token, 1);

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const created = response.body as AnnouncementCreateResponse;
    expect(created).toMatchObject({
      title: "Jadwal Posyandu",
      total_devices: 2,
      success_count: 2,
      failed_count: 0,
      sent_at: "2026-08-13T05:00:00.000Z",
    });
    expect(adapter.messages.map((message) => message.token).sort()).toEqual([
      "ibu-dua-token",
      "ibu-satu-token",
    ]);
    expect(repository.deliveries).toHaveLength(2);
    expect(repository.deliveries.every((delivery) => delivery.announcementId === created.id)).toBe(
      true,
    );
  });

  it("sends a genuine announcement payload instead of a fake K1 reminder", async () => {
    addDevice("ibu-satu-token", centerId);
    const token = await login("puskesmas.contoh");

    const created = (await createAnnouncement(token, 1)).body as AnnouncementCreateResponse;

    const [message] = adapter.messages;
    expect(message).toEqual({
      token: "ibu-satu-token",
      title: "Jadwal Posyandu",
      body: "Posyandu dibuka Selasa pukul 08.00.",
      announcementId: created.id,
    });
    expect(message).not.toHaveProperty("milestoneCode");
    expect(message).not.toHaveProperty("reminderCycleId");
  });

  it("records per-device failures without failing the broadcast", async () => {
    addDevice("token-berhasil", centerId);
    addDevice("token-ditolak", centerId);
    addDevice("token-meledak", centerId);
    repository.devices.push({
      id: "50000000-0000-4000-8000-0000000000ff",
      healthCenterId: centerId,
      pushTokenEnvelope: "bukan-envelope-yang-valid",
    });
    adapter.resultFor.set("token-ditolak", {
      status: "TERMINAL_FAILURE",
      errorCode: "UNREGISTERED",
      invalidateDevice: true,
    });
    adapter.throwFor.add("token-meledak");
    const token = await login("puskesmas.contoh");

    const response = await createAnnouncement(token, 1);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ total_devices: 4, success_count: 1, failed_count: 3 });
    expect(
      repository.deliveries
        .filter((delivery) => delivery.status === "FAILED")
        .map((delivery) => delivery.errorCode)
        .sort(),
    ).toEqual(["DECRYPT_FAILED", "SEND_ERROR", "UNREGISTERED"]);
  });

  it("never runs more than the configured number of sends at once", async () => {
    const deviceCount = ANNOUNCEMENT_SEND_CONCURRENCY * 2 + 5;
    for (let index = 0; index < deviceCount; index += 1) {
      addDevice(`token-${index.toString().padStart(3, "0")}`, centerId);
    }
    adapter.gate = new Promise((resolve) => setTimeout(resolve, 40));
    const token = await login("puskesmas.contoh");

    const response = await createAnnouncement(token, 1);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ total_devices: deviceCount, success_count: deviceCount });
    expect(adapter.messages).toHaveLength(deviceCount);
    expect(adapter.maxInFlight).toBe(ANNOUNCEMENT_SEND_CONCURRENCY);
  });

  it("replays a repeated key without sending or recording a second broadcast", async () => {
    addDevice("ibu-satu-token", centerId);
    const token = await login("puskesmas.contoh");

    const first = (await createAnnouncement(token, 1)).body as AnnouncementCreateResponse;
    const replay = await createAnnouncement(token, 1);

    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first);
    expect(adapter.messages).toHaveLength(1);
    expect(repository.announcementCount).toBe(1);
    expect(
      auditRepository.events.filter((event) => event.action === "ANNOUNCEMENT_SENT"),
    ).toHaveLength(1);
  });

  it("answers a retry that races an unfinished broadcast with a null sent_at and no extra send", async () => {
    addDevice("ibu-satu-token", centerId);
    let release!: () => void;
    adapter.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const token = await login("puskesmas.contoh");

    const original = createAnnouncement(token, 1).then((response) => response);
    await waitFor(() => adapter.messages.length === 1);
    const retry = await createAnnouncement(token, 1);

    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ sent_at: null, total_devices: 0 });
    expect(adapter.messages).toHaveLength(1);

    release();
    const finished = await original;
    expect(finished.body).toMatchObject({
      sent_at: "2026-08-13T05:00:00.000Z",
      total_devices: 1,
      success_count: 1,
    });
    expect(adapter.messages).toHaveLength(1);
  });

  it("rejects a reused key carrying different content", async () => {
    const token = await login("puskesmas.contoh");
    await createAnnouncement(token, 1);

    const conflicting = await request(server())
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotency_key: key(1), title: "Judul lain", body: "Isi lain" });

    expect(conflicting.status).toBe(409);
    expect((conflicting.body as CanonicalErrorEnvelope).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(repository.announcementCount).toBe(1);
  });

  it.each([
    ["missing idempotency key", { title: "Judul", body: "Isi" }],
    ["malformed idempotency key", { idempotency_key: "bukan-uuid", title: "Judul", body: "Isi" }],
    ["blank title", { idempotency_key: key(2), title: "  ", body: "Isi" }],
    ["unknown field", { idempotency_key: key(2), title: "Judul", body: "Isi", target: "semua" }],
  ])("rejects a request with %s", async (_label, payload) => {
    const token = await login("puskesmas.contoh");

    const response = await request(server())
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(repository.announcementCount).toBe(0);
    expect(adapter.messages).toHaveLength(0);
  });

  it.each(["bidan.contoh", "super.admin"])("denies broadcasting and history to %s", async (id) => {
    const token = await login(id);

    expect((await createAnnouncement(token, 1)).status).toBe(403);
    const history = await request(server())
      .get("/api/v1/announcements")
      .set("Authorization", `Bearer ${token}`);
    expect(history.status).toBe(403);
    expect(adapter.messages).toHaveLength(0);
  });

  it("requires authentication", async () => {
    expect((await request(server()).get("/api/v1/announcements")).status).toBe(401);
    const response = await request(server()).post("/api/v1/announcements").send(body(1));
    expect(response.status).toBe(401);
  });

  it("lists only the caller's own center history", async () => {
    addDevice("ibu-satu-token", centerId);
    repository.seedRecord({
      id: "60000000-0000-4000-8000-000000000001",
      staffUserId: otherPuskesmasId,
      title: "Pengumuman puskesmas lain",
      body: "Tidak boleh terlihat.",
      createdAt: new Date("2026-08-12T05:00:00.000Z"),
      sentAt: new Date("2026-08-12T05:00:01.000Z"),
    });
    const token = await login("puskesmas.contoh");
    await createAnnouncement(token, 1);

    const response = await request(server())
      .get("/api/v1/announcements")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const history = response.body as AnnouncementListResponse;
    expect(history.announcements.map((row) => row.title)).toEqual(["Jadwal Posyandu"]);
    expect(history.announcements[0]).toMatchObject({
      staff_username: "puskesmas.contoh",
      total_devices: 1,
      success_count: 1,
    });

    const otherToken = await login("puskesmas.lain");
    const otherHistory = (
      await request(server())
        .get("/api/v1/announcements")
        .set("Authorization", `Bearer ${otherToken}`)
    ).body as AnnouncementListResponse;
    expect(otherHistory.announcements.map((row) => row.title)).toEqual([
      "Pengumuman puskesmas lain",
    ]);
  });

  it("audits a sent announcement against the health center scope", async () => {
    const token = await login("puskesmas.contoh");
    const created = (await createAnnouncement(token, 1)).body as AnnouncementCreateResponse;

    expect(auditRepository.events.filter((event) => event.action === "ANNOUNCEMENT_SENT")).toEqual([
      expect.objectContaining({
        actorId: puskesmasId,
        resourceType: "ANNOUNCEMENT",
        resourceId: created.id,
        metadata: { scope_type: "HEALTH_CENTER", scope_id: centerId },
      }),
    ]);
  });

  function addDevice(plainToken: string, healthCenterId: string): void {
    repository.devices.push({
      id: `50000000-0000-4000-8000-${(repository.devices.length + 1).toString().padStart(12, "0")}`,
      healthCenterId,
      pushTokenEnvelope: tokenCrypto.encrypt(plainToken),
    });
  }

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

  function createAnnouncement(token: string, sequence: number): request.Test {
    return request(server())
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${token}`)
      .send(body(sequence));
  }
});

function body(sequence: number): {
  idempotency_key: string;
  title: string;
  body: string;
} {
  return {
    idempotency_key: key(sequence),
    title: "Jadwal Posyandu",
    body: "Posyandu dibuka Selasa pukul 08.00.",
  };
}

function key(sequence: number): string {
  return `8b26fdbd-6306-4bbf-9765-${sequence.toString().padStart(12, "0")}`;
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
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
