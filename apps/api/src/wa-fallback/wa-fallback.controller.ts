import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { WaFallbackService } from "./wa-fallback.service.js";

@Controller("wa-fallback")
@UseGuards(StaffAuthGuard)
export class WaFallbackController {
  public constructor(private readonly service: WaFallbackService) {}

  @Get("queue")
  public async getQueue(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    const actor = requireActor(req);
    if (actor.role === "SUPER_ADMIN") {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Super Admin tidak memiliki akses ke data operasional.",
        },
      });
      return;
    }

    const scope: { healthCenterId?: string; villageIds?: string[] } = {};
    if (actor.healthCenterId !== null) {
      scope.healthCenterId = actor.healthCenterId;
    }

    const result = await this.service.getQueue(scope);
    res.status(200).json(result);
  }

  @Post(":id/generate-link")
  public async generateLink(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const actor = requireActor(req);
    if (actor.role === "SUPER_ADMIN") {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Super Admin tidak memiliki akses ke data operasional.",
        },
      });
      return;
    }

    try {
      const result = await this.service.generateWaLink(id);
      res.status(200).json(result);
    } catch (err: unknown) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: (err as Error).message ?? "Tindak lanjut tidak ditemukan.",
        },
      });
    }
  }

  @Post(":id/resolve")
  public async resolve(
    @Param("id") id: string,
    @Body() body: { manual_note?: string },
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const actor = requireActor(req);
    if (actor.role === "SUPER_ADMIN") {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Super Admin tidak memiliki akses ke data operasional.",
        },
      });
      return;
    }

    try {
      const result = await this.service.resolve(id, actor.staffUserId, body.manual_note);
      res.status(200).json(result);
    } catch (err: unknown) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: (err as Error).message ?? "Tindak lanjut tidak ditemukan.",
        },
      });
    }
  }
}
