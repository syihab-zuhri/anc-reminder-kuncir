"use strict";

/**
 * Phase 1 authentication, organization scope, and session lifecycle.
 *
 * health_centers remains the Puskesmas organization boundary defined by the
 * authoritative ERD. Villages and facilities are children of that boundary.
 * Session credentials are stored only as keyed hashes by the application.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE facility_type AS ENUM (
      'PUSKESMAS',
      'POSYANDU',
      'PONED',
      'HOSPITAL',
      'MIDWIFE_PRACTICE',
      'OTHER'
    );

    ALTER TABLE health_centers
      ADD COLUMN code text;
    UPDATE health_centers
      SET code = 'HC-' || replace(id::text, '-', '')
      WHERE code IS NULL;
    ALTER TABLE health_centers
      ALTER COLUMN code SET NOT NULL,
      ADD CONSTRAINT health_centers_code_nonblank CHECK (btrim(code) <> ''),
      ADD CONSTRAINT health_centers_code_unique UNIQUE (code);

    CREATE TABLE villages (
      id uuid PRIMARY KEY,
      health_center_id uuid NOT NULL REFERENCES health_centers(id) ON DELETE RESTRICT,
      code text NOT NULL CHECK (btrim(code) <> ''),
      name text NOT NULL CHECK (btrim(name) <> ''),
      status health_center_status NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT villages_center_code_unique UNIQUE (health_center_id, code),
      CONSTRAINT villages_id_center_unique UNIQUE (id, health_center_id)
    );

    CREATE TABLE facilities (
      id uuid PRIMARY KEY,
      health_center_id uuid NOT NULL REFERENCES health_centers(id) ON DELETE RESTRICT,
      village_id uuid,
      code text NOT NULL CHECK (btrim(code) <> ''),
      name text NOT NULL CHECK (btrim(name) <> ''),
      facility_type facility_type NOT NULL,
      status health_center_status NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT facilities_center_code_unique UNIQUE (health_center_id, code),
      CONSTRAINT facilities_id_center_unique UNIQUE (id, health_center_id),
      CONSTRAINT facilities_village_same_center_fk
        FOREIGN KEY (village_id, health_center_id)
        REFERENCES villages(id, health_center_id)
        ON DELETE RESTRICT
    );

    ALTER TABLE staff_users
      ADD COLUMN display_name text,
      ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0
        CHECK (failed_login_attempts >= 0),
      ADD COLUMN locked_until timestamptz,
      ADD COLUMN last_login_at timestamptz;
    UPDATE staff_users
      SET display_name = login_identifier
      WHERE display_name IS NULL;
    ALTER TABLE staff_users
      ALTER COLUMN display_name SET NOT NULL,
      ADD CONSTRAINT staff_users_display_name_nonblank CHECK (btrim(display_name) <> '');
    CREATE UNIQUE INDEX staff_users_login_identifier_ci_idx
      ON staff_users (lower(login_identifier));

    CREATE TABLE staff_sessions (
      id uuid PRIMARY KEY,
      staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      access_token_hash text NOT NULL UNIQUE CHECK (btrim(access_token_hash) <> ''),
      refresh_token_hash text NOT NULL UNIQUE CHECK (btrim(refresh_token_hash) <> ''),
      access_expires_at timestamptz NOT NULL,
      refresh_expires_at timestamptz NOT NULL,
      rotated_at timestamptz,
      last_used_at timestamptz,
      revoked_at timestamptz,
      revoked_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      revocation_reason text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT staff_sessions_expiry_order CHECK (access_expires_at < refresh_expires_at),
      CONSTRAINT staff_sessions_revocation_pair CHECK (
        (revoked_at IS NULL AND revoked_by_staff_id IS NULL AND revocation_reason IS NULL)
        OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL AND btrim(revocation_reason) <> '')
      )
    );

    ALTER TABLE staff_assignments
      DROP CONSTRAINT staff_assignments_scope_unique,
      ADD COLUMN assigned_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN revoked_at timestamptz,
      ADD COLUMN revoked_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN revocation_reason text,
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD CONSTRAINT staff_assignments_revocation_pair CHECK (
        (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
        OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL
          AND revocation_reason IS NOT NULL AND btrim(revocation_reason) <> '')
      );
    CREATE UNIQUE INDEX staff_assignments_active_scope_unique_idx
      ON staff_assignments (staff_user_id, scope_type, scope_id)
      WHERE revoked_at IS NULL;

    ALTER TABLE mothers
      ADD COLUMN village_id uuid,
      ADD COLUMN registration_facility_id uuid,
      ADD CONSTRAINT mothers_village_same_center_fk
        FOREIGN KEY (village_id, health_center_id)
        REFERENCES villages(id, health_center_id)
        ON DELETE RESTRICT,
      ADD CONSTRAINT mothers_facility_same_center_fk
        FOREIGN KEY (registration_facility_id, health_center_id)
        REFERENCES facilities(id, health_center_id)
        ON DELETE RESTRICT;

    CREATE INDEX villages_health_center_status_idx
      ON villages (health_center_id, status, name);
    CREATE INDEX facilities_health_center_status_idx
      ON facilities (health_center_id, status, name);
    CREATE INDEX facilities_village_idx
      ON facilities (village_id) WHERE village_id IS NOT NULL;
    CREATE INDEX staff_sessions_access_active_idx
      ON staff_sessions (access_token_hash, access_expires_at) WHERE revoked_at IS NULL;
    CREATE INDEX staff_sessions_refresh_active_idx
      ON staff_sessions (refresh_token_hash, refresh_expires_at) WHERE revoked_at IS NULL;
    CREATE INDEX staff_sessions_user_active_idx
      ON staff_sessions (staff_user_id, refresh_expires_at DESC) WHERE revoked_at IS NULL;
    CREATE INDEX staff_assignments_staff_active_idx
      ON staff_assignments (staff_user_id, scope_type, scope_id) WHERE revoked_at IS NULL;
    CREATE INDEX mothers_village_idx
      ON mothers (village_id) WHERE village_id IS NOT NULL;

    CREATE TRIGGER villages_set_updated_at
      BEFORE UPDATE ON villages
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER facilities_set_updated_at
      BEFORE UPDATE ON facilities
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER staff_sessions_set_updated_at
      BEFORE UPDATE ON staff_sessions
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER staff_assignments_set_updated_at
      BEFORE UPDATE ON staff_assignments
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE mothers
      DROP CONSTRAINT IF EXISTS mothers_facility_same_center_fk,
      DROP CONSTRAINT IF EXISTS mothers_village_same_center_fk,
      DROP COLUMN IF EXISTS registration_facility_id,
      DROP COLUMN IF EXISTS village_id;

    DROP TRIGGER IF EXISTS staff_assignments_set_updated_at ON staff_assignments;
    DROP INDEX IF EXISTS staff_assignments_staff_active_idx;
    DROP INDEX IF EXISTS staff_assignments_active_scope_unique_idx;
    ALTER TABLE staff_assignments
      DROP CONSTRAINT IF EXISTS staff_assignments_revocation_pair,
      DROP COLUMN IF EXISTS updated_at,
      DROP COLUMN IF EXISTS revocation_reason,
      DROP COLUMN IF EXISTS revoked_by,
      DROP COLUMN IF EXISTS revoked_at,
      DROP COLUMN IF EXISTS assigned_by,
      ADD CONSTRAINT staff_assignments_scope_unique UNIQUE (staff_user_id, scope_type, scope_id);

    DROP TABLE IF EXISTS staff_sessions;
    DROP INDEX IF EXISTS staff_users_login_identifier_ci_idx;
    ALTER TABLE staff_users
      DROP CONSTRAINT IF EXISTS staff_users_display_name_nonblank,
      DROP COLUMN IF EXISTS last_login_at,
      DROP COLUMN IF EXISTS locked_until,
      DROP COLUMN IF EXISTS failed_login_attempts,
      DROP COLUMN IF EXISTS display_name;

    DROP TABLE IF EXISTS facilities;
    DROP TABLE IF EXISTS villages;
    ALTER TABLE health_centers
      DROP CONSTRAINT IF EXISTS health_centers_code_unique,
      DROP CONSTRAINT IF EXISTS health_centers_code_nonblank,
      DROP COLUMN IF EXISTS code;

    DROP TYPE IF EXISTS facility_type;
  `);
};
