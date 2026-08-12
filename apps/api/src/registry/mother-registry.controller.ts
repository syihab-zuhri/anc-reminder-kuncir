import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  motherDetailResponseSchema,
  motherListQuerySchema,
  motherListResponseSchema,
  motherRegistrationRequestSchema,
  type MotherDetailResponse,
  type MotherListResponse,
  type MotherRegistrationResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { OperationalQueriesService } from "../operational-queries/operational-queries.service.js";
import { parseRequest } from "../validation/parse-request.js";
import { MotherRegistryService } from "./mother-registry.service.js";

const uuidPathSchema = z.string().uuid();

@Controller("mothers")
@UseGuards(StaffAuthGuard)
export class MotherRegistryController {
  public constructor(
    private readonly service: MotherRegistryService,
    private readonly queriesService: OperationalQueriesService,
  ) {}

  @Post()
  public register(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<MotherRegistrationResponse> {
    return this.service.register(
      requireActor(request),
      parseRequest(motherRegistrationRequestSchema, body),
    );
  }

  @Get()
  public async getMothers(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<MotherListResponse> {
    const actor = requireActor(request);
    const parsedQuery = parseRequest(motherListQuerySchema, query);
    const result = await this.queriesService.getMothers(actor, parsedQuery);
    return parseRequest(motherListResponseSchema, result);
  }

  @Get(":id")
  public async getMotherById(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<MotherDetailResponse> {
    const actor = requireActor(request);
    const parsedId = parseRequest(uuidPathSchema, id);
    const result = await this.queriesService.getMotherById(actor, parsedId);
    return parseRequest(motherDetailResponseSchema, result);
  }
}
