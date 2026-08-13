"use strict";

/**
 * Durable device-token registration and leased push-attempt processing.
 *
 * Raw FCM tokens remain encrypted by the application. A keyed fingerprint is
 * stored only for safe upsert/reassignment and is never returned by an API.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE devices
      ADD COLUMN push_token_fingerprint text,
      ADD COLUMN registered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE devices
      ADD CONSTRAINT devices_token_fingerprint_not_blank CHECK (
        push_token_fingerprint IS NULL OR btrim(push_token_fingerprint) <> ''
      );

    CREATE UNIQUE INDEX devices_token_fingerprint_unique_idx
      ON devices (push_token_fingerprint)
      WHERE push_token_fingerprint IS NOT NULL AND status = 'ACTIVE';

    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY mother_id, platform
               ORDER BY updated_at DESC, id DESC
             ) AS active_rank
        FROM devices
       WHERE status = 'ACTIVE'
    )
    UPDATE devices AS device
       SET status = 'REVOKED', updated_at = CURRENT_TIMESTAMP
      FROM ranked
     WHERE ranked.id = device.id
       AND ranked.active_rank > 1;

    CREATE UNIQUE INDEX devices_one_active_platform_per_mother_idx
      ON devices (mother_id, platform)
      WHERE status = 'ACTIVE';

    ALTER TABLE push_attempts
      ADD COLUMN device_id uuid REFERENCES devices(id) ON DELETE RESTRICT,
      ADD COLUMN scheduled_for timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN claimed_at timestamptz,
      ADD COLUMN lease_expires_at timestamptz,
      ADD COLUMN completed_at timestamptz;

    UPDATE push_attempts
       SET scheduled_for = attempted_at,
           completed_at = CASE WHEN status = 'PENDING' THEN NULL ELSE attempted_at END;

    ALTER TABLE push_attempts
      ADD CONSTRAINT push_attempts_lease_pair CHECK (
        (claimed_at IS NULL AND lease_expires_at IS NULL)
        OR (claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at > claimed_at)
      ),
      ADD CONSTRAINT push_attempts_completion_state CHECK (
        (status = 'PENDING' AND completed_at IS NULL)
        OR (status <> 'PENDING' AND completed_at IS NOT NULL)
      );

    CREATE INDEX push_attempts_due_idx
      ON push_attempts (scheduled_for, lease_expires_at)
      WHERE status = 'PENDING';

    COMMENT ON COLUMN devices.push_token_encrypted IS
      'Versioned AES-256-GCM FCM token envelope; plaintext must never be logged or returned.';
    COMMENT ON COLUMN devices.push_token_fingerprint IS
      'Keyed, domain-separated token fingerprint used only for secure upsert/reassignment.';
    COMMENT ON COLUMN push_attempts.scheduled_for IS
      'Earliest time this attempt may be leased by a worker.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP INDEX IF EXISTS push_attempts_due_idx;
    ALTER TABLE push_attempts
      DROP CONSTRAINT IF EXISTS push_attempts_completion_state,
      DROP CONSTRAINT IF EXISTS push_attempts_lease_pair,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS lease_expires_at,
      DROP COLUMN IF EXISTS claimed_at,
      DROP COLUMN IF EXISTS scheduled_for,
      DROP COLUMN IF EXISTS device_id;

    DROP INDEX IF EXISTS devices_one_active_platform_per_mother_idx;
    DROP INDEX IF EXISTS devices_token_fingerprint_unique_idx;
    ALTER TABLE devices
      DROP CONSTRAINT IF EXISTS devices_token_fingerprint_not_blank,
      DROP COLUMN IF EXISTS registered_at,
      DROP COLUMN IF EXISTS push_token_fingerprint;
  `);
};
