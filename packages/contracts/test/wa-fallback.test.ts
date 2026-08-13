import { describe, expect, it } from "vitest";

import {
  generateWaLinkResponseSchema,
  resolveWaFallbackRequestSchema,
  waFallbackItemSchema,
} from "../src/index.js";

const item = {
  id: "91000000-0000-4000-8000-000000000001",
  reminder_cycle_id: "90000000-0000-4000-8000-000000000001",
  mother_id: "60000000-0000-4000-8000-000000000001",
  mother_full_name: "Siti Aminah",
  phone_number_masked: "0812****7890",
  milestone_code: "K2",
  due_at: "2026-09-01T00:00:00.000Z",
  status: "LINK_OPENED",
  wa_me_url: null,
  link_generated_at: "2026-08-13T01:00:00.000Z",
  link_opened_at: "2026-08-13T01:01:00.000Z",
  resolved_at: null,
  resolved_by: null,
  manual_note: null,
};

describe("WhatsApp fallback contracts", () => {
  it("accepts only the authoritative fallback statuses and strict timestamps", () => {
    expect(waFallbackItemSchema.safeParse(item).success).toBe(true);
    expect(waFallbackItemSchema.safeParse({ ...item, status: "RESOLVED" }).success).toBe(false);
    expect(waFallbackItemSchema.safeParse({ ...item, due_at: "2026-09-01" }).success).toBe(false);
  });

  it("requires generated-link responses to declare LINK_GENERATED", () => {
    const response = {
      fallback_id: item.id,
      wa_me_url: "https://wa.me/6281234567890?text=Pengingat",
      generated_at: "2026-08-13T01:00:00.000Z",
      status: "LINK_GENERATED",
      disclaimer:
        "Link wa.me ini adalah aksi manual Bidan dan tidak menjamin status pengiriman/penerimaan pesan di WhatsApp.",
    };
    expect(generateWaLinkResponseSchema.safeParse(response).success).toBe(true);
    expect(
      generateWaLinkResponseSchema.safeParse({ ...response, status: "LINK_OPENED" }).success,
    ).toBe(false);
  });

  it("rejects blank, oversized, and unknown resolve fields", () => {
    expect(resolveWaFallbackRequestSchema.safeParse({}).success).toBe(true);
    expect(
      resolveWaFallbackRequestSchema.safeParse({ manual_note: "Dihubungi manual" }).success,
    ).toBe(true);
    expect(resolveWaFallbackRequestSchema.safeParse({ manual_note: "   " }).success).toBe(false);
    expect(resolveWaFallbackRequestSchema.safeParse({ manual_note: "x".repeat(501) }).success).toBe(
      false,
    );
    expect(resolveWaFallbackRequestSchema.safeParse({ delivered: true }).success).toBe(false);
  });
});
