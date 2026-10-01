import { randomUUID } from "node:crypto";
import type { DatabasePool, TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

export interface CreateAnnouncementInput {
  readonly announcementId: string;
  readonly staffUserId: string;
  readonly title: string;
  readonly body: string;
  readonly occurredAt: Date;
}

export interface AnnouncementRecord {
  readonly id: string;
  readonly staffUserId: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
}

export interface AnnouncementWithStats {
  readonly record: AnnouncementRecord;
  readonly staffUsername: string | null;
  readonly totalDevices: number;
  readonly successCount: number;
  readonly failedCount: number;
}

export interface AnnouncementDeliveryInsert {
  readonly announcementId: string;
  readonly deviceId: string;
  readonly status: "SUCCESS" | "FAILED";
  readonly providerMessageId: string | null;
  readonly errorCode: string | null;
  readonly occurredAt: Date;
}

export interface ActiveDevice {
  readonly id: string;
  readonly pushTokenEnvelope: string;
}

/**
 * Every read is scoped to one health center. Announcements carry no center column of
 * their own; they belong to the center of the staff user who sent them, and devices
 * belong to the center of the mother that registered them.
 */
export interface AnnouncementRepository {
  create(client: TransactionClient, input: CreateAnnouncementInput): Promise<AnnouncementRecord>;
  findById(
    client: TransactionClient,
    announcementId: string,
    healthCenterId: string,
  ): Promise<AnnouncementWithStats | null>;
  markSent(announcementId: string, sentAt: Date): Promise<void>;
  listWithStats(healthCenterId: string): Promise<AnnouncementWithStats[]>;
  listActiveDevices(healthCenterId: string): Promise<ActiveDevice[]>;
  recordDeliveries(deliveries: readonly AnnouncementDeliveryInsert[]): Promise<void>;
}

interface AnnouncementRow extends QueryResultRow {
  readonly id: string;
  readonly staff_user_id: string;
  readonly title: string;
  readonly body: string;
  readonly created_at: Date;
  readonly sent_at: Date | null;
}

interface AnnouncementWithStatsRow extends AnnouncementRow {
  readonly staff_username: string | null;
  readonly total_devices: number;
  readonly success_count: number;
  readonly failed_count: number;
}

interface DeviceRow extends QueryResultRow {
  readonly id: string;
  readonly push_token_encrypted: string;
}

const statsSelect = `SELECT
         a.id,
         a.staff_user_id,
         a.title,
         a.body,
         a.created_at,
         a.sent_at,
         su.login_identifier AS staff_username,
         COUNT(ad.id)::int AS total_devices,
         COUNT(ad.id) FILTER (WHERE ad.status = 'SUCCESS')::int AS success_count,
         COUNT(ad.id) FILTER (WHERE ad.status = 'FAILED')::int AS failed_count
       FROM announcements a
       JOIN staff_users su ON su.id = a.staff_user_id
       LEFT JOIN announcement_deliveries ad ON ad.announcement_id = a.id`;

function toAnnouncementRecord(row: AnnouncementRow): AnnouncementRecord {
  return {
    id: row.id,
    staffUserId: row.staff_user_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

function toAnnouncementWithStats(row: AnnouncementWithStatsRow): AnnouncementWithStats {
  return {
    record: toAnnouncementRecord(row),
    staffUsername: row.staff_username,
    totalDevices: row.total_devices,
    successCount: row.success_count,
    failedCount: row.failed_count,
  };
}

export class PostgresAnnouncementRepository implements AnnouncementRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async create(
    client: TransactionClient,
    input: CreateAnnouncementInput,
  ): Promise<AnnouncementRecord> {
    const result = await client.query<AnnouncementRow>(
      `INSERT INTO announcements (id, staff_user_id, title, body, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, staff_user_id, title, body, created_at, sent_at`,
      [input.announcementId, input.staffUserId, input.title, input.body, input.occurredAt],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Announcement insert returned no row");
    return toAnnouncementRecord(row);
  }

  public async findById(
    client: TransactionClient,
    announcementId: string,
    healthCenterId: string,
  ): Promise<AnnouncementWithStats | null> {
    const result = await client.query<AnnouncementWithStatsRow>(
      `${statsSelect}
       WHERE a.id = $1 AND su.health_center_id = $2
       GROUP BY a.id, su.login_identifier`,
      [announcementId, healthCenterId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toAnnouncementWithStats(row);
  }

  public async markSent(announcementId: string, sentAt: Date): Promise<void> {
    await this.pool.query(`UPDATE announcements SET sent_at = $2 WHERE id = $1`, [
      announcementId,
      sentAt,
    ]);
  }

  public async listWithStats(healthCenterId: string): Promise<AnnouncementWithStats[]> {
    const result = await this.pool.query<AnnouncementWithStatsRow>(
      `${statsSelect}
       WHERE su.health_center_id = $1
       GROUP BY a.id, su.login_identifier
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [healthCenterId],
    );
    return result.rows.map(toAnnouncementWithStats);
  }

  public async listActiveDevices(healthCenterId: string): Promise<ActiveDevice[]> {
    const result = await this.pool.query<DeviceRow>(
      `SELECT d.id, d.push_token_encrypted
         FROM devices d
         JOIN mothers m ON m.id = d.mother_id
        WHERE d.platform = 'ANDROID'
          AND d.status = 'ACTIVE'
          AND m.health_center_id = $1
          AND m.archived_at IS NULL
        ORDER BY d.id`,
      [healthCenterId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      pushTokenEnvelope: row.push_token_encrypted,
    }));
  }

  public async recordDeliveries(deliveries: readonly AnnouncementDeliveryInsert[]): Promise<void> {
    if (deliveries.length === 0) return;
    await this.pool.query(
      `INSERT INTO announcement_deliveries
         (id, announcement_id, device_id, status, provider_message_id, error_code, created_at)
       SELECT * FROM unnest(
         $1::uuid[], $2::uuid[], $3::uuid[], $4::announcement_delivery_status[],
         $5::text[], $6::text[], $7::timestamptz[]
       )
       ON CONFLICT (announcement_id, device_id) DO NOTHING`,
      [
        deliveries.map(() => randomUUID()),
        deliveries.map((delivery) => delivery.announcementId),
        deliveries.map((delivery) => delivery.deviceId),
        deliveries.map((delivery) => delivery.status),
        deliveries.map((delivery) => delivery.providerMessageId),
        deliveries.map((delivery) => delivery.errorCode),
        deliveries.map((delivery) => delivery.occurredAt),
      ],
    );
  }
}
