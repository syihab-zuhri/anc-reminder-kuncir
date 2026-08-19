import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  assignmentRevokeRequestSchema,
  facilityCreateRequestSchema,
  facilityUpdateRequestSchema,
  staffAssignmentCreateRequestSchema,
  staffCreateRequestSchema,
  staffStatusUpdateRequestSchema,
  staffUpdateRequestSchema,
  villageCreateRequestSchema,
  villageUpdateRequestSchema,
  type Facility,
  type StaffAssignment,
  type StaffAssignmentDetail,
  type StaffSummary,
  type Village,
} from "@anc/contracts";
import { z } from "zod";

import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import { requireActor } from "../auth/staff-auth.controller.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { OrganizationScopeService } from "./organization-scope.service.js";

const uuidPathSchema = z.string().uuid();

@Controller("staff")
@UseGuards(StaffAuthGuard)
export class OrganizationScopeController {
  public constructor(private readonly service: OrganizationScopeService) {}

  @Get("organization/villages")
  public listVillages(@Req() request: AuthenticatedRequest): Promise<readonly Village[]> {
    return this.service.listVillages(requireActor(request));
  }

  @Post("organization/villages")
  public createVillage(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<Village> {
    return this.service.createVillage(
      requireActor(request),
      parseRequest(villageCreateRequestSchema, body),
    );
  }

  @Put("organization/villages/:id")
  public updateVillage(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Village> {
    return this.service.updateVillage(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parseRequest(villageUpdateRequestSchema, body),
    );
  }

  @Delete("organization/villages/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteVillage(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    await this.service.deleteVillage(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
    );
  }

  @Get("organization/facilities")
  public listFacilities(@Req() request: AuthenticatedRequest): Promise<readonly Facility[]> {
    return this.service.listFacilities(requireActor(request));
  }

  @Post("organization/facilities")
  public createFacility(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<Facility> {
    return this.service.createFacility(
      requireActor(request),
      parseRequest(facilityCreateRequestSchema, body),
    );
  }

  @Put("organization/facilities/:id")
  public updateFacility(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Facility> {
    return this.service.updateFacility(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parseRequest(facilityUpdateRequestSchema, body),
    );
  }

  @Delete("organization/facilities/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteFacility(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    await this.service.deleteFacility(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
    );
  }

  @Get("users")
  public listStaff(@Req() request: AuthenticatedRequest): Promise<readonly StaffSummary[]> {
    return this.service.listStaff(requireActor(request));
  }

  @Post("users")
  public createStaff(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<StaffSummary> {
    return this.service.createStaff(
      requireActor(request),
      parseRequest(staffCreateRequestSchema, body),
    );
  }

  @Put("users/:id")
  public updateStaff(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StaffSummary> {
    return this.service.updateStaff(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parseRequest(staffUpdateRequestSchema, body),
    );
  }

  @Delete("users/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteStaff(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    await this.service.deleteStaff(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
    );
  }

  @Patch("users/:id/status")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateStaffStatus(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.service.updateStaffStatus(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parseRequest(staffStatusUpdateRequestSchema, body),
    );
  }

  @Get("assignments")
  public listAssignments(
    @Req() request: AuthenticatedRequest,
  ): Promise<readonly StaffAssignmentDetail[]> {
    return this.service.listAssignments(requireActor(request));
  }

  @Post("assignments")
  public createAssignment(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<StaffAssignment> {
    return this.service.createAssignment(
      requireActor(request),
      parseRequest(staffAssignmentCreateRequestSchema, body),
    );
  }

  @Delete("assignments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async revokeAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.service.revokeAssignment(
      requireActor(request),
      parseRequest(uuidPathSchema, id),
      parseRequest(assignmentRevokeRequestSchema, body),
    );
  }
}
