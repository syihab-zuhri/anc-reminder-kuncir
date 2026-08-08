import type { StaffRole, StaffUserStatus } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

import type {
  SessionTarget,
  StaffActor,
  StaffAssignmentClaim,
  StaffCredentialRecord,
} from "./staff-auth.types.js";

interface QueryRow {
  readonly [column: string]: unknown;
}

interface CredentialRow extends QueryRow {
  readonly id: string;
  readonly health_center_id: string | null;
  readonly display_name: string;
  readonly role: StaffRole;
  readonly status: StaffUserStatus;
  readonly password_hash: string;
  readonly failed_login_attempts: number;
  readonly locked_until: Date | null;
}

interface ActorRow extends QueryRow {
  readonly session_id: string;
  readonly staff_user_id: string;
  readonly health_center_id: string | null;
  readonly display_name: string;
  readonly role: StaffRole;
  readonly status: StaffUserStatus;
}

interface AssignmentRow extends QueryRow {
  readonly scope_type: StaffAssignmentClaim["scopeType"];
  readonly scope_id: string;
}

interface SessionTargetRow extends QueryRow {
  readonly session_id: string;
  readonly staff_user_id: string;
  readonly health_center_id: string | null;
  readonly role: StaffRole;
  readonly revoked_at: Date | null;
}

interface SessionIdRow extends QueryRow {
  readonly id: string;
}

export interface CreateStaffSessionInput {
  readonly sessionId: string;
  readonly staffUserId: string;
  readonly accessTokenHash: string;
  readonly refreshTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly refreshExpiresAt: Date;
  readonly now: Date;
}

export interface RotateStaffSessionInput {
  readonly currentRefreshTokenHash: string;
  readonly accessTokenHash: string;
  readonly refreshTokenHash: string;
  readonly accessExpiresAt: Date;
  readonly refreshExpiresAt: Date;
  readonly now: Date;
}

export interface RevokeStaffSessionInput {
  readonly sessionId: string;
  readonly revokedByStaffId: string;
  readonly reason: string;
  readonly now: Date;
}

export interface StaffAuthRepository {
  findUserByLoginIdentifier(loginIdentifier: string): Promise<StaffCredentialRecord | null>;
  recordLoginFailure(staffUserId: string, threshold: number, lockedUntil: Date): Promise<void>;
  createSession(input: CreateStaffSessionInput): Promise<void>;
  findActiveActorByAccessTokenHash(accessTokenHash: string, now: Date): Promise<StaffActor | null>;
  rotateSession(input: RotateStaffSessionInput): Promise<StaffActor | null>;
  findSessionTarget(sessionId: string): Promise<SessionTarget | null>;
  revokeSession(input: RevokeStaffSessionInput): Promise<boolean>;
}

export class PostgresStaffAuthRepository implements StaffAuthRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async findUserByLoginIdentifier(
    loginIdentifier: string,
  ): Promise<StaffCredentialRecord | null> {
    const result = await this.pool.query<CredentialRow>(
      `SELECT
         u.id,
         u.health_center_id,
         u.display_name,
         u.role,
         u.status,
         u.password_hash,
         u.failed_login_attempts,
         u.locked_until
       FROM staff_users u
       LEFT JOIN health_centers h ON h.id = u.health_center_id
       WHERE lower(u.login_identifier) = lower($1)
         AND (u.role = 'SUPER_ADMIN' OR h.status = 'ACTIVE')
       LIMIT 1`,
      [loginIdentifier],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          healthCenterId: row.health_center_id,
          displayName: row.display_name,
          role: row.role,
          status: row.status,
          passwordHash: row.password_hash,
          failedLoginAttempts: row.failed_login_attempts,
          lockedUntil: row.locked_until,
        };
  }

  public async recordLoginFailure(
    staffUserId: string,
    threshold: number,
    lockedUntil: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE staff_users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= $2 THEN $3
             ELSE locked_until
           END
       WHERE id = $1 AND status = 'ACTIVE'`,
      [staffUserId, threshold, lockedUntil],
    );
  }

  public async createSession(input: CreateStaffSessionInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE staff_users
         SET failed_login_attempts = 0, locked_until = NULL, last_login_at = $2
         WHERE id = $1`,
        [input.staffUserId, input.now],
      );
      await client.query(
        `INSERT INTO staff_sessions (
           id, staff_user_id, access_token_hash, refresh_token_hash,
           access_expires_at, refresh_expires_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [
          input.sessionId,
          input.staffUserId,
          input.accessTokenHash,
          input.refreshTokenHash,
          input.accessExpiresAt,
          input.refreshExpiresAt,
          input.now,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async findActiveActorByAccessTokenHash(
    accessTokenHash: string,
    now: Date,
  ): Promise<StaffActor | null> {
    const result = await this.pool.query<ActorRow>(
      `${actorSelect}
       WHERE s.access_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.access_expires_at > $2
         AND u.status = 'ACTIVE'
         AND (u.role = 'SUPER_ADMIN' OR h.status = 'ACTIVE')
       LIMIT 1`,
      [accessTokenHash, now],
    );
    const row = result.rows[0];
    return row === undefined ? null : this.toActor(row);
  }

  public async rotateSession(input: RotateStaffSessionInput): Promise<StaffActor | null> {
    const result = await this.pool.query<SessionIdRow>(
      `UPDATE staff_sessions s
       SET access_token_hash = $2,
           refresh_token_hash = $3,
           access_expires_at = $4,
           refresh_expires_at = $5,
           rotated_at = $6,
           last_used_at = $6
       WHERE s.refresh_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.refresh_expires_at > $6
         AND EXISTS (
           SELECT 1
           FROM staff_users u
           LEFT JOIN health_centers h ON h.id = u.health_center_id
           WHERE u.id = s.staff_user_id
             AND u.status = 'ACTIVE'
             AND (u.role = 'SUPER_ADMIN' OR h.status = 'ACTIVE')
         )
       RETURNING s.id`,
      [
        input.currentRefreshTokenHash,
        input.accessTokenHash,
        input.refreshTokenHash,
        input.accessExpiresAt,
        input.refreshExpiresAt,
        input.now,
      ],
    );
    const session = result.rows[0];
    return session === undefined ? null : this.findActorBySessionId(session.id);
  }

  public async findSessionTarget(sessionId: string): Promise<SessionTarget | null> {
    const result = await this.pool.query<SessionTargetRow>(
      `SELECT
         s.id AS session_id,
         s.staff_user_id,
         u.health_center_id,
         u.role,
         s.revoked_at
       FROM staff_sessions s
       JOIN staff_users u ON u.id = s.staff_user_id
       WHERE s.id = $1
       LIMIT 1`,
      [sessionId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          sessionId: row.session_id,
          staffUserId: row.staff_user_id,
          healthCenterId: row.health_center_id,
          role: row.role,
          revokedAt: row.revoked_at,
        };
  }

  public async revokeSession(input: RevokeStaffSessionInput): Promise<boolean> {
    const result = await this.pool.query<SessionIdRow>(
      `UPDATE staff_sessions
       SET revoked_at = $2,
           revoked_by_staff_id = $3,
           revocation_reason = $4
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [input.sessionId, input.now, input.revokedByStaffId, input.reason],
    );
    return result.rowCount === 1;
  }

  private async findActorBySessionId(sessionId: string): Promise<StaffActor | null> {
    const result = await this.pool.query<ActorRow>(
      `${actorSelect}
       WHERE s.id = $1
         AND s.revoked_at IS NULL
         AND u.status = 'ACTIVE'
         AND (u.role = 'SUPER_ADMIN' OR h.status = 'ACTIVE')
       LIMIT 1`,
      [sessionId],
    );
    const row = result.rows[0];
    return row === undefined ? null : this.toActor(row);
  }

  private async toActor(row: ActorRow): Promise<StaffActor> {
    const assignments = await this.loadAssignments(row.staff_user_id);
    return {
      staffUserId: row.staff_user_id,
      sessionId: row.session_id,
      healthCenterId: row.health_center_id,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      assignments,
    };
  }

  private async loadAssignments(staffUserId: string): Promise<readonly StaffAssignmentClaim[]> {
    const result = await this.pool.query<AssignmentRow>(
      `SELECT scope_type, scope_id
       FROM staff_assignments
       WHERE staff_user_id = $1 AND revoked_at IS NULL
       ORDER BY scope_type, scope_id`,
      [staffUserId],
    );
    return result.rows.map((row) => ({ scopeType: row.scope_type, scopeId: row.scope_id }));
  }
}

const actorSelect = `SELECT
  s.id AS session_id,
  u.id AS staff_user_id,
  u.health_center_id,
  u.display_name,
  u.role,
  u.status
FROM staff_sessions s
JOIN staff_users u ON u.id = s.staff_user_id
LEFT JOIN health_centers h ON h.id = u.health_center_id`;
