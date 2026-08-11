"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE visit_confirmations
      ADD COLUMN confirmation_source text;

    UPDATE visit_confirmations
       SET confirmation_source = 'LEGACY_UNKNOWN'
     WHERE confirmation_source IS NULL;

    ALTER TABLE visit_confirmations
      ALTER COLUMN confirmation_source SET NOT NULL,
      ADD CONSTRAINT visit_confirmations_source_valid CHECK (
        confirmation_source IN ('STAFF_WEB', 'LEGACY_UNKNOWN')
      );

    CREATE UNIQUE INDEX visit_confirmations_one_initial_confirm_idx
      ON visit_confirmations (milestone_id)
      WHERE action = 'CONFIRM';

    COMMENT ON COLUMN visit_confirmations.confirmation_source IS
      'Server-controlled source. LEGACY_UNKNOWN is migration-only; new API confirmations use STAFF_WEB. History remains protected by the baseline append-only trigger.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP INDEX IF EXISTS visit_confirmations_one_initial_confirm_idx;

    ALTER TABLE visit_confirmations
      DROP CONSTRAINT IF EXISTS visit_confirmations_source_valid,
      DROP COLUMN IF EXISTS confirmation_source;
  `);
};
