import type { TransactionClient } from "@anc/database";
import type { MotherRegistrationResponse } from "@anc/contracts";
import type { QueryResultRow } from "pg";

import {
  ActiveAncPlanInvalidError,
  ActiveAncPlanUnavailableError,
  initializePregnancyMilestones,
  resolveAssignableAncPlan,
} from "../anc-plan/anc-milestone-engine.js";

export { ActiveAncPlanInvalidError, ActiveAncPlanUnavailableError };

export interface CreateMotherRegistrationInput {
  readonly motherId: string;
  readonly pregnancyId: string;
  readonly consentId: string;
  readonly healthCenterId: string;
  readonly fullName: string;
  readonly nikCiphertext: string;
  readonly address: string;
  readonly phoneNormalized: string;
  readonly pregnancyStartDate: string;
  readonly notificationAllowed: boolean;
  readonly recordedAt: Date;
}

export interface MotherRegistryRepository {
  create(
    client: TransactionClient,
    input: CreateMotherRegistrationInput,
  ): Promise<MotherRegistrationResponse>;
  findRegistration(
    client: TransactionClient,
    motherId: string,
  ): Promise<MotherRegistrationResponse | null>;
}

interface RegistrationLookupRow extends QueryResultRow {
  readonly mother_id: string;
  readonly health_center_id: string;
  readonly full_name: string;
  readonly phone_normalized: string;
  readonly pregnancy_id: string;
  readonly dating_basis: "PREGNANCY_START_DATE";
  readonly dating_date: string;
  readonly pregnancy_status: "ACTIVE";
  readonly consent_id: string;
  readonly consent_purpose: "REMINDER";
  readonly consent_status: "GRANTED" | "WITHDRAWN";
  readonly consent_source: "STAFF_REGISTRATION";
  readonly consent_recorded_at: Date;
}

export class PostgresMotherRegistryRepository implements MotherRegistryRepository {
  public constructor(private readonly allowSyntheticPlan = false) {}

  public async create(
    client: TransactionClient,
    input: CreateMotherRegistrationInput,
  ): Promise<MotherRegistrationResponse> {
    const plan = await resolveAssignableAncPlan(client, this.allowSyntheticPlan);

    await client.query(
      `INSERT INTO mothers (
         id, health_center_id, full_name, nik_ciphertext, address, phone_normalized
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.motherId,
        input.healthCenterId,
        input.fullName,
        input.nikCiphertext,
        input.address,
        input.phoneNormalized,
      ],
    );
    await client.query(
      `INSERT INTO pregnancies (
         id, mother_id, health_center_id, dating_basis, dating_date, status, care_plan_version_id
       ) VALUES ($1, $2, $3, 'PREGNANCY_START_DATE', $4, 'ACTIVE', $5)`,
      [input.pregnancyId, input.motherId, input.healthCenterId, input.pregnancyStartDate, plan.id],
    );
    await initializePregnancyMilestones(client, input.pregnancyId, plan);
    await client.query(
      `INSERT INTO consent_records (
         id, mother_id, purpose, status, source, recorded_at
       ) VALUES ($1, $2, 'REMINDER', $3, 'STAFF_REGISTRATION', $4)`,
      [
        input.consentId,
        input.motherId,
        input.notificationAllowed ? "GRANTED" : "WITHDRAWN",
        input.recordedAt,
      ],
    );

    return toRegistrationResponse({
      mother_id: input.motherId,
      health_center_id: input.healthCenterId,
      full_name: input.fullName,
      phone_normalized: input.phoneNormalized,
      pregnancy_id: input.pregnancyId,
      dating_basis: "PREGNANCY_START_DATE",
      dating_date: input.pregnancyStartDate,
      pregnancy_status: "ACTIVE",
      consent_id: input.consentId,
      consent_purpose: "REMINDER",
      consent_status: input.notificationAllowed ? "GRANTED" : "WITHDRAWN",
      consent_source: "STAFF_REGISTRATION",
      consent_recorded_at: input.recordedAt,
    });
  }

  public async findRegistration(
    client: TransactionClient,
    motherId: string,
  ): Promise<MotherRegistrationResponse | null> {
    const result = await client.query<RegistrationLookupRow>(
      `SELECT
         mother.id AS mother_id,
         mother.health_center_id,
         mother.full_name,
         mother.phone_normalized,
         pregnancy.id AS pregnancy_id,
         pregnancy.dating_basis,
         pregnancy.dating_date::text AS dating_date,
         pregnancy.status AS pregnancy_status,
         consent.id AS consent_id,
         consent.purpose AS consent_purpose,
         consent.status AS consent_status,
         consent.source AS consent_source,
         consent.recorded_at AS consent_recorded_at
       FROM mothers AS mother
       JOIN pregnancies AS pregnancy
         ON pregnancy.mother_id = mother.id
        AND pregnancy.status = 'ACTIVE'
       JOIN LATERAL (
         SELECT id, purpose, status, source, recorded_at
           FROM consent_records
          WHERE mother_id = mother.id
            AND purpose = 'REMINDER'
          ORDER BY recorded_at DESC, id DESC
          LIMIT 1
       ) AS consent ON TRUE
      WHERE mother.id = $1
      LIMIT 1`,
      [motherId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toRegistrationResponse(row);
  }
}

function toRegistrationResponse(row: RegistrationLookupRow): MotherRegistrationResponse {
  return {
    mother: {
      id: row.mother_id,
      health_center_id: row.health_center_id,
      full_name: row.full_name,
      phone_masked: maskPhone(row.phone_normalized),
    },
    pregnancy: {
      id: row.pregnancy_id,
      mother_id: row.mother_id,
      health_center_id: row.health_center_id,
      dating_basis: row.dating_basis,
      dating_date: row.dating_date,
      status: row.pregnancy_status,
    },
    consent: {
      id: row.consent_id,
      mother_id: row.mother_id,
      purpose: row.consent_purpose,
      status: row.consent_status,
      source: row.consent_source,
      recorded_at: row.consent_recorded_at.toISOString(),
    },
  };
}

export function maskPhone(phoneNormalized: string): string {
  const visibleSuffix = phoneNormalized.slice(-4);
  return `${"*".repeat(Math.max(4, phoneNormalized.length - visibleSuffix.length))}${visibleSuffix}`;
}
