import { Pool, type PoolConfig, type QueryResultRow } from "pg";

export type DatabasePool = Pool;

export interface DatabasePoolConfig {
  readonly connectionString: string;
  readonly applicationName?: string;
  readonly max?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
}

export type DatabaseReadinessReason = "UNEXPECTED_RESULT" | "QUERY_FAILED";

export interface DatabaseReadiness {
  readonly ready: boolean;
  readonly checkedAt: string;
  readonly latencyMs: number;
  readonly reason?: DatabaseReadinessReason;
}

interface ReadinessRow extends QueryResultRow {
  readonly ready: number;
}

function toPoolConfig(configOrUrl: DatabasePoolConfig | string): PoolConfig {
  if (typeof configOrUrl === "string") {
    return { connectionString: configOrUrl };
  }

  return {
    connectionString: configOrUrl.connectionString,
    ...(configOrUrl.applicationName === undefined
      ? {}
      : { application_name: configOrUrl.applicationName }),
    ...(configOrUrl.max === undefined ? {} : { max: configOrUrl.max }),
    ...(configOrUrl.idleTimeoutMillis === undefined
      ? {}
      : { idleTimeoutMillis: configOrUrl.idleTimeoutMillis }),
    ...(configOrUrl.connectionTimeoutMillis === undefined
      ? {}
      : { connectionTimeoutMillis: configOrUrl.connectionTimeoutMillis }),
  };
}

export function createDatabasePool(configOrUrl: DatabasePoolConfig | string): DatabasePool {
  return new Pool(toPoolConfig(configOrUrl));
}

export async function checkDatabaseReadiness(
  pool: Pick<DatabasePool, "query">,
): Promise<DatabaseReadiness> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const result = await pool.query<ReadinessRow>("SELECT 1::int AS ready");
    if (result.rows[0]?.ready !== 1) {
      return {
        ready: false,
        checkedAt,
        latencyMs: Date.now() - startedAt,
        reason: "UNEXPECTED_RESULT",
      };
    }

    return {
      ready: true,
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      ready: false,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      reason: "QUERY_FAILED",
    };
  }
}

export async function closeDatabasePool(pool: Pick<DatabasePool, "end">): Promise<void> {
  await pool.end();
}
