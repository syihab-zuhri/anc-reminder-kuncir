import { Controller, Get } from "@nestjs/common";
import { HealthService, type LivenessResponse, type ReadinessResponse } from "./health.service.js";

@Controller("health")
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get("live")
  public liveness(): LivenessResponse {
    return this.healthService.liveness();
  }

  @Get("ready")
  public readiness(): Promise<ReadinessResponse> {
    return this.healthService.readiness();
  }
}
