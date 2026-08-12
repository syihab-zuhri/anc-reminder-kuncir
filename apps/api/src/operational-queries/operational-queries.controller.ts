import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import {
  operationalMilestonesQuerySchema,
  operationalMilestonesResponseSchema,
  type OperationalMilestonesResponse,
} from "@anc/contracts";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { OperationalQueriesService } from "./operational-queries.service.js";

@Controller("operational")
@UseGuards(StaffAuthGuard)
export class OperationalQueriesController {
  public constructor(private readonly service: OperationalQueriesService) {}

  @Get("milestones")
  public async getOperationalMilestones(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<OperationalMilestonesResponse> {
    const actor = requireActor(request);
    const parsedQuery = parseRequest(operationalMilestonesQuerySchema, query);
    const result = await this.service.getOperationalMilestones(actor, parsedQuery);
    return parseRequest(operationalMilestonesResponseSchema, result);
  }
}
