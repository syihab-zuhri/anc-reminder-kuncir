import { Inject, Injectable } from "@nestjs/common";
import type { OrganizationReportResponse } from "@anc/contracts";

import type { Clock } from "../auth/staff-auth.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { CLOCK, REPORTS_REPOSITORY } from "../infrastructure/tokens.js";
import type { ReportsRepository } from "./reports.repository.js";

@Injectable()
export class ReportsService {
  public constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly repository: ReportsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
  ) {}

  /** Aggregate counts for the actor's health center; Super Admin reads no health data. */
  public async getSummary(actor: StaffActor): Promise<OrganizationReportResponse> {
    this.policy.assertCapability(actor, "MOTHER_BASIC_READ");
    if (actor.healthCenterId === null) throw forbidden();
    return this.repository.getOrganizationSummary(actor.healthCenterId, this.clock());
  }
}
