"use strict";

exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE mothers
      ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'PENDING_VERIFICATION',
      ADD COLUMN IF NOT EXISTS registered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS approved_by_staff_user_id uuid
        REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
      ADD COLUMN IF NOT EXISTS rejected_by_staff_user_id uuid
        REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS rejection_reason text;
  `);

  pgm.sql(String.raw`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mothers_registration_status_valid'
      ) THEN
        ALTER TABLE mothers
          ADD CONSTRAINT mothers_registration_status_valid
          CHECK (registration_status IN ('PENDING_VERIFICATION', 'APPROVED', 'REJECTED'));
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE mothers DROP CONSTRAINT IF EXISTS mothers_registration_status_valid;
    ALTER TABLE mothers
      DROP COLUMN IF EXISTS registration_status,
      DROP COLUMN IF EXISTS registered_at,
      DROP COLUMN IF EXISTS approved_at,
      DROP COLUMN IF EXISTS approved_by_staff_user_id,
      DROP COLUMN IF EXISTS rejected_at,
      DROP COLUMN IF EXISTS rejected_by_staff_user_id,
      DROP COLUMN IF EXISTS rejection_reason;
  `);
};
