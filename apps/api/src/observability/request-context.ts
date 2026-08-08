import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { REQUEST_ID_HEADER, requestIdSchema, type RequestId } from "@anc/contracts";
import type { NextFunction, Request, Response } from "express";

interface RequestContextState {
  readonly requestId: RequestId;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextState>();

export type RequestWithId = Request & { requestId?: RequestId };

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveRequestId(request: Request): RequestId {
  const supplied = firstHeaderValue(request.headers[REQUEST_ID_HEADER]);
  const parsed = requestIdSchema.safeParse(supplied);

  // Correlation IDs are operational metadata. Reject NIK-shaped values even
  // when they satisfy the generic character-level contract.
  if (parsed.success && !/\d{16}/u.test(parsed.data)) {
    return parsed.data;
  }

  return requestIdSchema.parse(randomUUID());
}

export function requestContextMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request);
  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  requestContextStorage.run({ requestId }, next);
}

export function currentRequestId(): RequestId | undefined {
  return requestContextStorage.getStore()?.requestId;
}
