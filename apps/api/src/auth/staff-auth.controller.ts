import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import {
  staffLoginRequestSchema,
  staffRefreshRequestSchema,
  staffSessionRevokeRequestSchema,
  type StaffMeResponse,
  type StaffTokenResponse,
} from "@anc/contracts";

import { parseRequest } from "../validation/parse-request.js";
import { StaffAuthGuard } from "./staff-auth.guard.js";
import { StaffAuthService } from "./staff-auth.service.js";
import type { AuthenticatedRequest, StaffActor } from "./staff-auth.types.js";

@Controller("staff")
export class StaffAuthController {
  public constructor(private readonly authService: StaffAuthService) {}

  @Post("auth/login")
  @HttpCode(HttpStatus.OK)
  public login(@Body() body: unknown): Promise<StaffTokenResponse> {
    return this.authService.login(parseRequest(staffLoginRequestSchema, body));
  }

  @Post("auth/refresh")
  @HttpCode(HttpStatus.OK)
  public refresh(@Body() body: unknown): Promise<StaffTokenResponse> {
    const input = parseRequest(staffRefreshRequestSchema, body);
    return this.authService.refresh(input.refresh_token);
  }

  @Post("auth/logout")
  @UseGuards(StaffAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.authService.logout(requireActor(request));
  }

  @Get("me")
  @UseGuards(StaffAuthGuard)
  public me(@Req() request: AuthenticatedRequest): StaffMeResponse {
    return this.authService.me(requireActor(request));
  }

  @Post("sessions/revoke")
  @UseGuards(StaffAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  public async revoke(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<void> {
    const input = parseRequest(staffSessionRevokeRequestSchema, body);
    await this.authService.revokeSession(requireActor(request), input.session_id, input.reason);
  }
}

export function requireActor(request: AuthenticatedRequest): StaffActor {
  const actor = request.staffActor;
  if (actor === undefined) throw new Error("StaffAuthGuard did not attach an actor");
  return actor;
}
