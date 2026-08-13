"use strict";

/**
 * Audit remediation 000013.
 *
 * 1. Program rule requirement uniqueness must account for FIELD_PRESENT
 *    field keys: two FIELD_PRESENT requirements on the same milestone are
 *    valid when they target different record fields (contract-level
 *    uniqueness already includes field_key).
 * 2. consent_records becomes append-only like every other history table,
 *    so consent withdrawals cannot be silently rewritten.
 */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    DROP INDEX IF EXISTS program_rule_requirements_version_unique_idx;

    CREATE UNIQUE INDEX program_rule_requirements_version_unique_idx
      ON program_rule_requirements (
        program_rule_version_id,
        requirement_type,
        milestone_code,
        (rule_config ->> 'field_key')
      ) NULLS NOT DISTINCT;

    CREATE FUNCTION anc_reject_consent_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      RAISE EXCEPTION 'consent_records is append-only'
        USING ERRCODE = '23514';
    END;
    $function$;

    CREATE TRIGGER consent_records_append_only
      BEFORE UPDATE OR DELETE ON consent_records
      FOR EACH ROW EXECUTE FUNCTION anc_reject_consent_mutation();

    COMMENT ON TABLE consent_records IS
      'Append-only consent history; withdrawal is recorded as a new row, never an edit.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TRIGGER IF EXISTS consent_records_append_only ON consent_records;
    DROP FUNCTION IF EXISTS anc_reject_consent_mutation();

    DROP INDEX IF EXISTS program_rule_requirements_version_unique_idx;

    CREATE UNIQUE INDEX program_rule_requirements_version_unique_idx
      ON program_rule_requirements (program_rule_version_id, requirement_type, milestone_code);
  `);
};
