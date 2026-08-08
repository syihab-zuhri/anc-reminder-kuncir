import { z } from "zod";

import { requestIdSchema } from "./request-id.js";

export const canonicalErrorCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, "Error codes must use UPPER_SNAKE_CASE");

export type CanonicalErrorCode = z.infer<typeof canonicalErrorCodeSchema>;

export const canonicalErrorSchema = z
  .object({
    code: canonicalErrorCodeSchema,
    message: z.string().trim().min(1),
    request_id: requestIdSchema,
    details: z.unknown().nullable(),
    fields: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type CanonicalError = z.infer<typeof canonicalErrorSchema>;

export const canonicalErrorEnvelopeSchema = z
  .object({
    error: canonicalErrorSchema,
  })
  .strict();

export type CanonicalErrorEnvelope = z.infer<typeof canonicalErrorEnvelopeSchema>;

export interface CreateCanonicalErrorInput {
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
  readonly details?: unknown;
  readonly fields?: Readonly<Record<string, string>>;
}

export function createCanonicalError(input: CreateCanonicalErrorInput): CanonicalErrorEnvelope {
  const fields = input.fields === undefined ? {} : { fields: input.fields };

  return canonicalErrorEnvelopeSchema.parse({
    error: {
      code: input.code,
      message: input.message,
      request_id: input.requestId,
      details: input.details ?? null,
      ...fields,
    },
  });
}
