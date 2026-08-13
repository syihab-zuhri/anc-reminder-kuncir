import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  markWaFallbackUnreachableRequestSchema,
  reminderSummaryResponseSchema,
  type MarkWaFallbackUnreachableRequest,
  type ReminderSummaryResponse,
  type WaFallbackItem,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { WaFallbackService } from "../wa-fallback/wa-fallback.service.js";
import { ReminderOperationsService } from "./reminder-operations.service.js";

const uuidPathSchema = z.string().uuid();

@Controller("reminders")
@UseGuards(StaffAuthGuard)
export class ReminderOperationsController {
  public constructor(
    private readonly service: ReminderOperationsService,
    private readonly waFallbackService: WaFallbackService,
  ) {}

  @Get("summary")
  @Header("Cache-Control", "no-store")
  public async getSummary(@Req() request: AuthenticatedRequest): Promise<ReminderSummaryResponse> {
    const result = await this.service.getSummary(requireActor(request));
    return parseRequest(reminderSummaryResponseSchema, result);
  }

  @Post("fallback-actions/:id/unreachable")
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
    return this.waFallbackService.markUnreachable(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parsed.manual_note,
    );
  }
}
