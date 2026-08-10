import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Response } from "express";

import { MotherAuthService } from "./mother-auth.service.js";
import type { MotherAuthenticatedRequest } from "./mother-auth.types.js";

@Injectable()
export class MotherAuthGuard implements CanActivate {
  public constructor(private readonly auth: MotherAuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<MotherAuthenticatedRequest>();
    const response = http.getResponse<Response>();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Pragma", "no-cache");
    const authorization = request.header("authorization");
    const match = /^Bearer (\S+)$/u.exec(authorization ?? "");
    request.motherActor = await this.auth.authenticateAccessToken(match?.[1] ?? "");
    return true;
  }
}
