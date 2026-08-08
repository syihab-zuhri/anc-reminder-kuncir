import { randomUUID } from "node:crypto";
import type {
  Facility,
  FacilityCreateRequest,
  StaffAssignment,
  StaffAssignmentCreateRequest,
  StaffRole,
  StaffSummary,
  StaffUserStatus,
  Village,
  VillageCreateRequest,
} from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

interface QueryRow {
  readonly [column: string]: unknown;
}

interface VillageRow extends QueryRow {
  readonly id: string;
  readonly health_center_id: string;
  readonly code: string;
  readonly name: string;
  readonly status: Village["status"];
}

interface FacilityRow extends QueryRow {
  readonly id: string;
  readonly health_center_id: string;
  readonly village_id: string | null;
  readonly code: string;
  readonly name: string;
  readonly facility_type: Facility["facility_type"];
  readonly status: Facility["status"];
}

interface StaffRow extends QueryRow {
  readonly id: string;
  readonly health_center_id: string | null;
  readonly login_identifier: string;
  readonly display_name: string;
  readonly role: StaffRole;
  readonly status: StaffUserStatus;
}

interface AssignmentRow extends QueryRow {
  readonly id: string;
  readonly staff_user_id: string;
  readonly scope_type: StaffAssignment["scope_type"];
  readonly scope_id: string;
  readonly health_center_id?: string | null;
  readonly role?: StaffRole;
}

interface ExistsRow extends QueryRow {
  readonly allowed: boolean;
}

export interface CreateStaffRecordInput {
  readonly id: string;
  readonly healthCenterId: string;
  readonly loginIdentifier: string;
  readonly displayName: string;
  readonly role: "BIDAN";
  readonly passwordHash: string;
}

export interface AssignmentTarget extends StaffAssignment {
  readonly healthCenterId: string | null;
  readonly role: StaffRole;
}

export interface OrganizationScopeRepository {
  listVillages(healthCenterId: string): Promise<readonly Village[]>;
  createVillage(healthCenterId: string, input: VillageCreateRequest): Promise<Village>;
  listFacilities(healthCenterId: string): Promise<readonly Facility[]>;
  createFacility(healthCenterId: string, input: FacilityCreateRequest): Promise<Facility>;
  listStaff(healthCenterId: string): Promise<readonly StaffSummary[]>;
  createStaff(input: CreateStaffRecordInput): Promise<StaffSummary>;
  findStaff(staffUserId: string): Promise<StaffSummary | null>;
  updateStaffStatus(
    staffUserId: string,
    status: StaffUserStatus,
    reason: string,
    changedByStaffId: string,
  ): Promise<boolean>;
  scopeBelongsToHealthCenter(
    healthCenterId: string,
    scopeType: StaffAssignment["scope_type"],
    scopeId: string,
  ): Promise<boolean>;
  createAssignment(
    assignedBy: string,
    input: StaffAssignmentCreateRequest,
  ): Promise<StaffAssignment>;
  findAssignment(assignmentId: string): Promise<AssignmentTarget | null>;
  revokeAssignment(assignmentId: string, revokedBy: string, reason: string): Promise<boolean>;
}

export class PostgresOrganizationScopeRepository implements OrganizationScopeRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async listVillages(healthCenterId: string): Promise<readonly Village[]> {
    const result = await this.pool.query<VillageRow>(
      `${villageSelect} WHERE health_center_id = $1 ORDER BY name, id`,
      [healthCenterId],
    );
    return result.rows.map(toVillage);
  }

  public async createVillage(
    healthCenterId: string,
    input: VillageCreateRequest,
  ): Promise<Village> {
    const result = await this.pool.query<VillageRow>(
      `INSERT INTO villages (id, health_center_id, code, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, health_center_id, code, name, status`,
      [randomUUID(), healthCenterId, input.code, input.name],
    );
    return toVillage(requireRow(result.rows[0]));
  }

  public async listFacilities(healthCenterId: string): Promise<readonly Facility[]> {
    const result = await this.pool.query<FacilityRow>(
      `${facilitySelect} WHERE health_center_id = $1 ORDER BY name, id`,
      [healthCenterId],
    );
    return result.rows.map(toFacility);
  }

  public async createFacility(
    healthCenterId: string,
    input: FacilityCreateRequest,
  ): Promise<Facility> {
    const result = await this.pool.query<FacilityRow>(
      `INSERT INTO facilities (
         id, health_center_id, village_id, code, name, facility_type
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, health_center_id, village_id, code, name, facility_type, status`,
      [
        randomUUID(),
        healthCenterId,
        input.village_id ?? null,
        input.code,
        input.name,
        input.facility_type,
      ],
    );
    return toFacility(requireRow(result.rows[0]));
  }

  public async listStaff(healthCenterId: string): Promise<readonly StaffSummary[]> {
    const result = await this.pool.query<StaffRow>(
      `${staffSelect}
       WHERE health_center_id = $1 AND role <> 'SUPER_ADMIN'
       ORDER BY display_name, id`,
      [healthCenterId],
    );
    return result.rows.map(toStaff);
  }

  public async createStaff(input: CreateStaffRecordInput): Promise<StaffSummary> {
    const result = await this.pool.query<StaffRow>(
      `INSERT INTO staff_users (
         id, health_center_id, role, login_identifier, display_name, password_hash
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, health_center_id, login_identifier, display_name, role, status`,
      [
        input.id,
        input.healthCenterId,
        input.role,
        input.loginIdentifier,
        input.displayName,
        input.passwordHash,
      ],
    );
    return toStaff(requireRow(result.rows[0]));
  }

  public async findStaff(staffUserId: string): Promise<StaffSummary | null> {
    const result = await this.pool.query<StaffRow>(`${staffSelect} WHERE id = $1 LIMIT 1`, [
      staffUserId,
    ]);
    const row = result.rows[0];
    return row === undefined ? null : toStaff(row);
  }

  public async updateStaffStatus(
    staffUserId: string,
    status: StaffUserStatus,
    reason: string,
    changedByStaffId: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE staff_users
         SET status = $2::staff_user_status,
             failed_login_attempts = CASE
               WHEN $2::staff_user_status = 'ACTIVE' THEN 0
               ELSE failed_login_attempts
             END,
             locked_until = CASE
               WHEN $2::staff_user_status = 'ACTIVE' THEN NULL
               ELSE locked_until
             END
         WHERE id = $1 AND role = 'BIDAN'
         RETURNING id`,
        [staffUserId, status],
      );
      if (result.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      if (status !== "ACTIVE") {
        await client.query(
          `UPDATE staff_sessions
           SET revoked_at = CURRENT_TIMESTAMP,
               revoked_by_staff_id = $3,
               revocation_reason = $2
           WHERE staff_user_id = $1 AND revoked_at IS NULL`,
          [staffUserId, reason, changedByStaffId],
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async scopeBelongsToHealthCenter(
    healthCenterId: string,
    scopeType: StaffAssignment["scope_type"],
    scopeId: string,
  ): Promise<boolean> {
    const table = scopeType === "AREA" ? "villages" : "mothers";
    const result = await this.pool.query<ExistsRow>(
      `SELECT EXISTS (
         SELECT 1 FROM ${table} WHERE id = $1 AND health_center_id = $2
       ) AS allowed`,
      [scopeId, healthCenterId],
    );
    return result.rows[0]?.allowed === true;
  }

  public async createAssignment(
    assignedBy: string,
    input: StaffAssignmentCreateRequest,
  ): Promise<StaffAssignment> {
    const result = await this.pool.query<AssignmentRow>(
      `INSERT INTO staff_assignments (
         id, staff_user_id, scope_type, scope_id, assigned_by
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, staff_user_id, scope_type, scope_id`,
      [randomUUID(), input.staff_user_id, input.scope_type, input.scope_id, assignedBy],
    );
    return toAssignment(requireRow(result.rows[0]));
  }

  public async findAssignment(assignmentId: string): Promise<AssignmentTarget | null> {
    const result = await this.pool.query<AssignmentRow>(
      `SELECT
         a.id,
         a.staff_user_id,
         a.scope_type,
         a.scope_id,
         u.health_center_id,
         u.role
       FROM staff_assignments a
       JOIN staff_users u ON u.id = a.staff_user_id
       WHERE a.id = $1 AND a.revoked_at IS NULL
       LIMIT 1`,
      [assignmentId],
    );
    const row = result.rows[0];
    if (row === undefined || row.health_center_id === undefined || row.role === undefined) {
      return null;
    }
    return {
      ...toAssignment(row),
      healthCenterId: row.health_center_id,
      role: row.role,
    };
  }

  public async revokeAssignment(
    assignmentId: string,
    revokedBy: string,
    reason: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE staff_assignments
       SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2, revocation_reason = $3
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [assignmentId, revokedBy, reason],
    );
    return result.rowCount === 1;
  }
}

function requireRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error("Database write returned no row");
  return row;
}

function toVillage(row: VillageRow): Village {
  return {
    id: row.id,
    health_center_id: row.health_center_id,
    code: row.code,
    name: row.name,
    status: row.status,
  };
}

function toFacility(row: FacilityRow): Facility {
  return {
    id: row.id,
    health_center_id: row.health_center_id,
    village_id: row.village_id,
    code: row.code,
    name: row.name,
    facility_type: row.facility_type,
    status: row.status,
  };
}

function toStaff(row: StaffRow): StaffSummary {
  return {
    id: row.id,
    health_center_id: row.health_center_id,
    login_identifier: row.login_identifier,
    display_name: row.display_name,
    role: row.role,
    status: row.status,
  };
}

function toAssignment(row: AssignmentRow): StaffAssignment {
  return {
    id: row.id,
    staff_user_id: row.staff_user_id,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
  };
}

const villageSelect = "SELECT id, health_center_id, code, name, status FROM villages";
const facilitySelect =
  "SELECT id, health_center_id, village_id, code, name, facility_type, status FROM facilities";
const staffSelect =
  "SELECT id, health_center_id, login_identifier, display_name, role, status FROM staff_users";
