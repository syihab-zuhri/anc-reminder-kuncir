import { Controller, Get, Header, Req, UseGuards } from "@nestjs/common";
import { reminderSummaryResponseSchema, type ReminderSummaryResponse } from "@anc/contracts";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { ReminderOperationsService } from "./reminder-operations.service.js";

// WhatsApp follow-up actions, including "unreachable", live under /wa-fallback only.
@Controller("reminders")
@UseGuards(StaffAuthGuard)
export class ReminderOperationsController {
  public constructor(private readonly service: ReminderOperationsService) {}

  @Get("summary")
  @Header("Cache-Control", "no-store")
  public async getSummary(@Req() request: AuthenticatedRequest): Promise<ReminderSummaryResponse> {
    const result = await this.service.getSummary(requireActor(request));
    return parseRequest(reminderSummaryResponseSchema, result);
  }
}
