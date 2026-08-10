/* eslint-disable camelcase */

/**
 * Phase 2 private mother authentication and durable application throttling.
 * Raw access codes, session tokens, names, and source IPs are never persisted
 * in the lookup/rate-limit columns introduced here.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE mother_access_rate_limit_scope AS ENUM ('IP', 'CODE');

    ALTER TABLE mother_access_credentials
      ADD COLUMN code_lookup_hash text,
      ADD CONSTRAINT mother_access_credentials_lookup_hash_format CHECK (
        code_lookup_hash IS NULL OR code_lookup_hash ~ '^[a-f0-9]{64}$'
      );

    CREATE UNIQUE INDEX mother_access_credentials_lookup_hash_unique_idx
      ON mother_access_credentials (code_lookup_hash)
      WHERE code_lookup_hash IS NOT NULL;

    ALTER TABLE mother_sessions
      ADD COLUMN credential_id uuid,
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN last_used_at timestamptz,
      ADD CONSTRAINT mother_sessions_credential_same_mother_fk
        FOREIGN KEY (credential_id, mother_id)
        REFERENCES mother_access_credentials(id, mother_id) ON DELETE RESTRICT,
      ADD CONSTRAINT mother_sessions_expiry_after_creation CHECK (expires_at > created_at);

    CREATE TABLE mother_access_rate_limits (
      bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
      scope mother_access_rate_limit_scope NOT NULL,
      failure_count integer NOT NULL CHECK (failure_count > 0),
      window_started_at timestamptz NOT NULL,
      blocked_until timestamptz,
      updated_at timestamptz NOT NULL,
      CONSTRAINT mother_access_rate_limits_block_state CHECK (
        blocked_until IS NULL OR blocked_until > window_started_at
      )
    );

    CREATE INDEX mother_access_rate_limits_blocked_idx
      ON mother_access_rate_limits (blocked_until)
      WHERE blocked_until IS NOT NULL;

    COMMENT ON COLUMN mother_access_credentials.code_lookup_hash IS
      'Keyed HMAC lookup only; not a plaintext access code or reusable authenticator.';
    COMMENT ON COLUMN mother_sessions.session_hash IS
      'Keyed HMAC only; raw mother bearer tokens must never be persisted.';
    COMMENT ON COLUMN mother_access_rate_limits.bucket_hash IS
      'Domain-separated keyed HMAC; raw source IP and access code are not persisted.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP INDEX IF EXISTS mother_access_rate_limits_blocked_idx;
    DROP TABLE IF EXISTS mother_access_rate_limits;

    ALTER TABLE mother_sessions
      DROP CONSTRAINT IF EXISTS mother_sessions_expiry_after_creation,
      DROP CONSTRAINT IF EXISTS mother_sessions_credential_same_mother_fk,
      DROP COLUMN IF EXISTS last_used_at,
      DROP COLUMN IF EXISTS created_at,
      DROP COLUMN IF EXISTS credential_id;

    DROP INDEX IF EXISTS mother_access_credentials_lookup_hash_unique_idx;
    ALTER TABLE mother_access_credentials
      DROP CONSTRAINT IF EXISTS mother_access_credentials_lookup_hash_format,
      DROP COLUMN IF EXISTS code_lookup_hash;

    DROP TYPE IF EXISTS mother_access_rate_limit_scope;
  `);
};
