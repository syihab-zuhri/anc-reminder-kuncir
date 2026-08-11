import { randomUUID } from "node:crypto";
import { loadApiConfig } from "@anc/config";
import { closeDatabasePool, createDatabasePool } from "@anc/database";
import { z } from "zod";

const designationSchema = z
  .object({
    CLINICAL_OWNER_CONFIRM: z.literal("CHANGE_CLINICAL_PROGRAM_OWNER"),
    CLINICAL_OWNER_HEALTH_CENTER_CODE: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/u),
    CLINICAL_OWNER_LOGIN_IDENTIFIER: z.string().trim().min(3).max(120),
    CLINICAL_OWNER_ENABLED: z.enum(["true", "false"]),
    CLINICAL_OWNER_REASON: z.string().trim().min(5).max(200),
  })
  .strict();

interface TargetStaffRow {
  readonly id: string;
  readonly current_value: boolean;
  readonly status: "ACTIVE" | "DISABLED" | "LOCKED";
}

async function main(): Promise<void> {
  const config = loadApiConfig();
  const input = designationSchema.parse({
    CLINICAL_OWNER_CONFIRM: process.env["CLINICAL_OWNER_CONFIRM"],
    CLINICAL_OWNER_HEALTH_CENTER_CODE: process.env["CLINICAL_OWNER_HEALTH_CENTER_CODE"],
    CLINICAL_OWNER_LOGIN_IDENTIFIER: process.env["CLINICAL_OWNER_LOGIN_IDENTIFIER"],
    CLINICAL_OWNER_ENABLED: process.env["CLINICAL_OWNER_ENABLED"],
    CLINICAL_OWNER_REASON: process.env["CLINICAL_OWNER_REASON"],
  });
  const enabled = input.CLINICAL_OWNER_ENABLED === "true";
  const loginIdentifier = input.CLINICAL_OWNER_LOGIN_IDENTIFIER.normalize("NFKC")
    .trim()
    .toLocaleLowerCase("id-ID");

  const pool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "anc-set-clinical-program-owner",
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `anc-clinical-owner:${input.CLINICAL_OWNER_HEALTH_CENTER_CODE}:${loginIdentifier}`,
    ]);
    const targetResult = await client.query<TargetStaffRow>(
      `SELECT staff.id,
              staff.clinical_program_owner AS current_value,
              staff.status
         FROM staff_users AS staff
         JOIN health_centers AS center ON center.id = staff.health_center_id
        WHERE center.code = $1
          AND lower(staff.login_identifier) = lower($2)
          AND staff.role = 'PUSKESMAS'
        FOR UPDATE`,
      [input.CLINICAL_OWNER_HEALTH_CENTER_CODE, loginIdentifier],
    );
    const target = targetResult.rows[0];
    if (target === undefined) {
      throw new Error("Matching Puskesmas staff account was not found");
    }
    if (enabled && target.status !== "ACTIVE") {
      throw new Error("Clinical program owner can only be granted to an active account");
    }

    const changed = target.current_value !== enabled;
    if (changed) {
      await client.query(
        `UPDATE staff_users
            SET clinical_program_owner = $2,
                updated_at = now()
          WHERE id = $1`,
        [target.id, enabled],
      );
      await client.query(
        `INSERT INTO audit_events (
           id, actor_type, actor_id, action, resource_type, resource_id, metadata
         ) VALUES ($1, 'SYSTEM', NULL, $2, 'STAFF_USER', $3, $4::jsonb)`,
        [
          randomUUID(),
          enabled ? "CLINICAL_PROGRAM_OWNER_GRANTED" : "CLINICAL_PROGRAM_OWNER_REVOKED",
          target.id,
          JSON.stringify({
            reason: input.CLINICAL_OWNER_REASON,
            role: "CLINICAL_PROGRAM_OWNER",
          }),
        ],
      );
    }
    await client.query("COMMIT");
    process.stdout.write(
      `${JSON.stringify({ staff_user_id: target.id, clinical_program_owner: enabled, changed })}\n`,
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
