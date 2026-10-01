import { describe, expect, it } from "vitest";

import {
  announcementContentSchema,
  announcementCreateRequestSchema,
  announcementCreateResponseSchema,
} from "../src/index.js";

const idempotencyKey = "8b26fdbd-6306-4bbf-9765-000000000001";

describe("announcement contracts", () => {
  it("requires a UUID idempotency key on broadcast requests", () => {
    const valid = announcementCreateRequestSchema.safeParse({
      idempotency_key: idempotencyKey,
      title: "  Jadwal Posyandu  ",
      body: "Posyandu dibuka Selasa pukul 08.00.",
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.title).toBe("Jadwal Posyandu");

    expect(announcementCreateRequestSchema.safeParse({ title: "Judul", body: "Isi" }).success).toBe(
      false,
    );
    expect(
      announcementCreateRequestSchema.safeParse({
        idempotency_key: "not-a-uuid",
        title: "Judul",
        body: "Isi",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields, blank content, and oversized content", () => {
    const base = { idempotency_key: idempotencyKey, title: "Judul", body: "Isi" };
    expect(announcementCreateRequestSchema.safeParse({ ...base, extra: true }).success).toBe(false);
    expect(announcementCreateRequestSchema.safeParse({ ...base, title: "   " }).success).toBe(
      false,
    );
    expect(
      announcementCreateRequestSchema.safeParse({ ...base, title: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      announcementCreateRequestSchema.safeParse({ ...base, body: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  it("validates form content independently of the idempotency key", () => {
    expect(announcementContentSchema.safeParse({ title: "Judul", body: "Isi" }).success).toBe(true);
    expect(announcementContentSchema.safeParse({ title: "", body: "Isi" }).success).toBe(false);
    expect(
      announcementContentSchema.safeParse({ title: "Judul", body: "Isi", extra: 1 }).success,
    ).toBe(false);
  });

  it("allows an unfinished broadcast to be reported with a null sent_at", () => {
    const response = {
      id: "30000000-0000-4000-8000-000000000001",
      title: "Judul",
      body: "Isi",
      created_at: "2026-08-13T05:00:00.000Z",
      total_devices: 0,
      success_count: 0,
      failed_count: 0,
    };
    expect(
      announcementCreateResponseSchema.safeParse({
        ...response,
        sent_at: "2026-08-13T05:00:01.000Z",
      }).success,
    ).toBe(true);
    expect(announcementCreateResponseSchema.safeParse({ ...response, sent_at: null }).success).toBe(
      true,
    );
    expect(announcementCreateResponseSchema.safeParse(response).success).toBe(false);
  });
});
