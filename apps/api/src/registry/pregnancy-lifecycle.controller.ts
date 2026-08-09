import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  pregnancyCloseRequestSchema,
  pregnancyCreateRequestSchema,
  pregnancyDatingRevisionRequestSchema,
  type PregnancyLifecycleResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { PregnancyLifecycleService } from "./pregnancy-lifecycle.service.js";

const uuidPathSchema = z.string().uuid();

@Controller()
@UseGuards(StaffAuthGuard)
export class PregnancyLifecycleController {
  public constructor(private readonly service: PregnancyLifecycleService) {}

  @Post("mothers/:motherId/pregnancies")
  public create(
    @Req() request: AuthenticatedRequest,
    @Param("motherId") motherId: string,
    @Body() body: unknown,
  ): Promise<PregnancyLifecycleResponse> {
    return this.service.create(
      requireActor(request),
      parseRequest(uuidPathSchema, motherId),
      parseRequest(pregnancyCreateRequestSchema, body),
    );
  }

  @Patch("pregnancies/:id")
  public reviseDating(
    @Req() request: AuthenticatedRequest,
    @Param("id") pregnancyId: string,
    @Body() body: unknown,
  ): Promise<PregnancyLifecycleResponse> {
    return this.service.reviseDating(
      requireActor(request),
      parseRequest(uuidPathSchema, pregnancyId),
      parseRequest(pregnancyDatingRevisionRequestSchema, body),
    );
  }

  @Post("pregnancies/:id/close")
  @HttpCode(HttpStatus.OK)
  public close(
    @Req() request: AuthenticatedRequest,
    @Param("id") pregnancyId: string,
    @Body() body: unknown,
  ): Promise<PregnancyLifecycleResponse> {
    return this.service.close(
      requireActor(request),
      parseRequest(uuidPathSchema, pregnancyId),
      parseRequest(pregnancyCloseRequestSchema, body),
    );
  }
}
