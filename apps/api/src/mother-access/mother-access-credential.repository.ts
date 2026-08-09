import type {
  MotherAccessCredentialIssueResponse,
  MotherAccessCredentialRevokeResponse,
} from "@anc/contracts";
import type { TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

export type MotherAccessCredentialIssueAction = "ISSUED" | "REISSUED";

export interface ReissueMotherAccessCredentialInput {
  readonly credentialId: string;
  readonly issuedEventId: string;
  readonly revokedEventId: string;
  readonly motherId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly codeHash: string;
  readonly reason: string;
  readonly occurredAt: Date;
}

export interface RevokeMotherAccessCredentialInput {
  readonly revokedEventId: string;
  readonly motherId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly reason: string;
  readonly occurredAt: Date;
}

export interface MotherAccessCredentialIssueMutation {
  readonly mutationId: string;
  readonly credential: Omit<MotherAccessCredentialIssueResponse, "one_time_code" | "code_delivery">;
}

export interface MotherAccessCredentialRevokeMutation {
  readonly mutationId: string;
  readonly credential: MotherAccessCredentialRevokeResponse;
}

export interface MotherAccessCredentialRepository {
  reissue(
    client: TransactionClient,
    input: ReissueMotherAccessCredentialInput,
  ): Promise<MotherAccessCredentialIssueMutation>;
  revoke(
    client: TransactionClient,
    input: RevokeMotherAccessCredentialInput,
  ): Promise<MotherAccessCredentialRevokeMutation>;
  findIssueMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MotherAccessCredentialIssueMutation["credential"] | null>;
  findRevokeMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MotherAccessCredentialRevokeResponse | null>;
}

export class MotherAccessTargetUnavailableError extends Error {
  public constructor() {
    super("Mother access target is outside the managed active-pregnancy scope");
    this.name = "MotherAccessTargetUnavailableError";
  }
}

export class MotherAccessCredentialNotActiveError extends Error {
  public constructor() {
    super("Mother has no active access credential");
    this.name = "MotherAccessCredentialNotActiveError";
  }
}

interface CredentialRow extends QueryResultRow {
  readonly id: string;
  readonly mother_id: string;
  readonly status: "ACTIVE" | "REVOKED";
  readonly issued_at: Date;
  readonly revoked_at: Date | null;
}

interface CredentialEventRow extends CredentialRow {
  readonly action: "ISSUED" | "REISSUED" | "REVOKED";
}

export class PostgresMotherAccessCredentialRepository implements MotherAccessCredentialRepository {
  public async reissue(
    client: TransactionClient,
    input: ReissueMotherAccessCredentialInput,
  ): Promise<MotherAccessCredentialIssueMutation> {
    await this.lockMother(client, input.motherId, input.healthCenterId, true);
    const latest = await this.findLatestCredential(client, input.motherId);
    const active =
      latest?.status === "ACTIVE"
        ? latest
        : await this.findActiveCredential(client, input.motherId);
    const previous = active ?? latest;
    const issueAction: MotherAccessCredentialIssueAction =
      previous === undefined ? "ISSUED" : "REISSUED";

    if (active !== undefined) {
      const revoked = await client.query<CredentialRow>(
        `UPDATE mother_access_credentials
            SET status = 'REVOKED',
                revoked_at = $2,
                revoked_by_staff_id = $3,
                revocation_reason = $4
          WHERE id = $1 AND status = 'ACTIVE'
          RETURNING id, mother_id, status, issued_at, revoked_at`,
        [active.id, input.occurredAt, input.actorStaffId, input.reason],
      );
      const revokedCredential = requireRow(revoked.rows[0]);
      await this.insertEvent(client, {
        id: input.revokedEventId,
        credential: revokedCredential,
        action: "REVOKED",
        previousCredentialId: null,
        actorStaffId: input.actorStaffId,
        reason: input.reason,
        occurredAt: input.occurredAt,
      });
    }

    await this.revokeSessions(client, input);
    const inserted = await client.query<CredentialRow>(
      `INSERT INTO mother_access_credentials (
         id, mother_id, code_hash, status, issued_at, issued_by_staff_id
       ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5)
       RETURNING id, mother_id, status, issued_at, revoked_at`,
      [input.credentialId, input.motherId, input.codeHash, input.occurredAt, input.actorStaffId],
    );
    const credential = requireRow(inserted.rows[0]);
    await this.insertEvent(client, {
      id: input.issuedEventId,
      credential,
      action: issueAction,
      previousCredentialId: previous?.id ?? null,
      actorStaffId: input.actorStaffId,
      reason: input.reason,
      occurredAt: input.occurredAt,
    });
    return {
      mutationId: input.issuedEventId,
      credential: toIssueResponse(credential, issueAction),
    };
  }

  public async revoke(
    client: TransactionClient,
    input: RevokeMotherAccessCredentialInput,
  ): Promise<MotherAccessCredentialRevokeMutation> {
    await this.lockMother(client, input.motherId, input.healthCenterId, false);
    const revoked = await client.query<CredentialRow>(
      `UPDATE mother_access_credentials
          SET status = 'REVOKED',
              revoked_at = $2,
              revoked_by_staff_id = $3,
              revocation_reason = $4
        WHERE mother_id = $1 AND status = 'ACTIVE'
        RETURNING id, mother_id, status, issued_at, revoked_at`,
      [input.motherId, input.occurredAt, input.actorStaffId, input.reason],
    );
    const credential = revoked.rows[0];
    if (credential === undefined) throw new MotherAccessCredentialNotActiveError();

    await this.revokeSessions(client, input);
    await this.insertEvent(client, {
      id: input.revokedEventId,
      credential,
      action: "REVOKED",
      previousCredentialId: null,
      actorStaffId: input.actorStaffId,
      reason: input.reason,
      occurredAt: input.occurredAt,
    });
    return {
      mutationId: input.revokedEventId,
      credential: toRevokeResponse(credential),
    };
  }

  public async findIssueMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MotherAccessCredentialIssueMutation["credential"] | null> {
    const row = await this.findEvent(client, eventId, healthCenterId);
    if (row === null || (row.action !== "ISSUED" && row.action !== "REISSUED")) return null;
    return toIssueResponse(row, row.action);
  }

  public async findRevokeMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MotherAccessCredentialRevokeResponse | null> {
    const row = await this.findEvent(client, eventId, healthCenterId);
    return row?.action === "REVOKED" ? toRevokeResponse(row) : null;
  }

  private async lockMother(
    client: TransactionClient,
    motherId: string,
    healthCenterId: string,
    requireActivePregnancy: boolean,
  ): Promise<void> {
    const result = await client.query(
      `SELECT mother.id
         FROM mothers AS mother
        WHERE mother.id = $1
          AND mother.health_center_id = $2
          AND (
            $3::boolean = FALSE
            OR EXISTS (
              SELECT 1
                FROM pregnancies AS pregnancy
               WHERE pregnancy.mother_id = mother.id
                 AND pregnancy.health_center_id = mother.health_center_id
                 AND pregnancy.status = 'ACTIVE'
            )
          )
        FOR UPDATE OF mother`,
      [motherId, healthCenterId, requireActivePregnancy],
    );
    if (result.rowCount !== 1) throw new MotherAccessTargetUnavailableError();
  }

  private async findLatestCredential(
    client: TransactionClient,
    motherId: string,
  ): Promise<CredentialRow | undefined> {
    const result = await client.query<CredentialRow>(
      `SELECT id, mother_id, status, issued_at, revoked_at
         FROM mother_access_credentials
        WHERE mother_id = $1
        ORDER BY issued_at DESC, id DESC
        LIMIT 1`,
      [motherId],
    );
    return result.rows[0];
  }

  private async findActiveCredential(
    client: TransactionClient,
    motherId: string,
  ): Promise<CredentialRow | undefined> {
    const result = await client.query<CredentialRow>(
      `SELECT id, mother_id, status, issued_at, revoked_at
         FROM mother_access_credentials
        WHERE mother_id = $1 AND status = 'ACTIVE'
        LIMIT 1`,
      [motherId],
    );
    return result.rows[0];
  }

  private async revokeSessions(
    client: TransactionClient,
    input: ReissueMotherAccessCredentialInput | RevokeMotherAccessCredentialInput,
  ): Promise<void> {
    await client.query(
      `UPDATE mother_sessions
          SET revoked_at = $2,
              revoked_by_staff_id = $3,
              revocation_reason = $4
        WHERE mother_id = $1 AND revoked_at IS NULL`,
      [input.motherId, input.occurredAt, input.actorStaffId, input.reason],
    );
  }

  private async insertEvent(
    client: TransactionClient,
    input: {
      readonly id: string;
      readonly credential: CredentialRow;
      readonly action: "ISSUED" | "REISSUED" | "REVOKED";
      readonly previousCredentialId: string | null;
      readonly actorStaffId: string;
      readonly reason: string;
      readonly occurredAt: Date;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO mother_access_credential_events (
         id, credential_id, mother_id, action, previous_credential_id,
         status, issued_at, revoked_at, actor_staff_id, reason, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.id,
        input.credential.id,
        input.credential.mother_id,
        input.action,
        input.previousCredentialId,
        input.credential.status,
        input.credential.issued_at,
        input.credential.revoked_at,
        input.actorStaffId,
        input.reason,
        input.occurredAt,
      ],
    );
  }

  private async findEvent(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<CredentialEventRow | null> {
    const result = await client.query<CredentialEventRow>(
      `SELECT
         event.credential_id AS id,
         event.mother_id,
         event.action,
         event.status,
         event.issued_at,
         event.revoked_at
       FROM mother_access_credential_events AS event
       JOIN mothers AS mother ON mother.id = event.mother_id
      WHERE event.id = $1 AND mother.health_center_id = $2
      LIMIT 1`,
      [eventId, healthCenterId],
    );
    return result.rows[0] ?? null;
  }
}

function toIssueResponse(
  row: CredentialRow,
  action: MotherAccessCredentialIssueAction,
): MotherAccessCredentialIssueMutation["credential"] {
  return {
    id: row.id,
    mother_id: row.mother_id,
    issuance_type: action,
    status: "ACTIVE",
    issued_at: row.issued_at.toISOString(),
  };
}

function toRevokeResponse(row: CredentialRow): MotherAccessCredentialRevokeResponse {
  if (row.revoked_at === null) throw new Error("Revoked credential snapshot is incomplete");
  return {
    id: row.id,
    mother_id: row.mother_id,
    status: "REVOKED",
    issued_at: row.issued_at.toISOString(),
    revoked_at: row.revoked_at.toISOString(),
  };
}

function requireRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error("Mother access credential write returned no row");
  return row;
}
