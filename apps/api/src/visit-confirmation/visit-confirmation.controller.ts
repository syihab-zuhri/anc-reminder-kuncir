import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { visitConfirmationRequestSchema, type VisitConfirmationResponse } from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { VisitConfirmationService } from "./visit-confirmation.service.js";

const uuidPathSchema = z.string().uuid();

@Controller()
@UseGuards(StaffAuthGuard)
export class VisitConfirmationController {
  public constructor(private readonly service: VisitConfirmationService) {}

  @Post("milestones/:id/confirm")
  public confirm(
    @Req() request: AuthenticatedRequest,
    @Param("id") milestoneId: string,
    @Body() body: unknown,
  ): Promise<VisitConfirmationResponse> {
    return this.service.confirm(
      requireActor(request),
      parseRequest(uuidPathSchema, milestoneId),
      parseRequest(visitConfirmationRequestSchema, body),
    );
  }
}
