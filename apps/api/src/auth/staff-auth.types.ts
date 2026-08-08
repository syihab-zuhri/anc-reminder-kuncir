import type { StaffAssignmentScopeType, StaffRole, StaffUserStatus } from "@anc/contracts";
import type { Request } from "express";

export interface StaffAssignmentClaim {
  readonly scopeType: StaffAssignmentScopeType;
  readonly scopeId: string;
}

export interface StaffActor {
  readonly staffUserId: string;
  readonly sessionId: string;
  readonly healthCenterId: string | null;
  readonly displayName: string;
  readonly role: StaffRole;
  readonly status: StaffUserStatus;
  readonly assignments: readonly StaffAssignmentClaim[];
}

export interface StaffCredentialRecord {
  readonly id: string;
  readonly healthCenterId: string | null;
  readonly displayName: string;
  readonly role: StaffRole;
  readonly status: StaffUserStatus;
  readonly passwordHash: string;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
}

export interface SessionTarget {
  readonly sessionId: string;
  readonly staffUserId: string;
  readonly healthCenterId: string | null;
  readonly role: StaffRole;
  readonly revokedAt: Date | null;
}

export type AuthenticatedRequest = Request & { staffActor?: StaffActor };
