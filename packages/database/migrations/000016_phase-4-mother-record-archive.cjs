"use strict";

exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE mothers
      ADD COLUMN archived_at timestamptz,
      ADD COLUMN archived_by_staff_user_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN archive_reason text;

    ALTER TABLE mothers
      ADD CONSTRAINT mothers_archive_state CHECK (
        (archived_at IS NULL AND archived_by_staff_user_id IS NULL AND archive_reason IS NULL)
        OR (
          archived_at IS NOT NULL
          AND archived_by_staff_user_id IS NOT NULL
          AND archive_reason IS NOT NULL
          AND btrim(archive_reason) <> ''
        )
      );

    CREATE INDEX mothers_active_health_center_idx
      ON mothers (health_center_id, created_at DESC, id DESC)
      WHERE archived_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP INDEX IF EXISTS mothers_active_health_center_idx;
    ALTER TABLE mothers
      DROP CONSTRAINT IF EXISTS mothers_archive_state,
      DROP COLUMN IF EXISTS archive_reason,
      DROP COLUMN IF EXISTS archived_by_staff_user_id,
      DROP COLUMN IF EXISTS archived_at;
  `);
};
