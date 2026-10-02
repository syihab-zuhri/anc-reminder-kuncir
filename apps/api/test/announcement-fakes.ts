/* eslint-disable @typescript-eslint/require-await -- in-memory repository satisfies async port */
import type { TransactionClient } from "@anc/database";

import type {
  ActiveDevice,
  AnnouncementDeliveryInsert,
  AnnouncementRecord,
  AnnouncementRepository,
  AnnouncementWithStats,
  CreateAnnouncementInput,
} from "../src/announcements/announcement.repository.js";
import type {
  PushDeliveryAdapter,
  PushDeliveryResult,
  PushMessage,
} from "../src/push/push-adapter.js";

export class FakeAnnouncementRepository implements AnnouncementRepository {
  /** staff user id -> health center id (announcements belong to the sender's center). */
  public readonly staffCenters = new Map<string, string>();
  public readonly staffUsernames = new Map<string, string>();
  public readonly devices: Array<ActiveDevice & { readonly healthCenterId: string }> = [];
  public readonly deliveries: AnnouncementDeliveryInsert[] = [];
  private readonly records: AnnouncementRecord[] = [];

  public get announcementCount(): number {
    return this.records.length;
  }

  public async create(
    _client: TransactionClient,
    input: CreateAnnouncementInput,
  ): Promise<AnnouncementRecord> {
    const record: AnnouncementRecord = {
      id: input.announcementId,
      staffUserId: input.staffUserId,
      title: input.title,
      body: input.body,
      createdAt: input.occurredAt,
      sentAt: null,
    };
    this.records.push(record);
    return record;
  }

  public async findById(
    _client: TransactionClient,
    announcementId: string,
    healthCenterId: string,
  ): Promise<AnnouncementWithStats | null> {
    const record = this.records.find((candidate) => candidate.id === announcementId);
    if (record === undefined || this.staffCenters.get(record.staffUserId) !== healthCenterId) {
      return null;
    }
    return this.withStats(record);
  }

  public async markSent(announcementId: string, sentAt: Date): Promise<void> {
    const index = this.records.findIndex((candidate) => candidate.id === announcementId);
    const record = this.records[index];
    if (record !== undefined) this.records[index] = { ...record, sentAt };
  }

  public async listWithStats(healthCenterId: string): Promise<AnnouncementWithStats[]> {
    return this.records
      .filter((record) => this.staffCenters.get(record.staffUserId) === healthCenterId)
      .map((record) => this.withStats(record))
      .sort((left, right) => right.record.createdAt.getTime() - left.record.createdAt.getTime());
  }

  public async listActiveDevices(healthCenterId: string): Promise<ActiveDevice[]> {
    return this.devices
      .filter((device) => device.healthCenterId === healthCenterId)
      .map(({ id, pushTokenEnvelope }) => ({ id, pushTokenEnvelope }));
  }

  public async recordDeliveries(deliveries: readonly AnnouncementDeliveryInsert[]): Promise<void> {
    this.deliveries.push(...deliveries);
  }

  /** Seeds an already-sent announcement, e.g. another center's history. */
  public seedRecord(record: AnnouncementRecord): void {
    this.records.push(record);
  }

  private withStats(record: AnnouncementRecord): AnnouncementWithStats {
    const own = this.deliveries.filter((delivery) => delivery.announcementId === record.id);
    const successCount = own.filter((delivery) => delivery.status === "SUCCESS").length;
    return {
      record,
      staffUsername: this.staffUsernames.get(record.staffUserId) ?? null,
      totalDevices: own.length,
      successCount,
      failedCount: own.length - successCount,
    };
  }
}

/** Records every message and can hold sends open to observe concurrency. */
export class RecordingPushAdapter implements PushDeliveryAdapter {
  public readonly messages: PushMessage[] = [];
  public inFlight = 0;
  public maxInFlight = 0;
  public gate: Promise<void> | null = null;
  public readonly resultFor = new Map<string, PushDeliveryResult>();
  public readonly throwFor = new Set<string>();

  public async send(message: PushMessage): Promise<PushDeliveryResult> {
    this.messages.push(message);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.gate !== null) await this.gate;
      if (this.throwFor.has(message.token)) throw new Error("adapter exploded");
      return (
        this.resultFor.get(message.token) ?? {
          status: "SUCCESS",
          providerMessageId: `projects/test/messages/${message.token}`,
        }
      );
    } finally {
      this.inFlight -= 1;
    }
  }
}
