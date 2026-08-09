"use strict";

/**
 * Phase 2 pregnancy lifecycle and immutable dating history.
 *
 * This migration deliberately stores approved dating inputs only. It does not
 * calculate gestational age, HPL, trimester, or K1-K8 target windows.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE mothers
      ADD CONSTRAINT mothers_id_health_center_unique
        UNIQUE (id, health_center_id);

    ALTER TABLE pregnancies
      ADD CONSTRAINT pregnancies_mother_same_center_fk
        FOREIGN KEY (mother_id, health_center_id)
        REFERENCES mothers(id, health_center_id)
        ON DELETE RESTRICT;

    CREATE TABLE pregnancy_dating_revisions (
      id uuid PRIMARY KEY,
      pregnancy_id uuid NOT NULL REFERENCES pregnancies(id) ON DELETE RESTRICT,
      actor_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      previous_dating_basis dating_basis NOT NULL,
      previous_dating_date date NOT NULL,
      revised_dating_basis dating_basis NOT NULL,
      revised_dating_date date NOT NULL,
      reason text NOT NULL CHECK (btrim(reason) <> ''),
      revised_at timestamptz NOT NULL,
      CONSTRAINT pregnancy_dating_revision_changed CHECK (
        previous_dating_basis <> revised_dating_basis
        OR previous_dating_date <> revised_dating_date
      )
    );

    CREATE TABLE pregnancy_lifecycle_events (
      id uuid PRIMARY KEY,
      pregnancy_id uuid NOT NULL REFERENCES pregnancies(id) ON DELETE RESTRICT,
      actor_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      action text NOT NULL CHECK (action IN ('CREATED', 'CLOSED')),
      dating_basis dating_basis NOT NULL,
      dating_date date NOT NULL,
      status pregnancy_status NOT NULL,
      reason text,
      occurred_at timestamptz NOT NULL,
      CONSTRAINT pregnancy_lifecycle_event_state CHECK (
        (action = 'CREATED' AND status = 'ACTIVE' AND reason IS NULL)
        OR
        (action = 'CLOSED' AND status = 'CLOSED'
          AND reason IS NOT NULL AND btrim(reason) <> '')
      )
    );

    COMMENT ON TABLE pregnancy_dating_revisions IS
      'Append-only history of approved dating inputs; no derived clinical values.';
    COMMENT ON TABLE pregnancy_lifecycle_events IS
      'Append-only lifecycle snapshots used for audit and idempotency replay.';

    CREATE INDEX pregnancy_dating_revisions_history_idx
      ON pregnancy_dating_revisions (pregnancy_id, revised_at DESC, id DESC);
    CREATE INDEX pregnancy_lifecycle_events_history_idx
      ON pregnancy_lifecycle_events (pregnancy_id, occurred_at DESC, id DESC);

    CREATE TRIGGER pregnancy_dating_revisions_append_only
      BEFORE UPDATE OR DELETE ON pregnancy_dating_revisions
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();
    CREATE TRIGGER pregnancy_lifecycle_events_append_only
      BEFORE UPDATE OR DELETE ON pregnancy_lifecycle_events
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TABLE IF EXISTS pregnancy_lifecycle_events;
    DROP TABLE IF EXISTS pregnancy_dating_revisions;

    ALTER TABLE pregnancies
      DROP CONSTRAINT IF EXISTS pregnancies_mother_same_center_fk;
    ALTER TABLE mothers
      DROP CONSTRAINT IF EXISTS mothers_id_health_center_unique;
  `);
};
