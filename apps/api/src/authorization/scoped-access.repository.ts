import type { DatabasePool } from "@anc/database";

import type { StaffActor } from "../auth/staff-auth.types.js";

interface ExistsRow {
  readonly [column: string]: unknown;
  readonly allowed: boolean;
}

export interface ScopedAccessRepository {
  canAccessMother(actor: StaffActor, motherId: string): Promise<boolean>;
}

export class PostgresScopedAccessRepository implements ScopedAccessRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async canAccessMother(actor: StaffActor, motherId: string): Promise<boolean> {
    if (actor.healthCenterId === null || actor.role === "SUPER_ADMIN") return false;
    const result = await this.pool.query<ExistsRow>(
      `SELECT EXISTS (
         SELECT 1
         FROM mothers m
         WHERE m.id = $1
           AND m.health_center_id = $2
           AND (
             $3::staff_role = 'PUSKESMAS'
             OR (
               $3::staff_role = 'BIDAN'
               AND EXISTS (
                 SELECT 1
                 FROM staff_assignments a
                 WHERE a.staff_user_id = $4
                   AND a.revoked_at IS NULL
                   AND (
                     (a.scope_type = 'MOTHER' AND a.scope_id = m.id)
                     OR (a.scope_type = 'AREA' AND m.village_id IS NOT NULL
                       AND a.scope_id = m.village_id)
                   )
               )
             )
           )
       ) AS allowed`,
      [motherId, actor.healthCenterId, actor.role, actor.staffUserId],
    );
    return result.rows[0]?.allowed === true;
  }
}
