import { Body, Controller, Param, Patch, Req, UseGuards } from "@nestjs/common";
import {
  milestoneCodeSchema,
  milestoneDueDateMutationRequestSchema,
  type MilestoneDueDateMutationResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { MilestoneScheduleService } from "./milestone-schedule.service.js";

const uuidPathSchema = z.string().uuid();

@Controller()
@UseGuards(StaffAuthGuard)
export class MilestoneScheduleController {
  public constructor(private readonly service: MilestoneScheduleService) {}

  @Patch("pregnancies/:id/milestones/:code/due-date")
  public setDueDate(
    @Req() request: AuthenticatedRequest,
    @Param("id") pregnancyId: string,
    @Param("code") code: string,
    @Body() body: unknown,
  ): Promise<MilestoneDueDateMutationResponse> {
    return this.service.setDueDate(
      requireActor(request),
      parseRequest(uuidPathSchema, pregnancyId),
      parseRequest(milestoneCodeSchema, code),
      parseRequest(milestoneDueDateMutationRequestSchema, body),
    );
  }
}
