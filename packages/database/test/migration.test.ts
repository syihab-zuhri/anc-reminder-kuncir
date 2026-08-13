import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

interface MigrationBuilderStub {
  sql(statement: string): void;
}

interface BaselineMigration {
  up(builder: MigrationBuilderStub): void;
  down(builder: MigrationBuilderStub): void;
}

const loadModule = createRequire(import.meta.url);
const migration = loadModule("../migrations/000001_baseline.cjs") as BaselineMigration;
const phaseOneMigration = loadModule(
  "../migrations/000002_phase_1_auth_security.cjs",
) as BaselineMigration;
const idempotencyMigration = loadModule(
  "../migrations/000003_api_idempotency.cjs",
) as BaselineMigration;
const pregnancyLifecycleMigration = loadModule(
  "../migrations/000004_phase_2_pregnancy_lifecycle.cjs",
) as BaselineMigration;
const motherAccessCredentialMigration = loadModule(
  "../migrations/000005_phase_2_mother_access_credentials.cjs",
) as BaselineMigration;
const motherPrivateAccessMigration = loadModule(
  "../migrations/000006_phase_2_mother_private_access.cjs",
) as BaselineMigration;
const ancMilestoneEngineMigration = loadModule(
  "../migrations/000007_phase_2_anc_milestone_engine.cjs",
) as BaselineMigration;
const milestoneSchedulingMigration = loadModule(
  "../migrations/000008_phase_2_milestone_scheduling.cjs",
) as BaselineMigration;
const visitConfirmationMigration = loadModule(
  "../migrations/000009_phase_2_visit_confirmation.cjs",
) as BaselineMigration;
const clinicalRecordValidationMigration = loadModule(
  "../migrations/000010_phase_2_clinical_record_validation.cjs",
) as BaselineMigration;
const pregnancyCloseCancellationMigration = loadModule(
  "../migrations/000011_phase_2_pregnancy_close_cancellation.cjs",
) as BaselineMigration;
const programStatusMigration = loadModule(
  "../migrations/000012_phase_2_program_status.cjs",
) as BaselineMigration;
const auditRemediationMigration = loadModule(
  "../migrations/000013_audit_remediation.cjs",
) as BaselineMigration;

describe("baseline database migration", () => {
  it("defines the ERD baseline and privacy-sensitive NIK column", () => {
    const sql = vi.fn();
    migration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("CREATE TABLE mothers");
    expect(statement).toContain("nik_ciphertext text NOT NULL");
    expect(statement).not.toMatch(/PRIMARY KEY\s*\([^)]*nik/i);
    expect(statement).toContain("CREATE TABLE pregnancy_milestones");
    expect(statement).toContain("CREATE TABLE reminder_cycles");
    expect(statement).toContain("CREATE TABLE program_assessments");
    expect(statement).toContain("CREATE TABLE audit_events");
    expect(statement).toContain("CREATE TRIGGER visit_confirmations_append_only");
  });

  it("contains no production clinical week seed or legal retention interval", () => {
    const sql = vi.fn();
    migration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).not.toMatch(/INSERT\s+INTO\s+anc_milestone_rules/i);
    expect(statement).not.toMatch(/retention|purge_after|delete_after/i);
  });

  it("provides an explicit reverse migration", () => {
    const sql = vi.fn();
    migration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS audit_events");
    expect(statement).toContain("DROP TABLE IF EXISTS health_centers");
    expect(statement).toContain("DROP TYPE IF EXISTS staff_role");
  });
});

describe("phase 1 auth and organization migration", () => {
  it("adds revocable staff sessions and scoped organization entities", () => {
    const sql = vi.fn();
    phaseOneMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("CREATE TABLE staff_sessions");
    expect(statement).toContain("access_token_hash text NOT NULL UNIQUE");
    expect(statement).toContain("refresh_token_hash text NOT NULL UNIQUE");
    expect(statement).not.toContain("access_token text");
    expect(statement).not.toContain("refresh_token text");
    expect(statement).toContain("CREATE TABLE villages");
    expect(statement).toContain("CREATE TABLE facilities");
    expect(statement).toContain("staff_assignments_active_scope_unique_idx");
    expect(statement).toContain("mothers_village_same_center_fk");
  });

  it("provides a reverse migration for every Phase 1 entity", () => {
    const sql = vi.fn();
    phaseOneMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS staff_sessions");
    expect(statement).toContain("DROP TABLE IF EXISTS facilities");
    expect(statement).toContain("DROP TABLE IF EXISTS villages");
    expect(statement).toContain("DROP TYPE IF EXISTS facility_type");
  });
});

describe("phase 1 API idempotency migration", () => {
  it("stores only keyed coordination metadata and a resource reference", () => {
    const sql = vi.fn();
    idempotencyMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("CREATE TABLE api_idempotency_records");
    expect(statement).toContain("request_hash text NOT NULL");
    expect(statement).toContain("result_resource_id uuid");
    expect(statement).not.toMatch(/request_body|response_body|payload jsonb/i);
  });

  it("provides an explicit reverse migration", () => {
    const sql = vi.fn();
    idempotencyMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS api_idempotency_records");
  });
});

describe("phase 2 pregnancy lifecycle migration", () => {
  it("adds same-center integrity and append-only lifecycle history without clinical derivation", () => {
    const sql = vi.fn();
    pregnancyLifecycleMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("pregnancies_mother_same_center_fk");
    expect(statement).toContain("CREATE TABLE pregnancy_dating_revisions");
    expect(statement).toContain("CREATE TABLE pregnancy_lifecycle_events");
    expect(statement).toContain("pregnancy_dating_revisions_append_only");
    expect(statement).toContain("pregnancy_lifecycle_events_append_only");
    expect(statement).not.toMatch(/target_week|gestational_age|trimester/i);
  });

  it("provides an explicit reverse migration", () => {
    const sql = vi.fn();
    pregnancyLifecycleMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS pregnancy_lifecycle_events");
    expect(statement).toContain("DROP TABLE IF EXISTS pregnancy_dating_revisions");
    expect(statement).toContain("DROP CONSTRAINT IF EXISTS pregnancies_mother_same_center_fk");
  });
});

describe("phase 2 mother access credential migration", () => {
  it("adds staff-attributed revocation and append-only snapshots without plaintext codes", () => {
    const sql = vi.fn();
    motherAccessCredentialMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("CREATE TABLE mother_access_credential_events");
    expect(statement).toContain("mother_access_credential_events_append_only");
    expect(statement).toContain("mother_access_credential_events_credential_same_mother_fk");
    expect(statement).toContain("mother_access_credential_events_previous_same_mother_fk");
    expect(statement).toContain("revoked_by_staff_id");
    expect(statement).toContain("mother_sessions_revocation_actor_pair");
    expect(statement).not.toMatch(/plaintext_code|one_time_code|raw_code/i);
  });

  it("provides an explicit reverse migration", () => {
    const sql = vi.fn();
    motherAccessCredentialMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS mother_access_credential_events");
    expect(statement).toContain("DROP TYPE IF EXISTS mother_access_credential_action");
    expect(statement).toContain("DROP COLUMN IF EXISTS revoked_by_staff_id");
  });
});

describe("phase 2 mother private access migration", () => {
  it("adds HMAC-only lookup/session bindings and durable hashed throttling", () => {
    const sql = vi.fn();
    motherPrivateAccessMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("code_lookup_hash text");
    expect(statement).toContain("mother_sessions_credential_same_mother_fk");
    expect(statement).toContain("CREATE TABLE mother_access_rate_limits");
    expect(statement).toContain("mother_access_rate_limits_blocked_idx");
    expect(statement).not.toMatch(/raw_ip|raw_code|session_token text|access_code text/i);
  });

  it("provides an explicit reverse migration", () => {
    const sql = vi.fn();
    motherPrivateAccessMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS mother_access_rate_limits");
    expect(statement).toContain("DROP COLUMN IF EXISTS code_lookup_hash");
    expect(statement).toContain("DROP TYPE IF EXISTS mother_access_rate_limit_scope");
  });
});

describe("phase 2 ANC milestone engine migration", () => {
  it("separates synthetic plans, locks governed rules, and enforces snapshot integrity", () => {
    const sql = vi.fn();
    ancMilestoneEngineMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("CREATE TYPE anc_plan_kind AS ENUM ('CLINICAL', 'SYNTHETIC')");
    expect(statement).toContain("anc_plan_governance_state");
    expect(statement).toContain("clinical_program_owner boolean NOT NULL DEFAULT false");
    expect(statement).toContain("SYNTHETIC plans are development/test fixtures");
    expect(statement).toContain("anc_plan_versions_complete_rules");
    expect(statement).toContain("anc_milestone_rules_draft_only");
    expect(statement).toContain("pregnancy_milestones_rule_snapshot_fk");
    expect(statement).toContain("pregnancy_milestones_pregnancy_plan_fk");
    expect(statement).not.toMatch(/INSERT\s+INTO\s+anc_milestone_rules/i);
  });

  it("provides a reverse migration for every added guard and key", () => {
    const sql = vi.fn();
    ancMilestoneEngineMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TRIGGER IF EXISTS anc_plan_versions_transition_guard");
    expect(statement).toContain("DROP COLUMN IF EXISTS plan_version_id");
    expect(statement).toContain("DROP TYPE IF EXISTS anc_plan_kind");
  });
});

describe("phase 2 milestone scheduling migration", () => {
  it("adds append-only schedule transitions with local-date and UTC snapshots", () => {
    const sql = vi.fn();
    milestoneSchedulingMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("CREATE TABLE milestone_schedule_events");
    expect(statement).toContain("milestone_schedule_events_transition_shape");
    expect(statement).toContain("previous_due_date date");
    expect(statement).toContain("scheduled_due_at timestamptz NOT NULL");
    expect(statement).toContain("milestone_schedule_events_append_only");
    expect(statement).toContain("pregnancy_milestones_identity_unique");
  });

  it("provides a reverse migration for the schedule history and identity key", () => {
    const sql = vi.fn();
    milestoneSchedulingMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS milestone_schedule_events");
    expect(statement).toContain("DROP CONSTRAINT IF EXISTS pregnancy_milestones_identity_unique");
    expect(statement).toContain("DROP TYPE IF EXISTS milestone_schedule_action");
  });
});

describe("phase 2 visit confirmation migration", () => {
  it("adds server-controlled source and logical confirmation dedupe", () => {
    const sql = vi.fn();
    visitConfirmationMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("ADD COLUMN confirmation_source text");
    expect(statement).toContain("visit_confirmations_source_valid");
    expect(statement).toContain("visit_confirmations_one_initial_confirm_idx");
    expect(statement).toContain("WHERE action = 'CONFIRM'");
    expect(statement).not.toContain("CREATE TRIGGER visit_confirmations_append_only");
  });

  it("provides a reverse migration for confirmation guards", () => {
    const sql = vi.fn();
    visitConfirmationMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).not.toContain("DROP TRIGGER IF EXISTS visit_confirmations_append_only");
    expect(statement).toContain("DROP INDEX IF EXISTS visit_confirmations_one_initial_confirm_idx");
    expect(statement).toContain("DROP COLUMN IF EXISTS confirmation_source");
  });
});

describe("phase 2 clinical record validation migration", () => {
  it("binds K1-K6 records to supported milestone codes and immutable revisions", () => {
    const sql = vi.fn();
    clinicalRecordValidationMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("k1_k6_records_code_supported");
    expect(statement).toContain("status = 'VALIDATED'");
    expect(statement).toContain("CREATE TABLE k1_k6_record_revisions");
    expect(statement).toContain("k1_k6_record_revisions_record_number_unique");
    expect(statement).toContain("legacy-revision-1");
    expect(statement).toContain("record_validation_status = record.status");
    expect(statement).toContain("k1_k6_record_revisions_append_only");
    expect(statement).toContain("record_validation_events_state_snapshot");
  });

  it("provides an explicit reverse migration", () => {
    const sql = vi.fn();
    clinicalRecordValidationMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS k1_k6_record_revisions");
    expect(statement).toContain("DROP COLUMN IF EXISTS revision_id");
    expect(statement).toContain("DROP COLUMN IF EXISTS milestone_code");
    expect(statement).toContain("pregnancy_milestones_id_code_unique");
  });
});

describe("phase 2 pregnancy close cancellation migration", () => {
  it("adds immutable cancellation snapshots and serializes reminder writes with close", () => {
    const sql = vi.fn();
    pregnancyCloseCancellationMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("CREATE TABLE pregnancy_close_cancellation_events");
    expect(statement).toContain("pregnancy_close_cancellations_snapshot_shape");
    expect(statement).toContain("pregnancy_close_cancellation_events_append_only");
    expect(statement).toContain("anc_guard_reminder_cycle_active_pregnancy");
    expect(statement).toContain("FOR SHARE OF pregnancy");
    expect(statement).toContain("reminder_cycles_active_pregnancy_guard");
  });

  it("provides an explicit reverse migration for every close guard", () => {
    const sql = vi.fn();
    pregnancyCloseCancellationMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TABLE IF EXISTS pregnancy_close_cancellation_events");
    expect(statement).toContain(
      "DROP FUNCTION IF EXISTS anc_guard_reminder_cycle_active_pregnancy",
    );
    expect(statement).toContain("DROP CONSTRAINT IF EXISTS reminder_cycles_identity_unique");
    expect(statement).toContain("DROP TYPE IF EXISTS pregnancy_close_cancellation_target");
  });
});

describe("phase 2 program status migration", () => {
  it("adds governed rule lifecycle and immutable assessment protection", () => {
    const sql = vi.fn();
    programStatusMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("program_rule_versions_complete_requirements");
    expect(statement).toContain("program_rule_requirements_draft_only");
    expect(statement).toContain("program_assessments_append_only");
  });
});

describe("audit remediation migration", () => {
  it("allows distinct field requirements and makes consent history append-only", () => {
    const sql = vi.fn();
    auditRemediationMigration.up({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("(rule_config ->> 'field_key')");
    expect(statement).toContain("NULLS NOT DISTINCT");
    expect(statement).toContain("consent_records_append_only");
    expect(statement).toContain("consent_records is append-only");
  });

  it("provides an explicit reverse migration", () => {
    const sql = vi.fn();
    auditRemediationMigration.down({ sql });
    const statement = sql.mock.calls.map(([value]) => String(value)).join("\n");

    expect(statement).toContain("DROP TRIGGER IF EXISTS consent_records_append_only");
    expect(statement).toContain("DROP FUNCTION IF EXISTS anc_reject_consent_mutation");
    expect(statement).toContain("CREATE UNIQUE INDEX program_rule_requirements_version_unique_idx");
  });
});
