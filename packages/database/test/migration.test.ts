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
