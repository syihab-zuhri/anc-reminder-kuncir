import { randomUUID } from "node:crypto";
import type { DatabasePool } from "@anc/database";

export interface CreateAnnouncementInput {
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

export interface AnnouncementRepository {
  create(input: CreateAnnouncementInput): Promise<AnnouncementRecord>;
  markSent(id: string, sentAt: Date): Promise<void>;
  listWithStats(): Promise<AnnouncementWithStats[]>;
  listActiveDevices(): Promise<ActiveDevice[]>;
  recordDelivery(input: AnnouncementDeliveryInsert): Promise<void>;
}

interface AnnouncementRow {
  readonly id: string;
  readonly staff_user_id: string;
  readonly staff_username: string | null;
  readonly title: string;
  readonly body: string;
  readonly created_at: Date;
  readonly sent_at: Date | null;
}

interface AnnouncementWithStatsRow extends AnnouncementRow {
  readonly total_devices: number;
  readonly success_count: number;
  readonly failed_count: number;
}

interface DeviceRow {
  readonly id: string;
  readonly push_token_encrypted: string;
}

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

export class PostgresAnnouncementRepository implements AnnouncementRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async create(input: CreateAnnouncementInput): Promise<AnnouncementRecord> {
    const result = await this.pool.query<AnnouncementRow>(
      `INSERT INTO announcements (id, staff_user_id, title, body, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, staff_user_id, title, body, created_at, sent_at`,
      [randomUUID(), input.staffUserId, input.title, input.body, input.occurredAt],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Announcement insert returned no row");
    return toAnnouncementRecord(row);
  }

  public async markSent(id: string, sentAt: Date): Promise<void> {
    await this.pool.query(`UPDATE announcements SET sent_at = $2 WHERE id = $1`, [id, sentAt]);
  }

  public async listWithStats(): Promise<AnnouncementWithStats[]> {
    const result = await this.pool.query<AnnouncementWithStatsRow>(
      `SELECT
         a.id,
         a.staff_user_id,
         a.title,
         a.body,
         a.created_at,
         a.sent_at,
         su.login_identifier AS staff_username,
         COUNT(ad.id) FILTER (WHERE ad.id IS NOT NULL)::int AS total_devices,
         COUNT(ad.id) FILTER (WHERE ad.status = 'SUCCESS')::int AS success_count,
         COUNT(ad.id) FILTER (WHERE ad.status = 'FAILED')::int AS failed_count
       FROM announcements a
       LEFT JOIN staff_users su ON su.id = a.staff_user_id
       LEFT JOIN announcement_deliveries ad ON ad.announcement_id = a.id
       GROUP BY a.id, su.login_identifier
       ORDER BY a.created_at DESC
       LIMIT 50`,
    );
    return result.rows.map((row) => ({
      record: toAnnouncementRecord(row),
      staffUsername: row.staff_username,
      totalDevices: row.total_devices,
      successCount: row.success_count,
      failedCount: row.failed_count,
    }));
  }

  public async listActiveDevices(): Promise<ActiveDevice[]> {
    const result = await this.pool.query<DeviceRow>(
      `SELECT id, push_token_encrypted
         FROM devices
        WHERE platform = 'ANDROID' AND status = 'ACTIVE'`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      pushTokenEnvelope: row.push_token_encrypted,
    }));
  }

  public async recordDelivery(input: AnnouncementDeliveryInsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO announcement_deliveries
         (id, announcement_id, device_id, status, provider_message_id, error_code, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (announcement_id, device_id) DO NOTHING`,
      [
        randomUUID(),
        input.announcementId,
        input.deviceId,
        input.status,
        input.providerMessageId,
        input.errorCode,
        input.occurredAt,
      ],
    );
  }
}
