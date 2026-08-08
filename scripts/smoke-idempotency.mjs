import { randomUUID } from "node:crypto";
import {
  IdempotencyKeyConflictError,
  closeDatabasePool,
  createDatabasePool,
  runIdempotentMutation,
} from "@anc/database";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");

const pool = createDatabasePool({
  connectionString: databaseUrl,
  applicationName: "anc-idempotency-smoke",
  max: 4,
});
const suffix = randomUUID().slice(0, 12);
const actorKey = `SYSTEM:SMOKE_${suffix}`;
const operation = "IDEMPOTENCY_SMOKE";
const idempotencyKey = randomUUID();
const resourceId = randomUUID();
const resourceCode = `IDEMP-${suffix}`;
const requestHash = "a".repeat(64);
let executionCount = 0;

async function execute(client) {
  executionCount += 1;
  const result = await client.query(
    `INSERT INTO health_centers (id, code, name)
     VALUES ($1, $2, 'Synthetic Idempotency Smoke')
     RETURNING id, code`,
    [resourceId, resourceCode],
  );
  const value = result.rows[0];
  if (value === undefined) throw new Error("Idempotency smoke mutation returned no resource");
  return { resourceType: "HEALTH_CENTER", resourceId: value.id, value };
}

async function replay(client, resource) {
  const result = await client.query("SELECT id, code FROM health_centers WHERE id = $1", [
    resource.resourceId,
  ]);
  const value = result.rows[0];
  if (value === undefined) throw new Error("Idempotency smoke replay resource is missing");
  return value;
}

const input = { actorKey, operation, idempotencyKey, requestHash };
try {
  const outcomes = await Promise.all([
    runIdempotentMutation(pool, input, execute, replay),
    runIdempotentMutation(pool, input, execute, replay),
  ]);
  const replayFlags = outcomes.map((outcome) => outcome.replayed).sort();
  if (executionCount !== 1 || replayFlags[0] !== false || replayFlags[1] !== true) {
    throw new Error("Concurrent idempotency smoke did not produce one execution and one replay");
  }
  if (outcomes.some((outcome) => outcome.resourceId !== resourceId)) {
    throw new Error("Idempotency smoke returned inconsistent resources");
  }

  try {
    await runIdempotentMutation(pool, { ...input, requestHash: "b".repeat(64) }, execute, replay);
    throw new Error("Conflicting idempotency request was accepted");
  } catch (error) {
    if (!(error instanceof IdempotencyKeyConflictError)) throw error;
  }

  process.stdout.write(
    "Idempotency smoke passed: one concurrent execution, one replay, conflict rejected.\n",
  );
} finally {
  await pool.query(
    `DELETE FROM api_idempotency_records
     WHERE actor_key = $1 AND operation = $2 AND idempotency_key = $3`,
    [actorKey, operation, idempotencyKey],
  );
  await pool.query("DELETE FROM health_centers WHERE id = $1", [resourceId]);
  await closeDatabasePool(pool);
}
