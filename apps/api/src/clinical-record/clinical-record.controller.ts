import { Body, Controller, Get, Header, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  clinicalRecordReopenRequestSchema,
  clinicalRecordSaveRequestSchema,
  clinicalRecordValidateRequestSchema,
  type ClinicalRecordResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { ClinicalRecordService } from "./clinical-record.service.js";

const uuidPathSchema = z.string().uuid();

@Controller()
@UseGuards(StaffAuthGuard)
export class ClinicalRecordController {
  public constructor(private readonly service: ClinicalRecordService) {}

  @Get("milestones/:id/record")
  @Header("Cache-Control", "no-store")
  public get(
    @Req() request: AuthenticatedRequest,
    @Param("id") milestoneId: string,
  ): Promise<ClinicalRecordResponse> {
    return this.service.get(requireActor(request), parseRequest(uuidPathSchema, milestoneId));
  }

  @Put("milestones/:id/record")
  @Header("Cache-Control", "no-store")
  public save(
    @Req() request: AuthenticatedRequest,
    @Param("id") milestoneId: string,
    @Body() body: unknown,
  ): Promise<ClinicalRecordResponse> {
    return this.service.save(
      requireActor(request),
      parseRequest(uuidPathSchema, milestoneId),
      parseRequest(clinicalRecordSaveRequestSchema, body),
    );
  }

  @Post("milestones/:id/record/validate")
  @Header("Cache-Control", "no-store")
  public validate(
    @Req() request: AuthenticatedRequest,
    @Param("id") milestoneId: string,
    @Body() body: unknown,
  ): Promise<ClinicalRecordResponse> {
    return this.service.validate(
      requireActor(request),
      parseRequest(uuidPathSchema, milestoneId),
      parseRequest(clinicalRecordValidateRequestSchema, body),
    );
  }

  @Post("milestones/:id/record/reopen")
  @Header("Cache-Control", "no-store")
  public reopen(
    @Req() request: AuthenticatedRequest,
    @Param("id") milestoneId: string,
    @Body() body: unknown,
  ): Promise<ClinicalRecordResponse> {
    return this.service.reopen(
      requireActor(request),
      parseRequest(uuidPathSchema, milestoneId),
      parseRequest(clinicalRecordReopenRequestSchema, body),
    );
  }
}
