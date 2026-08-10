import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  motherAccessValidateRequestSchema,
  type MotherMeResponse,
  type MotherSessionResponse,
} from "@anc/contracts";
import type { Response } from "express";

import { parseRequest } from "../validation/parse-request.js";
import { MotherAuthGuard } from "./mother-auth.guard.js";
import { MotherAuthService } from "./mother-auth.service.js";
import type { MotherActor, MotherAuthenticatedRequest } from "./mother-auth.types.js";

@Controller()
export class MotherAuthController {
  public constructor(private readonly auth: MotherAuthService) {}

  @Post("mother-access/validate")
  @HttpCode(HttpStatus.OK)
  public validate(
    @Req() request: MotherAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<MotherSessionResponse> {
    setPrivateNoStore(response);
    return this.auth.validate(
      parseRequest(motherAccessValidateRequestSchema, body),
      request.ip ?? request.socket.remoteAddress ?? "unknown",
    );
  }

  @Post("mother-access/logout")
  @UseGuards(MotherAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(
    @Req() request: MotherAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    setPrivateNoStore(response);
    await this.auth.logout(requireMotherActor(request));
  }

  @Get("mother/me")
  @UseGuards(MotherAuthGuard)
  public me(
    @Req() request: MotherAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): MotherMeResponse {
    setPrivateNoStore(response);
    return this.auth.me(requireMotherActor(request));
  }
}

export function requireMotherActor(request: MotherAuthenticatedRequest): MotherActor {
  const actor = request.motherActor;
  if (actor === undefined) throw new Error("MotherAuthGuard did not attach an actor");
  return actor;
}

function setPrivateNoStore(response: Response): void {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
}
