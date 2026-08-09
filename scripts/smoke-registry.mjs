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

async function ensureSyntheticActivePlan() {
  const existing = await pool.query(
    "SELECT id FROM anc_plan_versions WHERE status = 'ACTIVE' LIMIT 1",
  );
  if (existing.rows[0] !== undefined) return;

  const nextVersion = await pool.query(
    "SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM anc_plan_versions",
  );
  const versionNo = Number(nextVersion.rows[0]?.version_no);
  if (!Number.isSafeInteger(versionNo) || versionNo < 1) {
    throw new Error("Could not allocate a synthetic ANC plan version number");
  }
  await pool.query(
    `INSERT INTO anc_plan_versions (id, version_no, status)
     VALUES ($1, $2, 'ACTIVE')`,
    [randomUUID(), versionNo],
  );
}

try {
  await ensureSyntheticActivePlan();
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

  process.stdout.write(
    "Registry smoke passed: encrypted NIK, normalized contact, atomic state, and idempotency replay.\n",
  );
} finally {
  process.env.SMOKE_STAFF_PASSWORD = "";
  await app.close();
  await pool.end();
}
