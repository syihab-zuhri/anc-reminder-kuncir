import { closeDatabasePool, createDatabasePool } from "../packages/database/dist/index.js";
import { NikCipher } from "../apps/api/dist/registry/nik-cipher.js";

// Fills mothers.nik_fingerprint for records registered before migration 000021, so the unique
// index "one active record per NIK per health center" covers them too.
//
//   node --env-file=.env scripts/backfill-nik-fingerprints.mjs           # dry run (default)
//   node --env-file=.env scripts/backfill-nik-fingerprints.mjs --apply   # commit the changes
//
// Needs DATABASE_URL and NIK_ENCRYPTION_KEY (the same values the API uses). Oldest records are
// processed first so the earliest registration keeps the slot. A record whose NIK is already held
// by another active record is NOT changed; it is reported by id (never by NIK) for manual
// resolution, e.g. archive the duplicate. Safe to re-run: only rows with a NULL fingerprint are
// touched.

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
const nikKey = process.env.NIK_ENCRYPTION_KEY;
if (databaseUrl === undefined || nikKey === undefined) {
  throw new Error("DATABASE_URL and NIK_ENCRYPTION_KEY are required");
}

const cipher = new NikCipher(nikKey);
const pool = createDatabasePool({ connectionString: databaseUrl, applicationName: "backfill-nik" });
const client = await pool.connect();

const summary = {
  mode: apply ? "apply" : "dry-run",
  examined: 0,
  filled: 0,
  duplicates: [],
  undecryptable: [],
};

try {
  await client.query("BEGIN");
  const { rows } = await client.query(
    `SELECT id, health_center_id, nik_ciphertext, archived_at IS NOT NULL AS archived
       FROM mothers
      WHERE nik_fingerprint IS NULL
      ORDER BY created_at, id
        FOR UPDATE`,
  );

  for (const row of rows) {
    summary.examined += 1;
    let fingerprint;
    try {
      fingerprint = cipher.fingerprint(cipher.decrypt(row.nik_ciphertext));
    } catch {
      summary.undecryptable.push(row.id);
      continue;
    }

    await client.query("SAVEPOINT row_update");
    try {
      await client.query("UPDATE mothers SET nik_fingerprint = $2 WHERE id = $1", [
        row.id,
        fingerprint,
      ]);
      await client.query("RELEASE SAVEPOINT row_update");
      summary.filled += 1;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT row_update");
      if (error?.code !== "23505") throw error;
      const holder = await client.query(
        `SELECT id FROM mothers
          WHERE health_center_id = $1 AND nik_fingerprint = $2 AND archived_at IS NULL
          LIMIT 1`,
        [row.health_center_id, fingerprint],
      );
      summary.duplicates.push({ mother_id: row.id, duplicate_of: holder.rows[0]?.id ?? null });
    }
  }

  await client.query(apply ? "COMMIT" : "ROLLBACK");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!apply) process.stdout.write("Dry run only: nothing was written. Re-run with --apply.\n");
  if (summary.duplicates.length > 0 || summary.undecryptable.length > 0) process.exitCode = 3;
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await closeDatabasePool(pool);
}
