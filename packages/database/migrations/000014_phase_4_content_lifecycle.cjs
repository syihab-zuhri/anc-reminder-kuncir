"use strict";

/**
 * Versioned reminder content governance (TASK-P4-009).
 *
 * The two global baseline templates contain only the minimal, non-clinical
 * copy already approved in the blueprint. Facility overrides must still pass
 * REVIEW -> APPROVED -> PUBLISHED under a Clinical/Program Owner.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE content_template_type AS ENUM (
      'PUSH_REMINDER',
      'WAME_REMINDER',
      'EDUCATION',
      'CONTACT_GUIDANCE'
    );

    CREATE TYPE content_version_status AS ENUM (
      'DRAFT',
      'REVIEW',
      'APPROVED',
      'PUBLISHED',
      'ARCHIVED'
    );

    CREATE TABLE content_templates (
      id uuid PRIMARY KEY,
      health_center_id uuid REFERENCES health_centers(id) ON DELETE RESTRICT,
      template_key text NOT NULL CHECK (template_key ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
      content_type content_template_type NOT NULL,
      created_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT content_template_actor_scope CHECK (
        (health_center_id IS NULL AND created_by IS NULL)
        OR (health_center_id IS NOT NULL AND created_by IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX content_templates_scope_type_unique_idx
      ON content_templates (health_center_id, content_type) NULLS NOT DISTINCT;

    CREATE TABLE content_versions (
      id uuid PRIMARY KEY,
      content_template_id uuid NOT NULL REFERENCES content_templates(id) ON DELETE RESTRICT,
      version_no integer NOT NULL CHECK (version_no > 0),
      status content_version_status NOT NULL DEFAULT 'DRAFT',
      title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 120),
      body text NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 1000),
      placeholder_keys text[] NOT NULL DEFAULT '{}',
      source_reference text NOT NULL CHECK (
        btrim(source_reference) <> '' AND char_length(source_reference) <= 240
      ),
      approval_reference text CHECK (
        approval_reference IS NULL
        OR (btrim(approval_reference) <> '' AND char_length(approval_reference) <= 240)
      ),
      created_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      submitted_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      submitted_at timestamptz,
      approved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      approved_at timestamptz,
      published_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      published_at timestamptz,
      archived_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT content_versions_template_version_unique
        UNIQUE (content_template_id, version_no),
      CONSTRAINT content_versions_lifecycle_metadata CHECK (
        (status = 'DRAFT'
          AND submitted_at IS NULL AND approved_at IS NULL
          AND published_at IS NULL AND archived_at IS NULL)
        OR (status = 'REVIEW'
          AND submitted_at IS NOT NULL AND approved_at IS NULL
          AND published_at IS NULL AND archived_at IS NULL)
        OR (status = 'APPROVED'
          AND submitted_at IS NOT NULL AND approved_at IS NOT NULL
          AND approval_reference IS NOT NULL
          AND published_at IS NULL AND archived_at IS NULL)
        OR (status = 'PUBLISHED'
          AND submitted_at IS NOT NULL AND approved_at IS NOT NULL
          AND approval_reference IS NOT NULL
          AND published_at IS NOT NULL AND archived_at IS NULL)
        OR (status = 'ARCHIVED'
          AND submitted_at IS NOT NULL AND approved_at IS NOT NULL
          AND approval_reference IS NOT NULL
          AND published_at IS NOT NULL AND archived_at IS NOT NULL)
      ),
      CONSTRAINT content_versions_staff_actor_timestamps CHECK (
        (submitted_by IS NULL OR submitted_at IS NOT NULL)
        AND (approved_by IS NULL OR approved_at IS NOT NULL)
        AND (published_by IS NULL OR published_at IS NOT NULL)
        AND (archived_by IS NULL OR archived_at IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX content_versions_one_published_idx
      ON content_versions (content_template_id)
      WHERE status = 'PUBLISHED';
    CREATE INDEX content_versions_template_history_idx
      ON content_versions (content_template_id, version_no DESC);

    CREATE FUNCTION content_validate_version_payload()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      target_type content_template_type;
    BEGIN
      SELECT content_type INTO target_type
        FROM content_templates
       WHERE id = NEW.content_template_id;

      IF target_type = 'WAME_REMINDER'
         AND NEW.body ~* '\{\{\s*(nik|diagnosis|diagnosa|lab_result|hasil_lab|risk_category|kategori_risiko)\s*\}\}' THEN
        RAISE EXCEPTION 'WAME_REMINDER contains a prohibited sensitive placeholder'
          USING ERRCODE = '23514';
      END IF;

      IF NEW.title ~ '[<>]'
         OR NEW.body ~ '[<>]'
         OR NEW.title ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
         OR NEW.body ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN
        RAISE EXCEPTION 'Content title and body must be sanitized plain text'
          USING ERRCODE = '23514';
      END IF;

      IF NOT (NEW.placeholder_keys <@ ARRAY['milestone_code', 'facility_name']::text[]) THEN
        RAISE EXCEPTION 'Content version contains a non-allowlisted placeholder key'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER content_versions_payload_guard
      BEFORE INSERT OR UPDATE OF title, body, placeholder_keys, content_template_id ON content_versions
      FOR EACH ROW EXECUTE FUNCTION content_validate_version_payload();

    CREATE FUNCTION content_enforce_version_transition()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF OLD.status <> 'DRAFT'
         AND (
           OLD.content_template_id IS DISTINCT FROM NEW.content_template_id
           OR OLD.version_no IS DISTINCT FROM NEW.version_no
           OR OLD.title IS DISTINCT FROM NEW.title
           OR OLD.body IS DISTINCT FROM NEW.body
           OR OLD.placeholder_keys IS DISTINCT FROM NEW.placeholder_keys
           OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
           OR OLD.created_by IS DISTINCT FROM NEW.created_by
           OR OLD.created_at IS DISTINCT FROM NEW.created_at
         ) THEN
        RAISE EXCEPTION 'Content version snapshot is immutable outside DRAFT'
          USING ERRCODE = '23514';
      END IF;

      IF NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'REVIEW'))
        OR (OLD.status = 'REVIEW' AND NEW.status IN ('REVIEW', 'APPROVED'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('APPROVED', 'PUBLISHED'))
        OR (OLD.status = 'PUBLISHED' AND NEW.status IN ('PUBLISHED', 'ARCHIVED'))
        OR (OLD.status = 'ARCHIVED' AND NEW.status = 'ARCHIVED')
      ) THEN
        RAISE EXCEPTION 'Invalid content lifecycle transition from % to %', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;

      IF OLD.submitted_at IS NOT NULL AND (
           OLD.submitted_at IS DISTINCT FROM NEW.submitted_at
           OR OLD.submitted_by IS DISTINCT FROM NEW.submitted_by
         ) THEN
        RAISE EXCEPTION 'Content submission metadata is immutable'
          USING ERRCODE = '23514';
      END IF;
      IF OLD.approved_at IS NOT NULL AND (
           OLD.approved_at IS DISTINCT FROM NEW.approved_at
           OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
           OR OLD.approval_reference IS DISTINCT FROM NEW.approval_reference
         ) THEN
        RAISE EXCEPTION 'Content approval metadata is immutable'
          USING ERRCODE = '23514';
      END IF;
      IF OLD.published_at IS NOT NULL AND (
           OLD.published_at IS DISTINCT FROM NEW.published_at
           OR OLD.published_by IS DISTINCT FROM NEW.published_by
         ) THEN
        RAISE EXCEPTION 'Content publication metadata is immutable'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER content_versions_transition_guard
      BEFORE UPDATE ON content_versions
      FOR EACH ROW EXECUTE FUNCTION content_enforce_version_transition();

    CREATE TRIGGER content_versions_no_delete
      BEFORE DELETE ON content_versions
      FOR EACH ROW EXECUTE FUNCTION anc_reject_append_only_mutation();

    CREATE FUNCTION content_reject_template_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      RAISE EXCEPTION 'content_templates identity is immutable'
        USING ERRCODE = '23514';
    END;
    $function$;

    CREATE TRIGGER content_templates_immutable
      BEFORE UPDATE OR DELETE ON content_templates
      FOR EACH ROW EXECUTE FUNCTION content_reject_template_mutation();

    ALTER TABLE wa_fallback_actions
      ADD CONSTRAINT wa_fallback_actions_template_version_fk
      FOREIGN KEY (template_version_id) REFERENCES content_versions(id) ON DELETE RESTRICT;

    ALTER TABLE reminder_cycles
      ADD COLUMN push_template_version_id uuid
      REFERENCES content_versions(id) ON DELETE RESTRICT;

    INSERT INTO content_templates (
      id, health_center_id, template_key, content_type, created_by, created_at
    ) VALUES
      ('c0000000-0000-4000-8000-000000000001', NULL, 'system.anc.push-reminder', 'PUSH_REMINDER', NULL, CURRENT_TIMESTAMP),
      ('c0000000-0000-4000-8000-000000000002', NULL, 'system.anc.wame-reminder', 'WAME_REMINDER', NULL, CURRENT_TIMESTAMP);

    INSERT INTO content_versions (
      id,
      content_template_id,
      version_no,
      status,
      title,
      body,
      placeholder_keys,
      source_reference,
      approval_reference,
      submitted_at,
      approved_at,
      published_at,
      created_at
    ) VALUES
      (
        'c1000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001',
        1,
        'PUBLISHED',
        'Pengingat Pemeriksaan ANC',
        'Pengingat jadwal pemeriksaan kehamilan {{milestone_code}} dari {{facility_name}}. Mohon hubungi fasilitas kesehatan untuk konfirmasi jadwal.',
        ARRAY['milestone_code', 'facility_name'],
        'BLUEPRINT-CR-2026-08-08',
        'BLUEPRINT-CR-2026-08-08',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      ),
      (
        'c1000000-0000-4000-8000-000000000002',
        'c0000000-0000-4000-8000-000000000002',
        1,
        'PUBLISHED',
        'Pengingat WhatsApp Manual ANC',
        'Pengingat jadwal pemeriksaan kehamilan {{milestone_code}} dari {{facility_name}}. Mohon hubungi fasilitas kesehatan untuk konfirmasi jadwal.',
        ARRAY['milestone_code', 'facility_name'],
        'BLUEPRINT-CR-2026-08-08',
        'BLUEPRINT-CR-2026-08-08',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );

    COMMENT ON TABLE content_versions IS
      'Versioned plain-text content. REVIEW and later snapshots are immutable; publication requires governed approval.';
    COMMENT ON COLUMN wa_fallback_actions.template_version_id IS
      'Immutable content version snapshot selected for this manual wa.me action.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE reminder_cycles DROP COLUMN IF EXISTS push_template_version_id;
    ALTER TABLE wa_fallback_actions
      DROP CONSTRAINT IF EXISTS wa_fallback_actions_template_version_fk;

    DROP TRIGGER IF EXISTS content_templates_immutable ON content_templates;
    DROP TRIGGER IF EXISTS content_versions_no_delete ON content_versions;
    DROP TRIGGER IF EXISTS content_versions_transition_guard ON content_versions;
    DROP TRIGGER IF EXISTS content_versions_payload_guard ON content_versions;
    DROP FUNCTION IF EXISTS content_reject_template_mutation();
    DROP FUNCTION IF EXISTS content_enforce_version_transition();
    DROP FUNCTION IF EXISTS content_validate_version_payload();
    DROP TABLE IF EXISTS content_versions;
    DROP TABLE IF EXISTS content_templates;
    DROP TYPE IF EXISTS content_version_status;
    DROP TYPE IF EXISTS content_template_type;
  `);
};
