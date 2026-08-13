import { Injectable } from "@nestjs/common";
import type { RegisterAndroidDeviceRequest, RegisteredDeviceResponse } from "@anc/contracts";
import { DeviceTokenCrypto } from "@anc/database";

import { AuditService } from "../audit/audit.service.js";
import type { MotherActor } from "../mother-access/mother-auth.types.js";
import type { Clock } from "../auth/staff-auth.service.js";
import type { DeviceRegistrationRepository } from "./device-registration.repository.js";

@Injectable()
export class DeviceRegistrationService {
  public constructor(
    private readonly repository: DeviceRegistrationRepository,
    private readonly tokenCrypto: DeviceTokenCrypto,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  public async registerAndroid(
    actor: MotherActor,
    input: RegisterAndroidDeviceRequest,
  ): Promise<RegisteredDeviceResponse> {
    const occurredAt = this.clock();
    const device = await this.repository.registerAndroid({
      motherId: actor.motherId,
      encryptedToken: this.tokenCrypto.encrypt(input.push_token),
      tokenFingerprint: this.tokenCrypto.fingerprint(input.push_token),
      occurredAt,
    });
    await this.audit.record({
      actorType: "BUMIL",
      actorId: actor.motherId,
      action: "ANDROID_DEVICE_REGISTERED",
      resourceType: "DEVICE",
      resourceId: device.id,
      occurredAt,
    });
    return {
      id: device.id,
      platform: "ANDROID",
      status: "ACTIVE",
      registered_at: device.registeredAt.toISOString(),
      last_seen_at: device.lastSeenAt.toISOString(),
    };
  }
}
