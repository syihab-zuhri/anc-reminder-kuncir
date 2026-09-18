import { Injectable } from "@nestjs/common";
import type {
  AnnouncementCreateRequest,
  AnnouncementCreateResponse,
  AnnouncementListResponse,
} from "@anc/contracts";
import type { DeviceTokenCrypto } from "@anc/database";

import type { StaffActor } from "../auth/staff-auth.types.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthorizationPolicy } from "../authorization/authorization.policy.js";
import type { PushDeliveryAdapter } from "../scheduler/scheduler.service.js";
import type { AnnouncementRepository } from "./announcement.repository.js";

@Injectable()
export class AnnouncementService {
  public constructor(
    private readonly repository: AnnouncementRepository,
    private readonly policy: AuthorizationPolicy,
    private readonly tokenCrypto: DeviceTokenCrypto,
    private readonly pushAdapter: PushDeliveryAdapter,
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

    // Broadcast ke semua device ACTIVE via FCM/ntfy adapter.
    const devices = await this.repository.listActiveDevices();
    let successCount = 0;
    let failedCount = 0;

    for (const device of devices) {
      let pushToken: string;
      try {
        pushToken = this.tokenCrypto.decrypt(device.pushTokenEnvelope);
      } catch {
        pushToken = "";
      }

      if (pushToken === "") {
        failedCount += 1;
        await this.repository.recordDelivery({
          announcementId: announcement.id,
          deviceId: device.id,
          status: "FAILED",
          providerMessageId: null,
          errorCode: "DECRYPT_FAILED",
          occurredAt: this.clock(),
        });
        continue;
      }

      const result = await this.pushAdapter.send({
        token: pushToken,
        title: announcement.title,
        body: announcement.body,
        reminderCycleId: announcement.id,
        milestoneCode: "K1",
      });

      if (result.status === "SUCCESS") {
        successCount += 1;
        await this.repository.recordDelivery({
          announcementId: announcement.id,
          deviceId: device.id,
          status: "SUCCESS",
          providerMessageId: result.providerMessageId,
          errorCode: null,
          occurredAt: this.clock(),
        });
      } else {
        failedCount += 1;
        await this.repository.recordDelivery({
          announcementId: announcement.id,
          deviceId: device.id,
          status: "FAILED",
          providerMessageId: null,
          errorCode: result.errorCode,
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
      total_devices: successCount + failedCount,
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
