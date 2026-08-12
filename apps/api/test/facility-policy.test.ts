import { describe, expect, it } from "vitest";

import {
  assertFacilityTypeAllowed,
  isFacilityTypeAllowed,
} from "../src/anc-plan/facility-policy.js";

describe("ANC facility policy", () => {
  it("restricts K1/K4/K5 snapshots to Puskesmas", () => {
    const rule = {
      required_facility_policy: "PUSKESMAS_REQUIRED" as const,
      allowed_facility_types: ["PUSKESMAS"] as const,
    };
    expect(isFacilityTypeAllowed(rule, "PUSKESMAS")).toBe(true);
    expect(isFacilityTypeAllowed(rule, "MIDWIFE_PRACTICE")).toBe(false);
    expect(() => assertFacilityTypeAllowed(rule, "MIDWIFE_PRACTICE")).toThrow(
      expect.objectContaining({ code: "FACILITY_NOT_ALLOWED_FOR_MILESTONE" }),
    );
  });

  it("permits only configured PONED or hospital types for K8", () => {
    const rule = {
      required_facility_policy: "PONED_OR_RS_REQUIRED" as const,
      allowed_facility_types: ["PONED", "HOSPITAL"] as const,
    };
    expect(isFacilityTypeAllowed(rule, "PONED")).toBe(true);
    expect(isFacilityTypeAllowed(rule, "HOSPITAL")).toBe(true);
    expect(isFacilityTypeAllowed(rule, "PUSKESMAS")).toBe(false);
  });

  it("keeps flexible policies configurable instead of hardcoding every facility", () => {
    const rule = {
      required_facility_policy: "FLEXIBLE" as const,
      allowed_facility_types: ["PUSKESMAS", "MIDWIFE_PRACTICE"] as const,
    };
    expect(isFacilityTypeAllowed(rule, "MIDWIFE_PRACTICE")).toBe(true);
    expect(isFacilityTypeAllowed(rule, "POSYANDU")).toBe(false);
  });

  it("permits facility override when explicit clinical owner grant is provided (TASK-P5-003)", () => {
    const rule = {
      required_facility_policy: "PUSKESMAS_REQUIRED" as const,
      allowed_facility_types: ["PUSKESMAS"] as const,
    };
    expect(isFacilityTypeAllowed(rule, "MIDWIFE_PRACTICE", false)).toBe(false);
    expect(isFacilityTypeAllowed(rule, "MIDWIFE_PRACTICE", true)).toBe(true);
    expect(() => assertFacilityTypeAllowed(rule, "MIDWIFE_PRACTICE", true)).not.toThrow();
  });
});
