/* eslint-disable camelcase */

/**
 * Phase 2 mother access credential lifecycle.
 *
 * Plaintext access codes are intentionally absent from every table. Lifecycle
 * events keep immutable snapshots so idempotency replay never depends on the
 * mutable credential row and never recreates a previously displayed code.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE mother_access_credential_action AS ENUM ('ISSUED', 'REISSUED', 'REVOKED');

    ALTER TABLE mother_access_credentials
      ADD COLUMN issued_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN revoked_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN revocation_reason text,
      ADD CONSTRAINT mother_access_credentials_id_mother_unique UNIQUE (id, mother_id),
      ADD CONSTRAINT mother_access_credentials_revocation_actor_pair CHECK (
        (status = 'ACTIVE' AND revoked_by_staff_id IS NULL AND revocation_reason IS NULL)
        OR (
          status = 'REVOKED'
          AND (
            (revoked_by_staff_id IS NULL AND revocation_reason IS NULL)
            OR (revoked_by_staff_id IS NOT NULL AND revocation_reason IS NOT NULL AND char_length(btrim(revocation_reason)) BETWEEN 3 AND 200)
          )
        )
      );

    ALTER TABLE mother_sessions
      ADD COLUMN revoked_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN revocation_reason text,
      ADD CONSTRAINT mother_sessions_revocation_actor_pair CHECK (
        (revoked_at IS NULL AND revoked_by_staff_id IS NULL AND revocation_reason IS NULL)
        OR (
          revoked_at IS NOT NULL
          AND (
            (revoked_by_staff_id IS NULL AND revocation_reason IS NULL)
            OR (revoked_by_staff_id IS NOT NULL AND revocation_reason IS NOT NULL AND char_length(btrim(revocation_reason)) BETWEEN 3 AND 200)
          )
        )
      );

    CREATE TABLE mother_access_credential_events (
      id uuid PRIMARY KEY,
      credential_id uuid NOT NULL,
      mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE RESTRICT,
      action mother_access_credential_action NOT NULL,
      previous_credential_id uuid,
      status mother_access_credential_status NOT NULL,
      issued_at timestamptz NOT NULL,
      revoked_at timestamptz,
      actor_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 200),
      occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT mother_access_credential_events_credential_same_mother_fk
        FOREIGN KEY (credential_id, mother_id)
        REFERENCES mother_access_credentials(id, mother_id) ON DELETE RESTRICT,
      CONSTRAINT mother_access_credential_events_previous_same_mother_fk
        FOREIGN KEY (previous_credential_id, mother_id)
        REFERENCES mother_access_credentials(id, mother_id) ON DELETE RESTRICT,
      CONSTRAINT mother_access_credential_events_snapshot_state CHECK (
        (action IN ('ISSUED', 'REISSUED') AND status = 'ACTIVE' AND revoked_at IS NULL)
        OR (action = 'REVOKED' AND status = 'REVOKED' AND revoked_at IS NOT NULL)
      ),
      CONSTRAINT mother_access_credential_events_previous_state CHECK (
        (action = 'REISSUED' AND previous_credential_id IS NOT NULL AND previous_credential_id <> credential_id)
        OR (action <> 'REISSUED' AND previous_credential_id IS NULL)
      )
    );

    CREATE INDEX mother_access_credentials_history_idx
      ON mother_access_credentials (mother_id, issued_at DESC, id DESC);
    CREATE INDEX mother_access_credential_events_history_idx
      ON mother_access_credential_events (mother_id, occurred_at DESC, id DESC);

    CREATE TRIGGER mother_access_credential_events_append_only
      BEFORE UPDATE OR DELETE ON mother_access_credential_events
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();

    COMMENT ON COLUMN mother_access_credentials.code_hash IS
      'Salted scrypt verifier only. Plaintext ANC access codes must never be persisted.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TRIGGER IF EXISTS mother_access_credential_events_append_only ON mother_access_credential_events;
    DROP INDEX IF EXISTS mother_access_credential_events_history_idx;
    DROP INDEX IF EXISTS mother_access_credentials_history_idx;
    DROP TABLE IF EXISTS mother_access_credential_events;

    ALTER TABLE mother_sessions
      DROP CONSTRAINT IF EXISTS mother_sessions_revocation_actor_pair,
      DROP COLUMN IF EXISTS revocation_reason,
      DROP COLUMN IF EXISTS revoked_by_staff_id;

    ALTER TABLE mother_access_credentials
      DROP CONSTRAINT IF EXISTS mother_access_credentials_revocation_actor_pair,
      DROP CONSTRAINT IF EXISTS mother_access_credentials_id_mother_unique,
      DROP COLUMN IF EXISTS revocation_reason,
      DROP COLUMN IF EXISTS revoked_by_staff_id,
      DROP COLUMN IF EXISTS issued_by_staff_id;

    DROP TYPE IF EXISTS mother_access_credential_action;
  `);
};
