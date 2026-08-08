import { describe, expect, it } from "vitest";

import {
  actorRoleSchema,
  canonicalErrorEnvelopeSchema,
  createCanonicalError,
  idempotencyKeySchema,
  milestoneCodeSchema,
  requestIdSchema,
  staffCreateRequestSchema,
  staffLoginRequestSchema,
  staffRefreshRequestSchema,
  staffRoleSchema,
  villageCreateRequestSchema,
  waDeliveryStatusSchema,
  waFallbackActionStatusSchema,
} from "../src/index.js";

describe("shared domain contracts", () => {
  it("keeps interactive staff roles separate from mother and worker actors", () => {
    expect(staffRoleSchema.options).toEqual(["BIDAN", "PUSKESMAS", "SUPER_ADMIN"]);
    expect(actorRoleSchema.parse("BUMIL")).toBe("BUMIL");
    expect(actorRoleSchema.parse("REMINDER_WORKER")).toBe("REMINDER_WORKER");
  });

  it("defines K1 through K8 without embedding target weeks", () => {
    expect(milestoneCodeSchema.options).toEqual(["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"]);
  });

  it("does not allow wa.me link state to masquerade as delivery", () => {
    expect(waFallbackActionStatusSchema.safeParse("SENT").success).toBe(false);
    expect(waDeliveryStatusSchema.safeParse("UNKNOWN").success).toBe(true);
    expect(waDeliveryStatusSchema.safeParse("DELIVERED").success).toBe(false);
  });

  it("validates staff auth and organization mutations without accepting extra fields", () => {
    expect(
      staffLoginRequestSchema.safeParse({
        login_identifier: "bidan.kuncir",
        password: "candidate-password",
      }).success,
    ).toBe(true);
    expect(
      staffLoginRequestSchema.safeParse({
        login_identifier: "bidan.kuncir",
        password: "candidate-password",
        role: "PUSKESMAS",
      }).success,
    ).toBe(false);
    expect(
      staffCreateRequestSchema.safeParse({
        login_identifier: "bidan.baru",
        display_name: "Bidan Baru",
        role: "BIDAN",
        password: "BidanBaru2026",
      }).success,
    ).toBe(true);
    expect(
      villageCreateRequestSchema.safeParse({ code: "KNC-01", name: "Desa Kuncir" }).success,
    ).toBe(true);
    expect(staffRefreshRequestSchema.safeParse({ refresh_token: "raw-token" }).success).toBe(false);
    expect(idempotencyKeySchema.safeParse("8b26fdbd-6306-4bbf-9765-3fd620888e7c").success).toBe(
      true,
    );
    expect(idempotencyKeySchema.safeParse("duplicate-click").success).toBe(false);
  });
});

describe("canonical API errors", () => {
  it("creates the outer API error envelope with a request ID", () => {
    const envelope = createCanonicalError({
      code: "FORBIDDEN",
      message: "Anda tidak memiliki akses untuk tindakan ini.",
      requestId: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
    });

    expect(canonicalErrorEnvelopeSchema.parse(envelope)).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Anda tidak memiliki akses untuk tindakan ini.",
        request_id: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
        details: null,
      },
    });
  });

  it("supports field errors without relaxing the canonical envelope", () => {
    const envelope = createCanonicalError({
      code: "VALIDATION_ERROR",
      message: "Data pendaftaran belum lengkap.",
      requestId: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
      fields: { nik: "required" },
    });

    expect(envelope.error.fields).toEqual({ nik: "required" });
  });

  it("rejects unsafe request IDs and malformed error codes", () => {
    expect(requestIdSchema.safeParse("request id with spaces").success).toBe(false);
    expect(() =>
      createCanonicalError({
        code: "forbidden",
        message: "Forbidden",
        requestId: "0d5e8c8f-0f39-4b4e-87f5-30ac3c0c80bc",
      }),
    ).toThrow();
  });
});
