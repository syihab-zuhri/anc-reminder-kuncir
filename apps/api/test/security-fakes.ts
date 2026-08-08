/* eslint-disable @typescript-eslint/require-await -- test doubles intentionally satisfy async ports in memory */
import type {
  Facility,
  FacilityCreateRequest,
  StaffAssignment,
  StaffAssignmentCreateRequest,
  StaffSummary,
  StaffUserStatus,
  Village,
  VillageCreateRequest,
} from "@anc/contracts";

import type { AuditEventRecord, AuditRepository } from "../src/audit/audit.repository.js";
import type {
  CreateStaffSessionInput,
  RevokeStaffSessionInput,
  RotateStaffSessionInput,
  StaffAuthRepository,
} from "../src/auth/staff-auth.repository.js";
import type {
  SessionTarget,
  StaffActor,
  StaffAssignmentClaim,
  StaffCredentialRecord,
} from "../src/auth/staff-auth.types.js";
import type { ScopedAccessRepository } from "../src/authorization/scoped-access.repository.js";
import type {
  AssignmentTarget,
  CreateStaffRecordInput,
  OrganizationScopeRepository,
} from "../src/organization/organization-scope.repository.js";

interface MutableUser {
  id: string;
  healthCenterId: string | null;
  displayName: string;
  role: StaffCredentialRecord["role"];
  status: StaffCredentialRecord["status"];
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  loginIdentifier: string;
  assignments: StaffAssignmentClaim[];
}

interface MutableSession {
  id: string;
  staffUserId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
}

export interface SeedUserInput extends Omit<MutableUser, "failedLoginAttempts" | "lockedUntil"> {
  readonly failedLoginAttempts?: number;
  readonly lockedUntil?: Date | null;
}

export class FakeStaffAuthRepository implements StaffAuthRepository {
  public readonly users = new Map<string, MutableUser>();
  public readonly sessions = new Map<string, MutableSession>();

  public seedUser(input: SeedUserInput): void {
    this.users.set(input.id, {
      ...input,
      assignments: [...input.assignments],
      failedLoginAttempts: input.failedLoginAttempts ?? 0,
      lockedUntil: input.lockedUntil ?? null,
    });
  }

  public async findUserByLoginIdentifier(
    loginIdentifier: string,
  ): Promise<StaffCredentialRecord | null> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.loginIdentifier.toLowerCase() === loginIdentifier.toLowerCase(),
    );
    return user === undefined ? null : credential(user);
  }

  public async recordLoginFailure(
    staffUserId: string,
    threshold: number,
    lockedUntil: Date,
  ): Promise<void> {
    const user = this.users.get(staffUserId);
    if (user === undefined) return;
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= threshold) user.lockedUntil = lockedUntil;
  }

  public async createSession(input: CreateStaffSessionInput): Promise<void> {
    const user = this.users.get(input.staffUserId);
    if (user === undefined) throw new Error("Unknown fake user");
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    this.sessions.set(input.sessionId, {
      id: input.sessionId,
      staffUserId: input.staffUserId,
      accessTokenHash: input.accessTokenHash,
      refreshTokenHash: input.refreshTokenHash,
      accessExpiresAt: input.accessExpiresAt,
      refreshExpiresAt: input.refreshExpiresAt,
      revokedAt: null,
    });
  }

  public async findActiveActorByAccessTokenHash(
    accessTokenHash: string,
    now: Date,
  ): Promise<StaffActor | null> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.accessTokenHash === accessTokenHash &&
        candidate.revokedAt === null &&
        candidate.accessExpiresAt > now,
    );
    return session === undefined ? null : this.actorFor(session);
  }

  public async rotateSession(input: RotateStaffSessionInput): Promise<StaffActor | null> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.refreshTokenHash === input.currentRefreshTokenHash &&
        candidate.revokedAt === null &&
        candidate.refreshExpiresAt > input.now,
    );
    if (session === undefined) return null;
    const user = this.users.get(session.staffUserId);
    if (user === undefined || user.status !== "ACTIVE") return null;
    session.accessTokenHash = input.accessTokenHash;
    session.refreshTokenHash = input.refreshTokenHash;
    session.accessExpiresAt = input.accessExpiresAt;
    session.refreshExpiresAt = input.refreshExpiresAt;
    return this.actorFor(session);
  }

  public async findSessionTarget(sessionId: string): Promise<SessionTarget | null> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return null;
    const user = this.users.get(session.staffUserId);
    if (user === undefined) return null;
    return {
      sessionId,
      staffUserId: user.id,
      healthCenterId: user.healthCenterId,
      role: user.role,
      revokedAt: session.revokedAt,
    };
  }

  public async revokeSession(input: RevokeStaffSessionInput): Promise<boolean> {
    const session = this.sessions.get(input.sessionId);
    if (session === undefined || session.revokedAt !== null) return false;
    session.revokedAt = input.now;
    return true;
  }

  public sessionForUser(staffUserId: string): MutableSession | undefined {
    return [...this.sessions.values()].find((session) => session.staffUserId === staffUserId);
  }

  private actorFor(session: MutableSession): StaffActor | null {
    const user = this.users.get(session.staffUserId);
    if (user === undefined || user.status !== "ACTIVE") return null;
    return {
      staffUserId: user.id,
      sessionId: session.id,
      healthCenterId: user.healthCenterId,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      assignments: [...user.assignments],
    };
  }
}

function credential(user: MutableUser): StaffCredentialRecord {
  return {
    id: user.id,
    healthCenterId: user.healthCenterId,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    passwordHash: user.passwordHash,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
  };
}

export class FakeAuditRepository implements AuditRepository {
  public readonly events: AuditEventRecord[] = [];

  public async append(event: AuditEventRecord): Promise<void> {
    this.events.push(event);
  }
}

export class FakeScopedAccessRepository implements ScopedAccessRepository {
  public readonly allowedMotherIds = new Set<string>();

  public async canAccessMother(actor: StaffActor, motherId: string): Promise<boolean> {
    void actor;
    return this.allowedMotherIds.has(motherId);
  }
}

export class FakeOrganizationScopeRepository implements OrganizationScopeRepository {
  public readonly villages: Village[] = [];
  public readonly facilities: Facility[] = [];
  public readonly staff: StaffSummary[] = [];
  public readonly assignments: StaffAssignment[] = [];
  public readonly passwordHashes = new Map<string, string>();
  private readonly scopeCenters = new Map<string, string>();

  public async listVillages(healthCenterId: string): Promise<readonly Village[]> {
    return this.villages.filter((item) => item.health_center_id === healthCenterId);
  }

  public async createVillage(
    healthCenterId: string,
    input: VillageCreateRequest,
  ): Promise<Village> {
    const village: Village = {
      id: crypto.randomUUID(),
      health_center_id: healthCenterId,
      code: input.code,
      name: input.name,
      status: "ACTIVE",
    };
    this.villages.push(village);
    this.scopeCenters.set(`AREA:${village.id}`, healthCenterId);
    return village;
  }

  public async listFacilities(healthCenterId: string): Promise<readonly Facility[]> {
    return this.facilities.filter((item) => item.health_center_id === healthCenterId);
  }

  public async createFacility(
    healthCenterId: string,
    input: FacilityCreateRequest,
  ): Promise<Facility> {
    const facility: Facility = {
      id: crypto.randomUUID(),
      health_center_id: healthCenterId,
      village_id: input.village_id ?? null,
      code: input.code,
      name: input.name,
      facility_type: input.facility_type,
      status: "ACTIVE",
    };
    this.facilities.push(facility);
    return facility;
  }

  public async listStaff(healthCenterId: string): Promise<readonly StaffSummary[]> {
    return this.staff.filter((item) => item.health_center_id === healthCenterId);
  }

  public async createStaff(input: CreateStaffRecordInput): Promise<StaffSummary> {
    const staff: StaffSummary = {
      id: input.id,
      health_center_id: input.healthCenterId,
      login_identifier: input.loginIdentifier,
      display_name: input.displayName,
      role: input.role,
      status: "ACTIVE",
    };
    this.staff.push(staff);
    this.passwordHashes.set(staff.id, input.passwordHash);
    return staff;
  }

  public async findStaff(staffUserId: string): Promise<StaffSummary | null> {
    return this.staff.find((item) => item.id === staffUserId) ?? null;
  }

  public async updateStaffStatus(
    staffUserId: string,
    status: StaffUserStatus,
    reason: string,
    changedByStaffId: string,
  ): Promise<boolean> {
    void reason;
    void changedByStaffId;
    const index = this.staff.findIndex((item) => item.id === staffUserId);
    const existing = this.staff[index];
    if (existing === undefined) return false;
    this.staff[index] = { ...existing, status };
    return true;
  }

  public async scopeBelongsToHealthCenter(
    healthCenterId: string,
    scopeType: StaffAssignment["scope_type"],
    scopeId: string,
  ): Promise<boolean> {
    return this.scopeCenters.get(`${scopeType}:${scopeId}`) === healthCenterId;
  }

  public async createAssignment(
    assignedBy: string,
    input: StaffAssignmentCreateRequest,
  ): Promise<StaffAssignment> {
    void assignedBy;
    const assignment: StaffAssignment = { id: crypto.randomUUID(), ...input };
    this.assignments.push(assignment);
    return assignment;
  }

  public async findAssignment(assignmentId: string): Promise<AssignmentTarget | null> {
    const assignment = this.assignments.find((item) => item.id === assignmentId);
    if (assignment === undefined) return null;
    const staff = this.staff.find((item) => item.id === assignment.staff_user_id);
    if (staff === undefined) return null;
    return {
      ...assignment,
      healthCenterId: staff.health_center_id,
      role: staff.role,
    };
  }

  public async revokeAssignment(
    assignmentId: string,
    revokedBy: string,
    reason: string,
  ): Promise<boolean> {
    void revokedBy;
    void reason;
    const index = this.assignments.findIndex((item) => item.id === assignmentId);
    if (index < 0) return false;
    this.assignments.splice(index, 1);
    return true;
  }

  public seedMotherScope(healthCenterId: string, motherId: string): void {
    this.scopeCenters.set(`MOTHER:${motherId}`, healthCenterId);
  }
}
