import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  motherAccessCredentialMutationRequestSchema,
  type MotherAccessCredentialIssueResponse,
  type MotherAccessCredentialRevokeResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { MotherAccessCredentialService } from "./mother-access-credential.service.js";

const uuidPathSchema = z.string().uuid();

@Controller("mothers/:motherId/access-code")
@UseGuards(StaffAuthGuard)
export class MotherAccessCredentialController {
  public constructor(private readonly service: MotherAccessCredentialService) {}

  @Post("reissue")
  @HttpCode(HttpStatus.OK)
  public reissue(
    @Req() request: AuthenticatedRequest,
    @Param("motherId") motherId: string,
    @Body() body: unknown,
  ): Promise<MotherAccessCredentialIssueResponse> {
    return this.service.reissue(
      requireActor(request),
      parseRequest(uuidPathSchema, motherId),
      parseRequest(motherAccessCredentialMutationRequestSchema, body),
    );
  }

  @Post("revoke")
  @HttpCode(HttpStatus.OK)
  public revoke(
    @Req() request: AuthenticatedRequest,
    @Param("motherId") motherId: string,
    @Body() body: unknown,
  ): Promise<MotherAccessCredentialRevokeResponse> {
    return this.service.revoke(
      requireActor(request),
      parseRequest(uuidPathSchema, motherId),
      parseRequest(motherAccessCredentialMutationRequestSchema, body),
    );
  }
}
