import { randomUUID } from "node:crypto";
import pg from "pg";

import { bootstrapApi } from "../apps/api/dist/main.js";

const databaseUrl = process.env.DATABASE_URL;
const loginIdentifier = process.env.SMOKE_STAFF_LOGIN_IDENTIFIER;
const password = process.env.SMOKE_STAFF_PASSWORD;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");
if (loginIdentifier === undefined || password === undefined) {
  throw new Error("SMOKE_STAFF_LOGIN_IDENTIFIER and SMOKE_STAFF_PASSWORD are required");
}

const host = process.env.API_HOST ?? "127.0.0.1";
const port = process.env.API_PORT ?? "3001";
const baseUrl = `http://${host}:${port}/api/v1`;
const pool = new pg.Pool({
  connectionString: databaseUrl,
  application_name: "anc-registry-smoke",
  max: 1,
});
const app = await bootstrapApi();

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
}

async function readJson(response, operation) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${operation} failed with status ${response.status}: ${body}`);
  }
  return response.json();
}

async function expectStatus(response, expectedStatus, operation) {
  if (response.status === expectedStatus) return;
  const body = await response.text();
  throw new Error(`${operation} returned ${response.status}; expected ${expectedStatus}: ${body}`);
}

async function readErrorShape(response, expectedStatus, operation) {
  await expectStatus(response, expectedStatus, operation);
  const body = await response.json();
  const error = body?.error;
  if (typeof error !== "object" || error === null) {
    throw new Error(`${operation} did not return the canonical error envelope`);
  }
  return { code: error.code, message: error.message, details: error.details };
}

async function ensureSyntheticAssignablePlan() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Synthetic ANC plans are forbidden in production");
  }
  const existing = await pool.query(
    `SELECT plan.id
       FROM anc_plan_versions AS plan
      WHERE (plan.plan_kind = 'CLINICAL' AND plan.status = 'ACTIVE')
         OR (
           plan.plan_kind = 'SYNTHETIC'
           AND plan.status = 'DRAFT'
           AND (SELECT count(*) FROM anc_milestone_rules WHERE plan_version_id = plan.id) = 8
         )
      ORDER BY CASE WHEN plan.plan_kind = 'CLINICAL' THEN 0 ELSE 1 END, plan.version_no DESC
      LIMIT 1`,
  );
  if (existing.rows[0] !== undefined) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "ANC_SYNTHETIC_SMOKE_PLAN",
    ]);
    let planId;
    const draft = await client.query(
      `SELECT id
         FROM anc_plan_versions
        WHERE plan_kind = 'SYNTHETIC' AND status = 'DRAFT'
        ORDER BY version_no DESC
        LIMIT 1
        FOR UPDATE`,
    );
    if (draft.rows[0] === undefined) {
      const nextVersion = await client.query(
        "SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM anc_plan_versions",
      );
      const versionNo = Number(nextVersion.rows[0]?.version_no);
      if (!Number.isSafeInteger(versionNo) || versionNo < 1) {
        throw new Error("Could not allocate a synthetic ANC plan version number");
      }
      planId = randomUUID();
      await client.query(
        `INSERT INTO anc_plan_versions (
           id, version_no, plan_kind, status, source_reference
         ) VALUES ($1, $2, 'SYNTHETIC', 'DRAFT', $3)`,
        [planId, versionNo, "SYNTHETIC_REGISTRY_SMOKE_DEV_ONLY_NOT_CLINICAL_GUIDANCE"],
      );
    } else {
      planId = draft.rows[0].id;
      await client.query("DELETE FROM anc_milestone_rules WHERE plan_version_id = $1", [planId]);
    }

    for (const rule of syntheticMilestoneRules()) {
      await client.query(
        `INSERT INTO anc_milestone_rules (
           id, plan_version_id, code, trimester_label,
           target_week_start, target_week_end, milestone_category,
           required_facility_policy, allowed_facility_types,
           reminder_enabled, reminder_interval_days
         ) VALUES ($1, $2, $3, 'SYNTHETIC_DEV_ONLY', $4, $5, $6, $7, $8::jsonb, $9, 3)`,
        [
          randomUUID(),
          planId,
          rule.code,
          rule.targetWeekStart,
          rule.targetWeekEnd,
          rule.category,
          rule.facilityPolicy,
          JSON.stringify(rule.allowedFacilityTypes),
          rule.reminderEnabled,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function syntheticMilestoneRules() {
  return ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"].map((code, index) => {
    if (code === "K8") {
      return {
        code,
        targetWeekStart: null,
        targetWeekEnd: null,
        category: "DELIVERY",
        facilityPolicy: "PONED_OR_RS_REQUIRED",
        allowedFacilityTypes: ["PONED", "HOSPITAL"],
        reminderEnabled: false,
      };
    }
    const puskesmasRequired = code === "K1" || code === "K4" || code === "K5";
    return {
      code,
      targetWeekStart: index + 1,
      targetWeekEnd: index + 1,
      category: "ANC",
      facilityPolicy: puskesmasRequired ? "PUSKESMAS_REQUIRED" : "FLEXIBLE",
      allowedFacilityTypes: puskesmasRequired ? ["PUSKESMAS"] : ["PUSKESMAS", "MIDWIFE_PRACTICE"],
      reminderEnabled: true,
    };
  });
}

const smokeStartedAt = new Date();

try {
  await ensureSyntheticAssignablePlan();
  const login = await readJson(
    await request("/staff/auth/login", {
      method: "POST",
      body: JSON.stringify({ login_identifier: loginIdentifier, password }),
    }),
    "Puskesmas login",
  );
  const idempotencyKey = randomUUID();
  const syntheticNik = "3273014901010001";
  const syntheticPhone = "0812-3456-789";
  const registrationRequest = {
    idempotency_key: idempotencyKey,
    full_name: "Synthetic Registry Smoke",
    nik: syntheticNik,
    address: "Synthetic Registry Address",
    phone_number: syntheticPhone,
    pregnancy_start_date: "2026-05-01",
    consent: { notification_allowed: true },
  };
  const authorization = `Bearer ${login.access_token}`;
  const first = await readJson(
    await request("/mothers", {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(registrationRequest),
    }),
    "Mother registry creation",
  );
  const replay = await readJson(
    await request("/mothers", {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(registrationRequest),
    }),
    "Mother registry idempotency replay",
  );

  if (first.mother?.id !== replay.mother?.id || first.pregnancy?.id !== replay.pregnancy?.id) {
    throw new Error("Registry idempotency replay returned a different resource");
  }
  const serialized = JSON.stringify(first);
  if (
    serialized.includes(syntheticNik) ||
    serialized.includes(syntheticPhone) ||
    serialized.includes(registrationRequest.address)
  ) {
    throw new Error("Registry response exposed restricted registration input");
  }

  const stored = await pool.query(
    `SELECT
       mother.nik_ciphertext,
       mother.phone_normalized,
       pregnancy.status AS pregnancy_status,
       pregnancy.dating_basis,
       consent.status AS consent_status
     FROM mothers AS mother
     JOIN pregnancies AS pregnancy ON pregnancy.mother_id = mother.id AND pregnancy.status = 'ACTIVE'
     JOIN consent_records AS consent ON consent.mother_id = mother.id AND consent.purpose = 'REMINDER'
    WHERE mother.id = $1`,
    [first.mother?.id],
  );
  const row = stored.rows[0];
  if (
    row === undefined ||
    !String(row.nik_ciphertext).startsWith("v1.") ||
    String(row.nik_ciphertext).includes(syntheticNik) ||
    row.phone_normalized !== "628123456789" ||
    row.pregnancy_status !== "ACTIVE" ||
    row.dating_basis !== "PREGNANCY_START_DATE" ||
    row.consent_status !== "GRANTED"
  ) {
    throw new Error(
      "Registry persistence did not preserve the protected atomic registration state",
    );
  }

  const milestoneTimeline = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/milestones`, {
      headers: { authorization },
    }),
    "Synthetic K1-K8 milestone timeline",
  );
  if (
    milestoneTimeline.plan_kind !== "SYNTHETIC" ||
    milestoneTimeline.production_eligible !== false ||
    milestoneTimeline.milestones?.length !== 8 ||
    milestoneTimeline.milestones.map((milestone) => milestone.code).join(",") !==
      "K1,K2,K3,K4,K5,K6,K7,K8" ||
    milestoneTimeline.milestones.some((milestone) => milestone.due_at !== null)
  ) {
    throw new Error("Synthetic K1-K8 milestones were not initialized safely");
  }

  const duplicateWhileActive = await request(`/mothers/${first.mother.id}/pregnancies`, {
    method: "POST",
    headers: { authorization },
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      pregnancy_start_date: "2026-06-01",
    }),
  });
  await expectStatus(duplicateWhileActive, 409, "One-active-pregnancy guard");

  const revisionRequest = {
    idempotency_key: randomUUID(),
    pregnancy_start_date: "2026-04-28",
    reason: "Synthetic dating correction",
  };
  const revised = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}`, {
      method: "PATCH",
      headers: { authorization },
      body: JSON.stringify(revisionRequest),
    }),
    "Pregnancy dating revision",
  );
  const revisionReplay = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}`, {
      method: "PATCH",
      headers: { authorization },
      body: JSON.stringify(revisionRequest),
    }),
    "Pregnancy dating idempotency replay",
  );
  if (revised.dating_date !== "2026-04-28" || revisionReplay.dating_date !== revised.dating_date) {
    throw new Error("Pregnancy dating revision or replay returned an invalid snapshot");
  }

  const closeRequest = {
    idempotency_key: randomUUID(),
    reason: "Synthetic administrative close",
  };
  const closed = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/close`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(closeRequest),
    }),
    "Pregnancy close",
  );
  const closeReplay = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/close`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(closeRequest),
    }),
    "Pregnancy close idempotency replay",
  );
  if (
    closed.status !== "CLOSED" ||
    closed.closed_at === null ||
    closeReplay.closed_at !== closed.closed_at
  ) {
    throw new Error("Pregnancy close or replay returned an invalid immutable snapshot");
  }
  const revisionReplayAfterClose = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}`, {
      method: "PATCH",
      headers: { authorization },
      body: JSON.stringify(revisionRequest),
    }),
    "Pregnancy dating replay after close",
  );
  if (
    revisionReplayAfterClose.status !== "ACTIVE" ||
    revisionReplayAfterClose.dating_date !== revised.dating_date
  ) {
    throw new Error("Dating idempotency replay changed after pregnancy close");
  }

  const replacement = await readJson(
    await request(`/mothers/${first.mother.id}/pregnancies`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        pregnancy_start_date: "2026-06-01",
      }),
    }),
    "Replacement active pregnancy creation",
  );
  if (replacement.status !== "ACTIVE" || replacement.id === first.pregnancy.id) {
    throw new Error("Replacement pregnancy was not created as the sole active pregnancy");
  }

  const lifecycleState = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE pregnancy.status = 'ACTIVE')::int AS active_count,
       COUNT(DISTINCT revision.id)::int AS revision_count,
       COUNT(DISTINCT event.id) FILTER (WHERE event.action = 'CLOSED')::int AS close_count
     FROM pregnancies AS pregnancy
     LEFT JOIN pregnancy_dating_revisions AS revision
       ON revision.pregnancy_id = pregnancy.id
     LEFT JOIN pregnancy_lifecycle_events AS event
       ON event.pregnancy_id = pregnancy.id
    WHERE pregnancy.mother_id = $1`,
    [first.mother.id],
  );
  const lifecycleRow = lifecycleState.rows[0];
  if (
    lifecycleRow?.active_count !== 1 ||
    lifecycleRow.revision_count !== 1 ||
    lifecycleRow.close_count !== 1
  ) {
    throw new Error("Pregnancy lifecycle persistence violated active/history invariants");
  }

  const revision = await pool.query(
    `SELECT id, previous_dating_date::text, revised_dating_date::text
       FROM pregnancy_dating_revisions
      WHERE pregnancy_id = $1`,
    [first.pregnancy.id],
  );
  const revisionRow = revision.rows[0];
  if (
    revisionRow?.previous_dating_date !== "2026-05-01" ||
    revisionRow.revised_dating_date !== "2026-04-28"
  ) {
    throw new Error("Pregnancy dating history did not retain both approved inputs");
  }
  try {
    await pool.query("UPDATE pregnancy_dating_revisions SET reason = 'MUTATED' WHERE id = $1", [
      revisionRow.id,
    ]);
    throw new Error("Append-only pregnancy dating history accepted an update");
  } catch (error) {
    if (error?.code !== "55000") throw error;
  }

  const firstCredentialRequest = {
    idempotency_key: randomUUID(),
    reason: "Synthetic first access handoff",
  };
  const firstCredential = await readJson(
    await request(`/mothers/${first.mother.id}/access-code/reissue`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(firstCredentialRequest),
    }),
    "Mother access credential issue",
  );
  if (
    firstCredential.issuance_type !== "ISSUED" ||
    firstCredential.code_delivery !== "DISPLAY_ONCE" ||
    typeof firstCredential.one_time_code !== "string" ||
    !/^ANC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u.test(
      firstCredential.one_time_code,
    )
  ) {
    throw new Error("Initial mother access code was not delivered exactly once in the safe format");
  }
  const firstCredentialReplay = await readJson(
    await request(`/mothers/${first.mother.id}/access-code/reissue`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(firstCredentialRequest),
    }),
    "Mother access credential issue replay",
  );
  if (
    firstCredentialReplay.id !== firstCredential.id ||
    firstCredentialReplay.one_time_code !== null ||
    firstCredentialReplay.code_delivery !== "NOT_AVAILABLE_ON_REPLAY"
  ) {
    throw new Error("Credential replay exposed or regenerated a one-time access code");
  }

  const secondCredential = await readJson(
    await request(`/mothers/${first.mother.id}/access-code/reissue`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        reason: "Synthetic lost-code replacement",
      }),
    }),
    "Mother access credential reissue",
  );
  if (
    secondCredential.issuance_type !== "REISSUED" ||
    secondCredential.id === firstCredential.id ||
    secondCredential.one_time_code === firstCredential.one_time_code
  ) {
    throw new Error("Credential reissue did not rotate the active authenticator");
  }
  const immutableFirstReplay = await readJson(
    await request(`/mothers/${first.mother.id}/access-code/reissue`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(firstCredentialRequest),
    }),
    "Original credential replay after rotation",
  );
  if (
    immutableFirstReplay.id !== firstCredential.id ||
    immutableFirstReplay.status !== "ACTIVE" ||
    immutableFirstReplay.one_time_code !== null
  ) {
    throw new Error("Credential issuance replay changed after a later rotation");
  }

  const revokeCredentialRequest = {
    idempotency_key: randomUUID(),
    reason: "Synthetic device-loss revocation",
  };
  const revokedCredential = await readJson(
    await request(`/mothers/${first.mother.id}/access-code/revoke`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(revokeCredentialRequest),
    }),
    "Mother access credential revoke",
  );
  const revokeCredentialReplay = await readJson(
    await request(`/mothers/${first.mother.id}/access-code/revoke`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(revokeCredentialRequest),
    }),
    "Mother access credential revoke replay",
  );
  if (
    revokedCredential.status !== "REVOKED" ||
    revokedCredential.id !== secondCredential.id ||
    revokeCredentialReplay.revoked_at !== revokedCredential.revoked_at
  ) {
    throw new Error("Credential revocation or replay returned an invalid snapshot");
  }

  const replacementCredential = await readJson(
    await request(`/mothers/${first.mother.id}/access-code/reissue`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        reason: "Synthetic replacement after explicit revoke",
      }),
    }),
    "Mother access credential replacement after revoke",
  );
  if (
    replacementCredential.issuance_type !== "REISSUED" ||
    replacementCredential.status !== "ACTIVE"
  ) {
    throw new Error("Credential could not be safely reissued after explicit revocation");
  }

  const credentialState = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_count,
       COUNT(*) FILTER (WHERE status = 'REVOKED')::int AS revoked_count,
       BOOL_AND(code_hash LIKE 'scrypt$131072$8$1$%') AS hashes_are_scrypt,
       BOOL_AND(code_lookup_hash ~ '^[a-f0-9]{64}$') AS lookup_hashes_are_hmac,
       BOOL_OR(code_hash LIKE '%' || $2 || '%') AS leaked_first_code,
       BOOL_OR(code_hash LIKE '%' || $3 || '%') AS leaked_second_code,
       BOOL_OR(code_hash LIKE '%' || $4 || '%') AS leaked_replacement_code
     FROM mother_access_credentials
    WHERE mother_id = $1`,
    [
      first.mother.id,
      firstCredential.one_time_code,
      secondCredential.one_time_code,
      replacementCredential.one_time_code,
    ],
  );
  const credentialRow = credentialState.rows[0];
  if (
    credentialRow?.active_count !== 1 ||
    credentialRow.revoked_count !== 2 ||
    credentialRow.hashes_are_scrypt !== true ||
    credentialRow.lookup_hashes_are_hmac !== true ||
    credentialRow.leaked_first_code !== false ||
    credentialRow.leaked_second_code !== false ||
    credentialRow.leaked_replacement_code !== false
  ) {
    throw new Error("Credential persistence violated hash/rotation/one-active invariants");
  }

  const credentialHistory = await pool.query(
    `SELECT action, COUNT(*)::int AS event_count
       FROM mother_access_credential_events
      WHERE mother_id = $1
      GROUP BY action`,
    [first.mother.id],
  );
  const eventCounts = Object.fromEntries(
    credentialHistory.rows.map((event) => [event.action, event.event_count]),
  );
  if (eventCounts.ISSUED !== 1 || eventCounts.REISSUED !== 2 || eventCounts.REVOKED !== 2) {
    throw new Error("Credential lifecycle history did not retain issue/reissue/revoke events");
  }

  const credentialAudit = await pool.query(
    `SELECT action, COUNT(*)::int AS event_count
       FROM audit_events
      WHERE resource_id = ANY($1::uuid[])
        AND action IN (
          'MOTHER_ACCESS_CODE_ISSUED',
          'MOTHER_ACCESS_CODE_REISSUED',
          'MOTHER_ACCESS_CODE_REVOKED'
        )
      GROUP BY action`,
    [[firstCredential.id, secondCredential.id, replacementCredential.id]],
  );
  const auditCounts = Object.fromEntries(
    credentialAudit.rows.map((event) => [event.action, event.event_count]),
  );
  if (
    auditCounts.MOTHER_ACCESS_CODE_ISSUED !== 1 ||
    auditCounts.MOTHER_ACCESS_CODE_REISSUED !== 2 ||
    auditCounts.MOTHER_ACCESS_CODE_REVOKED !== 1
  ) {
    throw new Error("Credential audit events were missing or duplicated by idempotency replay");
  }

  const genericFailureAttempts = [
    {
      full_name: "Synthetic Registry Impostor",
      access_code: replacementCredential.one_time_code,
      operation: "Mother access wrong-name rejection",
    },
    {
      full_name: first.mother.full_name,
      access_code: firstCredential.one_time_code,
      operation: "Mother access revoked first-code rejection",
    },
    {
      full_name: first.mother.full_name,
      access_code: secondCredential.one_time_code,
      operation: "Mother access revoked second-code rejection",
    },
  ];
  const genericFailures = [];
  for (const attempt of genericFailureAttempts) {
    genericFailures.push(
      await readErrorShape(
        await request("/mother-access/validate", {
          method: "POST",
          body: JSON.stringify({
            full_name: attempt.full_name,
            access_code: attempt.access_code,
          }),
        }),
        401,
        attempt.operation,
      ),
    );
  }
  const expectedGenericFailure = {
    code: "INVALID_CREDENTIALS",
    message: "Kredensial tidak valid.",
    details: null,
  };
  if (
    genericFailures.some(
      (failure) => JSON.stringify(failure) !== JSON.stringify(expectedGenericFailure),
    )
  ) {
    throw new Error("Mother access failures exposed distinguishable credential state");
  }

  const motherSession = await readJson(
    await request("/mother-access/validate", {
      method: "POST",
      body: JSON.stringify({
        full_name: `  ${first.mother.full_name.toUpperCase()}  `,
        access_code: replacementCredential.one_time_code.toLowerCase().replaceAll("-", " "),
      }),
    }),
    "Mother private access validation",
  );
  if (
    motherSession.token_type !== "Bearer" ||
    !/^anc_mt_[A-Za-z0-9_-]{43}$/u.test(motherSession.access_token) ||
    Number.isNaN(Date.parse(motherSession.expires_at))
  ) {
    throw new Error("Mother access validation did not return an opaque expiring bearer session");
  }
  const motherAuthorization = `Bearer ${motherSession.access_token}`;
  const motherProfileResponse = await request("/mother/me", {
    headers: { authorization: motherAuthorization },
  });
  const motherProfile = await readJson(motherProfileResponse, "Mother own-profile read");
  if (
    motherProfileResponse.headers.get("cache-control") !== "private, no-store" ||
    motherProfile.id !== first.mother.id ||
    motherProfile.display_name !== first.mother.full_name ||
    motherProfile.active_pregnancy_id !== replacement.id ||
    /phone|address|nik|health_center/iu.test(JSON.stringify(motherProfile))
  ) {
    throw new Error("Mother own-profile response crossed the minimum-data boundary");
  }

  await expectStatus(
    await request(`/pregnancies/${replacement.id}/close`, {
      method: "POST",
      headers: { authorization: motherAuthorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        reason: "Mother bearer must not cross the staff authorization boundary",
      }),
    }),
    401,
    "Mother bearer cross-role rejection",
  );

  const storedSession = await pool.query(
    `SELECT session_hash, credential_id, revoked_at
       FROM mother_sessions
      WHERE id = $1 AND mother_id = $2`,
    [motherProfile.session_id, first.mother.id],
  );
  const storedSessionRow = storedSession.rows[0];
  if (
    !/^[a-f0-9]{64}$/u.test(storedSessionRow?.session_hash ?? "") ||
    storedSessionRow.session_hash.includes(motherSession.access_token) ||
    storedSessionRow.credential_id !== replacementCredential.id ||
    storedSessionRow.revoked_at !== null
  ) {
    throw new Error("Mother session persistence exposed a token or lost its credential binding");
  }

  await expectStatus(
    await request("/mother-access/logout", {
      method: "POST",
      headers: { authorization: motherAuthorization },
    }),
    204,
    "Mother logout",
  );
  await expectStatus(
    await request("/mother/me", { headers: { authorization: motherAuthorization } }),
    401,
    "Revoked mother session rejection",
  );
  const revokedSession = await pool.query("SELECT revoked_at FROM mother_sessions WHERE id = $1", [
    motherProfile.session_id,
  ]);
  if (
    revokedSession.rows[0]?.revoked_at === null ||
    revokedSession.rows[0]?.revoked_at === undefined
  ) {
    throw new Error("Mother logout did not durably revoke its session");
  }

  for (let attempt = 0; attempt < 7; attempt += 1) {
    await readErrorShape(
      await request("/mother-access/validate", {
        method: "POST",
        body: JSON.stringify({
          full_name: first.mother.full_name,
          access_code: `not-a-code-${attempt}`,
        }),
      }),
      401,
      `Mother access IP throttle failure ${attempt + 1}`,
    );
  }
  const throttled = await readErrorShape(
    await request("/mother-access/validate", {
      method: "POST",
      body: JSON.stringify({
        full_name: first.mother.full_name,
        access_code: "not-a-code-final",
      }),
    }),
    429,
    "Mother access durable throttle",
  );
  if (
    throttled.code !== "RATE_LIMITED" ||
    typeof throttled.details?.retry_after_seconds !== "number" ||
    throttled.details.retry_after_seconds <= 0
  ) {
    throw new Error("Mother access throttle did not return a safe retry interval");
  }

  const rateLimitState = await pool.query(
    `SELECT bucket_hash, scope, failure_count
       FROM mother_access_rate_limits`,
  );
  const serializedRateLimits = JSON.stringify(rateLimitState.rows);
  if (
    rateLimitState.rows.length === 0 ||
    rateLimitState.rows.some((row) => !/^[a-f0-9]{64}$/u.test(row.bucket_hash)) ||
    serializedRateLimits.includes(first.mother.full_name) ||
    serializedRateLimits.includes(replacementCredential.one_time_code) ||
    serializedRateLimits.includes(motherSession.access_token) ||
    serializedRateLimits.includes("not-a-code") ||
    serializedRateLimits.includes("127.0.0.1")
  ) {
    throw new Error("Mother access throttling persisted raw identity or credential material");
  }

  const motherAccessAudit = await pool.query(
    `SELECT actor_type, actor_id, action, resource_id, metadata
       FROM audit_events
      WHERE created_at >= $1
        AND action IN (
          'MOTHER_ACCESS_FAILURE',
          'MOTHER_ACCESS_THROTTLED',
          'MOTHER_ACCESS_SUCCESS',
          'MOTHER_LOGOUT'
        )
      ORDER BY created_at, id`,
    [smokeStartedAt],
  );
  const motherAuditCounts = {};
  for (const event of motherAccessAudit.rows) {
    const key = `${event.actor_type}:${event.action}`;
    motherAuditCounts[key] = (motherAuditCounts[key] ?? 0) + 1;
  }
  const serializedMotherAudit = JSON.stringify(motherAccessAudit.rows);
  if (
    motherAuditCounts["PUBLIC:MOTHER_ACCESS_FAILURE"] !== 10 ||
    motherAuditCounts["PUBLIC:MOTHER_ACCESS_THROTTLED"] !== 1 ||
    motherAuditCounts["BUMIL:MOTHER_ACCESS_SUCCESS"] !== 1 ||
    motherAuditCounts["BUMIL:MOTHER_LOGOUT"] !== 1 ||
    motherAccessAudit.rows.some(
      (event) =>
        event.actor_type === "PUBLIC" && (event.actor_id !== null || event.resource_id !== null),
    ) ||
    serializedMotherAudit.includes(first.mother.full_name) ||
    serializedMotherAudit.includes(firstCredential.one_time_code) ||
    serializedMotherAudit.includes(secondCredential.one_time_code) ||
    serializedMotherAudit.includes(replacementCredential.one_time_code) ||
    serializedMotherAudit.includes(motherSession.access_token) ||
    serializedMotherAudit.includes("not-a-code") ||
    serializedMotherAudit.includes("127.0.0.1")
  ) {
    throw new Error(
      "Mother authentication audit trail was incomplete or used the wrong actor type",
    );
  }

  const credentialEventId = await pool.query(
    `SELECT id FROM mother_access_credential_events WHERE mother_id = $1 LIMIT 1`,
    [first.mother.id],
  );
  try {
    await pool.query(
      "UPDATE mother_access_credential_events SET reason = 'MUTATED' WHERE id = $1",
      [credentialEventId.rows[0]?.id],
    );
    throw new Error("Append-only credential history accepted an update");
  } catch (error) {
    if (error?.code !== "55000") throw error;
  }

  process.stdout.write(
    "Registry smoke passed: protected registration, pregnancy lifecycle, K1-K8 milestone snapshot, hashed credential rotation, private mother sessions, and durable throttling.\n",
  );
} finally {
  process.env.SMOKE_STAFF_PASSWORD = "";
  await app.close();
  await pool.end();
}
