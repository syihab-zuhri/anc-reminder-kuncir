import { describe, expect, it } from "vitest";

import {
  actorRoleSchema,
  canonicalErrorEnvelopeSchema,
  createCanonicalError,
  idempotencyKeySchema,
  milestoneCodeSchema,
  motherAccessCodeSchema,
  motherAccessCredentialIssueResponseSchema,
  motherAccessCredentialMutationRequestSchema,
  motherAccessValidateRequestSchema,
  motherMeResponseSchema,
  motherSessionResponseSchema,
  motherRegistrationRequestSchema,
  pregnancyCloseRequestSchema,
  pregnancyCreateRequestSchema,
  pregnancyDatingRevisionRequestSchema,
  pregnancyLifecycleResponseSchema,
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
      staffCreateRequestSchema.safeParse({
        login_identifier: "bidan.delapan",
        display_name: "Bidan Delapan",
        role: "BIDAN",
        password: "Bidan123",
      }).success,
    ).toBe(true);
    expect(
      staffCreateRequestSchema.safeParse({
        login_identifier: "bidan.tujuh",
        display_name: "Bidan Tujuh",
        role: "BIDAN",
        password: "Bidan12",
      }).success,
    ).toBe(false);
    expect(
      staffCreateRequestSchema.safeParse({
        login_identifier: "operator.puskesmas",
        display_name: "Operator Puskesmas",
        role: "PUSKESMAS",
        password: "OperatorKuncir2026",
      }).success,
    ).toBe(true);
    expect(
      staffCreateRequestSchema.safeParse({
        login_identifier: "super.admin.baru",
        display_name: "Super Admin Baru",
        role: "SUPER_ADMIN",
        password: "SuperAdminKuncir2026",
      }).success,
    ).toBe(false);
    expect(
      villageCreateRequestSchema.safeParse({ code: "KNC-01", name: "Desa Kuncir" }).success,
    ).toBe(true);
    expect(staffRefreshRequestSchema.safeParse({ refresh_token: "raw-token" }).success).toBe(false);
    expect(idempotencyKeySchema.safeParse("8b26fdbd-6306-4bbf-9765-3fd620888e7c").success).toBe(
      true,
    );
    expect(idempotencyKeySchema.safeParse("duplicate-click").success).toBe(false);
    expect(
      motherRegistrationRequestSchema.safeParse({
        idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
        full_name: "Siti Aminah",
        nik: "3273014901010001",
        address: "Jl. Mawar Nomor 1",
        phone_number: "0812-3456-789",
        pregnancy_start_date: "2026-05-01",
        consent: { notification_allowed: true },
      }).success,
    ).toBe(true);
    expect(
      motherRegistrationRequestSchema.safeParse({
        idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
        full_name: "Siti Aminah",
        nik: "not-a-nik",
        address: "Jl. Mawar Nomor 1",
        phone_number: "0812-3456-789",
        pregnancy_start_date: "2026-02-30",
        consent: { notification_allowed: true },
      }).success,
    ).toBe(false);
    expect(
      pregnancyCreateRequestSchema.safeParse({
        idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
        pregnancy_start_date: "2026-05-01",
      }).success,
    ).toBe(true);
    expect(
      pregnancyDatingRevisionRequestSchema.safeParse({
        idempotency_key: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
        pregnancy_start_date: "2026-04-28",
        reason: "Koreksi input awal",
      }).success,
    ).toBe(true);
    expect(
      pregnancyCloseRequestSchema.safeParse({
        idempotency_key: "0d5e8c8f-0f39-4b4e-87f5-30ac3c0c80bc",
        reason: "x",
      }).success,
    ).toBe(false);
    expect(
      pregnancyLifecycleResponseSchema.safeParse({
        id: "60000000-0000-4000-8000-000000000001",
        mother_id: "50000000-0000-4000-8000-000000000001",
        health_center_id: "30000000-0000-4000-8000-000000000001",
        dating_basis: "PREGNANCY_START_DATE",
        dating_date: "2026-05-01",
        status: "CLOSED",
        closed_at: null,
      }).success,
    ).toBe(false);
    expect(motherAccessCodeSchema.safeParse("ANC-2345-6789-ABCD-EFGH").success).toBe(true);
    expect(motherAccessCodeSchema.safeParse("ANC-0000-0000-0000-0000").success).toBe(false);
    expect(
      motherAccessCredentialMutationRequestSchema.safeParse({
        idempotency_key: "80000000-0000-4000-8000-000000000001",
        reason: "Kode sebelumnya hilang",
      }).success,
    ).toBe(true);
    expect(
      motherAccessCredentialIssueResponseSchema.safeParse({
        id: "70000000-0000-4000-8000-000000000001",
        mother_id: "50000000-0000-4000-8000-000000000001",
        issuance_type: "ISSUED",
        status: "ACTIVE",
        issued_at: "2026-08-10T09:00:00.000Z",
        one_time_code: null,
        code_delivery: "DISPLAY_ONCE",
      }).success,
    ).toBe(false);
    expect(
      motherAccessValidateRequestSchema.safeParse({
        full_name: "Siti Aminah",
        access_code: "anc-2345-6789-abcd-efgh",
      }).success,
    ).toBe(true);
    expect(
      motherAccessValidateRequestSchema.safeParse({
        full_name: "Siti Aminah",
        access_code: "ANC-2345-6789-ABCD-EFGH",
        mother_id: "50000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
    expect(
      motherSessionResponseSchema.safeParse({
        token_type: "Bearer",
        access_token: `anc_mt_${"a".repeat(43)}`,
        expires_at: "2026-09-09T09:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      motherMeResponseSchema.safeParse({
        id: "50000000-0000-4000-8000-000000000001",
        display_name: "Siti Aminah",
        active_pregnancy_id: "60000000-0000-4000-8000-000000000001",
        session_id: "70000000-0000-4000-8000-000000000001",
        session_expires_at: "2026-09-09T09:00:00.000Z",
      }).success,
    ).toBe(true);
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
