import { HttpStatus, Injectable } from "@nestjs/common";
import type { StaffRole } from "@anc/contracts";

import type { SessionTarget, StaffActor } from "../auth/staff-auth.types.js";
import { ApiException } from "../errors/api.exception.js";

export type StaffCapability =
  | "STAFF_SELF_READ"
  | "MOTHER_BASIC_READ"
  | "MOTHER_REGISTRY_MANAGE"
  | "VISIT_CONFIRM_FLEXIBLE"
  | "WA_FALLBACK_ASSIGNED"
  | "ORGANIZATION_MANAGE"
  | "STAFF_MANAGE"
  | "SESSION_REVOKE_SCOPED"
  | "VISIT_CONFIRM_PUSKESMAS"
  | "CLINICAL_RECORD_WRITE"
  | "CARE_PLAN_MANAGE"
  | "MILESTONE_SCHEDULE"
  | "PROGRAM_STATUS_MANAGE"
  | "CONTENT_MANAGE";

const bidanCapabilities = new Set<StaffCapability>([
  "STAFF_SELF_READ",
  "MOTHER_BASIC_READ",
  "VISIT_CONFIRM_FLEXIBLE",
  "WA_FALLBACK_ASSIGNED",
]);
const puskesmasCapabilities = new Set<StaffCapability>([
  ...bidanCapabilities,
  "MOTHER_REGISTRY_MANAGE",
  "ORGANIZATION_MANAGE",
  "STAFF_MANAGE",
  "SESSION_REVOKE_SCOPED",
  "VISIT_CONFIRM_PUSKESMAS",
  "CLINICAL_RECORD_WRITE",
  "CARE_PLAN_MANAGE",
  "MILESTONE_SCHEDULE",
  "PROGRAM_STATUS_MANAGE",
  "CONTENT_MANAGE",
]);
const superAdminCapabilities = new Set<StaffCapability>(["STAFF_SELF_READ"]);

const capabilityByRole: Readonly<Record<StaffRole, ReadonlySet<StaffCapability>>> = {
  BIDAN: bidanCapabilities,
  PUSKESMAS: puskesmasCapabilities,
  SUPER_ADMIN: superAdminCapabilities,
};

@Injectable()
export class AuthorizationPolicy {
  public hasCapability(actor: StaffActor, capability: StaffCapability): boolean {
    return capabilityByRole[actor.role].has(capability);
  }

  public assertCapability(actor: StaffActor, capability: StaffCapability): void {
    if (!this.hasCapability(actor, capability)) throw forbidden();
  }

  public assertHealthCenterScope(actor: StaffActor, healthCenterId: string): void {
    if (actor.healthCenterId === null || actor.healthCenterId !== healthCenterId) throw forbidden();
  }

  public assertCanRevokeSession(actor: StaffActor, target: SessionTarget): void {
    if (actor.staffUserId === target.staffUserId) return;
    this.assertCapability(actor, "SESSION_REVOKE_SCOPED");
    if (
      actor.healthCenterId === null ||
      target.healthCenterId !== actor.healthCenterId ||
      target.role === "SUPER_ADMIN"
    ) {
      throw forbidden();
    }
  }
}

export function forbidden(): ApiException {
  return new ApiException({
    status: HttpStatus.FORBIDDEN,
    code: "FORBIDDEN",
    message: "Anda tidak memiliki akses untuk tindakan ini.",
  });
}
