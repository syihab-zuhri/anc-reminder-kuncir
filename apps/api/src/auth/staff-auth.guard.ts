import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";

import { StaffAuthService } from "./staff-auth.service.js";
import type { AuthenticatedRequest } from "./staff-auth.types.js";

@Injectable()
export class StaffAuthGuard implements CanActivate {
  public constructor(private readonly authService: StaffAuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    const match = /^Bearer (\S+)$/.exec(authorization ?? "");
    const actor = await this.authService.authenticateAccessToken(match?.[1] ?? "");
    request.staffActor = actor;
    return true;
  }
}
