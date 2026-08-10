import type { DatabasePool } from "@anc/database";
import type { QueryResultRow } from "pg";

import type { MotherAccessRateLimitScope } from "./mother-access-crypto.service.js";
import type { MotherActor } from "./mother-auth.types.js";

export interface MotherCredentialCandidate {
  readonly credentialId: string;
  readonly motherId: string;
  readonly fullName: string;
  readonly activePregnancyId: string;
  readonly codeHash: string;
}

export interface CreateMotherSessionInput {
  readonly sessionId: string;
  readonly credentialId: string;
  readonly motherId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

export interface MotherRateLimitBucket {
  readonly hash: string;
  readonly scope: MotherAccessRateLimitScope;
  readonly limit: number;
}

export interface MotherAuthRepository {
  findCredentialCandidate(codeLookupHash: string): Promise<MotherCredentialCandidate | null>;
  createSession(input: CreateMotherSessionInput): Promise<boolean>;
  findActiveActorBySessionHash(sessionHash: string, now: Date): Promise<MotherActor | null>;
  revokeSession(sessionId: string, motherId: string, now: Date): Promise<boolean>;
  rateLimitRetryAfterSeconds(bucketHashes: readonly string[], now: Date): Promise<number>;
  recordRateLimitFailure(
    buckets: readonly MotherRateLimitBucket[],
    now: Date,
    windowMinutes: number,
    blockMinutes: number,
  ): Promise<void>;
  clearRateLimitBuckets(bucketHashes: readonly string[]): Promise<void>;
}

interface CandidateRow extends QueryResultRow {
  readonly credential_id: string;
  readonly mother_id: string;
  readonly full_name: string;
  readonly active_pregnancy_id: string;
  readonly code_hash: string;
}

interface ActorRow extends QueryResultRow {
  readonly session_id: string;
  readonly credential_id: string;
  readonly mother_id: string;
  readonly full_name: string;
  readonly active_pregnancy_id: string;
  readonly expires_at: Date;
}

interface RetryRow extends QueryResultRow {
  readonly retry_after_seconds: number;
}

export class PostgresMotherAuthRepository implements MotherAuthRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async findCredentialCandidate(
    codeLookupHash: string,
  ): Promise<MotherCredentialCandidate | null> {
    const result = await this.pool.query<CandidateRow>(
      `SELECT
         credential.id AS credential_id,
         mother.id AS mother_id,
         mother.full_name,
         pregnancy.id AS active_pregnancy_id,
         credential.code_hash
       FROM mother_access_credentials AS credential
       JOIN mothers AS mother ON mother.id = credential.mother_id
       JOIN health_centers AS center ON center.id = mother.health_center_id
       JOIN pregnancies AS pregnancy
         ON pregnancy.mother_id = mother.id
        AND pregnancy.health_center_id = mother.health_center_id
        AND pregnancy.status = 'ACTIVE'
      WHERE credential.code_lookup_hash = $1
        AND credential.status = 'ACTIVE'
        AND center.status = 'ACTIVE'
      LIMIT 1`,
      [codeLookupHash],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          credentialId: row.credential_id,
          motherId: row.mother_id,
          fullName: row.full_name,
          activePregnancyId: row.active_pregnancy_id,
          codeHash: row.code_hash,
        };
  }

  public async createSession(input: CreateMotherSessionInput): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO mother_sessions (
         id, mother_id, credential_id, session_hash, expires_at, created_at, last_used_at
       )
       SELECT $1, mother.id, credential.id, $4, $5, $6, $6
         FROM mother_access_credentials AS credential
         JOIN mothers AS mother ON mother.id = credential.mother_id
         JOIN health_centers AS center ON center.id = mother.health_center_id
         JOIN pregnancies AS pregnancy
           ON pregnancy.mother_id = mother.id
          AND pregnancy.health_center_id = mother.health_center_id
          AND pregnancy.status = 'ACTIVE'
        WHERE credential.id = $2
          AND credential.mother_id = $3
          AND credential.status = 'ACTIVE'
          AND center.status = 'ACTIVE'
        LIMIT 1
      RETURNING id`,
      [
        input.sessionId,
        input.credentialId,
        input.motherId,
        input.tokenHash,
        input.expiresAt,
        input.now,
      ],
    );
    return result.rowCount === 1;
  }

  public async findActiveActorBySessionHash(
    sessionHash: string,
    now: Date,
  ): Promise<MotherActor | null> {
    const result = await this.pool.query<ActorRow>(
      `UPDATE mother_sessions AS session
          SET last_used_at = $2
         FROM mother_access_credentials AS credential,
              mothers AS mother,
              health_centers AS center,
              pregnancies AS pregnancy
        WHERE session.session_hash = $1
          AND session.revoked_at IS NULL
          AND session.expires_at > $2
          AND credential.id = session.credential_id
          AND credential.mother_id = session.mother_id
          AND credential.status = 'ACTIVE'
          AND mother.id = session.mother_id
          AND center.id = mother.health_center_id
          AND center.status = 'ACTIVE'
          AND pregnancy.mother_id = mother.id
          AND pregnancy.health_center_id = mother.health_center_id
          AND pregnancy.status = 'ACTIVE'
      RETURNING
        session.id AS session_id,
        credential.id AS credential_id,
        mother.id AS mother_id,
        mother.full_name,
        pregnancy.id AS active_pregnancy_id,
        session.expires_at`,
      [sessionHash, now],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          motherId: row.mother_id,
          credentialId: row.credential_id,
          sessionId: row.session_id,
          displayName: row.full_name,
          activePregnancyId: row.active_pregnancy_id,
          sessionExpiresAt: row.expires_at,
        };
  }

  public async revokeSession(sessionId: string, motherId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE mother_sessions
          SET revoked_at = $3
        WHERE id = $1 AND mother_id = $2 AND revoked_at IS NULL
      RETURNING id`,
      [sessionId, motherId, now],
    );
    return result.rowCount === 1;
  }

  public async rateLimitRetryAfterSeconds(
    bucketHashes: readonly string[],
    now: Date,
  ): Promise<number> {
    const result = await this.pool.query<RetryRow>(
      `SELECT COALESCE(
         CEIL(EXTRACT(EPOCH FROM (MAX(blocked_until) - $2))),
         0
       )::int AS retry_after_seconds
       FROM mother_access_rate_limits
      WHERE bucket_hash = ANY($1::text[])
        AND blocked_until > $2`,
      [bucketHashes, now],
    );
    return Math.max(0, result.rows[0]?.retry_after_seconds ?? 0);
  }

  public async recordRateLimitFailure(
    buckets: readonly MotherRateLimitBucket[],
    now: Date,
    windowMinutes: number,
    blockMinutes: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    const windowCutoff = new Date(now.getTime() - windowMinutes * 60_000);
    const blockedUntil = new Date(now.getTime() + blockMinutes * 60_000);
    try {
      await client.query("BEGIN");
      for (const bucket of [...buckets].sort((left, right) =>
        left.hash.localeCompare(right.hash),
      )) {
        await client.query(
          `INSERT INTO mother_access_rate_limits AS current (
             bucket_hash, scope, failure_count, window_started_at, blocked_until, updated_at
           ) VALUES (
             $1, $2, 1, $3,
             CASE WHEN $4::int <= 1 THEN $5::timestamptz ELSE NULL END,
             $3
           )
           ON CONFLICT (bucket_hash) DO UPDATE
             SET scope = EXCLUDED.scope,
                 failure_count = CASE
                   WHEN current.window_started_at <= $6 THEN 1
                   ELSE current.failure_count + 1
                 END,
                 window_started_at = CASE
                   WHEN current.window_started_at <= $6 THEN $3
                   ELSE current.window_started_at
                 END,
                 blocked_until = CASE
                   WHEN current.blocked_until > $3 THEN current.blocked_until
                   WHEN (
                     CASE
                       WHEN current.window_started_at <= $6 THEN 1
                       ELSE current.failure_count + 1
                     END
                   ) >= $4 THEN $5::timestamptz
                   ELSE NULL
                 END,
                 updated_at = $3`,
          [bucket.hash, bucket.scope, now, bucket.limit, blockedUntil, windowCutoff],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async clearRateLimitBuckets(bucketHashes: readonly string[]): Promise<void> {
    await this.pool.query(
      `DELETE FROM mother_access_rate_limits WHERE bucket_hash = ANY($1::text[])`,
      [bucketHashes],
    );
  }
}
