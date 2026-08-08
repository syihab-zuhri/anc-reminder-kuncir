import { randomUUID } from "node:crypto";
import { bootstrapApi } from "../apps/api/dist/main.js";

const loginIdentifier = process.env.SMOKE_STAFF_LOGIN_IDENTIFIER;
const password = process.env.SMOKE_STAFF_PASSWORD;
if (loginIdentifier === undefined || password === undefined) {
  throw new Error("SMOKE_STAFF_LOGIN_IDENTIFIER and SMOKE_STAFF_PASSWORD are required");
}

const host = process.env.API_HOST ?? "127.0.0.1";
const port = process.env.API_PORT ?? "3001";
const baseUrl = `http://${host}:${port}/api/v1`;
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
    throw new Error(`${operation} failed with status ${response.status}`);
  }
  return response.json();
}

try {
  const loginResponse = await request("/staff/auth/login", {
    method: "POST",
    body: JSON.stringify({ login_identifier: loginIdentifier, password }),
  });
  const login = await readJson(loginResponse, "Login");

  const meResponse = await request("/staff/me", {
    headers: { authorization: `Bearer ${login.access_token}` },
  });
  await readJson(meResponse, "Session identity lookup");

  const refreshResponse = await request("/staff/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: login.refresh_token }),
  });
  const refreshed = await readJson(refreshResponse, "Refresh rotation");

  const oldAccessResponse = await request("/staff/me", {
    headers: { authorization: `Bearer ${login.access_token}` },
  });
  if (oldAccessResponse.status !== 401) {
    throw new Error(`Rotated access token remained usable: ${oldAccessResponse.status}`);
  }

  const suffix = randomUUID().slice(0, 8);
  const puskesmasAuthorization = `Bearer ${refreshed.access_token}`;
  const villageResponse = await request("/staff/organization/villages", {
    method: "POST",
    headers: { authorization: puskesmasAuthorization },
    body: JSON.stringify({ code: `SMOKE-${suffix}`, name: "Synthetic Smoke Village" }),
  });
  const village = await readJson(villageResponse, "Village creation");

  const facilityResponse = await request("/staff/organization/facilities", {
    method: "POST",
    headers: { authorization: puskesmasAuthorization },
    body: JSON.stringify({
      village_id: village.id,
      code: `SMOKE-${suffix}`,
      name: "Synthetic Smoke Posyandu",
      facility_type: "POSYANDU",
    }),
  });
  await readJson(facilityResponse, "Facility creation");

  const bidanLoginIdentifier = `smoke.bidan.${suffix}`;
  const staffResponse = await request("/staff/users", {
    method: "POST",
    headers: { authorization: puskesmasAuthorization },
    body: JSON.stringify({
      login_identifier: bidanLoginIdentifier,
      display_name: "Synthetic Smoke Bidan",
      role: "BIDAN",
      password,
    }),
  });
  const staff = await readJson(staffResponse, "Bidan creation");

  const assignmentResponse = await request("/staff/assignments", {
    method: "POST",
    headers: { authorization: puskesmasAuthorization },
    body: JSON.stringify({
      staff_user_id: staff.id,
      scope_type: "AREA",
      scope_id: village.id,
    }),
  });
  const assignment = await readJson(assignmentResponse, "Assignment creation");

  const bidanLoginResponse = await request("/staff/auth/login", {
    method: "POST",
    body: JSON.stringify({ login_identifier: bidanLoginIdentifier, password }),
  });
  const bidanLogin = await readJson(bidanLoginResponse, "Bidan login");
  const deniedOrganizationResponse = await request("/staff/organization/villages", {
    headers: { authorization: `Bearer ${bidanLogin.access_token}` },
  });
  if (deniedOrganizationResponse.status !== 403) {
    throw new Error(
      `Bidan organization access was not denied: ${deniedOrganizationResponse.status}`,
    );
  }

  const disableResponse = await request(`/staff/users/${staff.id}/status`, {
    method: "PATCH",
    headers: { authorization: puskesmasAuthorization },
    body: JSON.stringify({ status: "DISABLED", reason: "SECURITY_SMOKE_CHECK" }),
  });
  if (disableResponse.status !== 204) {
    throw new Error(`Bidan disable failed with status ${disableResponse.status}`);
  }

  const disabledSessionResponse = await request("/staff/me", {
    headers: { authorization: `Bearer ${bidanLogin.access_token}` },
  });
  if (disabledSessionResponse.status !== 401) {
    throw new Error(`Disabled staff session remained usable: ${disabledSessionResponse.status}`);
  }

  const revokeAssignmentResponse = await request(`/staff/assignments/${assignment.id}`, {
    method: "DELETE",
    headers: { authorization: puskesmasAuthorization },
    body: JSON.stringify({ reason: "SECURITY_SMOKE_CHECK" }),
  });
  if (revokeAssignmentResponse.status !== 204) {
    throw new Error(`Assignment revocation failed: ${revokeAssignmentResponse.status}`);
  }

  const logoutResponse = await request("/staff/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${refreshed.access_token}` },
  });
  if (logoutResponse.status !== 204) {
    throw new Error(`Logout failed with status ${logoutResponse.status}`);
  }

  const revokedAccessResponse = await request("/staff/me", {
    headers: { authorization: `Bearer ${refreshed.access_token}` },
  });
  if (revokedAccessResponse.status !== 401) {
    throw new Error(`Logged-out access token remained usable: ${revokedAccessResponse.status}`);
  }

  process.stdout.write(
    "Phase 1 smoke passed: auth lifecycle, scoped organization, assignment, and disable revocation.\n",
  );
} finally {
  process.env.SMOKE_STAFF_PASSWORD = "";
  await app.close();
}
