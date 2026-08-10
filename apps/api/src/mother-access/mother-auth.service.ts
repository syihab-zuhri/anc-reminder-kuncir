import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import {
  motherMeResponseSchema,
  motherSessionResponseSchema,
  type MotherAccessValidateRequest,
  type MotherMeResponse,
  type MotherSessionResponse,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { ApiException } from "../errors/api.exception.js";
import {
  API_CONFIG,
  AUDIT_SERVICE,
  CLOCK,
  MOTHER_AUTH_REPOSITORY,
} from "../infrastructure/tokens.js";
import { MotherAccessCodeService } from "./mother-access-code.service.js";
import {
  MotherAccessCryptoService,
  normalizeMotherAccessCode,
} from "./mother-access-crypto.service.js";
import type { MotherAuthRepository, MotherRateLimitBucket } from "./mother-auth.repository.js";
import type { MotherActor } from "./mother-auth.types.js";

@Injectable()
export class MotherAuthService {
  public constructor(
    @Inject(MOTHER_AUTH_REPOSITORY) private readonly repository: MotherAuthRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly codes: MotherAccessCodeService,
    private readonly crypto: MotherAccessCryptoService,
  ) {}

  public async validate(
    input: MotherAccessValidateRequest,
    sourceIp: string,
  ): Promise<MotherSessionResponse> {
    const now = this.clock();
    const canonicalCode = normalizeMotherAccessCode(input.access_code);
    const rateCode =
      canonicalCode ?? input.access_code.normalize("NFKC").trim().toLocaleUpperCase();
    const codeLookupHash = this.crypto.credentialLookupHash(rateCode);
    const ipBucketHash = this.crypto.rateLimitBucketHash("IP", normalizeSourceIp(sourceIp));
    const codeBucketHash = this.crypto.rateLimitBucketHash("CODE", rateCode);
    const bucketHashes = [ipBucketHash, codeBucketHash];
    const retryAfterSeconds = await this.repository.rateLimitRetryAfterSeconds(bucketHashes, now);
    if (retryAfterSeconds > 0) {
      await this.recordPublicAudit("MOTHER_ACCESS_THROTTLED", "RATE_LIMITED", now);
      throw rateLimited(retryAfterSeconds);
    }

    const candidate =
      canonicalCode === null ? null : await this.repository.findCredentialCandidate(codeLookupHash);
    const codeValid = await this.codes.verifyOrDummy(
      canonicalCode ?? input.access_code,
      candidate?.codeHash,
    );
    const nameValid = this.crypto.namesEqual(
      input.full_name,
      candidate?.fullName ?? "synthetic unavailable mother",
    );
    if (candidate === null || canonicalCode === null || !codeValid || !nameValid) {
      await this.recordFailure(rateLimitBuckets(ipBucketHash, codeBucketHash, this.config), now);
      await this.recordPublicAudit("MOTHER_ACCESS_FAILURE", "INVALID_CREDENTIALS", now);
      throw invalidCredentials();
    }

    const sessionId = randomUUID();
    const session = this.crypto.issueSession(now);
    const created = await this.repository.createSession({
      sessionId,
      credentialId: candidate.credentialId,
      motherId: candidate.motherId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      now,
    });
    if (!created) {
      await this.recordFailure(rateLimitBuckets(ipBucketHash, codeBucketHash, this.config), now);
      await this.recordPublicAudit("MOTHER_ACCESS_FAILURE", "INVALID_CREDENTIALS", now);
      throw invalidCredentials();
    }

    await this.repository.clearRateLimitBuckets([codeBucketHash]);
    await this.audit.record({
      actorType: "BUMIL",
      actorId: candidate.motherId,
      action: "MOTHER_ACCESS_SUCCESS",
      resourceType: "MOTHER_SESSION",
      resourceId: sessionId,
      metadata: { session_id: sessionId },
      occurredAt: now,
    });
    return motherSessionResponseSchema.parse({
      token_type: "Bearer",
      access_token: session.token,
      expires_at: session.expiresAt.toISOString(),
    });
  }

  public async authenticateAccessToken(token: string): Promise<MotherActor> {
    if (!/^anc_mt_[A-Za-z0-9_-]{43}$/u.test(token)) throw invalidSession();
    const actor = await this.repository.findActiveActorBySessionHash(
      this.crypto.sessionTokenHash(token),
      this.clock(),
    );
    if (actor === null) throw invalidSession();
    return actor;
  }

  public me(actor: MotherActor): MotherMeResponse {
    return motherMeResponseSchema.parse({
      id: actor.motherId,
      display_name: actor.displayName,
      active_pregnancy_id: actor.activePregnancyId,
      session_id: actor.sessionId,
      session_expires_at: actor.sessionExpiresAt.toISOString(),
    });
  }

  public async logout(actor: MotherActor): Promise<void> {
    const now = this.clock();
    await this.repository.revokeSession(actor.sessionId, actor.motherId, now);
    await this.audit.record({
      actorType: "BUMIL",
      actorId: actor.motherId,
      action: "MOTHER_LOGOUT",
      resourceType: "MOTHER_SESSION",
      resourceId: actor.sessionId,
      metadata: { reason: "SELF_LOGOUT", session_id: actor.sessionId },
      occurredAt: now,
    });
  }

  private async recordFailure(buckets: readonly MotherRateLimitBucket[], now: Date): Promise<void> {
    await this.repository.recordRateLimitFailure(
      buckets,
      now,
      this.config.motherAccessRateWindowMinutes,
      this.config.motherAccessBlockMinutes,
    );
  }

  private async recordPublicAudit(action: string, reason: string, occurredAt: Date): Promise<void> {
    await this.audit.record({
      actorType: "PUBLIC",
      action,
      resourceType: "MOTHER_SESSION",
      metadata: { reason },
      occurredAt,
    });
  }
}

function rateLimitBuckets(
  ipHash: string,
  codeHash: string,
  config: ApiConfig,
): readonly MotherRateLimitBucket[] {
  return [
    { hash: ipHash, scope: "IP", limit: config.motherAccessIpMaxFailures },
    { hash: codeHash, scope: "CODE", limit: config.motherAccessCodeMaxFailures },
  ];
}

function normalizeSourceIp(value: string): string {
  return value.trim().toLocaleLowerCase("en-US") || "unknown";
}

function invalidCredentials(): ApiException {
  return new ApiException({
    status: HttpStatus.UNAUTHORIZED,
    code: "INVALID_CREDENTIALS",
    message: "Kredensial tidak valid.",
  });
}

function invalidSession(): ApiException {
  return new ApiException({
    status: HttpStatus.UNAUTHORIZED,
    code: "INVALID_SESSION",
    message: "Sesi tidak valid atau telah berakhir.",
  });
}

function rateLimited(retryAfterSeconds: number): ApiException {
  return new ApiException({
    status: HttpStatus.TOO_MANY_REQUESTS,
    code: "RATE_LIMITED",
    message: "Terlalu banyak permintaan. Silakan coba lagi.",
    details: { retry_after_seconds: retryAfterSeconds },
  });
}
