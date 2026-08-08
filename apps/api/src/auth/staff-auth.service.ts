import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  staffMeResponseSchema,
  staffTokenResponseSchema,
  type StaffLoginRequest,
  type StaffMeResponse,
  type StaffTokenResponse,
} from "@anc/contracts";

import { ApiException } from "../errors/api.exception.js";
import {
  API_CONFIG,
  AUDIT_SERVICE,
  CLOCK,
  SESSION_TOKEN_SERVICE,
  STAFF_AUTH_REPOSITORY,
} from "../infrastructure/tokens.js";
import type { AuditService } from "../audit/audit.service.js";
import type { ApiConfig } from "@anc/config";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { PasswordHasher } from "./password-hasher.js";
import type { StaffAuthRepository } from "./staff-auth.repository.js";
import type { StaffActor } from "./staff-auth.types.js";
import type { SessionTokenService } from "./session-token.service.js";

export type Clock = () => Date;

@Injectable()
export class StaffAuthService {
  public constructor(
    @Inject(STAFF_AUTH_REPOSITORY) private readonly repository: StaffAuthRepository,
    @Inject(SESSION_TOKEN_SERVICE) private readonly tokenService: SessionTokenService,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly passwordHasher: PasswordHasher,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async login(input: StaffLoginRequest): Promise<StaffTokenResponse> {
    const now = this.clock();
    const identifier = normalizeLoginIdentifier(input.login_identifier);
    const user = await this.repository.findUserByLoginIdentifier(identifier);
    const passwordValid = await this.passwordHasher.verifyOrDummy(
      input.password,
      user?.passwordHash,
    );
    const locked =
      user?.lockedUntil !== null && user?.lockedUntil !== undefined
        ? user.lockedUntil.getTime() > now.getTime()
        : false;
    const accepted = user !== null && user.status === "ACTIVE" && !locked && passwordValid;

    if (!accepted) {
      if (user !== null && user.status === "ACTIVE" && !locked && !passwordValid) {
        await this.repository.recordLoginFailure(
          user.id,
          this.config.staffLoginMaxFailures,
          new Date(now.getTime() + this.config.staffLoginLockMinutes * 60_000),
        );
      }
      await this.audit.record({
        actorType: user === null ? "PUBLIC" : "STAFF",
        actorId: user?.id ?? null,
        action: "STAFF_LOGIN_FAILURE",
        resourceType: "STAFF_SESSION",
        metadata: { reason: "INVALID_CREDENTIALS" },
        occurredAt: now,
      });
      throw invalidCredentials();
    }

    const sessionId = randomUUID();
    const tokens = this.tokenService.issue(now);
    await this.repository.createSession({
      sessionId,
      staffUserId: user.id,
      accessTokenHash: tokens.accessTokenHash,
      refreshTokenHash: tokens.refreshTokenHash,
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      now,
    });
    await this.audit.record({
      actorType: "STAFF",
      actorId: user.id,
      action: "STAFF_LOGIN_SUCCESS",
      resourceType: "STAFF_SESSION",
      resourceId: sessionId,
      metadata: { session_id: sessionId, role: user.role },
      occurredAt: now,
    });
    return tokenResponse(tokens);
  }

  public async refresh(refreshToken: string): Promise<StaffTokenResponse> {
    const now = this.clock();
    const tokens = this.tokenService.issue(now);
    const actor = await this.repository.rotateSession({
      currentRefreshTokenHash: this.tokenService.hash(refreshToken),
      accessTokenHash: tokens.accessTokenHash,
      refreshTokenHash: tokens.refreshTokenHash,
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      now,
    });
    if (actor === null) throw invalidSession();

    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "STAFF_SESSION_ROTATED",
      resourceType: "STAFF_SESSION",
      resourceId: actor.sessionId,
      metadata: { session_id: actor.sessionId },
      occurredAt: now,
    });
    return tokenResponse(tokens);
  }

  public async authenticateAccessToken(accessToken: string): Promise<StaffActor> {
    if (!/^anc_at_[A-Za-z0-9_-]{43}$/.test(accessToken)) throw invalidSession();
    const actor = await this.repository.findActiveActorByAccessTokenHash(
      this.tokenService.hash(accessToken),
      this.clock(),
    );
    if (actor === null) throw invalidSession();
    return actor;
  }

  public me(actor: StaffActor): StaffMeResponse {
    this.authorization.assertCapability(actor, "STAFF_SELF_READ");
    return staffMeResponseSchema.parse({
      id: actor.staffUserId,
      health_center_id: actor.healthCenterId,
      display_name: actor.displayName,
      role: actor.role,
      status: actor.status,
      session_id: actor.sessionId,
    });
  }

  public async logout(actor: StaffActor): Promise<void> {
    const now = this.clock();
    await this.repository.revokeSession({
      sessionId: actor.sessionId,
      revokedByStaffId: actor.staffUserId,
      reason: "SELF_LOGOUT",
      now,
    });
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "STAFF_LOGOUT",
      resourceType: "STAFF_SESSION",
      resourceId: actor.sessionId,
      metadata: { reason: "SELF_LOGOUT", session_id: actor.sessionId },
      occurredAt: now,
    });
  }

  public async revokeSession(actor: StaffActor, sessionId: string, reason: string): Promise<void> {
    const target = await this.repository.findSessionTarget(sessionId);
    if (target === null) throw forbidden();
    this.authorization.assertCanRevokeSession(actor, target);
    if (target.revokedAt !== null) return;

    const now = this.clock();
    await this.repository.revokeSession({
      sessionId,
      revokedByStaffId: actor.staffUserId,
      reason,
      now,
    });
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "SESSION_REVOKED",
      resourceType: "STAFF_SESSION",
      resourceId: sessionId,
      metadata: {
        reason,
        session_id: sessionId,
        target_staff_user_id: target.staffUserId,
      },
      occurredAt: now,
    });
  }
}

function normalizeLoginIdentifier(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("id-ID");
}

function tokenResponse(tokens: ReturnType<SessionTokenService["issue"]>): StaffTokenResponse {
  return staffTokenResponseSchema.parse({
    token_type: "Bearer",
    access_token: tokens.accessToken,
    access_expires_at: tokens.accessExpiresAt.toISOString(),
    refresh_token: tokens.refreshToken,
    refresh_expires_at: tokens.refreshExpiresAt.toISOString(),
  });
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
