/* eslint-disable @typescript-eslint/require-await -- in-memory ports satisfy async interfaces */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { registeredDeviceResponseSchema } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import type {
  DeviceRegistrationRepository,
  RegisterDeviceRecordInput,
  RegisteredDeviceRecord,
} from "../src/device-registration/device-registration.repository.js";
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

const motherId = "60000000-0000-4000-8000-000000000001";
const deviceId = "d0000000-0000-4000-8000-000000000001";
const token = "synthetic-fcm-token:abc1234567890";
const bearer = `anc_mt_${"a".repeat(43)}`;
const now = new Date("2026-08-13T03:00:00.000Z");

class FakeMotherAuthRepository implements MotherAuthRepository {
  public async findCredentialCandidate(): Promise<null> {
    return null;
  }
  public async createSession(): Promise<boolean> {
    return true;
  }
  public async findActiveActorBySessionHash(): Promise<MotherActor> {
    return {
      sessionId: "session-id-1",
      motherId,
      credentialId: "c0000000-0000-4000-8000-000000000001",
      displayName: "Siti Sintetis",
      activePregnancyId: "70000000-0000-4000-8000-000000000001",
      sessionExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
    };
  }
  public async revokeSession(): Promise<boolean> {
    return true;
  }
  public async rateLimitRetryAfterSeconds(): Promise<number> {
    return 0;
  }
  public async recordRateLimitFailure(): Promise<void> {}
  public async clearRateLimitBuckets(): Promise<void> {}
}

class FakeDeviceRegistrationRepository implements DeviceRegistrationRepository {
  public input: RegisterDeviceRecordInput | undefined;

  public async registerAndroid(input: RegisterDeviceRecordInput): Promise<RegisteredDeviceRecord> {
    this.input = input;
    return { id: deviceId, registeredAt: now, lastSeenAt: now };
  }
}

describe("Android device registration API", () => {
  let app: INestApplication | undefined;
  let repository: FakeDeviceRegistrationRepository;
  let audit: FakeAuditRepository;

  beforeEach(async () => {
    repository = new FakeDeviceRegistrationRepository();
    audit = new FakeAuditRepository();
    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: new FakeStaffAuthRepository(),
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      motherAuthRepository: new FakeMotherAuthRepository(),
      deviceRegistrationRepository: repository,
      auditRepository: audit,
      clock: () => now,
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("registers only the authenticated mother's encrypted Android token", async () => {
    const response = await request(server())
      .put("/api/v1/mother/me/devices/android")
      .set("authorization", `Bearer ${bearer}`)
      .send({ push_token: token })
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(registeredDeviceResponseSchema.parse(response.body)).toEqual({
      id: deviceId,
      platform: "ANDROID",
      status: "ACTIVE",
      registered_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    });
    expect(repository.input?.motherId).toBe(motherId);
    expect(repository.input?.encryptedToken).not.toContain(token);
    expect(repository.input?.tokenFingerprint).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(audit.events)).not.toContain(token);
    expect(audit.events.at(-1)).toMatchObject({
      actorType: "BUMIL",
      actorId: motherId,
      action: "ANDROID_DEVICE_REGISTERED",
      resourceType: "DEVICE",
      resourceId: deviceId,
    });
  });

  it("rejects unauthenticated and malformed registrations before persistence", async () => {
    await request(server())
      .put("/api/v1/mother/me/devices/android")
      .send({ push_token: token })
      .expect(401);
    await request(server())
      .put("/api/v1/mother/me/devices/android")
      .set("authorization", `Bearer ${bearer}`)
      .send({ push_token: "short token" })
      .expect(400);
    expect(repository.input).toBeUndefined();
  });

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Application not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});
