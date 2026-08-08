"use strict";

/**
 * Shared idempotency coordination without persisting request/response payloads.
 * A keyed request fingerprint detects accidental key reuse while the result is
 * represented only by its domain resource reference.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TABLE api_idempotency_records (
      id uuid PRIMARY KEY,
      actor_key text NOT NULL CHECK (btrim(actor_key) <> ''),
      operation text NOT NULL CHECK (
        operation ~ '^[A-Z][A-Z0-9_]{2,63}$'
      ),
      idempotency_key uuid NOT NULL,
      request_hash text NOT NULL CHECK (
        request_hash ~ '^[a-f0-9]{64}$'
      ),
      result_resource_type text,
      result_resource_id uuid,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT api_idempotency_scope_key_unique
        UNIQUE (actor_key, operation, idempotency_key),
      CONSTRAINT api_idempotency_completion_group CHECK (
        (completed_at IS NULL AND result_resource_type IS NULL AND result_resource_id IS NULL)
        OR
        (completed_at IS NOT NULL
          AND result_resource_type IS NOT NULL
          AND btrim(result_resource_type) <> ''
          AND result_resource_id IS NOT NULL)
      )
    );

    COMMENT ON TABLE api_idempotency_records IS
      'Coordination metadata only; never store request bodies, NIK, credentials, or response payloads.';
    CREATE INDEX api_idempotency_created_at_idx
      ON api_idempotency_records (created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TABLE IF EXISTS api_idempotency_records;
  `);
};
