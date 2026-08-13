import { Body, Controller, Put, Req, Res, UseGuards } from "@nestjs/common";
import {
  registerAndroidDeviceRequestSchema,
  registeredDeviceResponseSchema,
  type RegisteredDeviceResponse,
} from "@anc/contracts";
import type { Response } from "express";

import { requireMotherActor } from "../mother-access/mother-auth.controller.js";
import { MotherAuthGuard } from "../mother-access/mother-auth.guard.js";
import type { MotherAuthenticatedRequest } from "../mother-access/mother-auth.types.js";
import { parseRequest } from "../validation/parse-request.js";
import { DeviceRegistrationService } from "./device-registration.service.js";

@Controller()
export class DeviceRegistrationController {
  public constructor(private readonly service: DeviceRegistrationService) {}

  @Put("mother/me/devices/android")
  @UseGuards(MotherAuthGuard)
  public async registerAndroid(
    @Req() request: MotherAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<RegisteredDeviceResponse> {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Pragma", "no-cache");
    const result = await this.service.registerAndroid(
      requireMotherActor(request),
      parseRequest(registerAndroidDeviceRequestSchema, body),
    );
    return registeredDeviceResponseSchema.parse(result);
  }
}
