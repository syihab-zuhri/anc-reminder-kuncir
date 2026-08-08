import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { DatabasePool } from "@anc/database";
import { DATABASE_POOL, DATABASE_POOL_CLOSE } from "./tokens.js";

export type DatabasePoolClose = (pool: DatabasePool) => Promise<void>;

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  #closed = false;

  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    @Inject(DATABASE_POOL_CLOSE) private readonly closePool: DatabasePoolClose,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    await this.closePool(this.pool);
  }
}
