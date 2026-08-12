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
  const puskesmasFacility = await readJson(
    await request("/staff/organization/facilities", {
      method: "POST",
      headers: { authorization: `Bearer ${login.access_token}` },
      body: JSON.stringify({
        village_id: null,
        code: `PUSK-${randomUUID().slice(0, 8)}`,
        name: "Synthetic Puskesmas Facility",
        facility_type: "PUSKESMAS",
      }),
    }),
    "Synthetic Puskesmas facility creation",
  );
  const midwifeFacility = await readJson(
    await request("/staff/organization/facilities", {
      method: "POST",
      headers: { authorization: `Bearer ${login.access_token}` },
      body: JSON.stringify({
        village_id: null,
        code: `BPM-${randomUUID().slice(0, 8)}`,
        name: "Synthetic Midwife Practice",
        facility_type: "MIDWIFE_PRACTICE",
      }),
    }),
    "Synthetic midwife facility creation",
  );
  const syntheticBidanPassword = "SyntheticBidanSmoke2026";
  const syntheticBidanLogin = `bidan.smoke.${randomUUID().slice(0, 8)}`;
  const syntheticBidan = await readJson(
    await request("/staff/users", {
      method: "POST",
      headers: { authorization: `Bearer ${login.access_token}` },
      body: JSON.stringify({
        login_identifier: syntheticBidanLogin,
        display_name: "Synthetic Bidan Smoke",
        role: "BIDAN",
        password: syntheticBidanPassword,
      }),
    }),
    "Synthetic Bidan creation",
  );
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
    milestoneTimeline.milestones.some((milestone) => milestone.due_at !== null) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(milestoneTimeline.as_of_date ?? "") ||
    !Number.isInteger(milestoneTimeline.gestational_age?.total_days) ||
    milestoneTimeline.gestational_age.total_days !==
      milestoneTimeline.gestational_age.completed_weeks * 7 +
        milestoneTimeline.gestational_age.additional_days ||
    milestoneTimeline.trimester_label !== "SYNTHETIC_DEV_ONLY" ||
    milestoneTimeline.next_milestone_code !== "K1" ||
    milestoneTimeline.milestones[0]?.schedule_source !== "RULE_WINDOW" ||
    milestoneTimeline.milestones[0]?.visit_status !== "OVERDUE" ||
    milestoneTimeline.milestones[0]?.reminder_eligible !== true ||
    milestoneTimeline.milestones[7]?.schedule_source !== "UNSCHEDULED" ||
    milestoneTimeline.milestones[7]?.reminder_eligible !== false
  ) {
    throw new Error("Synthetic K1-K8 milestones were not initialized safely");
  }
  const nextMilestone = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/milestones/next`, {
      headers: { authorization },
    }),
    "Synthetic next ANC milestone",
  );
  if (
    nextMilestone.pregnancy_id !== first.pregnancy.id ||
    nextMilestone.next_milestone?.code !== "K1" ||
    nextMilestone.next_milestone?.visit_status !== "OVERDUE"
  ) {
    throw new Error("Server-derived next ANC milestone was inconsistent with the timeline");
  }

  await readJson(
    await request("/staff/assignments", {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({
        staff_user_id: syntheticBidan.id,
        scope_type: "MOTHER",
        scope_id: first.mother.id,
      }),
    }),
    "Synthetic Bidan mother assignment",
  );
  const bidanLogin = await readJson(
    await request("/staff/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_identifier: syntheticBidanLogin,
        password: syntheticBidanPassword,
      }),
    }),
    "Synthetic Bidan login",
  );
  const bidanAuthorization = `Bearer ${bidanLogin.access_token}`;

  const initialScheduleRequest = {
    idempotency_key: randomUUID(),
    due_date: "2026-05-08",
    expected_due_date: null,
  };
  const initialSchedule = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/milestones/K1/due-date`, {
      method: "PATCH",
      headers: { authorization },
      body: JSON.stringify(initialScheduleRequest),
    }),
    "Initial milestone schedule",
  );
  const initialScheduleReplay = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/milestones/K1/due-date`, {
      method: "PATCH",
      headers: { authorization },
      body: JSON.stringify(initialScheduleRequest),
    }),
    "Initial milestone schedule replay",
  );
  if (
    initialSchedule.action !== "SCHEDULED" ||
    initialSchedule.previous_due_date !== null ||
    initialSchedule.due_date !== "2026-05-08" ||
    initialSchedule.due_at !== "2026-05-07T17:00:00.000Z" ||
    initialSchedule.timezone !== "Asia/Jakarta" ||
    initialScheduleReplay.event_id !== initialSchedule.event_id
  ) {
    throw new Error("Initial milestone schedule or immutable replay was invalid");
  }

  const rescheduleRequest = {
    idempotency_key: randomUUID(),
    due_date: "2026-05-10",
    expected_due_date: "2026-05-08",
    reason: "Synthetic agreed schedule correction",
  };
  const rescheduled = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/milestones/K1/due-date`, {
      method: "PATCH",
      headers: { authorization },
      body: JSON.stringify(rescheduleRequest),
    }),
    "Milestone reschedule",
  );
  const immutableInitialReplay = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/milestones/K1/due-date`, {
      method: "PATCH",
      headers: { authorization },
      body: JSON.stringify(initialScheduleRequest),
    }),
    "Initial schedule replay after reschedule",
  );
  if (
    rescheduled.action !== "RESCHEDULED" ||
    rescheduled.previous_due_date !== "2026-05-08" ||
    rescheduled.due_date !== "2026-05-10" ||
    rescheduled.due_at !== "2026-05-09T17:00:00.000Z" ||
    immutableInitialReplay.event_id !== initialSchedule.event_id ||
    immutableInitialReplay.due_date !== "2026-05-08"
  ) {
    throw new Error("Milestone reschedule lost its transition or immutable history");
  }

  const concurrentScheduleResponses = await Promise.all(
    ["2026-05-15", "2026-05-16"].map((dueDate) =>
      request(`/pregnancies/${first.pregnancy.id}/milestones/K2/due-date`, {
        method: "PATCH",
        headers: { authorization },
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          due_date: dueDate,
          expected_due_date: null,
        }),
      }),
    ),
  );
  if (
    concurrentScheduleResponses
      .map((response) => response.status)
      .sort((left, right) => left - right)
      .join(",") !== "200,409"
  ) {
    throw new Error("Concurrent milestone scheduling did not produce one winner and one conflict");
  }
  const concurrentBodies = await Promise.all(
    concurrentScheduleResponses.map((response) => response.json()),
  );
  const concurrentConflict = concurrentBodies.find((body) => body.error !== undefined);
  if (concurrentConflict?.error?.code !== "MILESTONE_SCHEDULE_CHANGED") {
    throw new Error("Concurrent milestone scheduling returned the wrong conflict semantics");
  }

  const scheduleState = await pool.query(
    `SELECT
       milestone.code,
       milestone.due_at,
       COUNT(event.id)::int AS event_count
     FROM pregnancy_milestones AS milestone
     LEFT JOIN milestone_schedule_events AS event ON event.milestone_id = milestone.id
    WHERE milestone.pregnancy_id = $1
      AND milestone.code IN ('K1', 'K2')
    GROUP BY milestone.id, milestone.code, milestone.due_at
    ORDER BY milestone.code`,
    [first.pregnancy.id],
  );
  const k1ScheduleState = scheduleState.rows.find((row) => row.code === "K1");
  const k2ScheduleState = scheduleState.rows.find((row) => row.code === "K2");
  if (
    k1ScheduleState?.event_count !== 2 ||
    k1ScheduleState.due_at?.toISOString() !== "2026-05-09T17:00:00.000Z" ||
    k2ScheduleState?.event_count !== 1
  ) {
    throw new Error("Milestone schedule persistence violated transition or concurrency invariants");
  }
  const scheduleAudit = await pool.query(
    `SELECT action, COUNT(*)::int AS event_count
       FROM audit_events
      WHERE created_at >= $1
        AND action IN ('MILESTONE_SCHEDULED', 'MILESTONE_RESCHEDULED')
      GROUP BY action`,
    [smokeStartedAt],
  );
  const scheduleAuditCounts = Object.fromEntries(
    scheduleAudit.rows.map((event) => [event.action, event.event_count]),
  );
  if (
    scheduleAuditCounts.MILESTONE_SCHEDULED !== 2 ||
    scheduleAuditCounts.MILESTONE_RESCHEDULED !== 1
  ) {
    throw new Error("Milestone schedule audit was missing or duplicated by replay/concurrency");
  }
  try {
    await pool.query("UPDATE milestone_schedule_events SET reason = 'MUTATED' WHERE id = $1", [
      initialSchedule.event_id,
    ]);
    throw new Error("Append-only milestone schedule history accepted an update");
  } catch (error) {
    if (error?.code !== "55000") throw error;
  }

  const milestoneByCode = Object.fromEntries(
    milestoneTimeline.milestones.map((milestone) => [milestone.code, milestone]),
  );
  const k3ConfirmationRequest = {
    idempotency_key: randomUUID(),
    occurred_on: "2026-05-08",
    facility_id: midwifeFacility.id,
  };
  const k3Confirmation = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/confirm`, {
      method: "POST",
      headers: { authorization: bidanAuthorization },
      body: JSON.stringify(k3ConfirmationRequest),
    }),
    "Bidan K3 one-action confirmation",
  );
  const k3Replay = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/confirm`, {
      method: "POST",
      headers: { authorization: bidanAuthorization },
      body: JSON.stringify(k3ConfirmationRequest),
    }),
    "Bidan K3 confirmation replay",
  );
  const k3NewKeyDuplicate = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/confirm`, {
      method: "POST",
      headers: { authorization: bidanAuthorization },
      body: JSON.stringify({ ...k3ConfirmationRequest, idempotency_key: randomUUID() }),
    }),
    "Bidan K3 logical duplicate",
  );
  if (
    k3Confirmation.code !== "K3" ||
    k3Confirmation.visit_status !== "CONFIRMED" ||
    k3Confirmation.record_validation_status !== "INCOMPLETE" ||
    k3Confirmation.confirmation_source !== "STAFF_WEB" ||
    k3Confirmation.confirmed_by_staff_id !== syntheticBidan.id ||
    k3Replay.id !== k3Confirmation.id ||
    k3NewKeyDuplicate.id !== k3Confirmation.id
  ) {
    throw new Error("Bidan K3 confirmation changed detail state or duplicated history");
  }

  await expectStatus(
    await request(`/milestones/${milestoneByCode.K4.id}/confirm`, {
      method: "POST",
      headers: { authorization: bidanAuthorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        occurred_on: "2026-05-08",
        facility_id: puskesmasFacility.id,
      }),
    }),
    403,
    "Bidan K4 confirmation rejection",
  );
  const invalidK4Facility = await readErrorShape(
    await request(`/milestones/${milestoneByCode.K4.id}/confirm`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        occurred_on: "2026-05-08",
        facility_id: midwifeFacility.id,
      }),
    }),
    422,
    "Puskesmas K4 invalid-facility rejection",
  );
  if (invalidK4Facility.code !== "FACILITY_NOT_ALLOWED_FOR_MILESTONE") {
    throw new Error("K4 facility rule returned the wrong error");
  }
  const k4Confirmation = await readJson(
    await request(`/milestones/${milestoneByCode.K4.id}/confirm`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        occurred_on: "2026-05-08",
        facility_id: puskesmasFacility.id,
      }),
    }),
    "Puskesmas K4 confirmation",
  );
  const puskesmasActor = await pool.query(
    "SELECT id FROM staff_users WHERE login_identifier = $1",
    [loginIdentifier],
  );
  if (
    k4Confirmation.code !== "K4" ||
    k4Confirmation.confirmed_by_staff_id !== puskesmasActor.rows[0]?.id
  ) {
    throw new Error("Puskesmas did not inherit K4 confirmation capability");
  }

  const concurrentK6Responses = await Promise.all(
    [randomUUID(), randomUUID()].map((confirmationIdempotencyKey) =>
      request(`/milestones/${milestoneByCode.K6.id}/confirm`, {
        method: "POST",
        headers: { authorization: bidanAuthorization },
        body: JSON.stringify({
          idempotency_key: confirmationIdempotencyKey,
          occurred_on: "2026-05-08",
          facility_id: midwifeFacility.id,
        }),
      }),
    ),
  );
  if (concurrentK6Responses.some((response) => response.status !== 201)) {
    throw new Error("Concurrent identical K6 confirmation did not return two successful snapshots");
  }
  const concurrentK6Bodies = await Promise.all(
    concurrentK6Responses.map((response) => response.json()),
  );
  if (
    concurrentK6Bodies[0]?.id !== concurrentK6Bodies[1]?.id ||
    concurrentK6Bodies[0]?.code !== "K6"
  ) {
    throw new Error("Concurrent K6 confirmation created different logical confirmations");
  }

  const confirmationState = await pool.query(
    `SELECT
       milestone.code,
       milestone.visit_status,
       milestone.record_validation_status,
       COUNT(confirmation.id)::int AS confirmation_count
     FROM pregnancy_milestones AS milestone
     LEFT JOIN visit_confirmations AS confirmation
       ON confirmation.milestone_id = milestone.id
      AND confirmation.action = 'CONFIRM'
    WHERE milestone.pregnancy_id = $1
      AND milestone.code IN ('K3', 'K4', 'K6')
    GROUP BY milestone.id, milestone.code, milestone.visit_status,
             milestone.record_validation_status
    ORDER BY milestone.code`,
    [first.pregnancy.id],
  );
  if (
    confirmationState.rows.length !== 3 ||
    confirmationState.rows.some(
      (row) =>
        row.visit_status !== "CONFIRMED" ||
        row.record_validation_status !== "INCOMPLETE" ||
        row.confirmation_count !== 1,
    )
  ) {
    throw new Error("Visit confirmation persistence violated state/dedupe/detail invariants");
  }
  const confirmationAudit = await pool.query(
    `SELECT COUNT(*)::int AS event_count
       FROM audit_events
      WHERE created_at >= $1
        AND action = 'VISIT_CONFIRMED'
        AND resource_id = ANY($2::uuid[])`,
    [smokeStartedAt, [milestoneByCode.K3.id, milestoneByCode.K4.id, milestoneByCode.K6.id]],
  );
  if (confirmationAudit.rows[0]?.event_count !== 3) {
    throw new Error("Visit confirmation audit was missing or duplicated");
  }
  try {
    await pool.query("UPDATE visit_confirmations SET occurred_on = '2026-05-09' WHERE id = $1", [
      k3Confirmation.id,
    ]);
    throw new Error("Append-only visit confirmation history accepted an update");
  } catch (error) {
    if (error?.code !== "55000") throw error;
  }

  const confirmedTimeline = await readJson(
    await request(`/pregnancies/${first.pregnancy.id}/milestones`, {
      headers: { authorization },
    }),
    "Timeline after visit confirmations",
  );
  for (const code of ["K3", "K4", "K6"]) {
    const confirmedMilestone = confirmedTimeline.milestones.find(
      (milestone) => milestone.code === code,
    );
    if (
      confirmedMilestone?.visit_status !== "CONFIRMED" ||
      confirmedMilestone.reminder_eligible !== false
    ) {
      throw new Error(`Confirmed ${code} remained reminder-eligible`);
    }
  }

  await expectStatus(
    await request(`/milestones/${milestoneByCode.K3.id}/record`, {
      headers: { authorization: bidanAuthorization },
    }),
    403,
    "Bidan clinical-record read rejection",
  );
  await expectStatus(
    await request(`/milestones/${milestoneByCode.K7.id}/record`, {
      headers: { authorization },
    }),
    403,
    "K7 clinical-record boundary rejection",
  );

  const sensitiveSyntheticMarker = "SENSITIVE_SYNTHETIC_RECORD_MARKER";
  const initialRecordRequest = {
    idempotency_key: randomUUID(),
    expected_revision_id: null,
    schema_version: "synthetic.k3.v1",
    record_payload: {
      synthetic_component: { state: "RECORDED", marker: sensitiveSyntheticMarker },
    },
  };
  const initialRecord = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record`, {
      method: "PUT",
      headers: { authorization },
      body: JSON.stringify(initialRecordRequest),
    }),
    "Puskesmas K3 detail save",
  );
  const initialRecordReplay = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record`, {
      method: "PUT",
      headers: { authorization },
      body: JSON.stringify(initialRecordRequest),
    }),
    "Puskesmas K3 detail replay",
  );
  const initialRecordRead = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record`, {
      headers: { authorization },
    }),
    "Puskesmas K3 detail read",
  );
  if (
    initialRecord.code !== "K3" ||
    initialRecord.revision_no !== 1 ||
    initialRecord.record_validation_status !== "INCOMPLETE" ||
    initialRecordReplay.revision_id !== initialRecord.revision_id ||
    initialRecordRead.revision_id !== initialRecord.revision_id
  ) {
    throw new Error("K3 detail initial save/replay/read violated revision invariants");
  }

  const concurrentRecordResponses = await Promise.all(
    ["LEFT", "RIGHT"].map((value) =>
      request(`/milestones/${milestoneByCode.K3.id}/record`, {
        method: "PUT",
        headers: { authorization },
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          expected_revision_id: initialRecord.revision_id,
          schema_version: "synthetic.k3.v1",
          record_payload: { synthetic_component: { state: "RECORDED", value } },
        }),
      }),
    ),
  );
  if (
    concurrentRecordResponses
      .map((response) => response.status)
      .sort((left, right) => left - right)
      .join(",") !== "200,409"
  ) {
    throw new Error("Concurrent K3 detail writers did not produce one winner and one conflict");
  }
  const concurrentRecordBodies = await Promise.all(
    concurrentRecordResponses.map((response) => response.json()),
  );
  const revisedRecord = concurrentRecordBodies.find((body) => body.revision_no === 2);
  const revisionConflict = concurrentRecordBodies.find((body) => body.error !== undefined);
  if (
    revisedRecord?.record_validation_status !== "INCOMPLETE" ||
    revisionConflict?.error?.code !== "CLINICAL_RECORD_REVISION_CHANGED"
  ) {
    throw new Error("Concurrent K3 detail writers returned incorrect revision semantics");
  }

  const validationRequest = {
    idempotency_key: randomUUID(),
    expected_revision_id: revisedRecord.revision_id,
    attestation: "DETAIL_REVIEWED_COMPLETE",
  };
  const validatedRecord = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record/validate`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(validationRequest),
    }),
    "Puskesmas K3 detail validation",
  );
  const validatedReplay = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record/validate`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(validationRequest),
    }),
    "Puskesmas K3 detail validation replay",
  );
  const validatedLogicalDuplicate = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record/validate`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({ ...validationRequest, idempotency_key: randomUUID() }),
    }),
    "Puskesmas K3 detail validation logical duplicate",
  );
  if (
    validatedRecord.record_validation_status !== "VALIDATED" ||
    validatedRecord.validated_by_staff_id !== puskesmasActor.rows[0]?.id ||
    validatedReplay.revision_id !== revisedRecord.revision_id ||
    validatedLogicalDuplicate.revision_id !== revisedRecord.revision_id
  ) {
    throw new Error("K3 validation did not persist or deduplicate the validation state");
  }
  const editWhileValidated = await readErrorShape(
    await request(`/milestones/${milestoneByCode.K3.id}/record`, {
      method: "PUT",
      headers: { authorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        expected_revision_id: revisedRecord.revision_id,
        schema_version: "synthetic.k3.v1",
        record_payload: { synthetic_component: { state: "EDIT_WITHOUT_REOPEN" } },
      }),
    }),
    409,
    "Validated detail edit rejection",
  );
  if (editWhileValidated.code !== "CLINICAL_RECORD_REOPEN_REQUIRED") {
    throw new Error("Validated detail edit returned the wrong error");
  }

  const reopenRequest = {
    idempotency_key: randomUUID(),
    expected_revision_id: revisedRecord.revision_id,
    reason: "Synthetic detail correction required",
  };
  const reopenedRecord = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record/reopen`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify(reopenRequest),
    }),
    "Puskesmas K3 detail reopen",
  );
  const reopenedLogicalDuplicate = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record/reopen`, {
      method: "POST",
      headers: { authorization },
      body: JSON.stringify({ ...reopenRequest, idempotency_key: randomUUID() }),
    }),
    "Puskesmas K3 detail reopen logical duplicate",
  );
  if (
    reopenedRecord.record_validation_status !== "INCOMPLETE" ||
    reopenedLogicalDuplicate.revision_id !== revisedRecord.revision_id
  ) {
    throw new Error("K3 detail reopen did not persist or deduplicate correctly");
  }
  const finalRecord = await readJson(
    await request(`/milestones/${milestoneByCode.K3.id}/record`, {
      method: "PUT",
      headers: { authorization },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        expected_revision_id: revisedRecord.revision_id,
        schema_version: "synthetic.k3.v1",
        record_payload: { synthetic_component: { state: "REVISED_AFTER_REOPEN" } },
      }),
    }),
    "Puskesmas K3 detail revision after reopen",
  );
  if (finalRecord.revision_no !== 3 || finalRecord.record_validation_status !== "INCOMPLETE") {
    throw new Error("K3 detail revision after reopen returned an invalid snapshot");
  }

  const recordState = await pool.query(
    `SELECT record.status,
            milestone.record_validation_status,
            COUNT(DISTINCT revision.id)::int AS revision_count,
            COUNT(DISTINCT event.id)::int AS validation_event_count
       FROM k1_k6_records AS record
       JOIN pregnancy_milestones AS milestone ON milestone.id = record.milestone_id
       LEFT JOIN k1_k6_record_revisions AS revision ON revision.record_id = record.id
       LEFT JOIN record_validation_events AS event ON event.record_id = record.id
      WHERE record.id = $1
      GROUP BY record.id, record.status, milestone.record_validation_status`,
    [finalRecord.record_id],
  );
  if (
    recordState.rows[0]?.status !== "INCOMPLETE" ||
    recordState.rows[0]?.record_validation_status !== "INCOMPLETE" ||
    recordState.rows[0]?.revision_count !== 3 ||
    recordState.rows[0]?.validation_event_count !== 2
  ) {
    throw new Error("K3 detail persistence violated revision/validation state invariants");
  }
  const recordAudit = await pool.query(
    `SELECT action, COUNT(*)::int AS event_count
       FROM audit_events
      WHERE created_at >= $1
        AND resource_id = $2
        AND action IN ('K1_K6_RECORD_SAVED', 'RECORD_VALIDATED', 'RECORD_REOPENED')
      GROUP BY action`,
    [smokeStartedAt, finalRecord.record_id],
  );
  const recordAuditCounts = Object.fromEntries(
    recordAudit.rows.map((event) => [event.action, event.event_count]),
  );
  if (
    recordAuditCounts.K1_K6_RECORD_SAVED !== 3 ||
    recordAuditCounts.RECORD_VALIDATED !== 1 ||
    recordAuditCounts.RECORD_REOPENED !== 1
  ) {
    throw new Error("Clinical-record audit was missing or duplicated by replay/concurrency");
  }
  const sensitiveAuditLeak = await pool.query(
    `SELECT COUNT(*)::int AS leak_count
       FROM audit_events
      WHERE metadata::text LIKE $1`,
    [`%${sensitiveSyntheticMarker}%`],
  );
  if (sensitiveAuditLeak.rows[0]?.leak_count !== 0) {
    throw new Error("Sensitive clinical record payload leaked into generic audit metadata");
  }
  for (const [table, id] of [
    ["k1_k6_record_revisions", finalRecord.revision_id],
    ["record_validation_events", null],
  ]) {
    try {
      if (id === null) {
        await pool.query(
          "UPDATE record_validation_events SET reason = 'MUTATED' WHERE record_id = $1",
          [finalRecord.record_id],
        );
      } else {
        await pool.query(`UPDATE ${table} SET schema_version = 'mutated' WHERE id = $1`, [id]);
      }
      throw new Error(`Append-only ${table} accepted an update`);
    } catch (error) {
      if (error?.code !== "55000") throw error;
    }
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

  const pendingReminderCycleId = randomUUID();
  const waReminderCycleId = randomUUID();
  const completedReminderCycleId = randomUUID();
  const waActionId = randomUUID();
  await pool.query(
    `INSERT INTO reminder_cycles (
       id, milestone_id, cycle_anchor_at, status, idempotency_key, closed_at
     ) VALUES
       ($1, $4, '2026-08-01T00:00:00.000Z', 'PENDING', $5, NULL),
       ($2, $4, '2026-08-04T00:00:00.000Z', 'WA_ACTION_REQUIRED', $6, NULL),
       ($3, $4, '2026-08-07T00:00:00.000Z', 'PUSH_SUCCEEDED', $7, '2026-08-07T01:00:00.000Z')`,
    [
      pendingReminderCycleId,
      waReminderCycleId,
      completedReminderCycleId,
      milestoneByCode.K5.id,
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ],
  );
  await pool.query(
    `INSERT INTO wa_fallback_actions (id, reminder_cycle_id, mother_id, status)
     VALUES ($1, $2, $3, 'READY')`,
    [waActionId, waReminderCycleId, first.mother.id],
  );
  const preCloseMilestoneState = await pool.query(
    `SELECT id, visit_status
       FROM pregnancy_milestones
      WHERE pregnancy_id = $1`,
    [first.pregnancy.id],
  );
  const preCloseStatusByMilestoneId = Object.fromEntries(
    preCloseMilestoneState.rows.map((milestone) => [milestone.id, milestone.visit_status]),
  );
  const unfinishedMilestoneIds = preCloseMilestoneState.rows
    .filter((milestone) => ["UPCOMING", "DUE", "OVERDUE"].includes(milestone.visit_status))
    .map((milestone) => milestone.id);

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
  const closeCancellationState = await pool.query(
    `SELECT id, visit_status
       FROM pregnancy_milestones
      WHERE pregnancy_id = $1`,
    [first.pregnancy.id],
  );
  for (const milestone of closeCancellationState.rows) {
    const previousStatus = preCloseStatusByMilestoneId[milestone.id];
    const expectedStatus = ["UPCOMING", "DUE", "OVERDUE"].includes(previousStatus)
      ? "CANCELLED"
      : previousStatus;
    if (milestone.visit_status !== expectedStatus) {
      throw new Error(
        `Pregnancy close changed milestone ${milestone.id} from ${previousStatus} to ${milestone.visit_status}; expected ${expectedStatus}`,
      );
    }
  }
  const reminderCancellationState = await pool.query(
    `SELECT cycle.id, cycle.status, action.status AS wa_status
       FROM reminder_cycles AS cycle
       LEFT JOIN wa_fallback_actions AS action ON action.reminder_cycle_id = cycle.id
      WHERE cycle.id = ANY($1::uuid[])
      ORDER BY cycle.id`,
    [[pendingReminderCycleId, waReminderCycleId, completedReminderCycleId]],
  );
  const reminderStatusById = Object.fromEntries(
    reminderCancellationState.rows.map((cycle) => [
      cycle.id,
      { status: cycle.status, waStatus: cycle.wa_status },
    ]),
  );
  if (
    reminderStatusById[pendingReminderCycleId]?.status !== "CANCELLED" ||
    reminderStatusById[waReminderCycleId]?.status !== "CANCELLED" ||
    reminderStatusById[waReminderCycleId]?.waStatus !== "EXPIRED" ||
    reminderStatusById[completedReminderCycleId]?.status !== "PUSH_SUCCEEDED"
  ) {
    throw new Error("Pregnancy close reminder cancellation did not preserve terminal state");
  }
  const cancellationHistory = await pool.query(
    `SELECT target, COUNT(*)::int AS event_count
       FROM pregnancy_close_cancellation_events
      WHERE pregnancy_id = $1
      GROUP BY target`,
    [first.pregnancy.id],
  );
  const cancellationHistoryCounts = Object.fromEntries(
    cancellationHistory.rows.map((event) => [event.target, event.event_count]),
  );
  if (
    cancellationHistoryCounts.MILESTONE !== unfinishedMilestoneIds.length ||
    cancellationHistoryCounts.REMINDER_CYCLE !== 2
  ) {
    throw new Error("Pregnancy close cancellation history is incomplete or duplicated by replay");
  }
  try {
    await pool.query(
      `INSERT INTO reminder_cycles (
         id, milestone_id, cycle_anchor_at, status, idempotency_key
       ) VALUES ($1, $2, '2026-08-10T00:00:00.000Z', 'PENDING', $3)`,
      [randomUUID(), milestoneByCode.K5.id, randomUUID()],
    );
    throw new Error("Closed pregnancy accepted a new active reminder cycle");
  } catch (error) {
    if (error?.code !== "23514") throw error;
  }
  const closeAudit = await pool.query(
    `SELECT metadata
       FROM audit_events
      WHERE action = 'PREGNANCY_CLOSED'
        AND resource_id = $1
        AND created_at >= $2`,
    [first.pregnancy.id, smokeStartedAt],
  );
  if (
    closeAudit.rowCount !== 1 ||
    closeAudit.rows[0]?.metadata?.milestones_cancelled !== unfinishedMilestoneIds.length ||
    closeAudit.rows[0]?.metadata?.reminder_cycles_cancelled !== 2 ||
    closeAudit.rows[0]?.metadata?.wa_actions_expired !== 1
  ) {
    throw new Error("Pregnancy close audit cancellation summary is missing or duplicated");
  }
  try {
    await pool.query(
      `UPDATE pregnancy_close_cancellation_events
          SET previous_status = 'MUTATED'
        WHERE pregnancy_id = $1`,
      [first.pregnancy.id],
    );
    throw new Error("Pregnancy close cancellation history accepted an update");
  } catch (error) {
    if (error?.code !== "55000") throw error;
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
    "Registry smoke passed: protected registration, pregnancy lifecycle, concurrent K1-K8 scheduling/confirmation, versioned K1-K6 validation, hashed credential rotation, private mother sessions, and durable throttling.\n",
  );
} finally {
  process.env.SMOKE_STAFF_PASSWORD = "";
  await app.close();
  await pool.end();
}
