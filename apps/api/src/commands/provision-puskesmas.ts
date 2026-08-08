import { randomUUID } from "node:crypto";
import { loadApiConfig } from "@anc/config";
import { newStaffPasswordSchema } from "@anc/contracts";
import { closeDatabasePool, createDatabasePool } from "@anc/database";
import { z } from "zod";

import { PasswordHasher } from "../auth/password-hasher.js";

const provisionSchema = z
  .object({
    PROVISION_CONFIRM: z.literal("CREATE_INITIAL_PUSKESMAS"),
    PROVISION_HEALTH_CENTER_CODE: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/),
    PROVISION_HEALTH_CENTER_NAME: z.string().trim().min(2).max(160),
    PROVISION_LOGIN_IDENTIFIER: z.string().trim().min(3).max(120),
    PROVISION_DISPLAY_NAME: z.string().trim().min(2).max(160),
    PROVISION_PASSWORD: newStaffPasswordSchema,
  })
  .strict();

async function main(): Promise<void> {
  const config = loadApiConfig();
  const input = provisionSchema.parse({
    PROVISION_CONFIRM: process.env["PROVISION_CONFIRM"],
    PROVISION_HEALTH_CENTER_CODE: process.env["PROVISION_HEALTH_CENTER_CODE"],
    PROVISION_HEALTH_CENTER_NAME: process.env["PROVISION_HEALTH_CENTER_NAME"],
    PROVISION_LOGIN_IDENTIFIER: process.env["PROVISION_LOGIN_IDENTIFIER"],
    PROVISION_DISPLAY_NAME: process.env["PROVISION_DISPLAY_NAME"],
    PROVISION_PASSWORD: process.env["PROVISION_PASSWORD"],
  });
  process.env["PROVISION_PASSWORD"] = "";

  const pool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "anc-provision-puskesmas",
    max: 1,
  });
  const client = await pool.connect();
  const healthCenterId = randomUUID();
  const staffUserId = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `anc-provision:${input.PROVISION_HEALTH_CENTER_CODE}`,
    ]);
    const centerResult = await client.query<{ readonly id: string }>(
      `INSERT INTO health_centers (id, code, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [healthCenterId, input.PROVISION_HEALTH_CENTER_CODE, input.PROVISION_HEALTH_CENTER_NAME],
    );
    const actualHealthCenterId = centerResult.rows[0]?.id;
    if (actualHealthCenterId === undefined) throw new Error("Health center provisioning failed");

    const existingResult = await client.query<{ readonly exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM staff_users
         WHERE health_center_id = $1 AND role = 'PUSKESMAS'
       ) AS exists`,
      [actualHealthCenterId],
    );
    if (existingResult.rows[0]?.exists === true) {
      throw new Error("A Puskesmas staff account already exists for this health center");
    }

    const passwordHash = await new PasswordHasher().hash(input.PROVISION_PASSWORD);
    await client.query(
      `INSERT INTO staff_users (
         id, health_center_id, role, login_identifier, display_name, password_hash
       ) VALUES ($1, $2, 'PUSKESMAS', $3, $4, $5)`,
      [
        staffUserId,
        actualHealthCenterId,
        input.PROVISION_LOGIN_IDENTIFIER.normalize("NFKC").trim().toLocaleLowerCase("id-ID"),
        input.PROVISION_DISPLAY_NAME,
        passwordHash,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         id, actor_type, actor_id, action, resource_type, resource_id, metadata
       ) VALUES ($1, 'SYSTEM', NULL, 'STAFF_USER_PROVISIONED', 'STAFF_USER', $2, $3::jsonb)`,
      [randomUUID(), staffUserId, JSON.stringify({ role: "PUSKESMAS" })],
    );
    await client.query("COMMIT");
    process.stdout.write(
      `${JSON.stringify({ health_center_id: actualHealthCenterId, staff_user_id: staffUserId })}\n`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closeDatabasePool(pool);
  }
}

await main();
