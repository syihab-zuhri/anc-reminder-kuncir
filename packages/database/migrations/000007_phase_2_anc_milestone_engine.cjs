"use strict";

/**
 * Phase 2 ANC milestone engine integrity.
 *
 * No clinical target-week values are seeded here. Synthetic plans are forced
 * to remain DRAFT and may only be selected by non-production application code.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TYPE anc_plan_kind AS ENUM ('CLINICAL', 'SYNTHETIC');

    ALTER TABLE staff_users
      ADD COLUMN clinical_program_owner boolean NOT NULL DEFAULT false;

    ALTER TABLE anc_plan_versions
      ADD COLUMN plan_kind anc_plan_kind NOT NULL DEFAULT 'CLINICAL',
      ADD COLUMN source_reference text,
      ADD COLUMN approval_reference text,
      ADD COLUMN created_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
      ADD COLUMN activated_at timestamptz;

    UPDATE anc_plan_versions
       SET plan_kind = 'SYNTHETIC',
           status = 'DRAFT',
           effective_from = NULL,
           approved_by = NULL,
           approved_at = NULL,
           source_reference = 'SYNTHETIC_LEGACY_DEV_ONLY'
     WHERE status = 'ACTIVE'
       AND (approved_by IS NULL OR approved_at IS NULL);

    UPDATE anc_plan_versions
       SET source_reference = CASE
         WHEN plan_kind = 'SYNTHETIC' THEN 'SYNTHETIC_LEGACY_DEV_ONLY'
         ELSE 'MIGRATED_REFERENCE_REVIEW_REQUIRED'
       END
     WHERE source_reference IS NULL;

    ALTER TABLE anc_plan_versions
      ALTER COLUMN source_reference SET NOT NULL,
      DROP CONSTRAINT anc_plan_approval_pair,
      ADD CONSTRAINT anc_plan_source_reference_nonblank
        CHECK (btrim(source_reference) <> ''),
      ADD CONSTRAINT anc_plan_approval_reference_nonblank
        CHECK (approval_reference IS NULL OR btrim(approval_reference) <> ''),
      ADD CONSTRAINT anc_plan_governance_state CHECK (
        (
          plan_kind = 'SYNTHETIC'
          AND status = 'DRAFT'
          AND approval_reference IS NULL
          AND approved_by IS NULL
          AND approved_at IS NULL
          AND effective_from IS NULL
          AND activated_at IS NULL
        )
        OR
        (
          plan_kind = 'CLINICAL'
          AND (
            (
              status = 'DRAFT'
              AND approval_reference IS NULL
              AND approved_by IS NULL
              AND approved_at IS NULL
              AND effective_from IS NULL
              AND activated_at IS NULL
            )
            OR
            (
              status = 'APPROVED'
              AND approval_reference IS NOT NULL
              AND approved_by IS NOT NULL
              AND approved_at IS NOT NULL
              AND effective_from IS NOT NULL
              AND activated_at IS NULL
            )
            OR
            (
              status IN ('ACTIVE', 'ARCHIVED')
              AND approval_reference IS NOT NULL
              AND approved_by IS NOT NULL
              AND approved_at IS NOT NULL
              AND effective_from IS NOT NULL
              AND activated_at IS NOT NULL
            )
          )
        )
      );

    CREATE FUNCTION anc_facility_type_array_is_valid(value jsonb)
    RETURNS boolean
    LANGUAGE sql
    IMMUTABLE
    AS $function$
      SELECT
        jsonb_typeof(value) = 'array'
        AND jsonb_array_length(value) > 0
        AND NOT EXISTS (
          SELECT 1
            FROM jsonb_array_elements_text(value) AS item(facility_type)
           WHERE item.facility_type NOT IN (
             'PUSKESMAS', 'POSYANDU', 'PONED', 'HOSPITAL', 'MIDWIFE_PRACTICE', 'OTHER'
           )
        )
        AND (
          SELECT count(*) = count(DISTINCT item.facility_type)
            FROM jsonb_array_elements_text(value) AS item(facility_type)
        );
    $function$;

    ALTER TABLE anc_milestone_rules
      ADD CONSTRAINT anc_milestone_rules_facility_values_valid
        CHECK (anc_facility_type_array_is_valid(allowed_facility_types)),
      ADD CONSTRAINT anc_milestone_rules_structural_policy CHECK (
        (
          code IN ('K1', 'K4', 'K5')
          AND milestone_category = 'ANC'
          AND required_facility_policy = 'PUSKESMAS_REQUIRED'
          AND allowed_facility_types = '["PUSKESMAS"]'::jsonb
        )
        OR
        (
          code IN ('K2', 'K3', 'K6', 'K7')
          AND milestone_category = 'ANC'
          AND required_facility_policy = 'FLEXIBLE'
        )
        OR
        (
          code = 'K8'
          AND milestone_category = 'DELIVERY'
          AND required_facility_policy = 'PONED_OR_RS_REQUIRED'
          AND allowed_facility_types <@ '["PONED", "HOSPITAL"]'::jsonb
        )
      );

    ALTER TABLE anc_milestone_rules
      ADD CONSTRAINT anc_milestone_rules_identity_unique
        UNIQUE (id, plan_version_id, code);

    ALTER TABLE pregnancies
      ADD CONSTRAINT pregnancies_plan_identity_unique
        UNIQUE (id, care_plan_version_id);

    ALTER TABLE pregnancy_milestones
      ADD COLUMN plan_version_id uuid;

    UPDATE pregnancy_milestones AS milestone
       SET plan_version_id = rule.plan_version_id
      FROM anc_milestone_rules AS rule
     WHERE rule.id = milestone.rule_id;

    ALTER TABLE pregnancy_milestones
      ALTER COLUMN plan_version_id SET NOT NULL,
      ADD CONSTRAINT pregnancy_milestones_rule_snapshot_fk
        FOREIGN KEY (rule_id, plan_version_id, code)
        REFERENCES anc_milestone_rules(id, plan_version_id, code)
        ON DELETE RESTRICT,
      ADD CONSTRAINT pregnancy_milestones_pregnancy_plan_fk
        FOREIGN KEY (pregnancy_id, plan_version_id)
        REFERENCES pregnancies(id, care_plan_version_id)
        ON DELETE RESTRICT;

    CREATE FUNCTION anc_plan_rules_are_complete(target_plan_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT
        count(*) = 8
        AND count(DISTINCT code) = 8
        AND count(*) FILTER (WHERE code <> 'K8' AND target_week_start IS NULL) = 0
        AND count(*) FILTER (WHERE code <> 'K8' AND target_week_end IS NULL) = 0
      FROM anc_milestone_rules
      WHERE plan_version_id = target_plan_id;
    $function$;

    CREATE FUNCTION anc_validate_plan_rules_on_governed_status()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.status IN ('APPROVED', 'ACTIVE')
         AND NOT anc_plan_rules_are_complete(NEW.id) THEN
        RAISE EXCEPTION 'ANC plan % must contain complete K1-K8 rules before approval or activation', NEW.id
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $function$;

    CREATE CONSTRAINT TRIGGER anc_plan_versions_complete_rules
      AFTER INSERT OR UPDATE ON anc_plan_versions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION anc_validate_plan_rules_on_governed_status();

    CREATE FUNCTION anc_require_draft_plan_for_rule_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      target_plan_id uuid;
      target_status rule_version_status;
    BEGIN
      target_plan_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.plan_version_id ELSE NEW.plan_version_id END;
      SELECT status INTO target_status
        FROM anc_plan_versions
       WHERE id = target_plan_id
       FOR UPDATE;
      IF target_status IS DISTINCT FROM 'DRAFT'::rule_version_status THEN
        RAISE EXCEPTION 'Rules for ANC plan % are immutable outside DRAFT status', target_plan_id
          USING ERRCODE = '23514';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END;
    $function$;

    CREATE TRIGGER anc_milestone_rules_draft_only
      BEFORE INSERT OR UPDATE OR DELETE ON anc_milestone_rules
      FOR EACH ROW EXECUTE FUNCTION anc_require_draft_plan_for_rule_mutation();

    CREATE FUNCTION anc_enforce_plan_version_transition()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF OLD.plan_kind IS DISTINCT FROM NEW.plan_kind
         OR OLD.version_no IS DISTINCT FROM NEW.version_no
         OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
         OR OLD.created_by IS DISTINCT FROM NEW.created_by THEN
        RAISE EXCEPTION 'ANC plan version identity is immutable'
          USING ERRCODE = '23514';
      END IF;

      IF NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'APPROVED'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('APPROVED', 'ACTIVE', 'ARCHIVED'))
        OR (OLD.status = 'ACTIVE' AND NEW.status IN ('ACTIVE', 'ARCHIVED'))
        OR (OLD.status = 'ARCHIVED' AND NEW.status = 'ARCHIVED')
      ) THEN
        RAISE EXCEPTION 'Invalid ANC plan transition from % to %', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;

      IF OLD.status <> 'DRAFT'
         AND (
           OLD.approval_reference IS DISTINCT FROM NEW.approval_reference
           OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
           OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
           OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
         ) THEN
        RAISE EXCEPTION 'Approved ANC plan governance metadata is immutable'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER anc_plan_versions_transition_guard
      BEFORE UPDATE ON anc_plan_versions
      FOR EACH ROW EXECUTE FUNCTION anc_enforce_plan_version_transition();

    COMMENT ON COLUMN anc_plan_versions.plan_kind IS
      'SYNTHETIC plans are development/test fixtures and can never leave DRAFT status.';
    COMMENT ON COLUMN anc_plan_versions.approval_reference IS
      'Reference to separately controlled approval evidence; do not store signatures in this public repository.';
    COMMENT ON COLUMN pregnancy_milestones.plan_version_id IS
      'Snapshot integrity key tying the milestone rule to the pregnancy care-plan version.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TRIGGER IF EXISTS anc_plan_versions_transition_guard ON anc_plan_versions;
    DROP FUNCTION IF EXISTS anc_enforce_plan_version_transition();
    DROP TRIGGER IF EXISTS anc_milestone_rules_draft_only ON anc_milestone_rules;
    DROP FUNCTION IF EXISTS anc_require_draft_plan_for_rule_mutation();
    DROP TRIGGER IF EXISTS anc_plan_versions_complete_rules ON anc_plan_versions;
    DROP FUNCTION IF EXISTS anc_validate_plan_rules_on_governed_status();
    DROP FUNCTION IF EXISTS anc_plan_rules_are_complete(uuid);

    ALTER TABLE pregnancy_milestones
      DROP CONSTRAINT IF EXISTS pregnancy_milestones_pregnancy_plan_fk,
      DROP CONSTRAINT IF EXISTS pregnancy_milestones_rule_snapshot_fk,
      DROP COLUMN IF EXISTS plan_version_id;

    ALTER TABLE pregnancies
      DROP CONSTRAINT IF EXISTS pregnancies_plan_identity_unique;

    ALTER TABLE anc_milestone_rules
      DROP CONSTRAINT IF EXISTS anc_milestone_rules_identity_unique,
      DROP CONSTRAINT IF EXISTS anc_milestone_rules_structural_policy,
      DROP CONSTRAINT IF EXISTS anc_milestone_rules_facility_values_valid;

    DROP FUNCTION IF EXISTS anc_facility_type_array_is_valid(jsonb);

    ALTER TABLE anc_plan_versions
      DROP CONSTRAINT IF EXISTS anc_plan_governance_state,
      DROP CONSTRAINT IF EXISTS anc_plan_approval_reference_nonblank,
      DROP CONSTRAINT IF EXISTS anc_plan_source_reference_nonblank,
      ADD CONSTRAINT anc_plan_approval_pair CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
      ),
      DROP COLUMN IF EXISTS activated_at,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS approval_reference,
      DROP COLUMN IF EXISTS source_reference,
      DROP COLUMN IF EXISTS plan_kind;

    ALTER TABLE staff_users
      DROP COLUMN IF EXISTS clinical_program_owner;

    DROP TYPE IF EXISTS anc_plan_kind;
  `);
};
