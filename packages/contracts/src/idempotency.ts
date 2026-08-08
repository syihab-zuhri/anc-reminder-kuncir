import { z } from "zod";

export const idempotencyKeySchema = z.string().uuid();
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
