import { describe, expect, it } from "vitest";

import {
  markWaFallbackUnreachableRequestSchema,
  reminderSummaryResponseSchema,
} from "../src/index.js";

describe("reminder operations contracts", () => {
  it("accepts factual reminder failure data and keeps WhatsApp delivery unknown", () => {
    const result = reminderSummaryResponseSchema.safeParse({
      generated_at: "2026-08-13T03:00:00.000Z",
      fallback_sla_hours: 24,
      summary: {
        active_cycles_count: 1,
        pending_push_attempts_count: 0,
        retryable_push_failures_count: 0,
        terminal_push_failures_count: 1,
        unresolved_fallbacks_count: 1,
        escalated_fallbacks_count: 1,
        unreachable_fallbacks_count: 0,
      },
      oldest_pending_push_attempt_at: null,
      oldest_unresolved_fallback_at: "2026-08-11T03:00:00.000Z",
      fallback_queue: [],
      whatsapp_delivery_status: "UNKNOWN",
    });
    expect(result.success).toBe(true);

    expect(
      reminderSummaryResponseSchema.safeParse({
        ...(result.success ? result.data : {}),
        whatsapp_delivery_status: "DELIVERED",
      }).success,
    ).toBe(false);
  });

  it("requires a bounded operational note for an unreachable outcome", () => {
    expect(
      markWaFallbackUnreachableRequestSchema.safeParse({
        manual_note: "Nomor tidak aktif setelah dicoba dua kali.",
      }).success,
    ).toBe(true);
    expect(markWaFallbackUnreachableRequestSchema.safeParse({}).success).toBe(false);
    expect(
      markWaFallbackUnreachableRequestSchema.safeParse({ manual_note: "", delivered: false })
        .success,
    ).toBe(false);
  });
});
