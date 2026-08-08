import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString: databaseUrl,
  application_name: "anc-phase1-database-verification",
  max: 1,
});

function postgresErrorCode(error) {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return error.code;
}

async function expectPostgresError(client, savepoint, expectedCode, operation) {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await operation();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    if (postgresErrorCode(error) !== expectedCode) throw error;
    return;
  }
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`Expected PostgreSQL error ${expectedCode}`);
}

const client = await pool.connect();
try {
  const tables = await client.query(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])`,
    [["facilities", "staff_sessions", "villages"]],
  );
  if (tables.rowCount !== 3) throw new Error("Required Phase 1 tables are missing");

  const columns = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'staff_sessions'`,
  );
  const columnNames = new Set(columns.rows.map((row) => row.column_name));
  for (const requiredColumn of ["access_token_hash", "refresh_token_hash"]) {
    if (!columnNames.has(requiredColumn)) {
      throw new Error(`Missing session credential hash column: ${requiredColumn}`);
    }
  }
  for (const forbiddenColumn of ["access_token", "refresh_token"]) {
    if (columnNames.has(forbiddenColumn)) {
      throw new Error(`Raw session credential column is forbidden: ${forbiddenColumn}`);
    }
  }

  await client.query("BEGIN");
  const healthCenterA = randomUUID();
  const healthCenterB = randomUUID();
  const villageA = randomUUID();
  await client.query(
    `INSERT INTO health_centers (id, code, name)
     VALUES ($1, $2, 'Synthetic Center A'), ($3, $4, 'Synthetic Center B')`,
    [healthCenterA, `VERIFY-${healthCenterA}`, healthCenterB, `VERIFY-${healthCenterB}`],
  );
  await client.query(
    `INSERT INTO villages (id, health_center_id, code, name)
     VALUES ($1, $2, 'SYNTHETIC-VILLAGE', 'Synthetic Village')`,
    [villageA, healthCenterA],
  );
  await expectPostgresError(client, "same_center_check", "23503", async () => {
    await client.query(
      `INSERT INTO facilities (
         id, health_center_id, village_id, code, name, facility_type
       ) VALUES ($1, $2, $3, 'SYNTHETIC-FACILITY', 'Synthetic Facility', 'POSYANDU')`,
      [randomUUID(), healthCenterB, villageA],
    );
  });

  const auditEventId = randomUUID();
  await client.query(
    `INSERT INTO audit_events (
       id, actor_type, action, resource_type, metadata
     ) VALUES ($1, 'SYSTEM', 'PHASE1_DATABASE_VERIFIED', 'DATABASE', '{}')`,
    [auditEventId],
  );
  await expectPostgresError(client, "append_only_check", "55000", async () => {
    await client.query("UPDATE audit_events SET action = 'MUTATED' WHERE id = $1", [auditEventId]);
  });
  await client.query("ROLLBACK");

  process.stdout.write(
    "Phase 1 database verification passed: schema, hashed credentials, scope FK, append-only audit.\n",
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
