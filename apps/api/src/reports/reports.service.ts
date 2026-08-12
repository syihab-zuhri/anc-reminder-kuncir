import { Inject, Injectable } from "@nestjs/common";
import type { OrganizationReportResponse } from "@anc/contracts";

import { REPORTS_REPOSITORY } from "../infrastructure/tokens.js";
import type { ReportsRepository } from "./reports.repository.js";

@Injectable()
export class ReportsService {
  public constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly repository: ReportsRepository,
  ) {}

  public async getSummary(
    healthCenterId: string,
    now = new Date(),
  ): Promise<OrganizationReportResponse> {
    return this.repository.getOrganizationSummary(healthCenterId, now);
  }
}
