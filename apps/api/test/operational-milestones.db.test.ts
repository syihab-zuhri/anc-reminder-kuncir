import { randomUUID } from "node:crypto";
import type { VisitStatus } from "@anc/contracts";
import {
  closeDatabasePool,
  createDatabasePool,
  type DatabasePool,
  type TransactionClient,
} from "@anc/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { PostgresOperationalQueriesRepository } from "../src/operational-queries/operational-queries.repository.js";

// Runs the real operational milestone SQL against PostgreSQL. CI provides a migrated database
// through DATABASE_URL; without one the suite is skipped. Everything happens inside one
// transaction that is rolled back at the end.
const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(databaseUrl === undefined)("operational milestone status on PostgreSQL", () => {
  let pool: DatabasePool;
  let client: TransactionClient & { readonly release: () => void };
  let repository: PostgresOperationalQueriesRepository;
  let actor: StaffActor;

  beforeAll(async () => {
    pool = createDatabasePool({ connectionString: databaseUrl ?? "", applicationName: "api-test" });
    client = await pool.connect();
    await client.query("BEGIN");
    repository = new PostgresOperationalQueriesRepository({
      query: (sql: string, params?: unknown[]) => client.query(sql, params),
    } as unknown as DatabasePool);

    const healthCenterId = randomUUID();
    await client.query("INSERT INTO health_centers (id, code, name) VALUES ($1, $2, $3)", [
      healthCenterId,
      `OPS-TEST-${healthCenterId.slice(0, 8)}`,
      "Synthetic operational test center",
    ]);
    actor = {
      staffUserId: randomUUID(),
      sessionId: randomUUID(),
      healthCenterId,
      displayName: "Synthetic operator",
      role: "PUSKESMAS",
      status: "ACTIVE",
      assignments: [],
    };

    const planId = randomUUID();
    await client.query(
      `INSERT INTO anc_plan_versions (id, version_no, plan_kind, status, source_reference)
       SELECT $1, COALESCE(MAX(version_no), 0) + 1, 'SYNTHETIC', 'DRAFT', 'OPS_DB_TEST_ONLY'
         FROM anc_plan_versions`,
      [planId],
    );
    const motherId = randomUUID();
    await client.query(
      `INSERT INTO mothers (id, health_center_id, full_name, nik_ciphertext, address, phone_normalized)
       VALUES ($1, $2, 'Ibu sintetis', 'v1.synthetic.synthetic.synthetic', 'Alamat sintetis', '6281200000000')`,
      [motherId, healthCenterId],
    );
    // Dated 2026-05-01 but registered on 2026-08-15, in week 15.
    const pregnancyId = randomUUID();
    await client.query(
      `INSERT INTO pregnancies (
         id, mother_id, health_center_id, dating_basis, dating_date, status, care_plan_version_id,
         created_at
       ) VALUES ($1, $2, $3, 'PREGNANCY_START_DATE', '2026-05-01', 'ACTIVE', $4,
                 '2026-08-15T03:00:00Z')`,
      [pregnancyId, motherId, healthCenterId, planId],
    );
    for (const [code, start, end] of [
      ["K1", 4, 12],
      ["K2", 13, 24],
      ["K3", 25, 27],
    ] as const) {
      const ruleId = randomUUID();
      await client.query(
        `INSERT INTO anc_milestone_rules (
           id, plan_version_id, code, trimester_label, target_week_start, target_week_end,
           milestone_category, required_facility_policy, allowed_facility_types,
           reminder_enabled, reminder_interval_days
         ) VALUES ($1, $2, $3, 'SYNTHETIC', $4, $5, 'ANC', $6, '["PUSKESMAS"]'::jsonb, true, 3)`,
        [ruleId, planId, code, start, end, code === "K1" ? "PUSKESMAS_REQUIRED" : "FLEXIBLE"],
      );
      await client.query(
        `INSERT INTO pregnancy_milestones (
           id, pregnancy_id, rule_id, plan_version_id, code, visit_status, record_validation_status
         ) VALUES ($1, $2, $3, $4, $5, 'UPCOMING', 'INCOMPLETE')`,
        [randomUUID(), pregnancyId, ruleId, planId, code],
      );
    }
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    client.release();
    await closeDatabasePool(pool);
  });

  async function statuses(status?: VisitStatus): Promise<string[]> {
    const result = await repository.findOperationalMilestones(
      actor,
      { limit: 20, ...(status === undefined ? {} : { status }) },
      // 2026-11-01: K1 closed 2026-07-30 (before registration), K2 closed 2026-10-22 (after it),
      // K3 runs 2026-10-23 to 2026-11-12.
      new Date("2026-11-01T03:00:00Z"),
      "Asia/Jakarta",
    );
    return result.items.map((item) => `${item.milestone_code}:${item.visit_status}`);
  }

  it("matches the TypeScript rule: visits closed before registration are not overdue", async () => {
    expect(await statuses()).toEqual(["K1:BEFORE_REGISTRATION", "K2:OVERDUE", "K3:DUE"]);
  });

  it("filters on the derived status, including the one that is never stored", async () => {
    expect(await statuses("BEFORE_REGISTRATION")).toEqual(["K1:BEFORE_REGISTRATION"]);
    expect(await statuses("OVERDUE")).toEqual(["K2:OVERDUE"]);
  });
});
