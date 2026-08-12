import { describe, expect, it } from "vitest";

import { AuditService } from "../src/audit/audit.service.js";
import { FakeAuditRepository } from "./security-fakes.js";

describe("append-only audit metadata policy", () => {
  it("accepts allowlisted metadata and rejects sensitive keys", async () => {
    const repository = new FakeAuditRepository();
    const service = new AuditService(repository);
    await service.record({
      actorType: "STAFF",
      actorId: crypto.randomUUID(),
      action: "SESSION_REVOKED",
      resourceType: "STAFF_SESSION",
      resourceId: crypto.randomUUID(),
      metadata: {
        reason: "Rotasi petugas untuk NIK 3201010101010001",
        role: "PUSKESMAS",
        milestones_cancelled: 3,
        reminder_cycles_cancelled: 2,
        wa_actions_expired: 1,
      },
    });
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]?.metadata["reason"]).toBe("Rotasi petugas untuk NIK [REDACTED]");
    expect(repository.events[0]?.metadata["milestones_cancelled"]).toBe(3);

    await expect(
      service.record({
        actorType: "STAFF",
        action: "UNSAFE_EVENT",
        resourceType: "TEST",
        metadata: { password: "rahasia" },
      }),
    ).rejects.toThrow("not allowlisted");
  });
});
