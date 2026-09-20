import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import {
  announcementCreateRequestSchema,
  announcementCreateResponseSchema,
  announcementListResponseSchema,
  type AnnouncementCreateResponse,
  type AnnouncementListResponse,
} from "@anc/contracts";

import { requireActor } from "../auth/staff-auth.controller.js";
import { StaffAuthGuard } from "../auth/staff-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/staff-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { AnnouncementService } from "./announcement.service.js";

@Controller("announcements")
@UseGuards(StaffAuthGuard)
export class AnnouncementController {
  public constructor(private readonly service: AnnouncementService) {}

  @Get()
  public async list(@Req() request: AuthenticatedRequest): Promise<AnnouncementListResponse> {
    return parseRequest(
      announcementListResponseSchema,
      await this.service.list(requireActor(request)),
    );
  }

  @Post()
  public async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<AnnouncementCreateResponse> {
    return parseRequest(
      announcementCreateResponseSchema,
      await this.service.create(
        requireActor(request),
        parseRequest(announcementCreateRequestSchema, body),
      ),
    );
  }
}
