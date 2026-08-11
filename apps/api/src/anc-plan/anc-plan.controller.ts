import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  ancPlanActivateRequestSchema,
  ancPlanApproveRequestSchema,
  ancPlanCreateRequestSchema,
  type AncPlanResponse,
  type PregnancyMilestoneListResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { AncPlanService } from "./anc-plan.service.js";

const uuidPathSchema = z.string().uuid();

@Controller()
@UseGuards(StaffAuthGuard)
export class AncPlanController {
  public constructor(private readonly service: AncPlanService) {}

  @Get("anc-plan/active")
  public active(@Req() request: AuthenticatedRequest): Promise<AncPlanResponse> {
    return this.service.active(requireActor(request));
  }

  @Post("anc-plan/versions")
  public createDraft(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<AncPlanResponse> {
    return this.service.createDraft(
      requireActor(request),
      parseRequest(ancPlanCreateRequestSchema, body),
    );
  }

  @Post("anc-plan/versions/:id/approve")
  public approve(
    @Req() request: AuthenticatedRequest,
    @Param("id") planId: string,
    @Body() body: unknown,
  ): Promise<AncPlanResponse> {
    return this.service.approve(
      requireActor(request),
      parseRequest(uuidPathSchema, planId),
      parseRequest(ancPlanApproveRequestSchema, body),
    );
  }

  @Post("anc-plan/versions/:id/activate")
  public activate(
    @Req() request: AuthenticatedRequest,
    @Param("id") planId: string,
    @Body() body: unknown,
  ): Promise<AncPlanResponse> {
    return this.service.activate(
      requireActor(request),
      parseRequest(uuidPathSchema, planId),
      parseRequest(ancPlanActivateRequestSchema, body),
    );
  }

  @Get("pregnancies/:id/milestones")
  public milestones(
    @Req() request: AuthenticatedRequest,
    @Param("id") pregnancyId: string,
  ): Promise<PregnancyMilestoneListResponse> {
    return this.service.milestones(
      requireActor(request),
      parseRequest(uuidPathSchema, pregnancyId),
    );
  }
}
