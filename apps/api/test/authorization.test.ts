import { describe, expect, it } from "vitest";

import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { AuthorizationPolicy } from "../src/authorization/authorization.policy.js";
import { ScopedAccessService } from "../src/authorization/scoped-access.service.js";
import { FakeScopedAccessRepository } from "./security-fakes.js";

const centerId = "60000000-0000-4000-8000-000000000001";
const motherId = "70000000-0000-4000-8000-000000000001";

describe("central authorization policy", () => {
  const policy = new AuthorizationPolicy();

  it("makes Puskesmas a strict superset of Bidan capabilities", () => {
    const bidan = actor("BIDAN");
    const puskesmas = actor("PUSKESMAS");
    expect(policy.hasCapability(bidan, "MOTHER_BASIC_READ")).toBe(true);
    expect(policy.hasCapability(puskesmas, "MOTHER_BASIC_READ")).toBe(true);
    expect(policy.hasCapability(bidan, "MOTHER_REGISTRY_MANAGE")).toBe(true);
    expect(policy.hasCapability(puskesmas, "MOTHER_REGISTRY_MANAGE")).toBe(true);
    expect(policy.hasCapability(bidan, "CLINICAL_RECORD_WRITE")).toBe(false);
    expect(policy.hasCapability(puskesmas, "CLINICAL_RECORD_WRITE")).toBe(true);
    expect(policy.hasCapability(bidan, "MILESTONE_SCHEDULE")).toBe(false);
    expect(policy.hasCapability(puskesmas, "MILESTONE_SCHEDULE")).toBe(true);
  });

  it("denies Super Admin routine health access by default", () => {
    expect(policy.hasCapability(actor("SUPER_ADMIN"), "MOTHER_BASIC_READ")).toBe(false);
  });

  it("enforces repository scope after capability checks", async () => {
    const repository = new FakeScopedAccessRepository();
    const service = new ScopedAccessService(repository, policy);
    await expect(service.assertMotherRead(actor("BIDAN"), motherId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    repository.allowedMotherIds.add(motherId);
    await expect(service.assertMotherRead(actor("BIDAN"), motherId)).resolves.toBeUndefined();
    await expect(service.assertMotherRead(actor("SUPER_ADMIN"), motherId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

function actor(role: StaffActor["role"]): StaffActor {
  return {
    staffUserId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    healthCenterId: role === "SUPER_ADMIN" ? null : centerId,
    displayName: role,
    role,
    status: "ACTIVE",
    assignments: [],
  };
}
