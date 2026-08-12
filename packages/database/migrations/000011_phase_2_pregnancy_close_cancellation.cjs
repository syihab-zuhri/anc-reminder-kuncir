"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE pregnancy_close_cancellation_target AS ENUM ('MILESTONE', 'REMINDER_CYCLE');

    ALTER TABLE pregnancy_lifecycle_events
      ADD CONSTRAINT pregnancy_lifecycle_events_identity_unique
        UNIQUE (id, pregnancy_id);

    ALTER TABLE reminder_cycles
      ADD CONSTRAINT reminder_cycles_identity_unique
        UNIQUE (id, milestone_id);

    CREATE TABLE pregnancy_close_cancellation_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      lifecycle_event_id uuid NOT NULL,
      pregnancy_id uuid NOT NULL,
      milestone_id uuid NOT NULL,
      reminder_cycle_id uuid,
      target pregnancy_close_cancellation_target NOT NULL,
      previous_status text NOT NULL CHECK (btrim(previous_status) <> ''),
      cancelled_at timestamptz NOT NULL,
      CONSTRAINT pregnancy_close_cancellations_lifecycle_same_pregnancy_fk
        FOREIGN KEY (lifecycle_event_id, pregnancy_id)
        REFERENCES pregnancy_lifecycle_events(id, pregnancy_id)
        ON DELETE RESTRICT,
      CONSTRAINT pregnancy_close_cancellations_milestone_same_pregnancy_fk
        FOREIGN KEY (milestone_id, pregnancy_id)
        REFERENCES pregnancy_milestones(id, pregnancy_id)
        ON DELETE RESTRICT,
      CONSTRAINT pregnancy_close_cancellations_cycle_same_milestone_fk
        FOREIGN KEY (reminder_cycle_id, milestone_id)
        REFERENCES reminder_cycles(id, milestone_id)
        ON DELETE RESTRICT,
      CONSTRAINT pregnancy_close_cancellations_snapshot_shape CHECK (
        (
          target = 'MILESTONE'
          AND reminder_cycle_id IS NULL
          AND previous_status IN ('UPCOMING', 'DUE', 'OVERDUE')
        )
        OR
        (
          target = 'REMINDER_CYCLE'
          AND reminder_cycle_id IS NOT NULL
          AND previous_status IN (
            'PENDING',
            'PUSH_ATTEMPTING',
            'WA_ACTION_REQUIRED',
            'MANUAL_FOLLOWUP',
            'ESCALATED'
          )
        )
      )
    );

    CREATE UNIQUE INDEX pregnancy_close_cancellations_one_milestone_idx
      ON pregnancy_close_cancellation_events (lifecycle_event_id, milestone_id)
      WHERE target = 'MILESTONE';

    CREATE UNIQUE INDEX pregnancy_close_cancellations_one_cycle_idx
      ON pregnancy_close_cancellation_events (lifecycle_event_id, reminder_cycle_id)
      WHERE target = 'REMINDER_CYCLE';

    CREATE INDEX pregnancy_close_cancellations_pregnancy_history_idx
      ON pregnancy_close_cancellation_events (pregnancy_id, cancelled_at DESC, id DESC);

    CREATE TRIGGER pregnancy_close_cancellation_events_append_only
      BEFORE UPDATE OR DELETE ON pregnancy_close_cancellation_events
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();

    CREATE FUNCTION anc_guard_reminder_cycle_active_pregnancy()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      pregnancy_state pregnancy_status;
    BEGIN
      IF NEW.status = 'CANCELLED' THEN
        RETURN NEW;
      END IF;

      SELECT pregnancy.status
        INTO pregnancy_state
        FROM pregnancy_milestones AS milestone
        JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id
       WHERE milestone.id = NEW.milestone_id
       FOR SHARE OF pregnancy;

      IF pregnancy_state = 'CLOSED' THEN
        RAISE EXCEPTION 'active reminder cycles require an active pregnancy'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER reminder_cycles_active_pregnancy_guard
      BEFORE INSERT OR UPDATE ON reminder_cycles
      FOR EACH ROW EXECUTE FUNCTION anc_guard_reminder_cycle_active_pregnancy();

    COMMENT ON TABLE pregnancy_close_cancellation_events IS
      'Append-only snapshots of unfinished milestones and unresolved reminder cycles cancelled atomically by a pregnancy close event.';
    COMMENT ON FUNCTION anc_guard_reminder_cycle_active_pregnancy() IS
      'Serializes reminder writes against pregnancy close and rejects active reminder state for a closed pregnancy.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TRIGGER IF EXISTS reminder_cycles_active_pregnancy_guard ON reminder_cycles;
    DROP FUNCTION IF EXISTS anc_guard_reminder_cycle_active_pregnancy();

    DROP TABLE IF EXISTS pregnancy_close_cancellation_events;

    ALTER TABLE reminder_cycles
      DROP CONSTRAINT IF EXISTS reminder_cycles_identity_unique;

    ALTER TABLE pregnancy_lifecycle_events
      DROP CONSTRAINT IF EXISTS pregnancy_lifecycle_events_identity_unique;

    DROP TYPE IF EXISTS pregnancy_close_cancellation_target;
  `);
};
