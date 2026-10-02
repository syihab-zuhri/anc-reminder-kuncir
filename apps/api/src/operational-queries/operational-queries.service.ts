import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type {
  MotherDetailResponse,
  MotherExportQuery,
  MotherExportResponse,
  MotherListQuery,
  MotherListResponse,
  OperationalMilestonesQuery,
  OperationalMilestonesResponse,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import {
  API_CONFIG,
  AUDIT_SERVICE,
  CLOCK,
  OPERATIONAL_QUERIES_REPOSITORY,
} from "../infrastructure/tokens.js";
import type { OperationalQueriesRepository } from "./operational-queries.repository.js";

/** Far above the number of mothers one Puskesmas registers; keeps a single export bounded. */
export const motherExportMaxRows = 5000;

@Injectable()
export class OperationalQueriesService {
  public constructor(
    @Inject(OPERATIONAL_QUERIES_REPOSITORY)
    private readonly repository: OperationalQueriesRepository,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    private readonly policy: AuthorizationPolicy,
  ) {}

  public async getMothers(actor: StaffActor, query: MotherListQuery): Promise<MotherListResponse> {
    this.policy.assertCapability(actor, "MOTHER_BASIC_READ");
    if (actor.healthCenterId === null) throw forbidden();

    return this.repository.findMothers(actor, query, this.clock(), this.config.primaryTimezone);
  }

  /**
   * Every mother the actor may see that matches the filters, in one response. The file holds
   * full addresses and phone numbers, so each export is audited before the data leaves.
   */
  public async exportMothers(
    actor: StaffActor,
    query: MotherExportQuery,
  ): Promise<MotherExportResponse> {
    this.policy.assertCapability(actor, "MOTHER_BASIC_READ");
    if (actor.healthCenterId === null) throw forbidden();

    const now = this.clock();
    const result = await this.repository.findMothers(
      actor,
      { ...query, limit: motherExportMaxRows },
      now,
      this.config.primaryTimezone,
    );
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "MOTHER_LIST_EXPORTED",
      resourceType: "MOTHER_LIST",
      metadata: {
        row_count: result.items.length,
        truncated: result.has_more,
        village_id: query.village_id ?? null,
        pregnancy_status: query.pregnancy_status ?? null,
        search_applied: query.search !== undefined && query.search !== "",
      },
      occurredAt: now,
    });
    return { items: result.items, truncated: result.has_more, max_rows: motherExportMaxRows };
  }

  public async getMotherById(actor: StaffActor, motherId: string): Promise<MotherDetailResponse> {
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
