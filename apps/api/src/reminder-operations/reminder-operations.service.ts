import { Inject, Injectable } from "@nestjs/common";
import type { ReminderSummaryResponse } from "@anc/contracts";

import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { CLOCK, REMINDER_OPERATIONS_REPOSITORY } from "../infrastructure/tokens.js";
import type { ReminderOperationsRepository } from "./reminder-operations.repository.js";

@Injectable()
export class ReminderOperationsService {
  public constructor(
    @Inject(REMINDER_OPERATIONS_REPOSITORY)
    private readonly repository: ReminderOperationsRepository,
    private readonly policy: AuthorizationPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly fallbackSlaHours: number,
  ) {}

  public getSummary(actor: StaffActor): Promise<ReminderSummaryResponse> {
    this.policy.assertCapability(actor, "WA_FALLBACK_ASSIGNED");
    if (actor.role !== "PUSKESMAS" || actor.healthCenterId === null) throw forbidden();
    return this.repository.getSummary(actor.healthCenterId, this.clock(), this.fallbackSlaHours);
  }
}
