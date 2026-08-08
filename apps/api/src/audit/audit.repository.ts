import { randomUUID } from "node:crypto";
import type { DatabasePool } from "@anc/database";

export interface AuditEventRecord {
  readonly actorType: "STAFF" | "SYSTEM" | "PUBLIC";
  readonly actorId: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly createdAt: Date;
}

export interface AuditRepository {
  append(event: AuditEventRecord): Promise<void>;
}

export class PostgresAuditRepository implements AuditRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async append(event: AuditEventRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (
         id, actor_type, actor_id, action, resource_type, resource_id, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        randomUUID(),
        event.actorType,
        event.actorId,
        event.action,
        event.resourceType,
        event.resourceId,
        JSON.stringify(event.metadata),
        event.createdAt,
      ],
    );
  }
}
