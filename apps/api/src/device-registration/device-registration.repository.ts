import { randomUUID } from "node:crypto";
import type { DatabasePool } from "@anc/database";

export interface RegisterDeviceRecordInput {
  readonly motherId: string;
  readonly encryptedToken: string;
  readonly tokenFingerprint: string;
  readonly occurredAt: Date;
}

export interface RegisteredDeviceRecord {
  readonly id: string;
  readonly registeredAt: Date;
  readonly lastSeenAt: Date;
}

export interface DeviceRegistrationRepository {
  registerAndroid(input: RegisterDeviceRecordInput): Promise<RegisteredDeviceRecord>;
}

interface DeviceRow {
  readonly id: string;
  readonly registered_at: Date;
  readonly last_seen_at: Date;
}

export class PostgresDeviceRegistrationRepository implements DeviceRegistrationRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async registerAndroid(input: RegisterDeviceRecordInput): Promise<RegisteredDeviceRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        input.tokenFingerprint,
      ]);
      await client.query(
        `UPDATE devices
            SET status = 'REVOKED', updated_at = $3
          WHERE push_token_fingerprint = $1
            AND mother_id <> $2
            AND status = 'ACTIVE'`,
        [input.tokenFingerprint, input.motherId, input.occurredAt],
      );

      const current = await client.query<{ readonly id: string; readonly same_token: boolean }>(
        `SELECT id, push_token_fingerprint = $2 AS same_token
           FROM devices
          WHERE mother_id = $1 AND platform = 'ANDROID' AND status = 'ACTIVE'
          FOR UPDATE`,
        [input.motherId, input.tokenFingerprint],
      );
      const currentDevice = current.rows[0];
      let result;
      if (currentDevice === undefined) {
        result = await client.query<DeviceRow>(
          `INSERT INTO devices (
             id, mother_id, platform, push_token_encrypted, push_token_fingerprint,
             status, registered_at, last_seen_at, updated_at
           ) VALUES ($1, $2, 'ANDROID', $3, $4, 'ACTIVE', $5, $5, $5)
           RETURNING id, registered_at, last_seen_at`,
          [
            randomUUID(),
            input.motherId,
            input.encryptedToken,
            input.tokenFingerprint,
            input.occurredAt,
          ],
        );
      } else {
        result = await client.query<DeviceRow>(
          `UPDATE devices
              SET push_token_encrypted = $2,
                  push_token_fingerprint = $3,
                  registered_at = CASE WHEN $4 THEN registered_at ELSE $5 END,
                  last_seen_at = $5,
                  updated_at = $5
            WHERE id = $1
            RETURNING id, registered_at, last_seen_at`,
          [
            currentDevice.id,
            input.encryptedToken,
            input.tokenFingerprint,
            currentDevice.same_token,
            input.occurredAt,
          ],
        );
      }
      await client.query("COMMIT");
      const row = result.rows[0];
      if (row === undefined) throw new Error("Device registration returned no row");
      return {
        id: row.id,
        registeredAt: row.registered_at,
        lastSeenAt: row.last_seen_at,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
