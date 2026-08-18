import { createDatabasePool } from "../packages/database/dist/index.js";
import { PasswordHasher } from "../apps/api/dist/auth/password-hasher.js";
import crypto from "node:crypto";

async function seedData() {
  const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/anc_posyandu_kuncir";
  const pool = createDatabasePool(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Get health center
    const hcRes = await client.query("SELECT id FROM health_centers WHERE code = $1", ["PKM_KUNCIR"]);
    const hcId = hcRes.rows[0].id;
    
    // 1. Village
    const villageId = crypto.randomUUID();
    const vRes = await client.query(
      "INSERT INTO villages (id, health_center_id, code, name, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (health_center_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id",
      [villageId, hcId, "DS_KUNCIR", "Desa Kuncir", "ACTIVE"]
    );
    const actualVillageId = vRes.rows[0].id;
    
    // 2. Facility (Posyandu)
    const facilityId = crypto.randomUUID();
    await client.query(
      "INSERT INTO facilities (id, health_center_id, village_id, code, name, facility_type, status) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (health_center_id, code) DO UPDATE SET name = EXCLUDED.name",
      [facilityId, hcId, actualVillageId, "POS_MELATI_01", "Posyandu Melati 01", "POSYANDU", "ACTIVE"]
    );
    
    // 3. Bidan User
    const bidanId = crypto.randomUUID();
    const hasher = new PasswordHasher();
    const bidanHash = await hasher.hash("PosyanduKuncir2026!");
    const bidanRes = await client.query(
      "INSERT INTO staff_users (id, health_center_id, role, login_identifier, display_name, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (login_identifier) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id",
      [bidanId, hcId, "BIDAN", "bidan.kuncir", "Bidan Siti Rahayu, A.Md.Keb.", bidanHash, "ACTIVE"]
    );
    const actualBidanId = bidanRes.rows[0].id;
    
    // 4. Assign Bidan to Village
    const existingAssignment = await client.query(
      "SELECT id FROM staff_assignments WHERE staff_user_id = $1 AND scope_type = 'AREA' AND scope_id = $2 AND revoked_at IS NULL",
      [actualBidanId, actualVillageId]
    );
    if (existingAssignment.rows.length === 0) {
      await client.query(
        "INSERT INTO staff_assignments (id, staff_user_id, scope_type, scope_id) VALUES ($1, $2, $3, $4)",
        [crypto.randomUUID(), actualBidanId, "AREA", actualVillageId]
      );
    }

    // 5. Active Clinical Plan (K1 - K8)
    const existingPlan = await client.query("SELECT id FROM anc_plan_versions WHERE status = $1", ["ACTIVE"]);
    if (existingPlan.rows.length === 0) {
      const planId = crypto.randomUUID();
      const staffRes = await client.query("SELECT id FROM staff_users WHERE login_identifier = $1", ["petugas.kuncir"]);
      const authorId = staffRes.rows[0].id;
      
      await client.query(
        `INSERT INTO anc_plan_versions (id, version_no, status, plan_kind, source_reference, created_by)
         VALUES ($1, 1, 'DRAFT', 'CLINICAL', 'Kemenkes RI Standar Pelayanan Antenatal Care Terpadu', $2)`,
        [planId, authorId]
      );
      
      const milestones = [
        { code: "K1", tri: "Trimester 1", s: 4, e: 12, cat: "ANC", pol: "PUSKESMAS_REQUIRED", fac: JSON.stringify(["PUSKESMAS"]) },
        { code: "K2", tri: "Trimester 2", s: 13, e: 24, cat: "ANC", pol: "FLEXIBLE", fac: JSON.stringify(["POSYANDU", "PUSKESMAS", "MIDWIFE_PRACTICE"]) },
        { code: "K3", tri: "Trimester 2", s: 25, e: 27, cat: "ANC", pol: "FLEXIBLE", fac: JSON.stringify(["POSYANDU", "PUSKESMAS", "MIDWIFE_PRACTICE"]) },
        { code: "K4", tri: "Trimester 3", s: 28, e: 31, cat: "ANC", pol: "PUSKESMAS_REQUIRED", fac: JSON.stringify(["PUSKESMAS"]) },
        { code: "K5", tri: "Trimester 3", s: 32, e: 35, cat: "ANC", pol: "PUSKESMAS_REQUIRED", fac: JSON.stringify(["PUSKESMAS"]) },
        { code: "K6", tri: "Trimester 3", s: 36, e: 37, cat: "ANC", pol: "FLEXIBLE", fac: JSON.stringify(["POSYANDU", "PUSKESMAS", "MIDWIFE_PRACTICE"]) },
        { code: "K7", tri: "Trimester 3", s: 38, e: 39, cat: "ANC", pol: "FLEXIBLE", fac: JSON.stringify(["POSYANDU", "PUSKESMAS", "MIDWIFE_PRACTICE"]) },
        { code: "K8", tri: "Trimester 3", s: 40, e: 42, cat: "DELIVERY", pol: "PONED_OR_RS_REQUIRED", fac: JSON.stringify(["PONED", "HOSPITAL"]) },
      ];
      
      for (const m of milestones) {
        await client.query(
          `INSERT INTO anc_milestone_rules (id, plan_version_id, code, trimester_label, target_week_start, target_week_end, milestone_category, required_facility_policy, allowed_facility_types, reminder_enabled, reminder_interval_days)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, true, 3)`,
          [crypto.randomUUID(), planId, m.code, m.tri, m.s, m.e, m.cat, m.pol, m.fac]
        );
      }

      await client.query(
        `UPDATE anc_plan_versions
         SET status = 'APPROVED',
             effective_from = '2026-01-01',
             approved_by = $2,
             approved_at = now(),
             approval_reference = 'SK Kepala Puskesmas Kuncir No. 01/ANC/2026'
         WHERE id = $1`,
        [planId, authorId]
      );

      await client.query(
        `UPDATE anc_plan_versions
         SET status = 'ACTIVE',
             activated_at = now()
         WHERE id = $1`,
        [planId]
      );

      console.log("Active clinical plan K1-K8 seeded!");
    }
    
    await client.query("COMMIT");
    console.log("Sample village, posyandu, bidan account, and ANC plan seeded successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

seedData();
