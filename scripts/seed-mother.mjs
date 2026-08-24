import { createDatabasePool } from "../packages/database/dist/index.js";
import { PasswordHasher } from "../apps/api/dist/auth/password-hasher.js";
import crypto from "node:crypto";

async function seedMother() {
  const databaseUrl =
    process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/anc_posyandu_kuncir";
  const pool = createDatabasePool(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check health center and active plan
    const hcRes = await client.query("SELECT id FROM health_centers WHERE code = $1", [
      "PKM_KUNCIR",
    ]);
    const hcId = hcRes.rows[0].id;

    const vRes = await client.query("SELECT id FROM villages WHERE code = $1", ["DS_KUNCIR"]);
    const villageId = vRes.rows[0].id;

    const planRes = await client.query("SELECT id FROM anc_plan_versions WHERE status = $1", [
      "ACTIVE",
    ]);
    const planId = planRes.rows[0].id;

    // Check if mother already exists
    const motherCheck = await client.query(
      "SELECT id, full_name FROM mothers WHERE full_name = $1",
      ["Siti Aminah"],
    );
    let motherId = motherCheck.rows[0]?.id;

    if (!motherId) {
      motherId = crypto.randomUUID();
      // Dummy encrypted NIK
      const dummyNikCipher = Buffer.from("DUMMY_ENCRYPTED_NIK_3518012345670001").toString("base64");

      await client.query(
        `INSERT INTO mothers (id, health_center_id, village_id, full_name, nik_ciphertext, address, phone_normalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          motherId,
          hcId,
          villageId,
          "Siti Aminah",
          dummyNikCipher,
          "Dusun Krajan RT 02 RW 01, Desa Kuncir",
          "081234567890",
        ],
      );

      // Pregnancy: HPHT = 18 weeks ago (e.g. 2026-04-10)
      const pregnancyId = crypto.randomUUID();
      await client.query(
        `INSERT INTO pregnancies (id, mother_id, health_center_id, dating_basis, dating_date, estimated_due_date, status, care_plan_version_id)
         VALUES ($1, $2, $3, 'PREGNANCY_START_DATE', '2026-04-10', '2027-01-15', 'ACTIVE', $4)`,
        [pregnancyId, motherId, hcId, planId],
      );

      // Milestone schedule
      const rules = await client.query(
        "SELECT id, code, target_week_start, target_week_end FROM anc_milestone_rules WHERE plan_version_id = $1",
        [planId],
      );
      for (const r of rules.rows) {
        const msId = crypto.randomUUID();
        await client.query(
          `INSERT INTO pregnancy_milestones (id, pregnancy_id, plan_version_id, rule_id, code, visit_status, due_at)
           VALUES ($1, $2, $3, $4, $5, 'UPCOMING', now() + interval '14 days')`,
          [msId, pregnancyId, planId, r.id, r.code],
        );
      }
      console.log("Mother & active pregnancy created: Siti Aminah");
    }

    // Mother access credential (Crockford Base32 format: ANC-2345-6789-ABCD-EFGH)
    const accessCodePlaintext = "ANC-2345-6789-ABCD-EFGH";
    const motherSecret = "dev_mother_session_secret_key_at_least_32_chars";

    const hasher = new PasswordHasher();
    const scryptHash = await hasher.hash(accessCodePlaintext);

    // HMAC credential lookup hash
    const lookupHash = crypto
      .createHmac("sha256", motherSecret)
      .update(`anc-mother:credential-lookup\0${accessCodePlaintext}`, "utf8")
      .digest("hex");

    const staffRes = await client.query("SELECT id FROM staff_users WHERE login_identifier = $1", [
      "petugas.kuncir",
    ]);
    const authorId = staffRes.rows[0].id;

    await client.query(
      "UPDATE mother_access_credentials SET status = 'REVOKED', revoked_at = now(), revoked_by_staff_id = $2, revocation_reason = 'SEED_REPLACE_DEMO' WHERE mother_id = $1 AND status = 'ACTIVE'",
      [motherId, authorId],
    );

    await client.query(
      `INSERT INTO mother_access_credentials (id, mother_id, code_hash, code_lookup_hash, status, issued_at, issued_by_staff_id)
       VALUES ($1, $2, $3, $4, 'ACTIVE', now(), $5)`,
      [crypto.randomUUID(), motherId, scryptHash, lookupHash, authorId],
    );

    await client.query("COMMIT");
    console.log("Mother access credential issued successfully!");
    console.log("Nama Lengkap : Siti Aminah");
    console.log("Kode Akses   : " + accessCodePlaintext);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed Mother Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

seedMother();
