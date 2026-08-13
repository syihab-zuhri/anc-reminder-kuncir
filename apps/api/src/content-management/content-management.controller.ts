import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  contentTemplateCreateRequestSchema,
  contentTemplateListResponseSchema,
  contentTemplateResponseSchema,
  contentVersionApproveRequestSchema,
  contentVersionArchiveRequestSchema,
  contentVersionCreateRequestSchema,
  contentVersionPublishRequestSchema,
  contentVersionResponseSchema,
  contentVersionSubmitRequestSchema,
  type ContentTemplateListResponse,
  type ContentTemplateResponse,
  type ContentVersionResponse,
} from "@anc/contracts";
import { z } from "zod";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { ContentManagementService } from "./content-management.service.js";

const uuidPathSchema = z.string().uuid();

@Controller("content")
@UseGuards(StaffAuthGuard)
export class ContentManagementController {
  public constructor(private readonly service: ContentManagementService) {}

  @Get("templates")
  public async list(@Req() request: AuthenticatedRequest): Promise<ContentTemplateListResponse> {
    return parseRequest(
      contentTemplateListResponseSchema,
      await this.service.list(requireActor(request)),
    );
  }

  @Get("templates/:id")
  public async get(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ContentTemplateResponse> {
    return parseRequest(
      contentTemplateResponseSchema,
      await this.service.get(requireActor(request), parseRequest(uuidPathSchema, id)),
    );
  }

  @Post("templates")
  public async createTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ContentTemplateResponse> {
    return parseRequest(
      contentTemplateResponseSchema,
      await this.service.createTemplate(
        requireActor(request),
        parseRequest(contentTemplateCreateRequestSchema, body),
      ),
    );
  }

  @Post("templates/:id/versions")
  public async createVersion(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ContentVersionResponse> {
    return parseRequest(
      contentVersionResponseSchema,
      await this.service.createVersion(
        requireActor(request),
        parseRequest(uuidPathSchema, id),
        parseRequest(contentVersionCreateRequestSchema, body),
      ),
    );
  }

  @Post("versions/:id/submit-review")
  public async submitReview(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ContentVersionResponse> {
    return parseRequest(
      contentVersionResponseSchema,
      await this.service.submitReview(
        requireActor(request),
        parseRequest(uuidPathSchema, id),
        parseRequest(contentVersionSubmitRequestSchema, body),
      ),
    );
  }

  @Post("versions/:id/approve")
  public async approve(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ContentVersionResponse> {
    return parseRequest(
      contentVersionResponseSchema,
      await this.service.approve(
        requireActor(request),
        parseRequest(uuidPathSchema, id),
        parseRequest(contentVersionApproveRequestSchema, body),
      ),
    );
  }

  @Post("versions/:id/publish")
  public async publish(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ContentVersionResponse> {
    return parseRequest(
      contentVersionResponseSchema,
      await this.service.publish(
        requireActor(request),
        parseRequest(uuidPathSchema, id),
        parseRequest(contentVersionPublishRequestSchema, body),
      ),
    );
  }

  @Post("versions/:id/archive")
  public async archive(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ContentVersionResponse> {
    return parseRequest(
      contentVersionResponseSchema,
      await this.service.archive(
        requireActor(request),
        parseRequest(uuidPathSchema, id),
        parseRequest(contentVersionArchiveRequestSchema, body),
      ),
    );
  }
}
