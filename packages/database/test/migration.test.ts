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
