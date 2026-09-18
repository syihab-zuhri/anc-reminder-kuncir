import { Injectable } from "@nestjs/common";
import type {
  AnnouncementCreateRequest,
  AnnouncementCreateResponse,
  AnnouncementListResponse,
} from "@anc/contracts";

import type { StaffActor } from "../auth/staff-auth.types.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthorizationPolicy } from "../authorization/authorization.policy.js";
import type { AnnouncementRepository } from "./announcement.repository.js";

const NTFY_BASE_URL = "https://ntfy.posyandukkn26.my.id";
const NTFY_BROADCAST_TOPIC = "posyandu-broadcast";

/**
 * Kirim pengumuman ke topic ntfy statis `posyandu-broadcast`.
 * Semua HP bumil yang subscribe topic ini akan menerima notifikasi
 * tanpa perlu FCM credentials atau per-device token decryption.
 */
async function sendNtfyBroadcast(
  title: string,
  body: string,
  announcementId: string,
): Promise<{ readonly success: boolean; readonly providerMessageId: string | null }> {
  try {
    const url = `${NTFY_BASE_URL.replace(/\/+$/u, "")}/${NTFY_BROADCAST_TOPIC}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_BROADCAST_TOPIC,
        title,
        message: body,
        priority: 4,
        tags: ["loudspeaker", "posyandu"],
        click: "https://posyandukkn26.my.id/mother",
        actions: [
          {
            action: "view",
            label: "Buka Portal Ibu",
            url: "https://posyandukkn26.my.id/mother",
            clear: true,
          },
        ],
      }),
    });

    if (!response.ok) {
      return { success: false, providerMessageId: null };
    }

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof payload?.["id"] === "string" ? payload["id"] : `ntfy-${announcementId}`;
    return { success: true, providerMessageId: id };
  } catch {
    return { success: false, providerMessageId: null };
  }
}

@Injectable()
export class AnnouncementService {
  public constructor(
    private readonly repository: AnnouncementRepository,
    private readonly policy: AuthorizationPolicy,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  public async create(
    actor: StaffActor,
    input: AnnouncementCreateRequest,
  ): Promise<AnnouncementCreateResponse> {
    this.policy.assertCapability(actor, "CONTENT_MANAGE");

    const occurredAt = this.clock();
    const announcement = await this.repository.create({
      staffUserId: actor.staffUserId,
      title: input.title,
      body: input.body,
      occurredAt,
    });

    // Kirim ke topic ntfy broadcast statis — semua subscriber terima sekaligus.
    const result = await sendNtfyBroadcast(
      announcement.title,
      announcement.body,
      announcement.id,
    );

    // Catat 1 delivery record mewakili broadcast (device_id = null tidak diizinkan
    // skema, jadi simpan sebagai virtual device ID = announcement.id agar constraint
    // unique terpenuhi). Kita reuse announcement_id sebagai scope marker.
    const successCount = result.success ? 1 : 0;
    const failedCount = result.success ? 0 : 1;

    // Coba rekam ke tabel deliveries jika ada device aktif, otherwise catat broadcast.
    const devices = await this.repository.listActiveDevices();
    if (devices.length > 0) {
      for (const device of devices) {
        await this.repository.recordDelivery({
          announcementId: announcement.id,
          deviceId: device.id,
          status: result.success ? "SUCCESS" : "FAILED",
          providerMessageId: result.providerMessageId,
          errorCode: result.success ? null : "NTFY_BROADCAST_FAILED",
          occurredAt: this.clock(),
        });
      }
    }

    await this.repository.markSent(announcement.id, this.clock());

    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "ANNOUNCEMENT_SENT",
      resourceType: "ANNOUNCEMENT",
      resourceId: announcement.id,
      metadata: {
        scope_type: "ANNOUNCEMENT",
        scope_id: announcement.id,
      },
    });

    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      created_at: announcement.createdAt.toISOString(),
      sent_at: (announcement.sentAt ?? occurredAt).toISOString(),
      total_devices: devices.length > 0 ? devices.length : successCount + failedCount,
      success_count: successCount,
      failed_count: failedCount,
    };
  }

  public async list(actor: StaffActor): Promise<AnnouncementListResponse> {
    this.policy.assertCapability(actor, "CONTENT_MANAGE");

    const rows = await this.repository.listWithStats();
    return {
      announcements: rows.map((row) => ({
        id: row.record.id,
        staff_user_id: row.record.staffUserId,
        staff_username: row.staffUsername,
        title: row.record.title,
        body: row.record.body,
        created_at: row.record.createdAt.toISOString(),
        sent_at: row.record.sentAt === null ? null : row.record.sentAt.toISOString(),
        total_devices: row.totalDevices,
        success_count: row.successCount,
        failed_count: row.failedCount,
      })),
    };
  }
}
