"use strict";

/**
 * Phase 2 program status governance (TASK-P2-014).
 *
 * Adds lifecycle governance, draft-only requirement mutation, and append-only
 * assessment protection to the baseline program-status tables. No program rule
 * values are seeded here: without a clinical/program owner approval
 * (OPEN-CLIN-002) no version can reach ACTIVE, so assessments stay
 * NOT_EVALUATED.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    ALTER TABLE program_rule_versions
      ADD COLUMN source_reference text,
      ADD COLUMN approval_reference text,
      ADD COLUMN created_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN activated_at timestamptz;

    UPDATE program_rule_versions
       SET source_reference = 'MIGRATED_REFERENCE_REVIEW_REQUIRED'
     WHERE source_reference IS NULL;

    UPDATE program_rule_versions
       SET created_by = approved_by
     WHERE created_by IS NULL;

    ALTER TABLE program_rule_versions
      ALTER COLUMN source_reference SET NOT NULL,
      ALTER COLUMN created_by SET NOT NULL,
      ADD CONSTRAINT program_rule_source_reference_nonblank
        CHECK (btrim(source_reference) <> ''),
      ADD CONSTRAINT program_rule_approval_reference_nonblank
        CHECK (approval_reference IS NULL OR btrim(approval_reference) <> ''),
      ADD CONSTRAINT program_rule_activation_pair CHECK (
        (status <> 'ACTIVE' AND activated_at IS NULL)
        OR (status IN ('ACTIVE', 'ARCHIVED') AND activated_at IS NOT NULL)
      );

    ALTER TABLE program_rule_requirements
      ADD CONSTRAINT program_rule_requirement_type_milestone CHECK (
        requirement_type NOT IN ('MILESTONE_VALIDATED', 'FIELD_PRESENT')
        OR milestone_code IS NOT NULL
      );

    CREATE UNIQUE INDEX program_rule_requirements_version_unique_idx
      ON program_rule_requirements (program_rule_version_id, requirement_type, milestone_code);

    CREATE FUNCTION program_rule_has_requirements(version_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT EXISTS (
        SELECT 1
          FROM program_rule_requirements
         WHERE program_rule_version_id = version_id
      );
    $function$;

    CREATE FUNCTION program_enforce_rule_requirements_on_governed_status()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.status IN ('APPROVED', 'ACTIVE')
         AND NOT program_rule_has_requirements(NEW.id) THEN
        RAISE EXCEPTION 'Program rule % must contain at least one requirement before approval or activation', NEW.id
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $function$;

    CREATE CONSTRAINT TRIGGER program_rule_versions_complete_requirements
      AFTER INSERT OR UPDATE ON program_rule_versions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION program_enforce_rule_requirements_on_governed_status();

    CREATE FUNCTION program_require_draft_rule_for_requirement_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      target_rule_id uuid;
      target_status rule_version_status;
    BEGIN
      target_rule_id := CASE
        WHEN TG_OP = 'DELETE' THEN OLD.program_rule_version_id
        ELSE NEW.program_rule_version_id
      END;
      SELECT status INTO target_status
        FROM program_rule_versions
       WHERE id = target_rule_id
       FOR UPDATE;
      IF target_status IS DISTINCT FROM 'DRAFT'::rule_version_status THEN
        RAISE EXCEPTION 'Requirements for program rule % are immutable outside DRAFT status', target_rule_id
          USING ERRCODE = '23514';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END;
    $function$;

    CREATE TRIGGER program_rule_requirements_draft_only
      BEFORE INSERT OR UPDATE OR DELETE ON program_rule_requirements
      FOR EACH ROW EXECUTE FUNCTION program_require_draft_rule_for_requirement_mutation();

    CREATE FUNCTION program_enforce_rule_version_transition()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF OLD.version_no IS DISTINCT FROM NEW.version_no
         OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
         OR OLD.created_by IS DISTINCT FROM NEW.created_by THEN
        RAISE EXCEPTION 'Program rule version identity is immutable'
          USING ERRCODE = '23514';
      END IF;

      IF NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'APPROVED'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('APPROVED', 'ACTIVE', 'ARCHIVED'))
        OR (OLD.status = 'ACTIVE' AND NEW.status IN ('ACTIVE', 'ARCHIVED'))
        OR (OLD.status = 'ARCHIVED' AND NEW.status = 'ARCHIVED')
      ) THEN
        RAISE EXCEPTION 'Invalid program rule transition from % to %', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;

      IF OLD.status <> 'DRAFT'
         AND (
           OLD.approval_reference IS DISTINCT FROM NEW.approval_reference
           OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
           OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
           OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
         ) THEN
        RAISE EXCEPTION 'Approved program rule governance metadata is immutable'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER program_rule_versions_transition_guard
      BEFORE UPDATE ON program_rule_versions
      FOR EACH ROW EXECUTE FUNCTION program_enforce_rule_version_transition();

    CREATE FUNCTION program_reject_assessment_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      RAISE EXCEPTION 'program_assessments is append-only'
        USING ERRCODE = '23514';
    END;
    $function$;

    CREATE TRIGGER program_assessments_append_only
      BEFORE UPDATE OR DELETE ON program_assessments
      FOR EACH ROW EXECUTE FUNCTION program_reject_assessment_mutation();

    COMMENT ON COLUMN program_rule_versions.approval_reference IS
      'Reference to separately controlled approval evidence; do not store signatures in this public repository.';
    COMMENT ON TABLE program_assessments IS
      'Append-only evaluation history. Evidence summaries hold identifiers and booleans only, never raw clinical payloads.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TRIGGER IF EXISTS program_assessments_append_only ON program_assessments;
    DROP TRIGGER IF EXISTS program_rule_versions_transition_guard ON program_rule_versions;
    DROP TRIGGER IF EXISTS program_rule_requirements_draft_only ON program_rule_requirements;
    DROP TRIGGER IF EXISTS program_rule_versions_complete_requirements ON program_rule_versions;
    DROP FUNCTION IF EXISTS program_reject_assessment_mutation();
    DROP FUNCTION IF EXISTS program_enforce_rule_version_transition();
    DROP FUNCTION IF EXISTS program_require_draft_rule_for_requirement_mutation();
    DROP FUNCTION IF EXISTS program_enforce_rule_requirements_on_governed_status();
    DROP FUNCTION IF EXISTS program_rule_has_requirements(uuid);

    DROP INDEX IF EXISTS program_rule_requirements_version_unique_idx;

    ALTER TABLE program_rule_requirements
      DROP CONSTRAINT IF EXISTS program_rule_requirement_type_milestone;

    ALTER TABLE program_rule_versions
      DROP CONSTRAINT IF EXISTS program_rule_activation_pair,
      DROP CONSTRAINT IF EXISTS program_rule_approval_reference_nonblank,
      DROP CONSTRAINT IF EXISTS program_rule_source_reference_nonblank,
      ALTER COLUMN created_by DROP NOT NULL,
      ALTER COLUMN source_reference DROP NOT NULL,
      DROP COLUMN IF EXISTS activated_at,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS approval_reference,
      DROP COLUMN IF EXISTS source_reference;
  `);
};
