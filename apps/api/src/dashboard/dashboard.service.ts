import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type {
  BidanDashboardResponse,
  BumilDashboardResponse,
  PuskesmasDashboardResponse,
} from "@anc/contracts";

import type { MotherActor } from "../mother-access/mother-auth.types.js";
import type { StaffActor } from "../auth/staff-auth.types.js";

import { CLOCK, DASHBOARD_REPOSITORY } from "../infrastructure/tokens.js";
import type { DashboardRepository } from "./dashboard.repository.js";

@Injectable()
export class DashboardService {
  public constructor(
    @Inject(DASHBOARD_REPOSITORY) private readonly repository: DashboardRepository,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  public async getPuskesmasDashboard(
    actor: StaffActor,
    timezone = "Asia/Jakarta",
  ): Promise<PuskesmasDashboardResponse> {
    if (actor.role !== "PUSKESMAS" || actor.healthCenterId === null) {
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Only Puskesmas staff with an assigned health center can access this dashboard",
      });
    }
    return this.repository.getPuskesmasDashboard(actor, this.clock(), timezone);
  }

  public async getBidanDashboard(
    actor: StaffActor,
    timezone = "Asia/Jakarta",
  ): Promise<BidanDashboardResponse> {
    if (actor.role !== "BIDAN" || actor.healthCenterId === null) {
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Only Bidan staff can access this dashboard",
      });
    }
    return this.repository.getBidanDashboard(actor, this.clock(), timezone);
  }

  public async getBumilDashboard(
    actor: MotherActor,
    timezone = "Asia/Jakarta",
  ): Promise<BumilDashboardResponse> {
    return this.repository.getBumilDashboard(actor, this.clock(), timezone);
  }
}
