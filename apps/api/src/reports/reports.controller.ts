import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { OrganizationReportResponse } from "@anc/contracts";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { ReportsService } from "./reports.service.js";

@Controller("reports")
@UseGuards(StaffAuthGuard)
export class ReportsController {
  public constructor(private readonly service: ReportsService) {}

  @Get("summary")
  public getSummary(@Req() request: AuthenticatedRequest): Promise<OrganizationReportResponse> {
    return this.service.getSummary(requireActor(request));
  }
}
