import { randomUUID } from "node:crypto";
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
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import type { PushDeliveryAdapter } from "../push/push-adapter.js";
import type {
  ActiveDevice,
  AnnouncementDeliveryInsert,
  AnnouncementRepository,
  AnnouncementWithStats,
} from "./announcement.repository.js";

/**
 * Upper bound on concurrent FCM calls for one broadcast. Sending one device at a time
 * made a few dozen devices outlast the web proxy timeout; unbounded fan-out would
 * hammer the FCM quota and the connection pool.
 */
export const ANNOUNCEMENT_SEND_CONCURRENCY = 20;

const ANNOUNCEMENT_OPERATION = "ANNOUNCEMENT_BROADCAST";
const ANNOUNCEMENT_RESOURCE = "ANNOUNCEMENT";

interface BroadcastOutcome {
  readonly announcement: AnnouncementWithStats;
  readonly created: boolean;
}

@Injectable()
export class AnnouncementService {
  public constructor(
    private readonly repository: AnnouncementRepository,
    private readonly policy: AuthorizationPolicy,
    private readonly tokenCrypto: DeviceTokenCrypto,
    private readonly pushAdapter: PushDeliveryAdapter,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly idempotency: IdempotencyService,
  ) {}

  public async create(
    actor: StaffActor,
    input: AnnouncementCreateRequest,
  ): Promise<AnnouncementCreateResponse> {
    const healthCenterId = this.requireBroadcastCenter(actor);
    const occurredAt = this.clock();

    // Only the creation of the announcement record is idempotent. The FCM fan-out runs
    // after that transaction commits so no database transaction stays open while
    // waiting on a third party. A replay therefore never sends a second time.
    const outcome = await this.idempotency.runForStaff<BroadcastOutcome>(
      {
        actor,
        operation: ANNOUNCEMENT_OPERATION,
        idempotencyKey: input.idempotency_key,
        requestIdentity: input,
      },
      async (client) => {
        const record = await this.repository.create(client, {
          announcementId: randomUUID(),
          staffUserId: actor.staffUserId,
          title: input.title,
          body: input.body,
          occurredAt,
        });
        return {
          resourceType: ANNOUNCEMENT_RESOURCE,
          resourceId: record.id,
          value: {
            announcement: {
              record,
              staffUsername: null,
              totalDevices: 0,
              successCount: 0,
              failedCount: 0,
            },
            created: true,
          },
        };
      },
      async (client, resource) => {
        if (resource.resourceType !== ANNOUNCEMENT_RESOURCE) {
          throw new Error("Unexpected idempotency resource type for announcement broadcast");
        }
        const existing = await this.repository.findById(
          client,
          resource.resourceId,
          healthCenterId,
        );
        if (existing === null) throw new Error("Announcement replay resource is missing");
        return { announcement: existing, created: false };
      },
    );

    if (!outcome.value.created) return toCreateResponse(outcome.value.announcement);

    const announcement = outcome.value.announcement.record;
    const { successCount, failedCount, sentAt } = await this.broadcast(
      healthCenterId,
      announcement.id,
      announcement.title,
      announcement.body,
    );

    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "ANNOUNCEMENT_SENT",
      resourceType: "ANNOUNCEMENT",
      resourceId: announcement.id,
      metadata: {
        scope_type: "HEALTH_CENTER",
        scope_id: healthCenterId,
      },
    });

    return toCreateResponse({
      record: { ...announcement, sentAt },
      staffUsername: null,
      totalDevices: successCount + failedCount,
      successCount,
      failedCount,
    });
  }

  public async list(actor: StaffActor): Promise<AnnouncementListResponse> {
    const healthCenterId = this.requireBroadcastCenter(actor);

    const rows = await this.repository.listWithStats(healthCenterId);
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

  private requireBroadcastCenter(actor: StaffActor): string {
    this.policy.assertCapability(actor, "CONTENT_MANAGE");
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }

  private async broadcast(
    healthCenterId: string,
    announcementId: string,
    title: string,
    body: string,
  ): Promise<{ successCount: number; failedCount: number; sentAt: Date }> {
    const devices = await this.repository.listActiveDevices(healthCenterId);
    const deliveries = await mapWithConcurrency(devices, ANNOUNCEMENT_SEND_CONCURRENCY, (device) =>
      this.deliver(device, announcementId, title, body),
    );

    await this.repository.recordDeliveries(deliveries);
    const sentAt = this.clock();
    await this.repository.markSent(announcementId, sentAt);

    const successCount = deliveries.filter((delivery) => delivery.status === "SUCCESS").length;
    return { successCount, failedCount: deliveries.length - successCount, sentAt };
  }

  private async deliver(
    device: ActiveDevice,
    announcementId: string,
    title: string,
    body: string,
  ): Promise<AnnouncementDeliveryInsert> {
    const failed = (errorCode: string): AnnouncementDeliveryInsert => ({
      announcementId,
      deviceId: device.id,
      status: "FAILED",
      providerMessageId: null,
      errorCode,
      occurredAt: this.clock(),
    });

    let pushToken: string;
    try {
      pushToken = this.tokenCrypto.decrypt(device.pushTokenEnvelope);
    } catch {
      return failed("DECRYPT_FAILED");
    }

    try {
      const result = await this.pushAdapter.send({
        token: pushToken,
        title,
        body,
        announcementId,
      });
      if (result.status !== "SUCCESS") return failed(result.errorCode);
      return {
        announcementId,
        deviceId: device.id,
        status: "SUCCESS",
        providerMessageId: result.providerMessageId,
        errorCode: null,
        occurredAt: this.clock(),
      };
    } catch {
      return failed("SEND_ERROR");
    }
  }
}

function toCreateResponse(announcement: AnnouncementWithStats): AnnouncementCreateResponse {
  return {
    id: announcement.record.id,
    title: announcement.record.title,
    body: announcement.record.body,
    created_at: announcement.record.createdAt.toISOString(),
    sent_at: announcement.record.sentAt === null ? null : announcement.record.sentAt.toISOString(),
    total_devices: announcement.totalDevices,
    success_count: announcement.successCount,
    failed_count: announcement.failedCount,
  };
}

/** Maps with at most `limit` tasks in flight, preserving input order in the result. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
