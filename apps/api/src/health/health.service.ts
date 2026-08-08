import { Inject, Injectable, HttpStatus } from "@nestjs/common";
import type { DatabasePool, DatabaseReadiness } from "@anc/database";
import { ApiException } from "../errors/api.exception.js";
import { DATABASE_POOL, DATABASE_READINESS_CHECK } from "../infrastructure/tokens.js";

export type DatabaseReadinessCheck = (pool: DatabasePool) => Promise<DatabaseReadiness>;

export interface LivenessResponse {
  readonly status: "ok";
}

export interface ReadinessResponse {
  readonly status: "ready";
  readonly checks: {
    readonly database: "up";
  };
}

@Injectable()
export class HealthService {
  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    @Inject(DATABASE_READINESS_CHECK)
    private readonly checkDatabase: DatabaseReadinessCheck,
  ) {}

  public liveness(): LivenessResponse {
    return { status: "ok" };
  }

  public async readiness(): Promise<ReadinessResponse> {
    try {
      const database = await this.checkDatabase(this.pool);
      if (!database.ready) {
        throw new Error("Database readiness check reported unavailable");
      }

      return {
        status: "ready",
        checks: { database: "up" },
      };
    } catch {
      throw new ApiException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Layanan sementara tidak tersedia.",
        details: { database: "unavailable" },
      });
    }
  }
}
