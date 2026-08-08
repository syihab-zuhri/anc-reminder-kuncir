import { z } from "zod";

export const REQUEST_ID_HEADER = "x-request-id" as const;

export const requestIdSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    "Request ID must be a UUID v4",
  )
  .brand<"RequestId">();

export type RequestId = z.infer<typeof requestIdSchema>;
