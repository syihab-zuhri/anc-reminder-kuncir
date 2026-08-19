import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  AssignmentRevokeRequest,
  Facility,
  FacilityCreateRequest,
  FacilityUpdateRequest,
  StaffAssignment,
  StaffAssignmentCreateRequest,
  StaffAssignmentDetail,
  StaffCreateRequest,
  StaffStatusUpdateRequest,
  StaffSummary,
  StaffUpdateRequest,
  Village,
  VillageCreateRequest,
  VillageUpdateRequest,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { PasswordHasher } from "../auth/password-hasher.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import { AUDIT_SERVICE, ORGANIZATION_SCOPE_REPOSITORY } from "../infrastructure/tokens.js";
import type { OrganizationScopeRepository } from "./organization-scope.repository.js";

@Injectable()
export class OrganizationScopeService {
  public constructor(
    @Inject(ORGANIZATION_SCOPE_REPOSITORY)
    private readonly repository: OrganizationScopeRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    private readonly policy: AuthorizationPolicy,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  public async listVillages(actor: StaffActor): Promise<readonly Village[]> {
    return this.repository.listVillages(this.requireManagedCenter(actor));
  }

  public async createVillage(actor: StaffActor, input: VillageCreateRequest): Promise<Village> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const village = await this.repository.createVillage(healthCenterId, input);
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "VILLAGE_CREATED",
        resourceType: "VILLAGE",
        resourceId: village.id,
      });
      return village;
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async updateVillage(
    actor: StaffActor,
    villageId: string,
    input: VillageUpdateRequest,
  ): Promise<Village> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const village = await this.repository.updateVillage(healthCenterId, villageId, input);
      if (village === null) {
        throw new ApiException({
          status: HttpStatus.NOT_FOUND,
          code: "VILLAGE_NOT_FOUND",
          message: "Data desa tidak ditemukan.",
        });
      }
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "VILLAGE_UPDATED",
        resourceType: "VILLAGE",
        resourceId: villageId,
      });
      return village;
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async deleteVillage(actor: StaffActor, villageId: string): Promise<void> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const deleted = await this.repository.deleteVillage(healthCenterId, villageId);
      if (!deleted) {
        throw new ApiException({
          status: HttpStatus.NOT_FOUND,
          code: "VILLAGE_NOT_FOUND",
          message: "Data desa tidak ditemukan.",
        });
      }
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "VILLAGE_DELETED",
        resourceType: "VILLAGE",
        resourceId: villageId,
      });
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async listFacilities(actor: StaffActor): Promise<readonly Facility[]> {
    return this.repository.listFacilities(this.requireManagedCenter(actor));
  }

  public async createFacility(actor: StaffActor, input: FacilityCreateRequest): Promise<Facility> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const facility = await this.repository.createFacility(healthCenterId, input);
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "FACILITY_CREATED",
        resourceType: "FACILITY",
        resourceId: facility.id,
      });
      return facility;
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async updateFacility(
    actor: StaffActor,
    facilityId: string,
    input: FacilityUpdateRequest,
  ): Promise<Facility> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const facility = await this.repository.updateFacility(healthCenterId, facilityId, input);
      if (facility === null) {
        throw new ApiException({
          status: HttpStatus.NOT_FOUND,
          code: "FACILITY_NOT_FOUND",
          message: "Data fasilitas tidak ditemukan.",
        });
      }
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "FACILITY_UPDATED",
        resourceType: "FACILITY",
        resourceId: facilityId,
      });
      return facility;
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async deleteFacility(actor: StaffActor, facilityId: string): Promise<void> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const deleted = await this.repository.deleteFacility(healthCenterId, facilityId);
      if (!deleted) {
        throw new ApiException({
          status: HttpStatus.NOT_FOUND,
          code: "FACILITY_NOT_FOUND",
          message: "Data fasilitas tidak ditemukan.",
        });
      }
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "FACILITY_DELETED",
        resourceType: "FACILITY",
        resourceId: facilityId,
      });
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async listStaff(actor: StaffActor): Promise<readonly StaffSummary[]> {
    this.policy.assertCapability(actor, "STAFF_MANAGE");
    return this.repository.listStaff(this.requireCenter(actor));
  }

  public async createStaff(actor: StaffActor, input: StaffCreateRequest): Promise<StaffSummary> {
    this.policy.assertCapability(actor, "STAFF_MANAGE");
    const healthCenterId = this.requireCenter(actor);
    const id = randomUUID();
    try {
      const staff = await this.repository.createStaff({
        id,
        healthCenterId,
        loginIdentifier: input.login_identifier.normalize("NFKC").trim().toLocaleLowerCase("id-ID"),
        displayName: input.display_name,
        role: input.role,
        passwordHash: await this.passwordHasher.hash(input.password),
      });
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "STAFF_USER_CREATED",
        resourceType: "STAFF_USER",
        resourceId: staff.id,
        metadata: { role: staff.role, target_staff_user_id: staff.id },
      });
      return staff;
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async updateStaff(
    actor: StaffActor,
    staffUserId: string,
    input: StaffUpdateRequest,
  ): Promise<StaffSummary> {
    this.policy.assertCapability(actor, "STAFF_MANAGE");
    const healthCenterId = this.requireCenter(actor);
    const target = await this.repository.findStaff(staffUserId);
    if (target === null || target.health_center_id !== healthCenterId || target.role !== "BIDAN") {
      throw forbidden();
    }

    const passwordHash = input.password ? await this.passwordHasher.hash(input.password) : undefined;
    const updated = await this.repository.updateStaff(healthCenterId, staffUserId, {
      ...(input.display_name !== undefined ? { displayName: input.display_name } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    });
    if (updated === null) {
      throw new ApiException({
        status: HttpStatus.NOT_FOUND,
        code: "STAFF_NOT_FOUND",
        message: "Akun petugas tidak ditemukan.",
      });
    }

    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "STAFF_USER_UPDATED",
      resourceType: "STAFF_USER",
      resourceId: staffUserId,
    });
    return updated;
  }

  public async deleteStaff(actor: StaffActor, staffUserId: string): Promise<void> {
    this.policy.assertCapability(actor, "STAFF_MANAGE");
    const healthCenterId = this.requireCenter(actor);
    const target = await this.repository.findStaff(staffUserId);
    if (target === null || target.health_center_id !== healthCenterId || target.role !== "BIDAN") {
      throw forbidden();
    }

    const deleted = await this.repository.deleteStaff(healthCenterId, staffUserId);
    if (!deleted) {
      throw new ApiException({
        status: HttpStatus.NOT_FOUND,
        code: "STAFF_NOT_FOUND",
        message: "Akun petugas tidak ditemukan.",
      });
    }

    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "STAFF_USER_DELETED",
      resourceType: "STAFF_USER",
      resourceId: staffUserId,
    });
  }

  public async updateStaffStatus(
    actor: StaffActor,
    staffUserId: string,
    input: StaffStatusUpdateRequest,
  ): Promise<void> {
    this.policy.assertCapability(actor, "STAFF_MANAGE");
    const target = await this.repository.findStaff(staffUserId);
    if (
      target === null ||
      target.health_center_id !== this.requireCenter(actor) ||
      target.role !== "BIDAN"
    ) {
      throw forbidden();
    }
    const changed = await this.repository.updateStaffStatus(
      staffUserId,
      input.status,
      input.reason,
      actor.staffUserId,
    );
    if (!changed) throw forbidden();
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "STAFF_STATUS_CHANGED",
      resourceType: "STAFF_USER",
      resourceId: staffUserId,
      metadata: {
        reason: input.reason,
        target_staff_user_id: staffUserId,
      },
    });
  }

  public async listAssignments(actor: StaffActor): Promise<readonly StaffAssignmentDetail[]> {
    return this.repository.listAssignments(this.requireManagedCenter(actor));
  }

  public async createAssignment(
    actor: StaffActor,
    input: StaffAssignmentCreateRequest,
  ): Promise<StaffAssignment> {
    const healthCenterId = this.requireManagedCenter(actor);
    const target = await this.repository.findStaff(input.staff_user_id);
    if (
      target === null ||
      target.health_center_id !== healthCenterId ||
      target.role !== "BIDAN" ||
      target.status !== "ACTIVE" ||
      !(await this.repository.scopeBelongsToHealthCenter(
        healthCenterId,
        input.scope_type,
        input.scope_id,
      ))
    ) {
      throw forbidden();
    }

    try {
      const assignment = await this.repository.createAssignment(actor.staffUserId, input);
      await this.audit.record({
        actorType: "STAFF",
        actorId: actor.staffUserId,
        action: "STAFF_ASSIGNMENT_CREATED",
        resourceType: "STAFF_ASSIGNMENT",
        resourceId: assignment.id,
        metadata: {
          scope_id: assignment.scope_id,
          scope_type: assignment.scope_type,
          target_staff_user_id: assignment.staff_user_id,
        },
      });
      return assignment;
    } catch (error) {
      throw mapConflict(error);
    }
  }

  public async revokeAssignment(
    actor: StaffActor,
    assignmentId: string,
    input: AssignmentRevokeRequest,
  ): Promise<void> {
    const target = await this.repository.findAssignment(assignmentId);
    if (
      target === null ||
      target.healthCenterId !== this.requireManagedCenter(actor) ||
      target.role !== "BIDAN"
    ) {
      throw forbidden();
    }
    if (!(await this.repository.revokeAssignment(assignmentId, actor.staffUserId, input.reason))) {
      throw forbidden();
    }
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "STAFF_ASSIGNMENT_REVOKED",
      resourceType: "STAFF_ASSIGNMENT",
      resourceId: assignmentId,
      metadata: {
        reason: input.reason,
        scope_id: target.scope_id,
        scope_type: target.scope_type,
        target_staff_user_id: target.staff_user_id,
      },
    });
  }

  private requireManagedCenter(actor: StaffActor): string {
    this.policy.assertCapability(actor, "ORGANIZATION_MANAGE");
    return this.requireCenter(actor);
  }

  private requireCenter(actor: StaffActor): string {
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }
}

function mapConflict(error: unknown): unknown {
  if (isDatabaseError(error, "23505")) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "RESOURCE_CONFLICT",
      message: "Data dengan identitas tersebut sudah tersedia.",
    });
  }
  if (isDatabaseError(error, "23503")) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "RESOURCE_IN_USE",
      message: "Data tidak dapat dihapus karena masih terhubung dengan data riwayat/pasien lain.",
    });
  }
  return error;
}

function isDatabaseError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
