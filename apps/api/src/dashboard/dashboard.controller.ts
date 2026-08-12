import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import {
  bidanDashboardResponseSchema,
  puskesmasDashboardResponseSchema,
  type BidanDashboardResponse,
  type PuskesmasDashboardResponse,
} from "@anc/contracts";
import type { Response } from "express";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(StaffAuthGuard)
export class DashboardController {
  public constructor(private readonly service: DashboardService) {}

  @Get("puskesmas")
  public async getPuskesmasDashboard(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PuskesmasDashboardResponse> {
    const actor = requireActor(request);
    setPrivateNoStore(response);
    const result = await this.service.getPuskesmasDashboard(actor);
    return parseRequest(puskesmasDashboardResponseSchema, result);
  }

  @Get("bidan")
  public async getBidanDashboard(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BidanDashboardResponse> {
    const actor = requireActor(request);
    setPrivateNoStore(response);
    const result = await this.service.getBidanDashboard(actor);
    return parseRequest(bidanDashboardResponseSchema, result);
  }
}

function setPrivateNoStore(response: Response): void {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
}
