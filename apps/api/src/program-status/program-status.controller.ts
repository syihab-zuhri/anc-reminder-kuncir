import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  programAssessmentRecalculateRequestSchema,
  programRuleVersionActivateRequestSchema,
  programRuleVersionApproveRequestSchema,
  programRuleVersionCreateRequestSchema,
  type ProgramRuleVersionResponse,
  type ProgramStatusHistoryResponse,
  type ProgramStatusResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { ProgramStatusService } from "./program-status.service.js";

const uuidPathSchema = z.string().uuid();

@Controller()
@UseGuards(StaffAuthGuard)
export class ProgramStatusController {
  public constructor(private readonly service: ProgramStatusService) {}

  @Get("program-rules/active")
  public activeRule(@Req() request: AuthenticatedRequest): Promise<ProgramRuleVersionResponse> {
    return this.service.activeRule(requireActor(request));
  }

  @Post("program-rules/versions")
  public createDraft(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ProgramRuleVersionResponse> {
    return this.service.createDraft(
      requireActor(request),
      parseRequest(programRuleVersionCreateRequestSchema, body),
    );
  }

  @Post("program-rules/versions/:id/approve")
  public approve(
    @Req() request: AuthenticatedRequest,
    @Param("id") ruleId: string,
    @Body() body: unknown,
  ): Promise<ProgramRuleVersionResponse> {
    return this.service.approve(
      requireActor(request),
      parseRequest(uuidPathSchema, ruleId),
      parseRequest(programRuleVersionApproveRequestSchema, body),
    );
  }

  @Post("program-rules/versions/:id/activate")
  public activate(
    @Req() request: AuthenticatedRequest,
    @Param("id") ruleId: string,
    @Body() body: unknown,
  ): Promise<ProgramRuleVersionResponse> {
    return this.service.activate(
      requireActor(request),
      parseRequest(uuidPathSchema, ruleId),
      parseRequest(programRuleVersionActivateRequestSchema, body),
    );
  }

  @Get("pregnancies/:id/program-status")
  public getStatus(
    @Req() request: AuthenticatedRequest,
    @Param("id") pregnancyId: string,
  ): Promise<ProgramStatusResponse> {
    return this.service.getStatus(requireActor(request), parseRequest(uuidPathSchema, pregnancyId));
  }

  @Post("pregnancies/:id/program-status/recalculate")
  public recalculate(
    @Req() request: AuthenticatedRequest,
    @Param("id") pregnancyId: string,
    @Body() body: unknown,
  ): Promise<ProgramStatusResponse> {
    return this.service.recalculate(
      requireActor(request),
      parseRequest(uuidPathSchema, pregnancyId),
      parseRequest(programAssessmentRecalculateRequestSchema, body),
    );
  }

  @Get("pregnancies/:id/program-status/history")
  public history(
    @Req() request: AuthenticatedRequest,
    @Param("id") pregnancyId: string,
  ): Promise<ProgramStatusHistoryResponse> {
    return this.service.history(requireActor(request), parseRequest(uuidPathSchema, pregnancyId));
  }
}
