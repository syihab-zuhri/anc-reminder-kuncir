import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { JsonLogger } from "./json-logger.js";

function safePath(request: Request): string {
  return request.originalUrl.split("?", 1)[0] ?? request.path;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  public constructor(private readonly logger: JsonLogger) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logCompletion(request, response.statusCode, startedAt);
        },
        error: (error: unknown) => {
          const status = error instanceof HttpException ? error.getStatus() : 500;
          this.logCompletion(request, status, startedAt);
        },
      }),
    );
  }

  private logCompletion(request: Request, status: number, startedAt: number): void {
    this.logger.write("info", "API request completed", {
      event: "api_request_completed",
      method: request.method,
      path: safePath(request),
      status,
      duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  }
}
