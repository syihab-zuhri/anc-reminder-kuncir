import { randomUUID } from "node:crypto";
import {
  closeDatabasePool,
  createDatabasePool,
  type DatabasePool,
  type TransactionClient,
} from "@anc/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresReportsRepository } from "../src/reports/reports.repository.js";

// Runs the real report SQL against PostgreSQL. CI provides a migrated database through
// DATABASE_URL; without one the suite is skipped. Everything happens inside one transaction that
// is rolled back at the end, so no rows are left behind.
const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(databaseUrl === undefined)("organization report on PostgreSQL", () => {
  let pool: DatabasePool;
  let client: TransactionClient & { readonly release: () => void };
  let healthCenterId: string;
  let villageId: string;

  beforeAll(async () => {
    pool = createDatabasePool({ connectionString: databaseUrl ?? "", applicationName: "api-test" });
    client = await pool.connect();
    await client.query("BEGIN");

    healthCenterId = randomUUID();
    await client.query("INSERT INTO health_centers (id, code, name) VALUES ($1, $2, $3)", [
      healthCenterId,
      `REPORT-TEST-${healthCenterId.slice(0, 8)}`,
      "Synthetic report test center",
    ]);
    villageId = randomUUID();
    await client.query(
      "INSERT INTO villages (id, health_center_id, code, name) VALUES ($1, $2, $3, $4)",
      [villageId, healthCenterId, "REPORT-VILLAGE", "Desa Sintetis"],
    );
    const staffId = randomUUID();
    await client.query(
      `INSERT INTO staff_users (id, health_center_id, role, login_identifier, display_name, password_hash)
       VALUES ($1, $2, 'PUSKESMAS', $3, 'Synthetic operator', 'synthetic-hash')`,
      [staffId, healthCenterId, `report.test.${staffId.slice(0, 8)}`],
    );

    const planId = randomUUID();
    await client.query(
      `INSERT INTO anc_plan_versions (id, version_no, plan_kind, status, source_reference)
       SELECT $1, COALESCE(MAX(version_no), 0) + 1, 'SYNTHETIC', 'DRAFT', 'REPORT_DB_TEST_ONLY'
         FROM anc_plan_versions`,
      [planId],
    );

    // Two mothers in the village with an active pregnancy; the second one is archived.
    for (const archived of [false, true]) {
      const motherId = randomUUID();
      await client.query(
        `INSERT INTO mothers (
           id, health_center_id, village_id, full_name, nik_ciphertext, address, phone_normalized,
           archived_at, archived_by_staff_user_id, archive_reason
         ) VALUES (
           $1, $2, $3, 'Ibu sintetis', 'v1.synthetic.synthetic.synthetic', 'Alamat sintetis',
           '6281200000000', $4, $5, $6
         )`,
        [
          motherId,
          healthCenterId,
          villageId,
          archived ? new Date() : null,
          archived ? staffId : null,
          archived ? "Salah input" : null,
        ],
      );
      await client.query(
        `INSERT INTO pregnancies (
           id, mother_id, health_center_id, dating_basis, dating_date, status, care_plan_version_id
         ) VALUES ($1, $2, $3, 'PREGNANCY_START_DATE', '2026-05-01', 'ACTIVE', $4)`,
        [randomUUID(), motherId, healthCenterId, planId],
      );
    }
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    client.release();
    await closeDatabasePool(pool);
  });

  it("leaves archived mothers out of the totals and the village breakdown", async () => {
    const repository = new PostgresReportsRepository({
      query: (sql: string, params?: unknown[]) => client.query(sql, params),
    } as unknown as DatabasePool);

    const report = await repository.getOrganizationSummary(healthCenterId, new Date());

    expect(report.total_mothers).toBe(1);
    expect(report.total_active_pregnancies).toBe(1);
    expect(report.village_breakdown).toEqual([
      expect.objectContaining({
        village_id: villageId,
        total_mothers: 1,
        active_pregnancies: 1,
      }),
    ]);
  });
});
