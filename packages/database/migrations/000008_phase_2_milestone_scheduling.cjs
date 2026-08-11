"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE milestone_schedule_action AS ENUM ('SCHEDULED', 'RESCHEDULED');

    ALTER TABLE pregnancy_milestones
      ADD CONSTRAINT pregnancy_milestones_identity_unique UNIQUE (id, pregnancy_id);

    CREATE TABLE milestone_schedule_events (
      id uuid PRIMARY KEY,
      milestone_id uuid NOT NULL,
      pregnancy_id uuid NOT NULL,
      actor_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      action milestone_schedule_action NOT NULL,
      previous_due_at timestamptz,
      previous_due_date date,
      scheduled_due_at timestamptz NOT NULL,
      scheduled_due_date date NOT NULL,
      timezone text NOT NULL,
      reason text,
      occurred_at timestamptz NOT NULL,
      CONSTRAINT milestone_schedule_events_milestone_same_pregnancy_fk
        FOREIGN KEY (milestone_id, pregnancy_id)
        REFERENCES pregnancy_milestones(id, pregnancy_id)
        ON DELETE RESTRICT,
      CONSTRAINT milestone_schedule_events_timezone_nonblank CHECK (btrim(timezone) <> ''),
      CONSTRAINT milestone_schedule_events_reason_nonblank CHECK (
        reason IS NULL OR btrim(reason) <> ''
      ),
      CONSTRAINT milestone_schedule_events_transition_shape CHECK (
        (
          action = 'SCHEDULED'
          AND previous_due_at IS NULL
          AND previous_due_date IS NULL
        )
        OR
        (
          action = 'RESCHEDULED'
          AND previous_due_at IS NOT NULL
          AND previous_due_date IS NOT NULL
          AND reason IS NOT NULL
          AND previous_due_date <> scheduled_due_date
        )
      )
    );

    CREATE INDEX milestone_schedule_events_history_idx
      ON milestone_schedule_events (milestone_id, occurred_at DESC, id DESC);

    CREATE TRIGGER milestone_schedule_events_append_only
      BEFORE UPDATE OR DELETE ON milestone_schedule_events
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();

    COMMENT ON COLUMN milestone_schedule_events.scheduled_due_date IS
      'Local calendar date selected by staff; scheduled_due_at stores its UTC instant.';
    COMMENT ON COLUMN milestone_schedule_events.timezone IS
      'IANA timezone snapshot used to interpret the local due date.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TRIGGER IF EXISTS milestone_schedule_events_append_only ON milestone_schedule_events;
    DROP INDEX IF EXISTS milestone_schedule_events_history_idx;
    DROP TABLE IF EXISTS milestone_schedule_events;

    ALTER TABLE pregnancy_milestones
      DROP CONSTRAINT IF EXISTS pregnancy_milestones_identity_unique;

    DROP TYPE IF EXISTS milestone_schedule_action;
  `);
};
