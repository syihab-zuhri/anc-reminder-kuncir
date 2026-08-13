import { z } from "zod";

import { idempotencyKeySchema } from "./idempotency.js";

export const contentTemplateTypeSchema = z.enum([
  "PUSH_REMINDER",
  "WAME_REMINDER",
  "EDUCATION",
  "CONTACT_GUIDANCE",
]);
export type ContentTemplateType = z.infer<typeof contentTemplateTypeSchema>;

export const contentVersionStatusSchema = z.enum([
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
]);
export type ContentVersionStatus = z.infer<typeof contentVersionStatusSchema>;

export const contentPlaceholderKeySchema = z.enum(["milestone_code", "facility_name"]);
export type ContentPlaceholderKey = z.infer<typeof contentPlaceholderKeySchema>;

const templateKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9._-]{2,79}$/u, "Template key must use the safe key grammar");

const contentTitleSchema = z.string().trim().min(1).max(120).refine(isSanitizedPlainText, {
  message: "Content title must be sanitized plain text",
});

const contentBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(isSanitizedPlainText, { message: "Content body must be sanitized plain text" });

const sourceReferenceSchema = z.string().trim().min(3).max(240);

const contentVersionPayloadSchema = z
  .object({
    title: contentTitleSchema,
    body: contentBodySchema,
    source_reference: sourceReferenceSchema,
  })
  .strict();

export const contentTemplateCreateRequestSchema = contentVersionPayloadSchema
  .extend({
    idempotency_key: idempotencyKeySchema,
    template_key: templateKeySchema,
    content_type: contentTemplateTypeSchema,
  })
  .strict()
  .superRefine(validateContentPayload);
export type ContentTemplateCreateRequest = z.infer<typeof contentTemplateCreateRequestSchema>;

export const contentVersionCreateRequestSchema = contentVersionPayloadSchema
  .extend({ idempotency_key: idempotencyKeySchema })
  .strict()
  .superRefine(validateContentPayload);
export type ContentVersionCreateRequest = z.infer<typeof contentVersionCreateRequestSchema>;

export const contentVersionSubmitRequestSchema = z
  .object({ idempotency_key: idempotencyKeySchema })
  .strict();
export type ContentVersionSubmitRequest = z.infer<typeof contentVersionSubmitRequestSchema>;

export const contentVersionApproveRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    approval_reference: sourceReferenceSchema,
  })
  .strict();
export type ContentVersionApproveRequest = z.infer<typeof contentVersionApproveRequestSchema>;

export const contentVersionPublishRequestSchema = contentVersionSubmitRequestSchema;
export type ContentVersionPublishRequest = z.infer<typeof contentVersionPublishRequestSchema>;

export const contentVersionArchiveRequestSchema = contentVersionSubmitRequestSchema;
export type ContentVersionArchiveRequest = z.infer<typeof contentVersionArchiveRequestSchema>;

export const contentVersionResponseSchema = z
  .object({
    id: z.string().uuid(),
    content_template_id: z.string().uuid(),
    version_no: z.number().int().positive(),
    status: contentVersionStatusSchema,
    title: contentTitleSchema,
    body: contentBodySchema,
    placeholder_keys: z.array(contentPlaceholderKeySchema),
    source_reference: sourceReferenceSchema,
    approval_reference: sourceReferenceSchema.nullable(),
    created_by_staff_id: z.string().uuid().nullable(),
    submitted_by_staff_id: z.string().uuid().nullable(),
    submitted_at: z.string().datetime({ offset: true }).nullable(),
    approved_by_staff_id: z.string().uuid().nullable(),
    approved_at: z.string().datetime({ offset: true }).nullable(),
    published_by_staff_id: z.string().uuid().nullable(),
    published_at: z.string().datetime({ offset: true }).nullable(),
    archived_by_staff_id: z.string().uuid().nullable(),
    archived_at: z.string().datetime({ offset: true }).nullable(),
    created_at: z.string().datetime({ offset: true }),
    production_eligible: z.boolean(),
  })
  .strict()
  .superRefine((version, context) => {
    if (version.production_eligible !== (version.status === "PUBLISHED")) {
      context.addIssue({
        code: "custom",
        path: ["production_eligible"],
        message: "Only PUBLISHED content is production eligible",
      });
    }
  });
export type ContentVersionResponse = z.infer<typeof contentVersionResponseSchema>;

export const contentTemplateResponseSchema = z
  .object({
    id: z.string().uuid(),
    health_center_id: z.string().uuid().nullable(),
    template_key: templateKeySchema,
    content_type: contentTemplateTypeSchema,
    system_managed: z.boolean(),
    created_at: z.string().datetime({ offset: true }),
    versions: z.array(contentVersionResponseSchema),
  })
  .strict();
export type ContentTemplateResponse = z.infer<typeof contentTemplateResponseSchema>;

export const contentTemplateListResponseSchema = z
  .object({
    items: z.array(contentTemplateResponseSchema),
    total: z.number().int().min(0),
    capabilities: z
      .object({
        can_draft_and_review: z.boolean(),
        can_approve_publish_archive: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ContentTemplateListResponse = z.infer<typeof contentTemplateListResponseSchema>;

export function extractContentPlaceholderKeys(body: string): ContentPlaceholderKey[] {
  const keys: ContentPlaceholderKey[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gu)) {
    const key = match[1];
    if (key !== undefined && !seen.has(key)) {
      seen.add(key);
      if (contentPlaceholderKeySchema.safeParse(key).success)
        keys.push(key as ContentPlaceholderKey);
    }
  }
  return keys;
}

function validateContentPayload(
  value: { readonly body: string; readonly content_type?: ContentTemplateType },
  context: z.RefinementCtx,
): void {
  const allTokens = [...value.body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/gu)].map(
    (match) => match[1]?.trim() ?? "",
  );
  const unmatchedBraces = value.body.replace(/\{\{\s*[^{}]+?\s*\}\}/gu, "").match(/[{}]/u);
  if (unmatchedBraces !== null) {
    context.addIssue({
      code: "custom",
      path: ["body"],
      message: "Content contains malformed placeholder braces",
    });
  }
  for (const token of allTokens) {
    if (!contentPlaceholderKeySchema.safeParse(token).success) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: `Placeholder '${token}' is not allowed`,
      });
    }
  }

  if (value.content_type === "WAME_REMINDER") {
    const sensitive = new Set([
      "nik",
      "diagnosis",
      "diagnosa",
      "lab_result",
      "hasil_lab",
      "risk_category",
      "kategori_risiko",
    ]);
    if (allTokens.some((token) => sensitive.has(token.toLowerCase()))) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "WAME_REMINDER cannot contain sensitive placeholders",
      });
    }
  }
}

function isSanitizedPlainText(value: string): boolean {
  if (/[<>]/u.test(value)) return false;
  return [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  });
}
