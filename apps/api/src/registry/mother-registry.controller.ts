import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { motherRegistrationRequestSchema, type MotherRegistrationResponse } from "@anc/contracts";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { MotherRegistryService } from "./mother-registry.service.js";

@Controller("mothers")
@UseGuards(StaffAuthGuard)
export class MotherRegistryController {
  public constructor(private readonly service: MotherRegistryService) {}

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
}
