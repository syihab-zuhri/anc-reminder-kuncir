import type { Request } from "express";

export interface MotherActor {
  readonly motherId: string;
  readonly credentialId: string;
  readonly sessionId: string;
  readonly displayName: string;
  readonly activePregnancyId: string;
  readonly sessionExpiresAt: Date;
}

export type MotherAuthenticatedRequest = Request & { motherActor?: MotherActor };
