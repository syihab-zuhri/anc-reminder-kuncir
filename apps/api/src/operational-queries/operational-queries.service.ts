import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type {
  MotherDetailResponse,
  MotherListQuery,
  MotherListResponse,
  OperationalMilestonesQuery,
  OperationalMilestonesResponse,
} from "@anc/contracts";

import type { StaffActor } from "../auth/staff-auth.types.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import { API_CONFIG, CLOCK, OPERATIONAL_QUERIES_REPOSITORY } from "../infrastructure/tokens.js";
import type { OperationalQueriesRepository } from "./operational-queries.repository.js";

@Injectable()
export class OperationalQueriesService {
  public constructor(
    @Inject(OPERATIONAL_QUERIES_REPOSITORY)
    private readonly repository: OperationalQueriesRepository,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
  ) {}

  public async getMothers(
    actor: StaffActor,
    query: MotherListQuery,
  ): Promise<MotherListResponse> {
    this.policy.assertCapability(actor, "MOTHER_BASIC_READ");
    if (actor.healthCenterId === null) throw forbidden();

    return this.repository.findMothers(
      actor,
      query,
      this.clock(),
      this.config.primaryTimezone,
    );
  }

  public async getMotherById(
    actor: StaffActor,
    motherId: string,
  ): Promise<MotherDetailResponse> {
    this.policy.assertCapability(actor, "MOTHER_BASIC_READ");
    if (actor.healthCenterId === null) throw forbidden();

    const result = await this.repository.findMotherById(
      actor,
      motherId,
      this.clock(),
      this.config.primaryTimezone,
    );

    if (result === null) {
      throw new ApiException({
        status: HttpStatus.NOT_FOUND,
        code: "MOTHER_NOT_FOUND",
        message: "Data Ibu Hamil tidak ditemukan atau berada di luar wewenang.",
      });
    }

    return result;
  }

  public async getOperationalMilestones(
    actor: StaffActor,
    query: OperationalMilestonesQuery,
  ): Promise<OperationalMilestonesResponse> {
    this.policy.assertCapability(actor, "MOTHER_BASIC_READ");
    if (actor.healthCenterId === null) throw forbidden();

    return this.repository.findOperationalMilestones(
      actor,
      query,
      this.clock(),
      this.config.primaryTimezone,
    );
  }
}
