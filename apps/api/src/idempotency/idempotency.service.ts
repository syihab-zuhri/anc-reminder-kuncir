import { createHmac } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type { IdempotencyKey } from "@anc/contracts";
import {
  IdempotencyKeyConflictError,
  runIdempotentMutation,
  type DatabasePool,
  type IdempotencyMutationExecution,
  type IdempotencyResourceReference,
  type IdempotentMutationResult,
  type TransactionClient,
} from "@anc/database";

import type { StaffActor } from "../auth/staff-auth.types.js";
import { ApiException } from "../errors/api.exception.js";
import { API_CONFIG, DATABASE_POOL } from "../infrastructure/tokens.js";

export interface StaffIdempotentMutationInput {
  readonly actor: StaffActor;
  readonly operation: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly requestIdentity: unknown;
}

@Injectable()
export class IdempotencyService {
  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  public async runForStaff<T>(
    input: StaffIdempotentMutationInput,
    execute: (client: TransactionClient) => Promise<IdempotencyMutationExecution<T>>,
    replay: (client: TransactionClient, resource: IdempotencyResourceReference) => Promise<T>,
  ): Promise<IdempotentMutationResult<T>> {
    try {
      return await runIdempotentMutation(
        this.pool,
        {
          actorKey: `STAFF:${input.actor.staffUserId}`,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
          requestHash: createIdempotencyRequestHash(
            this.config.idempotencySecret,
            input.requestIdentity,
          ),
        },
        execute,
        replay,
      );
    } catch (error) {
      if (error instanceof IdempotencyKeyConflictError) {
        throw new ApiException({
          status: HttpStatus.CONFLICT,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Kunci idempotensi telah digunakan untuk permintaan yang berbeda.",
        });
      }
      throw error;
    }
  }
}

export function createIdempotencyRequestHash(secret: string, value: unknown): string {
  return createHmac("sha256", secret).update(stableSerialize(value), "utf8").digest("hex");
}

function stableSerialize(value: unknown): string {
  return serializeValue(value, new WeakSet<object>(), 0);
}

function serializeValue(value: unknown, seen: WeakSet<object>, depth: number): string {
  if (depth > 20) throw new Error("Idempotency request identity exceeds maximum depth");
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Idempotency request identity contains a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error("Idempotency request identity must contain only JSON values");
  }
  if (seen.has(value)) throw new Error("Idempotency request identity must not be circular");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => serializeValue(item, seen, depth + 1)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Idempotency request identity must be a plain object");
    }
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${serializeValue(nested, seen, depth + 1)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}
