import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { bumilDashboardResponseSchema, type BumilDashboardResponse } from "@anc/contracts";
import type { Response } from "express";

import { MotherAuthGuard } from "../mother-access/mother-auth.guard.js";
import type { MotherAuthenticatedRequest } from "../mother-access/mother-auth.types.js";
import { requireMotherActor } from "../mother-access/mother-auth.controller.js";
import { parseRequest } from "../validation/parse-request.js";
import { DashboardService } from "./dashboard.service.js";

@Controller()
export class MotherDashboardController {
  public constructor(private readonly service: DashboardService) {}

  @Get("mother/me/dashboard")
  @UseGuards(MotherAuthGuard)
  public async getMotherMeDashboard(
    @Req() request: MotherAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BumilDashboardResponse> {
    const actor = requireMotherActor(request);
    setPrivateNoStore(response);
    const result = await this.service.getBumilDashboard(actor);
    return parseRequest(bumilDashboardResponseSchema, result);
  }

  @Get("dashboard/bumil")
  @UseGuards(MotherAuthGuard)
  public async getBumilDashboard(
    @Req() request: MotherAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BumilDashboardResponse> {
    const actor = requireMotherActor(request);
    setPrivateNoStore(response);
    const result = await this.service.getBumilDashboard(actor);
    return parseRequest(bumilDashboardResponseSchema, result);
  }
}

function setPrivateNoStore(response: Response): void {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
}
