import { describe, expect, it } from "vitest";

import {
  clinicalRecordReopenRequestSchema,
  clinicalRecordResponseSchema,
  clinicalRecordSaveRequestSchema,
  clinicalRecordValidateRequestSchema,
} from "../src/index.js";

const idempotencyKey = "10000000-0000-4000-8000-000000000001";
const revisionId = "20000000-0000-4000-8000-000000000001";

describe("clinical record contracts", () => {
  it("accepts a bounded versioned payload without imposing unapproved clinical fields", () => {
    expect(
      clinicalRecordSaveRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: null,
        schema_version: "synthetic.k3.v1",
        record_payload: { synthetic_component: { state: "RECORDED" } },
      }),
    ).toMatchObject({ schema_version: "synthetic.k3.v1" });
  });

  it("rejects empty, unsafe, oversized, and unknown input", () => {
    expect(() =>
      clinicalRecordSaveRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: null,
        schema_version: "synthetic.k3.v1",
        record_payload: {},
      }),
    ).toThrow();
    expect(() =>
      clinicalRecordSaveRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: null,
        schema_version: "synthetic.k3.v1",
        record_payload: JSON.parse('{"__proto__":{"polluted":true}}') as unknown,
      }),
    ).toThrow();
    expect(() =>
      clinicalRecordSaveRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: null,
        schema_version: "synthetic.k3.v1",
        record_payload: { note: "x".repeat(65_537) },
      }),
    ).toThrow();
    expect(() =>
      clinicalRecordSaveRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: null,
        schema_version: "synthetic.k3.v1",
        record_payload: { synthetic_component: true },
        clinical_approval: true,
      }),
    ).toThrow();
  });

  it("requires explicit validation attestation and a reopen reason", () => {
    expect(
      clinicalRecordValidateRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: revisionId,
        attestation: "DETAIL_REVIEWED_COMPLETE",
      }),
    ).toBeDefined();
    expect(() =>
      clinicalRecordValidateRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: revisionId,
        attestation: "VALID",
      }),
    ).toThrow();
    expect(() =>
      clinicalRecordReopenRequestSchema.parse({
        idempotency_key: idempotencyKey,
        expected_revision_id: revisionId,
        reason: "x",
      }),
    ).toThrow();
  });

  it("keeps validated state metadata paired", () => {
    const base = {
      record_id: "30000000-0000-4000-8000-000000000001",
      milestone_id: "40000000-0000-4000-8000-000000000001",
      pregnancy_id: "50000000-0000-4000-8000-000000000001",
      code: "K3",
      revision_id: revisionId,
      revision_no: 1,
      schema_version: "synthetic.k3.v1",
      record_payload: { synthetic_component: true },
    } as const;
    expect(
      clinicalRecordResponseSchema.parse({
        ...base,
        record_validation_status: "VALIDATED",
        validated_at: "2026-08-12T01:00:00.000Z",
        validated_by_staff_id: "60000000-0000-4000-8000-000000000001",
      }),
    ).toBeDefined();
    expect(() =>
      clinicalRecordResponseSchema.parse({
        ...base,
        record_validation_status: "INCOMPLETE",
        validated_at: "2026-08-12T01:00:00.000Z",
        validated_by_staff_id: null,
      }),
    ).toThrow();
  });
});
