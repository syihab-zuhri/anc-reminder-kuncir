"use strict";

/**
 * Gate-C ERD baseline.
 *
 * This migration intentionally contains no clinical target-week seed and no
 * legal-retention interval. Those values require owner approval before they
 * can enter production configuration.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE health_center_status AS ENUM ('ACTIVE', 'INACTIVE');
    CREATE TYPE staff_role AS ENUM ('BIDAN', 'PUSKESMAS', 'SUPER_ADMIN');
    CREATE TYPE staff_user_status AS ENUM ('ACTIVE', 'DISABLED', 'LOCKED');
    CREATE TYPE staff_assignment_scope_type AS ENUM ('AREA', 'MOTHER');
    CREATE TYPE dating_basis AS ENUM (
      'PREGNANCY_START_DATE',
      'HPHT',
      'CLINICALLY_CONFIRMED_DATE',
      'OTHER_APPROVED'
    );
    CREATE TYPE pregnancy_status AS ENUM ('ACTIVE', 'CLOSED');
    CREATE TYPE rule_version_status AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'ARCHIVED');
    CREATE TYPE milestone_code AS ENUM ('K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8');
    CREATE TYPE milestone_category AS ENUM ('ANC', 'DELIVERY');
    CREATE TYPE required_facility_policy AS ENUM (
      'PUSKESMAS_REQUIRED',
      'FLEXIBLE',
      'PONED_OR_RS_REQUIRED'
    );
    CREATE TYPE visit_status AS ENUM (
      'UPCOMING',
      'DUE',
      'OVERDUE',
      'CONFIRMED',
      'CANCELLED',
      'NOT_APPLICABLE'
    );
    CREATE TYPE record_validation_status AS ENUM ('NOT_REQUIRED', 'INCOMPLETE', 'VALIDATED');
    CREATE TYPE k1_k6_record_status AS ENUM ('INCOMPLETE', 'VALIDATED');
    CREATE TYPE visit_confirmation_action AS ENUM ('CONFIRM', 'CORRECT');
    CREATE TYPE record_validation_action AS ENUM ('VALIDATE', 'REOPEN', 'CORRECT');
    CREATE TYPE mother_access_credential_status AS ENUM ('ACTIVE', 'REVOKED');
    CREATE TYPE device_platform AS ENUM ('ANDROID');
    CREATE TYPE device_status AS ENUM ('ACTIVE', 'INVALID', 'REVOKED');
    CREATE TYPE consent_purpose AS ENUM ('REMINDER', 'DATA_PROCESSING', 'OTHER');
    CREATE TYPE consent_status AS ENUM ('GRANTED', 'WITHDRAWN');
    CREATE TYPE reminder_cycle_status AS ENUM (
      'PENDING',
      'PUSH_ATTEMPTING',
      'PUSH_SUCCEEDED',
      'WA_ACTION_REQUIRED',
      'MANUAL_FOLLOWUP',
      'ESCALATED',
      'CANCELLED'
    );
    CREATE TYPE push_attempt_status AS ENUM (
      'PENDING',
      'SUCCESS',
      'RETRYABLE_FAILURE',
      'TERMINAL_FAILURE'
    );
    CREATE TYPE wa_fallback_action_status AS ENUM (
      'READY',
      'LINK_GENERATED',
      'LINK_OPENED',
      'RESOLVED_MANUALLY',
      'UNREACHABLE',
      'SKIPPED',
      'EXPIRED'
    );
    CREATE TYPE program_requirement_type AS ENUM (
      'MILESTONE_VALIDATED',
      'FIELD_PRESENT',
      'OTHER_APPROVED'
    );
    CREATE TYPE sigizi_kesga_recording_status AS ENUM (
      'IN_PROGRESS',
      'COMPLETE',
      'NOT_EVALUATED'
    );
    CREATE TYPE fetal_rights_status AS ENUM ('NOT_YET_MET', 'MET', 'NOT_EVALUATED');
    CREATE TYPE assessment_evaluator_type AS ENUM ('SYSTEM', 'STAFF');

    CREATE TABLE health_centers (
      id uuid PRIMARY KEY,
      name text NOT NULL CHECK (btrim(name) <> ''),
      status health_center_status NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE staff_users (
      id uuid PRIMARY KEY,
      health_center_id uuid REFERENCES health_centers(id) ON DELETE RESTRICT,
      role staff_role NOT NULL,
      login_identifier text NOT NULL UNIQUE CHECK (btrim(login_identifier) <> ''),
      password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
      status staff_user_status NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE staff_assignments (
      id uuid PRIMARY KEY,
      staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      scope_type staff_assignment_scope_type NOT NULL,
      scope_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT staff_assignments_scope_unique UNIQUE (staff_user_id, scope_type, scope_id)
    );

    CREATE TABLE anc_plan_versions (
      id uuid PRIMARY KEY,
      version_no integer NOT NULL UNIQUE CHECK (version_no > 0),
      status rule_version_status NOT NULL DEFAULT 'DRAFT',
      effective_from date,
      approved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT anc_plan_approval_pair CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
      )
    );

    CREATE TABLE anc_milestone_rules (
      id uuid PRIMARY KEY,
      plan_version_id uuid NOT NULL REFERENCES anc_plan_versions(id) ON DELETE RESTRICT,
      code milestone_code NOT NULL,
      trimester_label text NOT NULL CHECK (btrim(trimester_label) <> ''),
      target_week_start integer,
      target_week_end integer,
      milestone_category milestone_category NOT NULL,
      required_facility_policy required_facility_policy NOT NULL,
      allowed_facility_types jsonb NOT NULL DEFAULT '[]'::jsonb,
      reminder_enabled boolean NOT NULL,
      reminder_interval_days integer NOT NULL DEFAULT 3 CHECK (reminder_interval_days = 3),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT anc_milestone_rules_version_code_unique UNIQUE (plan_version_id, code),
      CONSTRAINT anc_milestone_rules_week_window CHECK (
        (target_week_start IS NULL AND target_week_end IS NULL)
        OR (
          target_week_start IS NOT NULL
          AND target_week_end IS NOT NULL
          AND target_week_start >= 0
          AND target_week_end >= target_week_start
        )
      ),
      CONSTRAINT anc_milestone_rules_facilities_array CHECK (
        jsonb_typeof(allowed_facility_types) = 'array'
      )
    );

    CREATE TABLE mothers (
      id uuid PRIMARY KEY,
      health_center_id uuid NOT NULL REFERENCES health_centers(id) ON DELETE RESTRICT,
      full_name text NOT NULL CHECK (btrim(full_name) <> ''),
      nik_ciphertext text NOT NULL CHECK (btrim(nik_ciphertext) <> ''),
      address text NOT NULL CHECK (btrim(address) <> ''),
      phone_normalized text NOT NULL CHECK (phone_normalized ~ '^[0-9]+$'),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    COMMENT ON COLUMN mothers.nik_ciphertext IS
      'Restricted encrypted NIK; never an internal identifier or primary key.';
    COMMENT ON COLUMN mothers.phone_normalized IS
      'Mutable normalized contact value; never an internal identifier or primary key.';

    CREATE TABLE pregnancies (
      id uuid PRIMARY KEY,
      mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE RESTRICT,
      health_center_id uuid NOT NULL REFERENCES health_centers(id) ON DELETE RESTRICT,
      dating_basis dating_basis NOT NULL,
      dating_date date NOT NULL,
      estimated_due_date date,
      status pregnancy_status NOT NULL DEFAULT 'ACTIVE',
      care_plan_version_id uuid NOT NULL REFERENCES anc_plan_versions(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at timestamptz,
      CONSTRAINT pregnancies_closed_state CHECK (
        (status = 'ACTIVE' AND closed_at IS NULL)
        OR (status = 'CLOSED' AND closed_at IS NOT NULL)
      )
    );

    CREATE TABLE pregnancy_milestones (
      id uuid PRIMARY KEY,
      pregnancy_id uuid NOT NULL REFERENCES pregnancies(id) ON DELETE RESTRICT,
      rule_id uuid NOT NULL REFERENCES anc_milestone_rules(id) ON DELETE RESTRICT,
      code milestone_code NOT NULL,
      due_at timestamptz,
      visit_status visit_status NOT NULL DEFAULT 'UPCOMING',
      record_validation_status record_validation_status NOT NULL DEFAULT 'NOT_REQUIRED',
      confirmed_at timestamptz,
      confirmed_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT pregnancy_milestones_pregnancy_code_unique UNIQUE (pregnancy_id, code),
      CONSTRAINT pregnancy_milestones_confirmation_pair CHECK (
        (confirmed_at IS NULL AND confirmed_by IS NULL)
        OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
      )
    );

    CREATE TABLE visit_confirmations (
      id uuid PRIMARY KEY,
      milestone_id uuid NOT NULL REFERENCES pregnancy_milestones(id) ON DELETE RESTRICT,
      actor_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      action visit_confirmation_action NOT NULL,
      facility_id uuid,
      occurred_on date,
      reason text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT visit_confirmations_reason_not_blank CHECK (reason IS NULL OR btrim(reason) <> '')
    );

    CREATE TABLE k1_k6_records (
      id uuid PRIMARY KEY,
      milestone_id uuid NOT NULL UNIQUE REFERENCES pregnancy_milestones(id) ON DELETE RESTRICT,
      record_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      schema_version text NOT NULL CHECK (btrim(schema_version) <> ''),
      status k1_k6_record_status NOT NULL DEFAULT 'INCOMPLETE',
      validated_at timestamptz,
      validated_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT k1_k6_records_payload_object CHECK (jsonb_typeof(record_payload) = 'object'),
      CONSTRAINT k1_k6_records_validation_pair CHECK (
        (validated_at IS NULL AND validated_by IS NULL)
        OR (validated_at IS NOT NULL AND validated_by IS NOT NULL)
      )
    );

    CREATE TABLE record_validation_events (
      id uuid PRIMARY KEY,
      record_id uuid NOT NULL REFERENCES k1_k6_records(id) ON DELETE RESTRICT,
      action record_validation_action NOT NULL,
      actor_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
      reason text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT record_validation_events_reason_not_blank CHECK (reason IS NULL OR btrim(reason) <> '')
    );

    CREATE TABLE mother_access_credentials (
      id uuid PRIMARY KEY,
      mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE RESTRICT,
      code_hash text NOT NULL CHECK (btrim(code_hash) <> ''),
      status mother_access_credential_status NOT NULL DEFAULT 'ACTIVE',
      issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at timestamptz,
      CONSTRAINT mother_access_credentials_revocation_state CHECK (
        (status = 'ACTIVE' AND revoked_at IS NULL)
        OR (status = 'REVOKED' AND revoked_at IS NOT NULL)
      )
    );

    CREATE TABLE mother_sessions (
      id uuid PRIMARY KEY,
      mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE RESTRICT,
      session_hash text NOT NULL UNIQUE CHECK (btrim(session_hash) <> ''),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    );

    CREATE TABLE devices (
      id uuid PRIMARY KEY,
      mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE RESTRICT,
      platform device_platform NOT NULL,
      push_token_encrypted text NOT NULL CHECK (btrim(push_token_encrypted) <> ''),
      status device_status NOT NULL DEFAULT 'ACTIVE',
      last_seen_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE consent_records (
      id uuid PRIMARY KEY,
      mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE RESTRICT,
      purpose consent_purpose NOT NULL,
      status consent_status NOT NULL,
      source text NOT NULL CHECK (btrim(source) <> ''),
      recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE reminder_cycles (
      id uuid PRIMARY KEY,
      milestone_id uuid NOT NULL REFERENCES pregnancy_milestones(id) ON DELETE RESTRICT,
      cycle_anchor_at timestamptz NOT NULL,
      status reminder_cycle_status NOT NULL DEFAULT 'PENDING',
      idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at timestamptz,
      CONSTRAINT reminder_cycles_logical_key_unique UNIQUE (milestone_id, cycle_anchor_at)
    );

    CREATE TABLE push_attempts (
      id uuid PRIMARY KEY,
      reminder_cycle_id uuid NOT NULL REFERENCES reminder_cycles(id) ON DELETE RESTRICT,
      attempt_no integer NOT NULL CHECK (attempt_no > 0),
      status push_attempt_status NOT NULL DEFAULT 'PENDING',
      provider_message_id text,
      error_code text,
      attempted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT push_attempts_cycle_attempt_unique UNIQUE (reminder_cycle_id, attempt_no),
      CONSTRAINT push_attempts_provider_id_not_blank CHECK (
        provider_message_id IS NULL OR btrim(provider_message_id) <> ''
      ),
      CONSTRAINT push_attempts_error_code_not_blank CHECK (
        error_code IS NULL OR btrim(error_code) <> ''
      )
    );

    CREATE TABLE wa_fallback_actions (
      id uuid PRIMARY KEY,
      reminder_cycle_id uuid NOT NULL UNIQUE REFERENCES reminder_cycles(id) ON DELETE RESTRICT,
      mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE RESTRICT,
      status wa_fallback_action_status NOT NULL DEFAULT 'READY',
      template_version_id uuid,
      link_generated_at timestamptz,
      link_opened_at timestamptz,
      resolved_at timestamptz,
      resolved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      manual_note text,
      escalated_at timestamptz,
      CONSTRAINT wa_fallback_actions_manual_note_not_blank CHECK (
        manual_note IS NULL OR btrim(manual_note) <> ''
      ),
      CONSTRAINT wa_fallback_actions_resolution_pair CHECK (
        (resolved_at IS NULL AND resolved_by IS NULL)
        OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
      )
    );

    COMMENT ON TABLE wa_fallback_actions IS
      'Manual wa.me workflow metadata only; full URLs and provider delivery claims are not persisted.';

    CREATE TABLE program_rule_versions (
      id uuid PRIMARY KEY,
      version_no integer NOT NULL UNIQUE CHECK (version_no > 0),
      status rule_version_status NOT NULL DEFAULT 'DRAFT',
      approved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      approved_at timestamptz,
      effective_from date,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT program_rule_approval_pair CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
      )
    );

    CREATE TABLE program_rule_requirements (
      id uuid PRIMARY KEY,
      program_rule_version_id uuid NOT NULL REFERENCES program_rule_versions(id) ON DELETE RESTRICT,
      requirement_type program_requirement_type NOT NULL,
      milestone_code milestone_code,
      rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT program_rule_requirements_config_object CHECK (jsonb_typeof(rule_config) = 'object')
    );

    CREATE TABLE program_assessments (
      id uuid PRIMARY KEY,
      pregnancy_id uuid NOT NULL REFERENCES pregnancies(id) ON DELETE RESTRICT,
      rule_version_id uuid NOT NULL REFERENCES program_rule_versions(id) ON DELETE RESTRICT,
      sigizi_kesga_recording_status sigizi_kesga_recording_status NOT NULL,
      fetal_rights_status fetal_rights_status NOT NULL,
      evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
      evaluated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      evaluated_by_type assessment_evaluator_type NOT NULL,
      evaluated_by_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      CONSTRAINT program_assessments_evidence_object CHECK (jsonb_typeof(evidence_summary) = 'object'),
      CONSTRAINT program_assessments_evaluator CHECK (
        (evaluated_by_type = 'SYSTEM' AND evaluated_by_staff_id IS NULL)
        OR (evaluated_by_type = 'STAFF' AND evaluated_by_staff_id IS NOT NULL)
      )
    );

    CREATE TABLE audit_events (
      id uuid PRIMARY KEY,
      actor_type text NOT NULL CHECK (btrim(actor_type) <> ''),
      actor_id uuid,
      action text NOT NULL CHECK (btrim(action) <> ''),
      resource_type text NOT NULL CHECK (btrim(resource_type) <> ''),
      resource_id uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
    );

    COMMENT ON COLUMN audit_events.metadata IS
      'Redacted metadata only; no NIK, secrets, or unnecessary raw clinical payloads.';

    CREATE UNIQUE INDEX anc_plan_versions_one_active_idx
      ON anc_plan_versions ((status)) WHERE status = 'ACTIVE';
    CREATE UNIQUE INDEX program_rule_versions_one_active_idx
      ON program_rule_versions ((status)) WHERE status = 'ACTIVE';
    CREATE UNIQUE INDEX pregnancies_one_active_per_mother_idx
      ON pregnancies (mother_id) WHERE status = 'ACTIVE';
    CREATE UNIQUE INDEX mother_access_credentials_one_active_idx
      ON mother_access_credentials (mother_id) WHERE status = 'ACTIVE';

    CREATE INDEX staff_users_health_center_idx ON staff_users (health_center_id);
    CREATE INDEX staff_assignments_scope_idx ON staff_assignments (scope_type, scope_id);
    CREATE INDEX mothers_health_center_idx ON mothers (health_center_id);
    CREATE INDEX mothers_phone_normalized_idx ON mothers (phone_normalized);
    CREATE INDEX pregnancies_health_center_status_idx ON pregnancies (health_center_id, status);
    CREATE INDEX pregnancies_mother_idx ON pregnancies (mother_id);
    CREATE INDEX anc_milestone_rules_plan_idx ON anc_milestone_rules (plan_version_id);
    CREATE INDEX pregnancy_milestones_scheduler_idx ON pregnancy_milestones (visit_status, due_at);
    CREATE INDEX visit_confirmations_history_idx ON visit_confirmations (milestone_id, created_at DESC);
    CREATE INDEX record_validation_events_history_idx
      ON record_validation_events (record_id, created_at DESC);
    CREATE INDEX mother_sessions_expiry_idx ON mother_sessions (expires_at) WHERE revoked_at IS NULL;
    CREATE INDEX devices_mother_status_idx ON devices (mother_id, status);
    CREATE INDEX consent_records_history_idx ON consent_records (mother_id, purpose, recorded_at DESC);
    CREATE INDEX reminder_cycles_status_anchor_idx ON reminder_cycles (status, cycle_anchor_at);
    CREATE INDEX push_attempts_cycle_status_idx ON push_attempts (reminder_cycle_id, status);
    CREATE INDEX wa_fallback_actions_queue_idx ON wa_fallback_actions (status, escalated_at);
    CREATE INDEX wa_fallback_actions_mother_idx ON wa_fallback_actions (mother_id);
    CREATE INDEX program_rule_requirements_version_idx
      ON program_rule_requirements (program_rule_version_id);
    CREATE INDEX program_assessments_history_idx
      ON program_assessments (pregnancy_id, evaluated_at DESC);
    CREATE INDEX audit_events_resource_idx ON audit_events (resource_type, resource_id, created_at DESC);
    CREATE INDEX audit_events_actor_idx ON audit_events (actor_type, actor_id, created_at DESC);
    CREATE INDEX audit_events_created_at_idx ON audit_events (created_at DESC);

    CREATE FUNCTION anc_set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER health_centers_set_updated_at
      BEFORE UPDATE ON health_centers
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER staff_users_set_updated_at
      BEFORE UPDATE ON staff_users
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER mothers_set_updated_at
      BEFORE UPDATE ON mothers
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER pregnancies_set_updated_at
      BEFORE UPDATE ON pregnancies
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER pregnancy_milestones_set_updated_at
      BEFORE UPDATE ON pregnancy_milestones
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER k1_k6_records_set_updated_at
      BEFORE UPDATE ON k1_k6_records
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();
    CREATE TRIGGER devices_set_updated_at
      BEFORE UPDATE ON devices
      FOR EACH ROW EXECUTE FUNCTION anc_set_updated_at();

    CREATE FUNCTION anc_reject_append_only_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
    END;
    $function$;

    CREATE TRIGGER visit_confirmations_append_only
      BEFORE UPDATE OR DELETE ON visit_confirmations
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();
    CREATE TRIGGER record_validation_events_append_only
      BEFORE UPDATE OR DELETE ON record_validation_events
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();
    CREATE TRIGGER audit_events_append_only
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS program_assessments;
    DROP TABLE IF EXISTS program_rule_requirements;
    DROP TABLE IF EXISTS program_rule_versions;
    DROP TABLE IF EXISTS wa_fallback_actions;
    DROP TABLE IF EXISTS push_attempts;
    DROP TABLE IF EXISTS reminder_cycles;
    DROP TABLE IF EXISTS consent_records;
    DROP TABLE IF EXISTS devices;
    DROP TABLE IF EXISTS mother_sessions;
    DROP TABLE IF EXISTS mother_access_credentials;
    DROP TABLE IF EXISTS record_validation_events;
    DROP TABLE IF EXISTS k1_k6_records;
    DROP TABLE IF EXISTS visit_confirmations;
    DROP TABLE IF EXISTS pregnancy_milestones;
    DROP TABLE IF EXISTS pregnancies;
    DROP TABLE IF EXISTS mothers;
    DROP TABLE IF EXISTS anc_milestone_rules;
    DROP TABLE IF EXISTS anc_plan_versions;
    DROP TABLE IF EXISTS staff_assignments;
    DROP TABLE IF EXISTS staff_users;
    DROP TABLE IF EXISTS health_centers;

    DROP FUNCTION IF EXISTS anc_reject_append_only_mutation();
    DROP FUNCTION IF EXISTS anc_set_updated_at();

    DROP TYPE IF EXISTS assessment_evaluator_type;
    DROP TYPE IF EXISTS fetal_rights_status;
    DROP TYPE IF EXISTS sigizi_kesga_recording_status;
    DROP TYPE IF EXISTS program_requirement_type;
    DROP TYPE IF EXISTS wa_fallback_action_status;
    DROP TYPE IF EXISTS push_attempt_status;
    DROP TYPE IF EXISTS reminder_cycle_status;
    DROP TYPE IF EXISTS consent_status;
    DROP TYPE IF EXISTS consent_purpose;
    DROP TYPE IF EXISTS device_status;
    DROP TYPE IF EXISTS device_platform;
    DROP TYPE IF EXISTS mother_access_credential_status;
    DROP TYPE IF EXISTS record_validation_action;
    DROP TYPE IF EXISTS visit_confirmation_action;
    DROP TYPE IF EXISTS k1_k6_record_status;
    DROP TYPE IF EXISTS record_validation_status;
    DROP TYPE IF EXISTS visit_status;
    DROP TYPE IF EXISTS required_facility_policy;
    DROP TYPE IF EXISTS milestone_category;
    DROP TYPE IF EXISTS milestone_code;
    DROP TYPE IF EXISTS rule_version_status;
    DROP TYPE IF EXISTS pregnancy_status;
    DROP TYPE IF EXISTS dating_basis;
    DROP TYPE IF EXISTS staff_assignment_scope_type;
    DROP TYPE IF EXISTS staff_user_status;
    DROP TYPE IF EXISTS staff_role;
    DROP TYPE IF EXISTS health_center_status;
  `);
};
