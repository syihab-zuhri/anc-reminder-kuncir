/* eslint-disable @typescript-eslint/require-await -- test doubles intentionally satisfy async ports */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  motherAccessCredentialIssueResponseSchema,
  motherAccessCredentialRevokeResponseSchema,
  type MotherAccessCredentialRevokeResponse,
} from "@anc/contracts";
import type { DatabasePool, IdempotencyResourceReference, TransactionClient } from "@anc/database";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { ApiException } from "../src/errors/api.exception.js";
import type { IdempotencyService } from "../src/idempotency/idempotency.service.js";
import { MotherAccessCodeService } from "../src/mother-access/mother-access-code.service.js";
import { MotherAccessCryptoService } from "../src/mother-access/mother-access-crypto.service.js";
import {
  MotherAccessCredentialNotActiveError,
  MotherAccessTargetUnavailableError,
  type MotherAccessCredentialIssueMutation,
  type MotherAccessCredentialRepository,
  type MotherAccessCredentialRevokeMutation,
  type ReissueMotherAccessCredentialInput,
  type RevokeMotherAccessCredentialInput,
} from "../src/mother-access/mother-access-credential.repository.js";
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
const motherId = "50000000-0000-4000-8000-000000000001";
const otherMotherId = "50000000-0000-4000-8000-000000000002";
const inactivePregnancyMotherId = "50000000-0000-4000-8000-000000000003";
const puskesmasId = "40000000-0000-4000-8000-000000000001";
const bidanId = "40000000-0000-4000-8000-000000000002";
const superAdminId = "40000000-0000-4000-8000-000000000003";
const password = "AmanSekali2026";
const now = new Date("2026-08-10T09:00:00.000Z");

describe("mother access credential staff API", () => {
  let app: INestApplication | undefined;
  let credentials: FakeMotherAccessCredentialRepository;
  let audit: FakeAuditRepository;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await new PasswordHasher().hash(password);
  });

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    credentials = new FakeMotherAccessCredentialRepository();
    audit = new FakeAuditRepository();
    credentials.seedMother(motherId, centerId, true);
    credentials.seedMother(otherMotherId, otherCenterId, true);
    credentials.seedMother(inactivePregnancyMotherId, centerId, false);
    credentials.activeSessions.set(motherId, 2);

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
      motherAccessCredentialRepository: credentials,
      motherAccessCodeService: new FakeMotherAccessCodeService(),
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

  it("issues once, hides plaintext on replay, and atomically reissues the active code", async () => {
    const token = await login("puskesmas");
    const firstRequest = mutationRequest(
      "80000000-0000-4000-8000-000000000001",
      "Serah terima awal",
    );
    const firstResponse = await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/reissue`)
      .set("authorization", `Bearer ${token}`)
      .send(firstRequest)
      .expect(200);
    const first = motherAccessCredentialIssueResponseSchema.parse(firstResponse.body);
    expect(first).toMatchObject({
      mother_id: motherId,
      issuance_type: "ISSUED",
      status: "ACTIVE",
      code_delivery: "DISPLAY_ONCE",
    });
    expect(first.one_time_code).toMatch(
      /^ANC-(?:[23456789A-HJ-NP-Z]{4}-){3}[23456789A-HJ-NP-Z]{4}$/u,
    );
    expect(credentials.activeSessions.get(motherId)).toBe(0);
    expect(credentials.records[0]?.codeHash).not.toContain(first.one_time_code ?? "missing");

    const replayResponse = await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/reissue`)
      .set("authorization", `Bearer ${token}`)
      .send(firstRequest)
      .expect(200);
    const replay = motherAccessCredentialIssueResponseSchema.parse(replayResponse.body);
    expect(replay).toMatchObject({
      id: first.id,
      one_time_code: null,
      code_delivery: "NOT_AVAILABLE_ON_REPLAY",
    });
    expect(credentials.records).toHaveLength(1);

    const secondResponse = await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/reissue`)
      .set("authorization", `Bearer ${token}`)
      .send(mutationRequest("80000000-0000-4000-8000-000000000002", "Kode sebelumnya hilang"))
      .expect(200);
    const second = motherAccessCredentialIssueResponseSchema.parse(secondResponse.body);
    expect(second).toMatchObject({ issuance_type: "REISSUED", code_delivery: "DISPLAY_ONCE" });
    expect(second.id).not.toBe(first.id);
    expect(second.one_time_code).not.toBe(first.one_time_code);
    expect(credentials.activeFor(motherId)).toHaveLength(1);
    expect(credentials.records.find((record) => record.id === first.id)?.status).toBe("REVOKED");
    expect(
      audit.events
        .filter((event) => event.action.startsWith("MOTHER_ACCESS_CODE_"))
        .map((event) => event.action),
    ).toEqual(["MOTHER_ACCESS_CODE_ISSUED", "MOTHER_ACCESS_CODE_REISSUED"]);
  });

  it("revokes the active code and sessions exactly once, then allows a safe reissue", async () => {
    const token = await login("puskesmas");
    await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/reissue`)
      .set("authorization", `Bearer ${token}`)
      .send(mutationRequest("80000000-0000-4000-8000-000000000003", "Serah terima awal"))
      .expect(200);
    credentials.activeSessions.set(motherId, 1);

    const revokeRequest = mutationRequest(
      "80000000-0000-4000-8000-000000000004",
      "Perangkat dilaporkan hilang",
    );
    const revokedResponse = await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/revoke`)
      .set("authorization", `Bearer ${token}`)
      .send(revokeRequest)
      .expect(200);
    const revoked = motherAccessCredentialRevokeResponseSchema.parse(revokedResponse.body);
    expect(revoked).toMatchObject({ mother_id: motherId, status: "REVOKED" });
    expect(revoked.revoked_at).toBe(now.toISOString());
    expect(credentials.activeFor(motherId)).toHaveLength(0);
    expect(credentials.activeSessions.get(motherId)).toBe(0);

    const replay = await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/revoke`)
      .set("authorization", `Bearer ${token}`)
      .send(revokeRequest)
      .expect(200);
    expect(replay.body).toEqual(revokedResponse.body);

    await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/revoke`)
      .set("authorization", `Bearer ${token}`)
      .send(mutationRequest("80000000-0000-4000-8000-000000000005", "Tidak ada kode aktif"))
      .expect(409);

    const reissuedResponse = await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/reissue`)
      .set("authorization", `Bearer ${token}`)
      .send(mutationRequest("80000000-0000-4000-8000-000000000006", "Penggantian setelah revoke"))
      .expect(200);
    expect(
      motherAccessCredentialIssueResponseSchema.parse(reissuedResponse.body).issuance_type,
    ).toBe("REISSUED");
    expect(credentials.activeFor(motherId)).toHaveLength(1);
    expect(
      audit.events.filter((event) => event.action === "MOTHER_ACCESS_CODE_REVOKED"),
    ).toHaveLength(1);
  });

  it("fails closed for Bidan, cross-center and inactive-pregnancy targets", async () => {
    const puskesmasToken = await login("puskesmas");
    for (const [target, key] of [
      [otherMotherId, "80000000-0000-4000-8000-000000000007"],
      [inactivePregnancyMotherId, "80000000-0000-4000-8000-000000000008"],
    ] as const) {
      await request(server())
        .post(`/api/v1/mothers/${target}/access-code/reissue`)
        .set("authorization", `Bearer ${puskesmasToken}`)
        .send(mutationRequest(key, "Permintaan tidak berwenang"))
        .expect(403);
    }

    const superAdminToken = await login("super_admin");
    await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/reissue`)
      .set("authorization", `Bearer ${superAdminToken}`)
      .send(mutationRequest("80000000-0000-4000-8000-000000000009", "Super Admin tidak berwenang"))
      .expect(403);
    await request(server())
      .post(`/api/v1/mothers/${motherId}/access-code/reissue`)
      .set("authorization", `Bearer ${puskesmasToken}`)
      .send(mutationRequest("80000000-0000-4000-8000-000000000010", "x"))
      .expect(400);
    expect(credentials.records).toHaveLength(0);
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

interface StoredCredential {
  readonly id: string;
  readonly motherId: string;
  readonly codeHash: string;
  status: "ACTIVE" | "REVOKED";
  readonly issuedAt: Date;
  revokedAt: Date | null;
}

type StoredEvent =
  | { readonly kind: "ISSUE"; readonly value: MotherAccessCredentialIssueMutation["credential"] }
  | { readonly kind: "REVOKE"; readonly value: MotherAccessCredentialRevokeResponse };

class FakeMotherAccessCredentialRepository implements MotherAccessCredentialRepository {
  public readonly records: StoredCredential[] = [];
  public readonly activeSessions = new Map<string, number>();
  private readonly mothers = new Map<string, { centerId: string; activePregnancy: boolean }>();
  private readonly events = new Map<string, StoredEvent>();

  public seedMother(id: string, healthCenterId: string, activePregnancy: boolean): void {
    this.mothers.set(id, { centerId: healthCenterId, activePregnancy });
  }

  public activeFor(targetMotherId: string): readonly StoredCredential[] {
    return this.records.filter(
      (record) => record.motherId === targetMotherId && record.status === "ACTIVE",
    );
  }

  public async reissue(
    client: TransactionClient,
    input: ReissueMotherAccessCredentialInput,
  ): Promise<MotherAccessCredentialIssueMutation> {
    void client;
    const mother = this.mothers.get(input.motherId);
    if (
      mother === undefined ||
      mother.centerId !== input.healthCenterId ||
      !mother.activePregnancy
    ) {
      throw new MotherAccessTargetUnavailableError();
    }
    const previous = [...this.records]
      .reverse()
      .find((record) => record.motherId === input.motherId);
    const active = this.activeFor(input.motherId)[0];
    if (active !== undefined) {
      active.status = "REVOKED";
      active.revokedAt = input.occurredAt;
      this.events.set(input.revokedEventId, {
        kind: "REVOKE",
        value: revokeResponse(active),
      });
    }
    this.activeSessions.set(input.motherId, 0);
    const record: StoredCredential = {
      id: input.credentialId,
      motherId: input.motherId,
      codeHash: input.codeHash,
      status: "ACTIVE",
      issuedAt: input.occurredAt,
      revokedAt: null,
    };
    this.records.push(record);
    const credential: MotherAccessCredentialIssueMutation["credential"] = {
      id: record.id,
      mother_id: record.motherId,
      issuance_type: previous === undefined ? "ISSUED" : "REISSUED",
      status: "ACTIVE",
      issued_at: record.issuedAt.toISOString(),
    };
    this.events.set(input.issuedEventId, { kind: "ISSUE", value: credential });
    return { mutationId: input.issuedEventId, credential };
  }

  public async revoke(
    client: TransactionClient,
    input: RevokeMotherAccessCredentialInput,
  ): Promise<MotherAccessCredentialRevokeMutation> {
    void client;
    const mother = this.mothers.get(input.motherId);
    if (mother === undefined || mother.centerId !== input.healthCenterId) {
      throw new MotherAccessTargetUnavailableError();
    }
    const active = this.activeFor(input.motherId)[0];
    if (active === undefined) throw new MotherAccessCredentialNotActiveError();
    active.status = "REVOKED";
    active.revokedAt = input.occurredAt;
    this.activeSessions.set(input.motherId, 0);
    const credential = revokeResponse(active);
    this.events.set(input.revokedEventId, { kind: "REVOKE", value: credential });
    return { mutationId: input.revokedEventId, credential };
  }

  public async findIssueMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MotherAccessCredentialIssueMutation["credential"] | null> {
    void client;
    const event = this.events.get(eventId);
    if (event?.kind !== "ISSUE") return null;
    return this.mothers.get(event.value.mother_id)?.centerId === healthCenterId
      ? event.value
      : null;
  }

  public async findRevokeMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MotherAccessCredentialRevokeResponse | null> {
    void client;
    const event = this.events.get(eventId);
    if (event?.kind !== "REVOKE") return null;
    return this.mothers.get(event.value.mother_id)?.centerId === healthCenterId
      ? event.value
      : null;
  }
}

class FakeMotherAccessCodeService extends MotherAccessCodeService {
  private sequence = 0;

  public constructor() {
    super(new PasswordHasher(), new MotherAccessCryptoService("m".repeat(32), 30));
  }

  public override async issue(): Promise<{
    readonly plaintext: string;
    readonly hash: string;
    readonly lookupHash: string;
  }> {
    this.sequence += 1;
    const suffix = ["2222", "2223", "2224", "2225", "2226", "2227"][this.sequence - 1] ?? "ZZZZ";
    return {
      plaintext: `ANC-2345-6789-ABCD-${suffix}`,
      hash: `test-scrypt-hash-${this.sequence}`,
      lookupHash: String(this.sequence).padStart(64, "a"),
    };
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

function mutationRequest(idempotencyKey: string, reason: string): Readonly<Record<string, string>> {
  return { idempotency_key: idempotencyKey, reason };
}

function revokeResponse(record: StoredCredential): MotherAccessCredentialRevokeResponse {
  if (record.revokedAt === null) throw new Error("Expected revoked fake credential");
  return {
    id: record.id,
    mother_id: record.motherId,
    status: "REVOKED",
    issued_at: record.issuedAt.toISOString(),
    revoked_at: record.revokedAt.toISOString(),
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
