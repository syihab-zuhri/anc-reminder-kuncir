import { randomUUID } from "node:crypto";
import {
  closeDatabasePool,
  createDatabasePool,
  type DatabasePool,
  type TransactionClient,
} from "@anc/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { processReminderCycles } from "../src/reminder-processor.js";

// Runs the real reminder SQL against PostgreSQL. CI provides a migrated database through
// DATABASE_URL; without one the suite is skipped. Everything happens inside one transaction that
// is rolled back at the end, so no rows are left behind and no other test sees them.
const databaseUrl = process.env["DATABASE_URL"];

// Production-shaped K1–K8 windows (weeks of gestation).
const rules = [
  { code: "K1", start: 4, end: 12 },
  { code: "K2", start: 13, end: 24 },
  { code: "K3", start: 25, end: 27 },
  { code: "K4", start: 28, end: 31 },
  { code: "K5", start: 32, end: 35 },
  { code: "K6", start: 36, end: 37 },
  { code: "K7", start: 38, end: 39 },
  { code: "K8", start: 40, end: 42 },
] as const;

const anchor = "2026-06-04";

describe.skipIf(databaseUrl === undefined)("reminder cycle selection on PostgreSQL", () => {
  let pool: DatabasePool;
  let client: TransactionClient & { readonly release: () => void };
  let workerPool: DatabasePool;
  let healthCenterId: string;
  let planId: string;
  const ruleIds = new Map<string, string>();

  beforeAll(async () => {
    pool = createDatabasePool({
      connectionString: databaseUrl ?? "",
      applicationName: "worker-test",
    });
    client = await pool.connect();
    await client.query("BEGIN");
    // The processor opens and commits its own transactions; nest them as savepoints instead.
    workerPool = {
      connect: () =>
        Promise.resolve({
          query: (sql: string, params?: unknown[]) => {
            const statement = sql.trim().replace(/;$/u, "").toUpperCase();
            if (statement === "BEGIN") return client.query("SAVEPOINT reminder_tick");
            if (statement === "COMMIT") return client.query("RELEASE SAVEPOINT reminder_tick");
            if (statement === "ROLLBACK") {
              return client.query("ROLLBACK TO SAVEPOINT reminder_tick");
            }
            return client.query(sql, params);
          },
          release: () => undefined,
        }),
    } as unknown as DatabasePool;

    healthCenterId = randomUUID();
    await client.query("INSERT INTO health_centers (id, code, name) VALUES ($1, $2, $3)", [
      healthCenterId,
      `REMINDER-TEST-${healthCenterId.slice(0, 8)}`,
      "Synthetic reminder test center",
    ]);
    planId = randomUUID();
    await client.query(
      `INSERT INTO anc_plan_versions (id, version_no, plan_kind, status, source_reference)
       SELECT $1, COALESCE(MAX(version_no), 0) + 1, 'SYNTHETIC', 'DRAFT', 'REMINDER_DB_TEST_ONLY'
         FROM anc_plan_versions`,
      [planId],
    );
    for (const rule of rules) {
      const id = randomUUID();
      ruleIds.set(rule.code, id);
      const policy =
        rule.code === "K8"
          ? { category: "DELIVERY", facility: "PONED_OR_RS_REQUIRED", types: ["PONED", "HOSPITAL"] }
          : ["K1", "K4", "K5"].includes(rule.code)
            ? { category: "ANC", facility: "PUSKESMAS_REQUIRED", types: ["PUSKESMAS"] }
            : { category: "ANC", facility: "FLEXIBLE", types: ["PUSKESMAS"] };
      await client.query(
        `INSERT INTO anc_milestone_rules (
           id, plan_version_id, code, trimester_label, target_week_start, target_week_end,
           milestone_category, required_facility_policy, allowed_facility_types,
           reminder_enabled, reminder_interval_days
         ) VALUES ($1, $2, $3, 'SYNTHETIC', $4, $5, $6, $7, $8::jsonb, true, 3)`,
        [
          id,
          planId,
          rule.code,
          rule.start,
          rule.end,
          policy.category,
          policy.facility,
          JSON.stringify(policy.types),
        ],
      );
    }
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    client.release();
    await closeDatabasePool(pool);
  });

  async function mother(
    name: string,
    weeksAtAnchor: number,
    options: { readonly k1DueOffsetDays?: number } = {},
  ): Promise<{ readonly motherId: string; readonly milestoneIds: Map<string, string> }> {
    const motherId = randomUUID();
    const pregnancyId = randomUUID();
    await client.query(
      `INSERT INTO mothers (id, health_center_id, full_name, nik_ciphertext, address, phone_normalized)
       VALUES ($1, $2, $3, 'v1.synthetic.synthetic.synthetic', 'Alamat sintetis', '6281200000000')`,
      [motherId, healthCenterId, name],
    );
    await client.query(
      `INSERT INTO pregnancies (
         id, mother_id, health_center_id, dating_basis, dating_date, status, care_plan_version_id
       ) VALUES ($1, $2, $3, 'PREGNANCY_START_DATE', $4::date - $5::int, 'ACTIVE', $6)`,
      [pregnancyId, motherId, healthCenterId, anchor, weeksAtAnchor * 7, planId],
    );
    const milestoneIds = new Map<string, string>();
    for (const rule of rules) {
      const id = randomUUID();
      milestoneIds.set(rule.code, id);
      const dueOffset = rule.code === "K1" ? options.k1DueOffsetDays : undefined;
      await client.query(
        `INSERT INTO pregnancy_milestones (
           id, pregnancy_id, rule_id, plan_version_id, code, due_at, visit_status, record_validation_status
         ) VALUES (
           $1, $2, $3, $4, $5,
           CASE WHEN $6::int IS NULL THEN NULL
                ELSE (($7::date + $6::int)::timestamp + interval '9 hours') AT TIME ZONE 'Asia/Jakarta'
           END,
           'UPCOMING', $8
         )`,
        [
          id,
          pregnancyId,
          ruleIds.get(rule.code),
          planId,
          rule.code,
          dueOffset ?? null,
          anchor,
          rule.code === "K7" || rule.code === "K8" ? "NOT_REQUIRED" : "INCOMPLETE",
        ],
      );
    }
    await client.query(
      `INSERT INTO consent_records (id, mother_id, purpose, status, source, recorded_at)
       VALUES ($1, $2, 'REMINDER', 'GRANTED', 'STAFF_REGISTRATION', now())`,
      [randomUUID(), motherId],
    );
    return { motherId, milestoneIds };
  }

  function day(offset: number): string {
    const date = new Date(`${anchor}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  async function remindedCodes(motherId: string): Promise<string[]> {
    const { rows } = await client.query<{ readonly code: string; readonly anchor_day: string }>(
      `SELECT pm.code::text AS code,
              to_char(rc.cycle_anchor_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS anchor_day
         FROM reminder_cycles rc
         JOIN pregnancy_milestones pm ON pm.id = rc.milestone_id
         JOIN pregnancies p ON p.id = pm.pregnancy_id
        WHERE p.mother_id = $1
        ORDER BY rc.cycle_anchor_at, pm.code`,
      [motherId],
    );
    return rows.map((row) => `${row.code}@${row.anchor_day}`);
  }

  it("reminds the visit whose window is open, skips windows that already passed, and spaces cycles exactly 3 days apart", async () => {
    const early = await mother("Ibu minggu 5", 5);
    const late = await mother("Ibu terdaftar minggu 22", 22);
    const notYet = await mother("Ibu minggu 3", 3);
    const pastTerm = await mother("Ibu minggu 43", 43);
    const appointment = await mother("Ibu dengan janji K1", 9, { k1DueOffsetDays: 5 });

    for (const offset of [0, 1, 2, 3]) {
      await processReminderCycles(workerPool, day(offset), {
        intervalDays: 3,
        timezone: "Asia/Jakarta",
      });
      if (offset === 0) {
        // Without an Android device each cycle becomes a WhatsApp task. Close the late mother's
        // task so her next cycle can be created; the early mother's task stays open.
        await client.query(
          `UPDATE wa_fallback_actions wf SET status = 'SKIPPED'
             FROM reminder_cycles rc JOIN pregnancy_milestones pm ON pm.id = rc.milestone_id
            WHERE rc.id = wf.reminder_cycle_id AND pm.id = $1`,
          [late.milestoneIds.get("K2")],
        );
      }
    }

    // Window open: K1 (weeks 4–12) on day 0; the open WhatsApp task blocks a second cycle.
    expect(await remindedCodes(early.motherId)).toEqual([`K1@${day(0)}`]);
    // Registered at week 22: K2 is open, K1 passed. Cycles exactly 3 days apart.
    expect(await remindedCodes(late.motherId)).toEqual([`K2@${day(0)}`, `K2@${day(3)}`]);
    // No window open yet, and every window already passed.
    expect(await remindedCodes(notYet.motherId)).toEqual([]);
    expect(await remindedCodes(pastTerm.motherId)).toEqual([]);
    // An explicit appointment in 5 days is reminded during the 3 days before it, not earlier.
    expect(await remindedCodes(appointment.motherId)).toEqual([`K1@${day(2)}`]);

    const { rows } = await client.query<{ readonly open_tasks: number }>(
      `SELECT count(*)::int AS open_tasks
         FROM wa_fallback_actions
        WHERE mother_id = $1 AND status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')`,
      [early.motherId],
    );
    expect(rows[0]?.open_tasks).toBe(1);
  });
});
