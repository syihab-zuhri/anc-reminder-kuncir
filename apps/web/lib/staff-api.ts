import { createHash } from "node:crypto";

import {
  canonicalErrorEnvelopeSchema,
  createCanonicalError,
  staffMeResponseSchema,
  staffTokenResponseSchema,
  type CanonicalErrorEnvelope,
  type StaffLoginRequest,
  type StaffMeResponse,
  type StaffTokenResponse,
} from "@anc/contracts";

const REQUEST_TIMEOUT_MS = 8_000;

export type StaffApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly error: CanonicalErrorEnvelope };

/**
 * `clientIp` is the browser's address as seen by this BFF, forwarded so the API can throttle failed
 * logins per source address instead of seeing every attempt as coming from the BFF itself.
 */
export function staffApiLogin(
  input: StaffLoginRequest,
  clientIp?: string,
): Promise<StaffApiResult<StaffTokenResponse>> {
  return staffApiRequest("/staff/auth/login", staffTokenResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
    ...(clientIp === undefined ? {} : { headers: { "x-forwarded-for": clientIp } }),
  });
}

export function staffApiRefresh(refreshToken: string): Promise<StaffApiResult<StaffTokenResponse>> {
  return staffApiRequest("/staff/auth/refresh", staffTokenResponseSchema, {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

const REFRESH_REUSE_WINDOW_MS = 10_000;
const refreshes = new Map<
  string,
  { readonly result: Promise<StaffApiResult<StaffTokenResponse>>; readonly expiresAt: number }
>();

/**
 * Rotates a refresh token once, however many requests carry it. A workspace panel fires several
 * requests together; after the access token expires each of them arrives with the same refresh
 * cookie, and the API accepts a refresh token only once. Requests that arrive while the rotation
 * runs, or within a few seconds after it (before the browser has stored the new cookies), share
 * its result instead of failing with "Sesi petugas belum aktif".
 */
export function refreshStaffSession(
  refreshToken: string,
): Promise<StaffApiResult<StaffTokenResponse>> {
  const now = Date.now();
  for (const [key, entry] of refreshes) if (entry.expiresAt <= now) refreshes.delete(key);

  const key = createHash("sha256").update(refreshToken).digest("hex");
  const existing = refreshes.get(key);
  if (existing !== undefined) return existing.result;

  const result = staffApiRefresh(refreshToken);
  refreshes.set(key, { result, expiresAt: now + REFRESH_REUSE_WINDOW_MS });
  // A failed rotation must not be replayed; the next request may try again.
  void result.then((outcome) => {
    if (!outcome.ok) refreshes.delete(key);
  });
  return result;
}

/** Test hook: forget shared rotations between test cases. */
export function resetStaffRefreshCache(): void {
  refreshes.clear();
}

export function staffApiMe(accessToken: string): Promise<StaffApiResult<StaffMeResponse>> {
  return staffApiRequest("/staff/me", staffMeResponseSchema, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

/** True when the API revoked the session; false when the access token was already invalid. */
export async function staffApiLogout(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(apiUrl("/staff/auth/logout"), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    // Logout is best-effort: the BFF always clears its own cookies.
    return false;
  }
}

async function staffApiRequest<T>(
  path: string,
  schema: {
    readonly safeParse: (input: unknown) => { success: true; data: T } | { success: false };
  },
  init: RequestInit,
): Promise<StaffApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return failure(503, "SERVICE_UNAVAILABLE", "Layanan petugas belum dapat dihubungi.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = canonicalErrorEnvelopeSchema.safeParse(body);
    return error.success
      ? { ok: false, status: response.status, error: error.data }
      : failure(
          response.status,
          "UPSTREAM_ERROR",
          "Layanan petugas mengembalikan respons yang tidak valid.",
        );
  }

  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : failure(502, "UPSTREAM_CONTRACT_ERROR", "Kontrak layanan petugas tidak valid.");
}

function apiUrl(path: string): string {
  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl === undefined) throw new Error("API_BASE_URL is required for staff session routes");
  return `${baseUrl.replace(/\/$/u, "")}${path}`;
}

function failure<T>(status: number, code: string, message: string): StaffApiResult<T> {
  return {
    ok: false,
    status,
    error: createCanonicalError({ code, message, requestId: crypto.randomUUID() }),
  };
}
