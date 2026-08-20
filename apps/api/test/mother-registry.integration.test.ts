/* eslint-disable @typescript-eslint/require-await -- test double intentionally satisfies async port */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  motherRegistrationResponseSchema,
  type MotherRegistrationRequest,
  type MotherRegistrationResponse,
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
  ActiveAncPlanUnavailableError,
  MotherRecordHasActivePregnancyError,
  maskPhone,
  type ArchiveMotherRecordInput,
  type CreateMotherRegistrationInput,
  type MotherRegistryRepository,
  type UpdateMotherRecordInput,
} from "../src/registry/mother-registry.repository.js";
import { NikCipher } from "../src/registry/nik-cipher.js";
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
const superAdminId = "40000000-0000-4000-8000-000000000003";
const password = "AmanSekali2026";
const now = new Date("2026-08-10T09:00:00.000Z");

describe("mother registry API", () => {
  let app: INestApplication | undefined;
  let registry: FakeMotherRegistryRepository;
  let idempotency: FakeIdempotencyService;
  let audit: FakeAuditRepository;

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    registry = new FakeMotherRegistryRepository();
    idempotency = new FakeIdempotencyService();
    audit = new FakeAuditRepository();
    const passwordHash = await new PasswordHasher().hash(password);
    for (const [id, role, loginIdentifier, hcId] of [
      [puskesmasId, "PUSKESMAS", "puskesmas", centerId],
      [bidanId, "BIDAN", "bidan", centerId],
      [superAdminId, "SUPER_ADMIN", "super_admin", null],
    ] as const) {
      auth.seedUser({
        id,
        healthCenterId: hcId,
        displayName: role,
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
      motherRegistryRepository: registry,
      auditRepository: audit,
      idempotencyService: idempotency as unknown as IdempotencyService,
      clock: () => new Date(now),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("creates mother, active pregnancy, and consent once without exposing NIK/contact", async () => {
    const token = await login("puskesmas");
    const body = registrationRequest();
    const first = await request(server())
      .post("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .send(body)
      .expect(201);
    const response = motherRegistrationResponseSchema.parse(first.body);

    expect(response.mother.health_center_id).toBe(centerId);
    expect(response.pregnancy).toMatchObject({
      mother_id: response.mother.id,
      dating_basis: "PREGNANCY_START_DATE",
      dating_date: "2026-05-01",
      status: "ACTIVE",
    });
    expect(response.consent).toMatchObject({
      mother_id: response.mother.id,
      purpose: "REMINDER",
      status: "GRANTED",
      source: "STAFF_REGISTRATION",
    });
    const serialized = JSON.stringify(first.body);
    expect(serialized).not.toContain(body.nik);
    expect(serialized).not.toContain(body.phone_number);
    expect(serialized).not.toContain(body.address);
    expect(response.mother.phone_masked).toMatch(/\*+6789/u);
    expect(registry.created).toHaveLength(1);
    const created = registry.created[0];
    expect(created?.phoneNormalized).toBe("628123456789");
    expect(created?.nikCiphertext).not.toContain(body.nik);
    expect(
      new NikCipher(apiConfigFixture().nikEncryptionKey).decrypt(created?.nikCiphertext ?? ""),
    ).toBe(body.nik);
    expect(audit.events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["MOTHER_REGISTERED", "PREGNANCY_CREATED", "CONSENT_RECORDED"]),
    );

    const replay = await request(server())
      .post("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .send(body)
      .expect(201);
    expect(replay.body).toEqual(first.body);
    expect(registry.created).toHaveLength(1);
    expect(audit.events).toHaveLength(4);
  });

  it("rejects invalid contact/date inputs and keeps Puskesmas-only registry permission", async () => {
    const puskesmasToken = await login("puskesmas");
    await request(server())
      .post("/api/v1/mothers")
      .set("authorization", `Bearer ${puskesmasToken}`)
      .send({ ...registrationRequest(), phone_number: "0812-invalid" })
      .expect(422);
    await request(server())
      .post("/api/v1/mothers")
      .set("authorization", `Bearer ${puskesmasToken}`)
      .send({ ...registrationRequest(), pregnancy_start_date: "2026-08-11" })
      .expect(422);
    const superAdminToken = await login("super_admin");
    await request(server())
      .post("/api/v1/mothers")
      .set("authorization", `Bearer ${superAdminToken}`)
      .send(registrationRequest())
      .expect(403);
    expect(registry.created).toHaveLength(0);

    const bidanToken = await login("bidan");
    await request(server())
      .post("/api/v1/mothers")
      .set("authorization", `Bearer ${bidanToken}`)
      .send(registrationRequest())
      .expect(201);
    expect(registry.created).toHaveLength(1);
  });

  it("fails safely when no approved active ANC plan can be selected", async () => {
    registry.failWithoutActivePlan = true;
    const token = await login("puskesmas");
    const response = await request(server())
      .post("/api/v1/mothers")
      .set("authorization", `Bearer ${token}`)
      .send(registrationRequest())
      .expect(409);
    expect(errorCode(response)).toBe("REGISTRATION_NOT_READY");
    expect(registry.created).toHaveLength(0);
  });

  it("updates patient administration data and archives only a closed record for Puskesmas", async () => {
    const token = await login("puskesmas");
    const update = await request(server())
      .patch("/api/v1/mothers/50000000-0000-4000-8000-000000000001")
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7d",
        full_name: "Siti Aminah Diperbarui",
        address: "Jl. Mawar Nomor 2, Kuncir",
        phone_number: "0812-3456-789",
        reason: "Koreksi data administrasi",
      })
      .expect(200);
    expect(update.body).toMatchObject({
      id: "50000000-0000-4000-8000-000000000001",
      full_name: "Siti Aminah Diperbarui",
    });

    registry.hasActivePregnancy = true;
    await request(server())
      .delete("/api/v1/mothers/50000000-0000-4000-8000-000000000001")
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7e",
        reason: "Data pendaftaran duplikat",
      })
      .expect(409);

    registry.hasActivePregnancy = false;
    await request(server())
      .delete("/api/v1/mothers/50000000-0000-4000-8000-000000000001")
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7f",
        reason: "Data pendaftaran duplikat",
      })
      .expect(200);

    const bidanToken = await login("bidan");
    await request(server())
      .delete("/api/v1/mothers/50000000-0000-4000-8000-000000000001")
      .set("authorization", `Bearer ${bidanToken}`)
      .send({
        idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e80",
        reason: "Data pendaftaran duplikat",
      })
      .expect(403);
  });

  async function login(identifier: string): Promise<string> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password })
      .expect(200);
    return stringField(bodyRecord(response), "access_token");
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

function registrationRequest(): MotherRegistrationRequest {
  return {
    idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
    full_name: "Siti Aminah",
    nik: "3273014901010001",
    address: "Jl. Mawar Nomor 1, Kuncir",
    phone_number: "0812-3456-789",
    pregnancy_start_date: "2026-05-01",
    consent: { notification_allowed: true },
  };
}

function bodyRecord(response: request.Response): Readonly<Record<string, unknown>> {
  const value: unknown = response.body;
  if (typeof value !== "object" || value === null) throw new Error("Expected object response");
  return value as Readonly<Record<string, unknown>>;
}

function stringField(value: Readonly<Record<string, unknown>>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string") throw new Error(`Expected string field ${field}`);
  return candidate;
}

function errorCode(response: request.Response): string {
  const error = bodyRecord(response)["error"];
  if (typeof error !== "object" || error === null) throw new Error("Expected canonical error");
  return stringField(error as Readonly<Record<string, unknown>>, "code");
}

class FakeMotherRegistryRepository implements MotherRegistryRepository {
  public readonly created: CreateMotherRegistrationInput[] = [];
  public readonly registrations = new Map<string, MotherRegistrationResponse>();
  public failWithoutActivePlan = false;
  public hasActivePregnancy = false;

  public async create(
    client: TransactionClient,
    input: CreateMotherRegistrationInput,
  ): Promise<MotherRegistrationResponse> {
    void client;
    if (this.failWithoutActivePlan) throw new ActiveAncPlanUnavailableError();
    this.created.push(input);
    const registration: MotherRegistrationResponse = {
      mother: {
        id: input.motherId,
        health_center_id: input.healthCenterId,
        full_name: input.fullName,
        phone_masked: maskPhone(input.phoneNormalized),
      },
      pregnancy: {
        id: input.pregnancyId,
        mother_id: input.motherId,
        health_center_id: input.healthCenterId,
        dating_basis: "PREGNANCY_START_DATE",
        dating_date: input.pregnancyStartDate,
        status: "ACTIVE",
      },
      consent: {
        id: input.consentId,
        mother_id: input.motherId,
        purpose: "REMINDER",
        status: input.notificationAllowed ? "GRANTED" : "WITHDRAWN",
        source: "STAFF_REGISTRATION",
        recorded_at: input.recordedAt.toISOString(),
      },
    };
    this.registrations.set(registration.mother.id, registration);
    return registration;
  }

  public async findRegistration(
    client: TransactionClient,
    motherId: string,
  ): Promise<MotherRegistrationResponse | null> {
    void client;
    return this.registrations.get(motherId) ?? null;
  }

  public async updateRecord(
    client: TransactionClient,
    input: UpdateMotherRecordInput,
  ): Promise<{ id: string; full_name: string; address: string; phone_masked: string }> {
    void client;
    return {
      id: input.motherId,
      full_name: input.fullName,
      address: input.address,
      phone_masked: maskPhone(input.phoneNormalized ?? "628123456789"),
    };
  }

  public async findRecordUpdate(
    client: TransactionClient,
    motherId: string,
  ): Promise<{ id: string; full_name: string; address: string; phone_masked: string } | null> {
    void client;
    return {
      id: motherId,
      full_name: "Siti Aminah Diperbarui",
      address: "Jl. Mawar Nomor 2, Kuncir",
      phone_masked: maskPhone("628123456789"),
    };
  }

  public async archiveRecord(
    client: TransactionClient,
    input: ArchiveMotherRecordInput,
  ): Promise<{ id: string; archived_at: string }> {
    void client;
    if (this.hasActivePregnancy) throw new MotherRecordHasActivePregnancyError();
    return { id: input.motherId, archived_at: input.archivedAt.toISOString() };
  }

  public async findArchivedRecord(
    client: TransactionClient,
    motherId: string,
  ): Promise<{ id: string; archived_at: string } | null> {
    void client;
    return { id: motherId, archived_at: now.toISOString() };
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
