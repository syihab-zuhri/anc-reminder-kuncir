import { randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { DatabasePool } from "./pool.js";

const operationPattern = /^[A-Z][A-Z0-9_]{2,63}$/;
const actorKeyPattern = /^[A-Z][A-Z0-9_]*:[A-Za-z0-9._:-]{1,160}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestHashPattern = /^[a-f0-9]{64}$/;
const retryableTransactionCodes = new Set(["40001", "40P01"]);

export type TransactionClient = Pick<PoolClient, "query">;

export interface IdempotencyResourceReference {
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface IdempotencyMutationExecution<T> extends IdempotencyResourceReference {
  readonly value: T;
}

export interface IdempotentMutationInput {
  readonly actorKey: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly maxAttempts?: number;
}

export interface IdempotentMutationResult<T> extends IdempotencyResourceReference {
  readonly replayed: boolean;
  readonly value: T;
}

interface IdempotencyRecordRow extends QueryResultRow {
  readonly request_hash: string;
  readonly result_resource_type: string | null;
  readonly result_resource_id: string | null;
  readonly completed_at: Date | null;
}

export class IdempotencyKeyConflictError extends Error {
  public constructor() {
    super("Idempotency key was already used for a different request");
    this.name = "IdempotencyKeyConflictError";
  }
}

export async function runIdempotentMutation<T>(
  pool: Pick<DatabasePool, "connect">,
  input: IdempotentMutationInput,
  execute: (client: TransactionClient) => Promise<IdempotencyMutationExecution<T>>,
  replay: (client: TransactionClient, resource: IdempotencyResourceReference) => Promise<T>,
): Promise<IdempotentMutationResult<T>> {
  validateInput(input);
  const maxAttempts = input.maxAttempts ?? 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${input.actorKey}:${input.operation}:${input.idempotencyKey}`,
      ]);
      const existing = await findRecord(client, input);

      if (existing !== undefined) {
        if (!requestHashesEqual(existing.request_hash, input.requestHash)) {
          throw new IdempotencyKeyConflictError();
        }
        const resource = completedResource(existing);
        const value = await replay(client, resource);
        await client.query("COMMIT");
        return { ...resource, replayed: true, value };
      }

      const recordId = randomUUID();
      await client.query(
        `INSERT INTO api_idempotency_records (
           id, actor_key, operation, idempotency_key, request_hash
         ) VALUES ($1, $2, $3, $4, $5)`,
        [recordId, input.actorKey, input.operation, input.idempotencyKey, input.requestHash],
      );
      const execution = await execute(client);
      validateResource(execution);
      const completed = await client.query(
        `UPDATE api_idempotency_records
         SET result_resource_type = $2,
             result_resource_id = $3,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND completed_at IS NULL
         RETURNING id`,
        [recordId, execution.resourceType, execution.resourceId],
      );
      if (completed.rowCount !== 1) throw new Error("Idempotency record completion failed");
      await client.query("COMMIT");
      return {
        resourceType: execution.resourceType,
        resourceId: execution.resourceId,
        replayed: false,
        value: execution.value,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (attempt < maxAttempts && isRetryableTransactionError(error)) continue;
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Idempotent transaction attempts exhausted");
}

async function findRecord(
  client: TransactionClient,
  input: IdempotentMutationInput,
): Promise<IdempotencyRecordRow | undefined> {
  const result = await client.query<IdempotencyRecordRow>(
    `SELECT request_hash, result_resource_type, result_resource_id, completed_at
     FROM api_idempotency_records
     WHERE actor_key = $1 AND operation = $2 AND idempotency_key = $3
     LIMIT 1`,
    [input.actorKey, input.operation, input.idempotencyKey],
  );
  return result.rows[0];
}

function completedResource(record: IdempotencyRecordRow): IdempotencyResourceReference {
  if (
    record.completed_at === null ||
    record.result_resource_type === null ||
    record.result_resource_id === null
  ) {
    throw new Error("Committed idempotency record is incomplete");
  }
  return {
    resourceType: record.result_resource_type,
    resourceId: record.result_resource_id,
  };
}

function validateInput(input: IdempotentMutationInput): void {
  if (!actorKeyPattern.test(input.actorKey)) throw new Error("Invalid idempotency actor key");
  if (!operationPattern.test(input.operation)) throw new Error("Invalid idempotency operation");
  if (!uuidPattern.test(input.idempotencyKey)) throw new Error("Invalid idempotency key");
  if (!requestHashPattern.test(input.requestHash)) throw new Error("Invalid request hash");
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error("Idempotency transaction maxAttempts must be between 1 and 5");
  }
}

function validateResource(resource: IdempotencyResourceReference): void {
  if (!operationPattern.test(resource.resourceType)) {
    throw new Error("Invalid idempotency result resource type");
  }
  if (!uuidPattern.test(resource.resourceId)) {
    throw new Error("Invalid idempotency result resource id");
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    retryableTransactionCodes.has(error.code)
  );
}

function requestHashesEqual(left: string, right: string): boolean {
  if (!requestHashPattern.test(left) || !requestHashPattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
