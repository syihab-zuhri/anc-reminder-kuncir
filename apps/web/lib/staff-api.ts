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

export function staffApiLogin(
  input: StaffLoginRequest,
): Promise<StaffApiResult<StaffTokenResponse>> {
  return staffApiRequest("/staff/auth/login", staffTokenResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function staffApiRefresh(refreshToken: string): Promise<StaffApiResult<StaffTokenResponse>> {
  return staffApiRequest("/staff/auth/refresh", staffTokenResponseSchema, {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function staffApiMe(accessToken: string): Promise<StaffApiResult<StaffMeResponse>> {
  return staffApiRequest("/staff/me", staffMeResponseSchema, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function staffApiLogout(accessToken: string): Promise<void> {
  try {
    await fetch(apiUrl("/staff/auth/logout"), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Logout is best-effort: the BFF always clears its own cookies.
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
