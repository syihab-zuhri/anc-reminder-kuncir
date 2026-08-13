import type {
  ContentPlaceholderKey,
  ContentTemplateCreateRequest,
  ContentTemplateResponse,
  ContentTemplateType,
  ContentVersionCreateRequest,
  ContentVersionResponse,
  ContentVersionStatus,
} from "@anc/contracts";
import type { DatabasePool, TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

type Queryable = Pick<TransactionClient, "query">;

interface TemplateRow extends QueryResultRow {
  readonly id: string;
  readonly health_center_id: string | null;
  readonly template_key: string;
  readonly content_type: ContentTemplateType;
  readonly created_at: Date;
}

interface VersionRow extends QueryResultRow {
  readonly id: string;
  readonly content_template_id: string;
  readonly version_no: number;
  readonly status: ContentVersionStatus;
  readonly title: string;
  readonly body: string;
  readonly placeholder_keys: ContentPlaceholderKey[];
  readonly source_reference: string;
  readonly approval_reference: string | null;
  readonly created_by: string | null;
  readonly submitted_by: string | null;
  readonly submitted_at: Date | null;
  readonly approved_by: string | null;
  readonly approved_at: Date | null;
  readonly published_by: string | null;
  readonly published_at: Date | null;
  readonly archived_by: string | null;
  readonly archived_at: Date | null;
  readonly created_at: Date;
}

interface VersionStateRow extends QueryResultRow {
  readonly status: ContentVersionStatus;
  readonly health_center_id: string | null;
  readonly content_template_id: string;
}

export interface CreateContentTemplateInput {
  readonly templateId: string;
  readonly versionId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly placeholderKeys: readonly ContentPlaceholderKey[];
  readonly request: ContentTemplateCreateRequest;
}

export interface CreateContentVersionInput {
  readonly versionId: string;
  readonly templateId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly placeholderKeys: readonly ContentPlaceholderKey[];
  readonly request: ContentVersionCreateRequest;
}

export class ContentTemplateConflictError extends Error {}
export class ContentVersionNotFoundError extends Error {}
export class ContentVersionTransitionError extends Error {}

export interface ContentManagementRepository {
  queryRunner(): Queryable;
  withTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T>;
  isClinicalProgramOwner(staffUserId: string): Promise<boolean>;
  listTemplates(healthCenterId: string): Promise<ContentTemplateResponse[]>;
  findTemplateById(
    client: Queryable,
    templateId: string,
    healthCenterId: string,
  ): Promise<ContentTemplateResponse | null>;
  findVersionById(
    client: Queryable,
    versionId: string,
    healthCenterId: string,
  ): Promise<ContentVersionResponse | null>;
  createTemplate(
    client: TransactionClient,
    input: CreateContentTemplateInput,
  ): Promise<ContentTemplateResponse>;
  createVersion(
    client: TransactionClient,
    input: CreateContentVersionInput,
  ): Promise<ContentVersionResponse>;
  submitReview(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse>;
  approve(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    approvalReference: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse>;
  publish(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse>;
  archive(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse>;
}

export class PostgresContentManagementRepository implements ContentManagementRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public queryRunner(): Queryable {
    return this.pool;
  }

  public async withTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async isClinicalProgramOwner(staffUserId: string): Promise<boolean> {
    const result = await this.pool.query<{ readonly allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM staff_users
          WHERE id = $1
            AND role = 'PUSKESMAS'
            AND status = 'ACTIVE'
            AND clinical_program_owner = true
       ) AS allowed`,
      [staffUserId],
    );
    return result.rows[0]?.allowed === true;
  }

  public async listTemplates(healthCenterId: string): Promise<ContentTemplateResponse[]> {
    const result = await this.pool.query<TemplateRow>(
      `${TEMPLATE_SELECT}
        WHERE health_center_id IS NULL OR health_center_id = $1
        ORDER BY system_managed ASC, content_type ASC`,
      [healthCenterId],
    );
    return Promise.all(result.rows.map((row) => this.toTemplate(this.pool, row)));
  }

  public async findTemplateById(
    client: Queryable,
    templateId: string,
    healthCenterId: string,
  ): Promise<ContentTemplateResponse | null> {
    const result = await client.query<TemplateRow>(
      `${TEMPLATE_SELECT}
        WHERE id = $1 AND (health_center_id IS NULL OR health_center_id = $2)
        LIMIT 1`,
      [templateId, healthCenterId],
    );
    const row = result.rows[0];
    return row === undefined ? null : this.toTemplate(client, row);
  }

  public async findVersionById(
    client: Queryable,
    versionId: string,
    healthCenterId: string,
  ): Promise<ContentVersionResponse | null> {
    const result = await client.query<VersionRow>(
      `${VERSION_SELECT}
         JOIN content_templates ct ON ct.id = cv.content_template_id
        WHERE cv.id = $1 AND (ct.health_center_id IS NULL OR ct.health_center_id = $2)
        LIMIT 1`,
      [versionId, healthCenterId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toVersion(row);
  }

  public async createTemplate(
    client: TransactionClient,
    input: CreateContentTemplateInput,
  ): Promise<ContentTemplateResponse> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `CONTENT_TEMPLATE:${input.healthCenterId}:${input.request.content_type}`,
    ]);
    const existing = await client.query<{ readonly id: string }>(
      `SELECT id FROM content_templates
        WHERE health_center_id = $1 AND content_type = $2
        LIMIT 1`,
      [input.healthCenterId, input.request.content_type],
    );
    if (existing.rows[0] !== undefined) throw new ContentTemplateConflictError();

    await client.query(
      `INSERT INTO content_templates (
         id, health_center_id, template_key, content_type, created_by
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.templateId,
        input.healthCenterId,
        input.request.template_key,
        input.request.content_type,
        input.actorStaffId,
      ],
    );
    await this.insertVersion(client, {
      versionId: input.versionId,
      templateId: input.templateId,
      actorStaffId: input.actorStaffId,
      title: input.request.title,
      body: input.request.body,
      sourceReference: input.request.source_reference,
      placeholderKeys: input.placeholderKeys,
      versionNo: 1,
    });
    return requireTemplate(
      await this.findTemplateById(client, input.templateId, input.healthCenterId),
    );
  }

  public async createVersion(
    client: TransactionClient,
    input: CreateContentVersionInput,
  ): Promise<ContentVersionResponse> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `CONTENT_VERSION:${input.templateId}`,
    ]);
    const template = await client.query<{ readonly id: string }>(
      `SELECT id FROM content_templates
        WHERE id = $1 AND health_center_id = $2
        LIMIT 1`,
      [input.templateId, input.healthCenterId],
    );
    if (template.rows[0] === undefined) throw new ContentVersionNotFoundError();
    const openVersion = await client.query<{ readonly id: string }>(
      `SELECT id FROM content_versions
        WHERE content_template_id = $1
          AND status IN ('DRAFT', 'REVIEW', 'APPROVED')
        LIMIT 1`,
      [input.templateId],
    );
    if (openVersion.rows[0] !== undefined) throw new ContentTemplateConflictError();
    const next = await client.query<{ readonly version_no: number }>(
      `SELECT COALESCE(MAX(version_no), 0)::integer + 1 AS version_no
         FROM content_versions
        WHERE content_template_id = $1`,
      [input.templateId],
    );
    const versionNo = next.rows[0]?.version_no;
    if (versionNo === undefined) throw new Error("Content version allocation failed");
    await this.insertVersion(client, {
      versionId: input.versionId,
      templateId: input.templateId,
      actorStaffId: input.actorStaffId,
      title: input.request.title,
      body: input.request.body,
      sourceReference: input.request.source_reference,
      placeholderKeys: input.placeholderKeys,
      versionNo,
    });
    return requireVersion(
      await this.findVersionById(client, input.versionId, input.healthCenterId),
    );
  }

  public submitReview(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    return this.transition(
      client,
      versionId,
      healthCenterId,
      "DRAFT",
      "REVIEW",
      ["submitted_by = $4", "submitted_at = $5"],
      [actorStaffId, occurredAt],
    );
  }

  public async approve(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    approvalReference: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    await requireClinicalOwner(client, actorStaffId);
    return this.transition(
      client,
      versionId,
      healthCenterId,
      "REVIEW",
      "APPROVED",
      ["approved_by = $4", "approved_at = $5", "approval_reference = $6"],
      [actorStaffId, occurredAt, approvalReference],
    );
  }

  public async publish(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    await requireClinicalOwner(client, actorStaffId);
    const state = await lockVersionState(client, versionId, healthCenterId);
    if (state.status !== "APPROVED") throw new ContentVersionTransitionError();
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `CONTENT_PUBLISH:${state.content_template_id}`,
    ]);
    await client.query(
      `UPDATE content_versions
          SET status = 'ARCHIVED', archived_by = $2, archived_at = $3
        WHERE content_template_id = $1 AND status = 'PUBLISHED'`,
      [state.content_template_id, actorStaffId, occurredAt],
    );
    await client.query(
      `UPDATE content_versions
          SET status = 'PUBLISHED', published_by = $2, published_at = $3
        WHERE id = $1`,
      [versionId, actorStaffId, occurredAt],
    );
    return requireVersion(await this.findVersionById(client, versionId, healthCenterId));
  }

  public async archive(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    await requireClinicalOwner(client, actorStaffId);
    return this.transition(
      client,
      versionId,
      healthCenterId,
      "PUBLISHED",
      "ARCHIVED",
      ["archived_by = $4", "archived_at = $5"],
      [actorStaffId, occurredAt],
    );
  }

  private async transition(
    client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    expected: ContentVersionStatus,
    target: ContentVersionStatus,
    assignments: readonly string[],
    extraParameters: readonly unknown[],
  ): Promise<ContentVersionResponse> {
    const state = await lockVersionState(client, versionId, healthCenterId);
    if (state.status !== expected) throw new ContentVersionTransitionError();
    await client.query(
      `UPDATE content_versions cv
          SET status = $3, ${assignments.join(", ")}
         FROM content_templates ct
        WHERE cv.id = $1
          AND ct.id = cv.content_template_id
          AND ct.health_center_id = $2`,
      [versionId, healthCenterId, target, ...extraParameters],
    );
    return requireVersion(await this.findVersionById(client, versionId, healthCenterId));
  }

  private async insertVersion(
    client: TransactionClient,
    input: {
      readonly versionId: string;
      readonly templateId: string;
      readonly actorStaffId: string;
      readonly title: string;
      readonly body: string;
      readonly sourceReference: string;
      readonly placeholderKeys: readonly ContentPlaceholderKey[];
      readonly versionNo: number;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO content_versions (
         id, content_template_id, version_no, status, title, body,
         placeholder_keys, source_reference, created_by
       ) VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6::text[], $7, $8)`,
      [
        input.versionId,
        input.templateId,
        input.versionNo,
        input.title,
        input.body,
        input.placeholderKeys,
        input.sourceReference,
        input.actorStaffId,
      ],
    );
  }

  private async toTemplate(client: Queryable, row: TemplateRow): Promise<ContentTemplateResponse> {
    const versions = await client.query<VersionRow>(
      `${VERSION_SELECT}
        WHERE cv.content_template_id = $1
        ORDER BY cv.version_no DESC`,
      [row.id],
    );
    return {
      id: row.id,
      health_center_id: row.health_center_id,
      template_key: row.template_key,
      content_type: row.content_type,
      system_managed: row.health_center_id === null,
      created_at: row.created_at.toISOString(),
      versions: versions.rows.map(toVersion),
    };
  }
}

const TEMPLATE_SELECT = `SELECT
  id, health_center_id, template_key, content_type, created_at,
  (health_center_id IS NULL) AS system_managed
 FROM content_templates`;

const VERSION_SELECT = `SELECT
  cv.id, cv.content_template_id, cv.version_no, cv.status, cv.title, cv.body,
  cv.placeholder_keys, cv.source_reference, cv.approval_reference,
  cv.created_by, cv.submitted_by, cv.submitted_at, cv.approved_by, cv.approved_at,
  cv.published_by, cv.published_at, cv.archived_by, cv.archived_at, cv.created_at
 FROM content_versions cv`;

function toVersion(row: VersionRow): ContentVersionResponse {
  return {
    id: row.id,
    content_template_id: row.content_template_id,
    version_no: row.version_no,
    status: row.status,
    title: row.title,
    body: row.body,
    placeholder_keys: row.placeholder_keys,
    source_reference: row.source_reference,
    approval_reference: row.approval_reference,
    created_by_staff_id: row.created_by,
    submitted_by_staff_id: row.submitted_by,
    submitted_at: row.submitted_at?.toISOString() ?? null,
    approved_by_staff_id: row.approved_by,
    approved_at: row.approved_at?.toISOString() ?? null,
    published_by_staff_id: row.published_by,
    published_at: row.published_at?.toISOString() ?? null,
    archived_by_staff_id: row.archived_by,
    archived_at: row.archived_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    production_eligible: row.status === "PUBLISHED",
  };
}

async function lockVersionState(
  client: TransactionClient,
  versionId: string,
  healthCenterId: string,
): Promise<VersionStateRow> {
  const result = await client.query<VersionStateRow>(
    `SELECT cv.status, ct.health_center_id, cv.content_template_id
       FROM content_versions cv
       JOIN content_templates ct ON ct.id = cv.content_template_id
      WHERE cv.id = $1 AND ct.health_center_id = $2
      FOR UPDATE OF cv`,
    [versionId, healthCenterId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new ContentVersionNotFoundError();
  return row;
}

async function requireClinicalOwner(client: Queryable, staffUserId: string): Promise<void> {
  const result = await client.query<{ readonly allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM staff_users
        WHERE id = $1 AND role = 'PUSKESMAS' AND status = 'ACTIVE'
          AND clinical_program_owner = true
     ) AS allowed`,
    [staffUserId],
  );
  if (result.rows[0]?.allowed !== true) throw new ContentVersionNotFoundError();
}

function requireTemplate(value: ContentTemplateResponse | null): ContentTemplateResponse {
  if (value === null) throw new ContentVersionNotFoundError();
  return value;
}

function requireVersion(value: ContentVersionResponse | null): ContentVersionResponse {
  if (value === null) throw new ContentVersionNotFoundError();
  return value;
}
