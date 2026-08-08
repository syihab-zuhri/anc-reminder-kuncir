import { HttpStatus } from "@nestjs/common";
import type { z } from "zod";

import { ApiException } from "../errors/api.exception.js";

export function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.length === 0 ? "request" : issue.path.join(".");
    fields[path] ??= issue.message;
  }

  throw new ApiException({
    status: HttpStatus.BAD_REQUEST,
    code: "VALIDATION_ERROR",
    message: "Permintaan tidak valid.",
    fields,
  });
}
