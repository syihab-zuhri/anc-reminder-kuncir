/* eslint-disable @typescript-eslint/require-await -- test doubles intentionally satisfy async ports */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { motherMeResponseSchema, motherSessionResponseSchema } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import { MotherAccessCodeService } from "../src/mother-access/mother-access-code.service.js";
import { MotherAccessCryptoService } from "../src/mother-access/mother-access-crypto.service.js";
import type {
  CreateMotherSessionInput,
  MotherAuthRepository,
  MotherCredentialCandidate,
  MotherRateLimitBucket,
} from "../src/mother-access/mother-auth.repository.js";
import type { MotherActor } from "../src/mother-access/mother-auth.types.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const motherId = "50000000-0000-4000-8000-000000000001";
const pregnancyId = "60000000-0000-4000-8000-000000000001";
const credentialId = "70000000-0000-4000-8000-000000000001";
const oldCode = "ANC-2345-6789-ABCD-EFGH";
const revokedCode = "ANC-JKLM-NPQR-STUV-WXYZ";
const inactivePregnancyCode = "ANC-AAAA-BBBB-CCCC-DDDD";
const replacementCode = "ANC-EEEE-FFFF-GGGG-HHHH";
const now = new Date("2026-08-10T09:00:00.000Z");

describe("mother private access API", () => {
  let app: INestApplication | undefined;
  let repository: FakeMotherAuthRepository;
  let audit: FakeAuditRepository;
  let crypto: MotherAccessCryptoService;
  let currentTime: Date;

  beforeEach(async () => {
    const config = apiConfigFixture();
    crypto = new MotherAccessCryptoService(config.motherSessionSecret, config.motherSessionTtlDays);
    repository = new FakeMotherAuthRepository();
    audit = new FakeAuditRepository();
    currentTime = new Date(now);
    repository.seedCredential(crypto.credentialLookupHash(oldCode), {
      credentialId,
      motherId,
      fullName: "Siti Aminah",
      activePregnancyId: pregnancyId,
      codeHash: fakeCodeHash(oldCode),
    });
    repository.seedCredential(
      crypto.credentialLookupHash(revokedCode),
      {
        credentialId: "70000000-0000-4000-8000-000000000002",
        motherId: "50000000-0000-4000-8000-000000000002",
        fullName: "Ibu Revoked",
        activePregnancyId: "60000000-0000-4000-8000-000000000002",
        codeHash: fakeCodeHash(revokedCode),
      },
      false,
      true,
    );
    repository.seedCredential(
      crypto.credentialLookupHash(inactivePregnancyCode),
      {
        credentialId: "70000000-0000-4000-8000-000000000003",
        motherId: "50000000-0000-4000-8000-000000000003",
        fullName: "Ibu Pregnancy Closed",
        activePregnancyId: "60000000-0000-4000-8000-000000000003",
        codeHash: fakeCodeHash(inactivePregnancyCode),
      },
      true,
      false,
    );

    app = await createApiApplication({
      config,
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() =>
        Promise.resolve({ ready: true, checkedAt: currentTime.toISOString(), latencyMs: 1 }),
      ),
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: new FakeStaffAuthRepository(),
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      motherAuthRepository: repository,
      motherAccessCodeService: new FakeMotherAccessCodeService(crypto),
      auditRepository: audit,
      clock: () => new Date(currentTime),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("creates an own-only no-store session, rejects cross-role use, and logs out", async () => {
    const login = await validate("  SITI   AMINAH ", "anc 2345-6789 abcd-efgh", 200);
    const session = motherSessionResponseSchema.parse(login.body);
    expect(login.headers["cache-control"]).toBe("private, no-store");
    expect(session.expires_at).toBe("2026-09-09T09:00:00.000Z");
    expect(repository.rawSessionHashes()).not.toContain(session.access_token);

    const meResponse = await request(server())
      .get("/api/v1/mother/me")
      .set("authorization", `Bearer ${session.access_token}`)
      .expect(200);
    expect(meResponse.headers["cache-control"]).toBe("private, no-store");
    expect(motherMeResponseSchema.parse(meResponse.body)).toMatchObject({
      id: motherId,
      display_name: "Siti Aminah",
      active_pregnancy_id: pregnancyId,
    });
    expect(JSON.stringify(meResponse.body)).not.toMatch(/phone|address|nik|health_center/iu);

    await request(server())
      .post(`/api/v1/pregnancies/${pregnancyId}/close`)
      .set("authorization", `Bearer ${session.access_token}`)
      .send({
        idempotency_key: "90000000-0000-4000-8000-000000000001",
        reason: "Mother token must not cross the staff boundary",
      })
      .expect(401);

    await request(server())
      .post("/api/v1/mother-access/logout")
      .set("authorization", `Bearer ${session.access_token}`)
      .expect(204);
    const revokedSessionResponse = await request(server())
      .get("/api/v1/mother/me")
      .set("authorization", `Bearer ${session.access_token}`)
      .expect(401);
    expect(revokedSessionResponse.headers["cache-control"]).toBe("private, no-store");
    expect(
      audit.events.filter((event) => event.actorType === "BUMIL").map((event) => event.action),
    ).toEqual(["MOTHER_ACCESS_SUCCESS", "MOTHER_LOGOUT"]);
  });

  it("returns the same generic failure for wrong name/code, malformed, revoked, and inactive data", async () => {
    const attempts = [
      ["Nama Salah", oldCode],
      ["Siti Aminah", "ANC-2222-2222-2222-2222"],
      ["Siti Aminah", "not-a-code"],
      ["Ibu Revoked", revokedCode],
      ["Ibu Pregnancy Closed", inactivePregnancyCode],
    ] as const;
    const failures: Array<Readonly<Record<string, unknown>>> = [];
    for (const [name, code] of attempts) {
      const response = await validate(name, code, 401);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      failures.push(errorShape(response));
    }
    expect(failures).toEqual(Array.from({ length: attempts.length }, () => failures[0]));
    expect(failures[0]).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Kredensial tidak valid.",
      details: null,
    });

    const failureAudits = audit.events.filter((event) => event.action === "MOTHER_ACCESS_FAILURE");
    expect(failureAudits).toHaveLength(attempts.length);
    expect(
      failureAudits.every((event) => event.actorId === null && event.resourceId === null),
    ).toBe(true);
    const serializedAudit = JSON.stringify(failureAudits);
    for (const [name, code] of attempts) {
      expect(serializedAudit).not.toContain(name);
      expect(serializedAudit).not.toContain(code);
    }
  });

  it("blocks a repeatedly failed code for 15 minutes and recovers after expiry", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await validate("Nama Salah", oldCode, 401);
    }
    const throttled = await validate("Siti Aminah", oldCode, 429);
    expect(errorShape(throttled)).toEqual({
      code: "RATE_LIMITED",
      message: "Terlalu banyak permintaan. Silakan coba lagi.",
      details: { retry_after_seconds: 900 },
    });
    expect(audit.events.filter((event) => event.action === "MOTHER_ACCESS_THROTTLED")).toHaveLength(
      1,
    );

    currentTime = new Date(now.getTime() + 16 * 60_000);
    const recovered = await validate("Siti Aminah", oldCode, 200);
    expect(motherSessionResponseSchema.parse(recovered.body).token_type).toBe("Bearer");
  });

  it("invalidates an old session/code after reissue and accepts only the replacement", async () => {
    const initial = motherSessionResponseSchema.parse(
      (await validate("Siti Aminah", oldCode, 200)).body,
    );
    repository.revokeCredential(credentialId);
    repository.seedCredential(crypto.credentialLookupHash(replacementCode), {
      credentialId: "70000000-0000-4000-8000-000000000004",
      motherId,
      fullName: "Siti Aminah",
      activePregnancyId: pregnancyId,
      codeHash: fakeCodeHash(replacementCode),
    });

    await request(server())
      .get("/api/v1/mother/me")
      .set("authorization", `Bearer ${initial.access_token}`)
      .expect(401);
    await validate("Siti Aminah", oldCode, 401);
    const replacement = await validate("siti aminah", replacementCode, 200);
    expect(motherSessionResponseSchema.parse(replacement.body).access_token).not.toBe(
      initial.access_token,
    );
  });

  async function validate(
    fullName: string,
    accessCode: string,
    status: number,
  ): Promise<request.Response> {
    return request(server())
      .post("/api/v1/mother-access/validate")
      .send({ full_name: fullName, access_code: accessCode })
      .expect(status);
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

interface StoredCredential {
  readonly lookupHash: string;
  readonly candidate: MotherCredentialCandidate;
  active: boolean;
  activePregnancy: boolean;
}

interface StoredSession {
  readonly hash: string;
  readonly actor: MotherActor;
  revoked: boolean;
}

interface StoredRateLimit {
  readonly scope: "IP" | "CODE";
  count: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
}

class FakeMotherAuthRepository implements MotherAuthRepository {
  private readonly credentials = new Map<string, StoredCredential>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly rateLimits = new Map<string, StoredRateLimit>();

  public seedCredential(
    lookupHash: string,
    candidate: MotherCredentialCandidate,
    active = true,
    activePregnancy = true,
  ): void {
    this.credentials.set(lookupHash, { lookupHash, candidate, active, activePregnancy });
  }

  public revokeCredential(targetCredentialId: string): void {
    const credential = [...this.credentials.values()].find(
      (item) => item.candidate.credentialId === targetCredentialId,
    );
    if (credential !== undefined) credential.active = false;
    for (const session of this.sessions.values()) {
      if (session.actor.credentialId === targetCredentialId) session.revoked = true;
    }
  }

  public rawSessionHashes(): string {
    return [...this.sessions.keys()].join("");
  }

  public async findCredentialCandidate(
    codeLookupHash: string,
  ): Promise<MotherCredentialCandidate | null> {
    const stored = this.credentials.get(codeLookupHash);
    return stored?.active === true && stored.activePregnancy ? stored.candidate : null;
  }

  public async createSession(input: CreateMotherSessionInput): Promise<boolean> {
    const stored = [...this.credentials.values()].find(
      (item) =>
        item.candidate.credentialId === input.credentialId &&
        item.candidate.motherId === input.motherId,
    );
    if (stored?.active !== true || !stored.activePregnancy) return false;
    this.sessions.set(input.tokenHash, {
      hash: input.tokenHash,
      revoked: false,
      actor: {
        motherId: stored.candidate.motherId,
        credentialId: stored.candidate.credentialId,
        sessionId: input.sessionId,
        displayName: stored.candidate.fullName,
        activePregnancyId: stored.candidate.activePregnancyId,
        sessionExpiresAt: input.expiresAt,
      },
    });
    return true;
  }

  public async findActiveActorBySessionHash(
    sessionHash: string,
    requestedAt: Date,
  ): Promise<MotherActor | null> {
    const session = this.sessions.get(sessionHash);
    if (session === undefined || session.revoked || session.actor.sessionExpiresAt <= requestedAt) {
      return null;
    }
    const credential = [...this.credentials.values()].find(
      (item) => item.candidate.credentialId === session.actor.credentialId,
    );
    return credential?.active === true && credential.activePregnancy ? session.actor : null;
  }

  public async revokeSession(sessionId: string, targetMotherId: string): Promise<boolean> {
    const session = [...this.sessions.values()].find(
      (item) => item.actor.sessionId === sessionId && item.actor.motherId === targetMotherId,
    );
    if (session === undefined || session.revoked) return false;
    session.revoked = true;
    return true;
  }

  public async rateLimitRetryAfterSeconds(
    bucketHashes: readonly string[],
    requestedAt: Date,
  ): Promise<number> {
    let retryAfter = 0;
    for (const hash of bucketHashes) {
      const blockedUntil = this.rateLimits.get(hash)?.blockedUntil;
      if (blockedUntil !== null && blockedUntil !== undefined && blockedUntil > requestedAt) {
        retryAfter = Math.max(
          retryAfter,
          Math.ceil((blockedUntil.getTime() - requestedAt.getTime()) / 1000),
        );
      }
    }
    return retryAfter;
  }

  public async recordRateLimitFailure(
    buckets: readonly MotherRateLimitBucket[],
    requestedAt: Date,
    windowMinutes: number,
    blockMinutes: number,
  ): Promise<void> {
    for (const bucket of buckets) {
      const existing = this.rateLimits.get(bucket.hash);
      const expiredWindow =
        existing === undefined ||
        existing.windowStartedAt.getTime() <= requestedAt.getTime() - windowMinutes * 60_000;
      const count = expiredWindow ? 1 : (existing?.count ?? 0) + 1;
      this.rateLimits.set(bucket.hash, {
        scope: bucket.scope,
        count,
        windowStartedAt: expiredWindow
          ? new Date(requestedAt)
          : (existing?.windowStartedAt ?? new Date(requestedAt)),
        blockedUntil:
          existing?.blockedUntil !== null &&
          existing?.blockedUntil !== undefined &&
          existing.blockedUntil > requestedAt
            ? existing.blockedUntil
            : count >= bucket.limit
              ? new Date(requestedAt.getTime() + blockMinutes * 60_000)
              : null,
      });
    }
  }

  public async clearRateLimitBuckets(bucketHashes: readonly string[]): Promise<void> {
    for (const hash of bucketHashes) this.rateLimits.delete(hash);
  }
}

class FakeMotherAccessCodeService extends MotherAccessCodeService {
  public constructor(crypto: MotherAccessCryptoService) {
    super(new PasswordHasher(), crypto);
  }

  public override async verifyOrDummy(
    code: string,
    encodedHash: string | undefined,
  ): Promise<boolean> {
    return encodedHash === fakeCodeHash(code);
  }
}

function fakeCodeHash(code: string): string {
  return `fake-scrypt:${code}`;
}

function errorShape(response: request.Response): Readonly<Record<string, unknown>> {
  const body: unknown = response.body;
  if (typeof body !== "object" || body === null || !("error" in body)) {
    throw new Error("Expected canonical error response");
  }
  const error = (body as { readonly error: unknown }).error;
  if (typeof error !== "object" || error === null) throw new Error("Expected error object");
  const record = error as Readonly<Record<string, unknown>>;
  return { code: record["code"], message: record["message"], details: record["details"] };
}
