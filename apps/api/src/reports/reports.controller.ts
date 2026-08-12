import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { ReportsService } from "./reports.service.js";

@Controller("reports")
@UseGuards(StaffAuthGuard)
export class ReportsController {
  public constructor(private readonly service: ReportsService) {}

  @Get("summary")
  public async getSummary(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    const actor = requireActor(req);

    if (actor.role === "SUPER_ADMIN") {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Super Admin tidak memiliki akses ke laporan operasional kesehatan.",
        },
      });
      return;
    }

    if (actor.healthCenterId === null) {
      res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "Akses laporan memerlukan identitas Puskesmas yang sah.",
        },
      });
      return;
    }

    const report = await this.service.getSummary(actor.healthCenterId);
    res.status(200).json(report);
  }
}
