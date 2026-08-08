import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { REQUEST_ID_HEADER, createCanonicalError, type RequestId } from "@anc/contracts";
import type { Request, Response } from "express";
import type { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { JsonLogger } from "../observability/json-logger.js";
import {
  currentRequestId,
  resolveRequestId,
  type RequestWithId,
} from "../observability/request-context.js";
import { ApiException } from "./api.exception.js";

interface ResolvedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details: unknown;
  readonly fields?: Readonly<Record<string, string>>;
}

const statusDefaults: Readonly<Record<number, Pick<ResolvedError, "code" | "message">>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: "VALIDATION_ERROR",
    message: "Permintaan tidak valid.",
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: "UNAUTHENTICATED",
    message: "Autentikasi diperlukan.",
  },
  [HttpStatus.FORBIDDEN]: {
    code: "FORBIDDEN",
    message: "Anda tidak memiliki akses untuk tindakan ini.",
  },
  [HttpStatus.NOT_FOUND]: {
    code: "NOT_FOUND",
    message: "Sumber daya tidak ditemukan.",
  },
  [HttpStatus.CONFLICT]: {
    code: "CONFLICT",
    message: "Permintaan bertentangan dengan keadaan saat ini.",
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: "UNPROCESSABLE_ENTITY",
    message: "Permintaan tidak dapat diproses.",
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: "RATE_LIMITED",
    message: "Terlalu banyak permintaan. Silakan coba lagi.",
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: "SERVICE_UNAVAILABLE",
    message: "Layanan sementara tidak tersedia.",
  },
};

function requestPath(request: Request): string {
  return request.originalUrl.split("?", 1)[0] ?? request.path;
}

function requestIdFor(request: RequestWithId, response: Response): RequestId {
  const requestId = request.requestId ?? currentRequestId() ?? resolveRequestId(request);
  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof ApiException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
      ...(exception.fields === undefined ? {} : { fields: exception.fields }),
    };
  }

  const status =
    exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  const safeDefault = statusDefaults[status] ?? {
    code: "INTERNAL_ERROR",
    message: "Terjadi kesalahan pada server.",
  };

  return {
    status,
    code: safeDefault.code,
    message: safeDefault.message,
    details: null,
  };
}

@Catch()
export class CanonicalErrorFilter implements ExceptionFilter {
  public constructor(
    private readonly logger: JsonLogger,
    private readonly audit?: AuditService,
  ) {}

  public async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = requestIdFor(request, response);
    const resolved = resolveError(exception);

    if (resolved.status === Number(HttpStatus.FORBIDDEN)) {
      await this.recordAuthorizationDenial(request, requestId, resolved.code);
    }

    if (resolved.status >= 500) {
      this.logger.write("error", "API request failed", {
        event: "api_request_failed",
        error_name: exception instanceof Error ? exception.name : "UnknownException",
        method: request.method,
        path: requestPath(request),
        status: resolved.status,
      });
    }

    const envelope = createCanonicalError({
      code: resolved.code,
      message: resolved.message,
      requestId,
      details: resolved.details,
      ...(resolved.fields === undefined ? {} : { fields: resolved.fields }),
    });
    response.status(resolved.status).json(envelope);
  }

  private async recordAuthorizationDenial(
    request: RequestWithId,
    requestId: RequestId,
    reason: string,
  ): Promise<void> {
    const actor = (request as AuthenticatedRequest).staffActor;
    if (this.audit === undefined || actor === undefined) return;

    try {
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "AUTHZ_DENIED",
        resourceType: "API_REQUEST",
        metadata: { reason, request_id: requestId },
      });
    } catch (error) {
      this.logger.write("error", "Authorization denial audit failed", {
        event: "authorization_denial_audit_failed",
        error_name: error instanceof Error ? error.name : "UnknownError",
        method: request.method,
        path: requestPath(request),
      });
    }
  }
}
