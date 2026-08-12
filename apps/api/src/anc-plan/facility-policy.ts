import type { FacilityType, RequiredFacilityPolicy } from "@anc/contracts";
import { HttpStatus } from "@nestjs/common";

import { ApiException } from "../errors/api.exception.js";

export interface FacilityRuleSnapshot {
  readonly required_facility_policy: RequiredFacilityPolicy;
  readonly allowed_facility_types: readonly FacilityType[];
}

export function isFacilityTypeAllowed(
  rule: FacilityRuleSnapshot,
  facilityType: FacilityType,
  hasClinicalOwnerOverride = false,
): boolean {
  if (hasClinicalOwnerOverride) return true;
  if (!rule.allowed_facility_types.includes(facilityType)) return false;
  if (rule.required_facility_policy === "PUSKESMAS_REQUIRED") {
    return facilityType === "PUSKESMAS";
  }
  if (rule.required_facility_policy === "PONED_OR_RS_REQUIRED") {
    return facilityType === "PONED" || facilityType === "HOSPITAL";
  }
  return true;
}

export function assertFacilityTypeAllowed(
  rule: FacilityRuleSnapshot,
  facilityType: FacilityType,
  hasClinicalOwnerOverride = false,
): void {
  if (isFacilityTypeAllowed(rule, facilityType, hasClinicalOwnerOverride)) return;
  throw new ApiException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: "FACILITY_NOT_ALLOWED_FOR_MILESTONE",
    message: "Jenis fasilitas tidak diizinkan untuk milestone ini.",
  });
}
