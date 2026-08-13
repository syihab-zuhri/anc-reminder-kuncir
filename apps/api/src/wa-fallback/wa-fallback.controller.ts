import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  markWaFallbackUnreachableRequestSchema,
  resolveWaFallbackRequestSchema,
  type GenerateWaLinkResponse,
  type MarkWaFallbackUnreachableRequest,
  type ResolveWaFallbackRequest,
  type WaFallbackItem,
  type WaFallbackQueueResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { WaFallbackService } from "./wa-fallback.service.js";

const uuidPathSchema = z.string().uuid();

@Controller("wa-fallback")
@UseGuards(StaffAuthGuard)
export class WaFallbackController {
  public constructor(private readonly service: WaFallbackService) {}

  @Get("queue")
  public getQueue(@Req() request: AuthenticatedRequest): Promise<WaFallbackQueueResponse> {
    return this.service.getQueue(requireActor(request));
  }

  @Post(":id/generate-link")
  @HttpCode(HttpStatus.OK)
  public generateLink(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<GenerateWaLinkResponse> {
    return this.service.generateLink(requireActor(request), parseRequest(uuidPathSchema, id));
  }

  @Post(":id/mark-opened")
  @HttpCode(HttpStatus.OK)
  public markOpened(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<WaFallbackItem> {
    return this.service.markOpened(requireActor(request), parseRequest(uuidPathSchema, id));
  }

  @Post(":id/resolve")
  @HttpCode(HttpStatus.OK)
  public resolve(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WaFallbackItem> {
    const parsed: ResolveWaFallbackRequest = parseRequest(resolveWaFallbackRequestSchema, body);
    return this.service.resolve(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parsed.manual_note,
    );
  }

  @Post(":id/unreachable")
  @HttpCode(HttpStatus.OK)
  public markUnreachable(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WaFallbackItem> {
    const parsed: MarkWaFallbackUnreachableRequest = parseRequest(
      markWaFallbackUnreachableRequestSchema,
      body,
    );
    return this.service.markUnreachable(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parsed.manual_note,
    );
  }
}
