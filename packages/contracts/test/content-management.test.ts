import { describe, expect, it } from "vitest";

import {
  contentTemplateCreateRequestSchema,
  contentTemplateListResponseSchema,
  contentVersionResponseSchema,
  extractContentPlaceholderKeys,
} from "../src/index.js";

const idempotencyKey = "8b26fdbd-6306-4bbf-9765-3fd620888e7c";

describe("content management contracts", () => {
  it("accepts sanitized reminder copy and extracts an ordered placeholder snapshot", () => {
    const request = {
      idempotency_key: idempotencyKey,
      template_key: "anc.wame-reminder",
      content_type: "WAME_REMINDER",
      title: "Pengingat ANC",
      body: "Pengingat {{milestone_code}} dari {{facility_name}}. Hubungi {{facility_name}}.",
      source_reference: "SOP-ANC-SYNTHETIC-001",
    };
    expect(contentTemplateCreateRequestSchema.safeParse(request).success).toBe(true);
    expect(extractContentPlaceholderKeys(request.body)).toEqual([
      "milestone_code",
      "facility_name",
    ]);
  });

  it.each(["nik", "diagnosis", "lab_result", "risk_category", "mother_name"])(
    "rejects non-allowlisted placeholder %s from wa.me copy",
    (placeholder) => {
      expect(
        contentTemplateCreateRequestSchema.safeParse({
          idempotency_key: idempotencyKey,
          template_key: "anc.wame-reminder",
          content_type: "WAME_REMINDER",
          title: "Pengingat ANC",
          body: `Data {{${placeholder}}}`,
          source_reference: "SOP-ANC-SYNTHETIC-001",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects HTML, malformed braces, and synthetic delivery status fields", () => {
    expect(
      contentTemplateCreateRequestSchema.safeParse({
        idempotency_key: idempotencyKey,
        template_key: "anc.push-reminder",
        content_type: "PUSH_REMINDER",
        title: "Pengingat ANC",
        body: "<strong>Periksa {{milestone_code}}</strong>",
        source_reference: "SOP-ANC-SYNTHETIC-001",
      }).success,
    ).toBe(false);
    expect(
      contentTemplateCreateRequestSchema.safeParse({
        idempotency_key: idempotencyKey,
        template_key: "anc.push-reminder",
        content_type: "PUSH_REMINDER",
        title: "Pengingat ANC",
        body: "Periksa {{milestone_code}",
        source_reference: "SOP-ANC-SYNTHETIC-001",
      }).success,
    ).toBe(false);
    expect(
      contentVersionResponseSchema.safeParse({ delivered: true, status: "PUBLISHED" }).success,
    ).toBe(false);
  });

  it("requires server-derived content governance capabilities", () => {
    expect(
      contentTemplateListResponseSchema.safeParse({
        items: [],
        total: 0,
        capabilities: {
          can_draft_and_review: true,
          can_approve_publish_archive: false,
        },
      }).success,
    ).toBe(true);
    expect(contentTemplateListResponseSchema.safeParse({ items: [], total: 0 }).success).toBe(
      false,
    );
  });
});
