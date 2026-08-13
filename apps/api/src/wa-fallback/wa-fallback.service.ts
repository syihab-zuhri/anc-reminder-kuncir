import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  GenerateWaLinkResponse,
  WaFallbackItem,
  WaFallbackQueueResponse,
} from "@anc/contracts";

import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import type { WaFallbackRepository } from "./wa-fallback.repository.js";

const WA_DISCLAIMER =
  "Link wa.me ini adalah aksi manual Bidan dan tidak menjamin status pengiriman/penerimaan pesan di WhatsApp." as const;

@Injectable()
export class WaFallbackService {
  public constructor(
    private readonly repository: WaFallbackRepository,
    private readonly policy: AuthorizationPolicy,
    private readonly audit: AuditService,
  ) {}

  public async getQueue(actor: StaffActor): Promise<WaFallbackQueueResponse> {
    this.policy.assertCapability(actor, "WA_FALLBACK_ASSIGNED");
    if (actor.healthCenterId === null) throw forbidden();
    const items = await this.repository.getQueue({
      healthCenterId: actor.healthCenterId,
      actorStaffId: actor.staffUserId,
      role: actor.role === "PUSKESMAS" ? "PUSKESMAS" : "BIDAN",
    });
    return { items, total: items.length };
  }

  public async generateLink(actor: StaffActor, id: string): Promise<GenerateWaLinkResponse> {
    await this.assertFallbackAccess(actor, id);
    const target = await this.repository.getLinkTarget(id);
    if (target === null) throw notFound();
    if (target.status !== "READY" && target.status !== "LINK_GENERATED") {
      throw invalidState();
    }

    let generatedAt = target.status === "LINK_GENERATED" ? target.linkGeneratedAt : new Date();
    if (generatedAt === null) throw invalidState();
    // The message carries no personal or clinical data: wa.me URLs are
    // unencrypted and must not leak mother identity.
    const messageText = `Pengingat jadwal pemeriksaan kehamilan ${target.milestoneCode} dari Puskesmas. Mohon hubungi Puskesmas untuk konfirmasi jadwal. ${WA_DISCLAIMER}`;
    const waMeUrl = `https://wa.me/${normalizeWaPhone(target.phoneNormalized)}?text=${encodeURIComponent(messageText)}`;

    if (target.status === "READY") {
      const result = await this.repository.markLinkGenerated(id, generatedAt, this.scope(actor));
      if (result === "NOT_FOUND") throw notFound();
      if (result === "INVALID_STATE") {
        const concurrent = await this.repository.getLinkTarget(id);
        if (concurrent?.status !== "LINK_GENERATED" || concurrent.linkGeneratedAt === null) {
          throw invalidState();
        }
        generatedAt = concurrent.linkGeneratedAt;
      } else {
        await this.recordTransition(actor, id, "WA_FALLBACK_LINK_GENERATED", generatedAt);
      }
    }

    return {
      fallback_id: id,
      wa_me_url: waMeUrl,
      generated_at: generatedAt.toISOString(),
      status: "LINK_GENERATED",
      disclaimer: WA_DISCLAIMER,
    };
  }

  public async markOpened(actor: StaffActor, id: string): Promise<WaFallbackItem> {
    await this.assertFallbackAccess(actor, id);
    const occurredAt = new Date();
    const result = await this.repository.markLinkOpened(id, occurredAt, this.scope(actor));
    const item = await this.transitionOutcome(result, id, ["LINK_OPENED"]);
    if (result === "UPDATED") {
      await this.recordTransition(actor, id, "WA_FALLBACK_LINK_OPENED", occurredAt);
    }
    return item;
  }

  public async resolve(
    actor: StaffActor,
    id: string,
    manualNote: string | undefined,
  ): Promise<WaFallbackItem> {
    await this.assertFallbackAccess(actor, id);
    const occurredAt = new Date();
    const result = await this.repository.markResolved(
      id,
      actor.staffUserId,
      manualNote ?? null,
      occurredAt,
      this.scope(actor),
    );
    const item = await this.transitionOutcome(result, id, ["RESOLVED_MANUALLY"]);
    if (result === "UPDATED") {
      await this.recordTransition(actor, id, "WA_FALLBACK_RESOLVED", occurredAt);
    }
    return item;
  }

  private async transitionOutcome(
    result: "UPDATED" | "NOT_FOUND" | "INVALID_STATE",
    id: string,
    idempotentStatuses: readonly string[],
  ): Promise<WaFallbackItem> {
    if (result === "NOT_FOUND") throw notFound();
    if (result === "INVALID_STATE") {
      const current = await this.repository.getById(id);
      if (current !== null && idempotentStatuses.includes(current.status)) return current;
      throw invalidState();
    }
    const item = await this.repository.getById(id);
    if (item === null) throw notFound();
    return item;
  }

  private async assertFallbackAccess(actor: StaffActor, id: string): Promise<void> {
    this.policy.assertCapability(actor, "WA_FALLBACK_ASSIGNED");
    const target = await this.repository.getScopeTarget(id);
    if (target === null) throw notFound();
    if (actor.healthCenterId === null || actor.healthCenterId !== target.healthCenterId) {
      throw forbidden();
    }
    if (actor.role === "BIDAN") {
      if (!(await this.repository.canAccessMother(actor.staffUserId, target.motherId))) {
        throw forbidden();
      }
    }
  }

  private recordTransition(
    actor: StaffActor,
    fallbackId: string,
    action: string,
    occurredAt: Date,
  ): Promise<void> {
    return this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action,
      resourceType: "WA_FALLBACK_ACTION",
      resourceId: fallbackId,
      occurredAt,
    });
  }

  private scope(actor: StaffActor) {
    if (actor.healthCenterId === null) throw forbidden();
    return {
      healthCenterId: actor.healthCenterId,
      actorStaffId: actor.staffUserId,
      role: actor.role === "PUSKESMAS" ? ("PUSKESMAS" as const) : ("BIDAN" as const),
    };
  }
}

// Defense-in-depth normalization: registration already stores digits-only
// Indonesian numbers, typically 62-prefixed.
export function normalizeWaPhone(phoneNormalized: string): string {
  const digits = phoneNormalized.replace(/\D/gu, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function notFound(): ApiException {
  return new ApiException({
    status: HttpStatus.NOT_FOUND,
    code: "WA_FALLBACK_NOT_FOUND",
    message: "Tindak lanjut WhatsApp tidak ditemukan.",
  });
}

function invalidState(): ApiException {
  return new ApiException({
    status: HttpStatus.CONFLICT,
    code: "WA_FALLBACK_INVALID_STATE",
    message: "Status tindak lanjut WhatsApp tidak mengizinkan tindakan ini.",
  });
}
