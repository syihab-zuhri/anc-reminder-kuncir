import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bootstrapApi } from "../apps/api/dist/main.js";

const loginIdentifier = process.env.SMOKE_STAFF_LOGIN_IDENTIFIER;
const password = process.env.SMOKE_STAFF_PASSWORD;
if (loginIdentifier === undefined || password === undefined) {
  throw new Error("SMOKE_STAFF_LOGIN_IDENTIFIER and SMOKE_STAFF_PASSWORD are required");
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDirectory = resolve(repositoryRoot, "apps/web");
const nextCli = resolve(repositoryRoot, "node_modules/next/dist/bin/next");
const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const app = await bootstrapApi();
const web = spawn(
  process.execPath,
  [nextCli, "start", "--hostname", "127.0.0.1", "--port", "3000"],
  {
    cwd: webDirectory,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let webOutput = "";
for (const stream of [web.stdout, web.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    webOutput = `${webOutput}${chunk}`.slice(-4_000);
  });
}

const cookies = new Map();

try {
  await waitForWeb();

  const loginResponse = await fetch(`${appBaseUrl}/api/staff-session/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appBaseUrl },
    body: JSON.stringify({ login_identifier: loginIdentifier, password }),
  });
  const identity = await readJson(loginResponse, "Web login");
  updateCookies(loginResponse);
  const serializedIdentity = JSON.stringify(identity);
  if (serializedIdentity.includes("access_token") || serializedIdentity.includes("refresh_token")) {
    throw new Error("Web login exposed a credential in its response body");
  }
  assertSessionCookies();

  const invalidAccessToken = `anc_at_${randomBytes(32).toString("base64url")}`;
  cookies.set("anc_staff_access", invalidAccessToken);
  const meResponse = await fetch(`${appBaseUrl}/api/staff-session/me`, {
    headers: { cookie: cookieHeader() },
  });
  await readJson(meResponse, "Web session refresh");
  updateCookies(meResponse);
  if (cookies.get("anc_staff_access") === invalidAccessToken) {
    throw new Error("Web session did not rotate an invalid access token");
  }
  assertSessionCookies();

  const logoutResponse = await fetch(`${appBaseUrl}/api/staff-session/logout`, {
    method: "POST",
    headers: { cookie: cookieHeader(), origin: appBaseUrl },
  });
  if (logoutResponse.status !== 204) {
    throw new Error(`Web logout failed with status ${logoutResponse.status}`);
  }
  updateCookies(logoutResponse);
  if (cookies.size !== 0) throw new Error("Web logout did not clear browser cookies");

  const expiredResponse = await fetch(`${appBaseUrl}/api/staff-session/me`);
  if (expiredResponse.status !== 401) {
    throw new Error(`Anonymous Web session was not rejected: ${expiredResponse.status}`);
  }

  process.stdout.write(
    "Web staff smoke passed: safe login body, HttpOnly cookies, refresh rotation, and logout.\n",
  );
} finally {
  process.env.SMOKE_STAFF_PASSWORD = "";
  web.kill("SIGTERM");
  await app.close();
}

async function waitForWeb() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (web.exitCode !== null) {
      throw new Error(`Web server exited before readiness.\n${webOutput}`);
    }
    try {
      const response = await fetch(`${appBaseUrl}/staff/login`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Web server did not become ready.\n${webOutput}`);
}

async function readJson(response, operation) {
  if (!response.ok) throw new Error(`${operation} failed with status ${response.status}`);
  return response.json();
}

function updateCookies(response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";", 1);
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value === "" || /max-age=0/iu.test(header)) cookies.delete(name);
    else cookies.set(name, value);
  }
}

function assertSessionCookies() {
  if (!cookies.has("anc_staff_access") || !cookies.has("anc_staff_refresh")) {
    throw new Error("Web session cookies are incomplete");
  }
}

function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}
