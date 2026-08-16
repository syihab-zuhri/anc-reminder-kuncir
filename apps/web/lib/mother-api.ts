import {
  canonicalErrorEnvelopeSchema,
  createCanonicalError,
  motherMeResponseSchema,
  motherSessionResponseSchema,
  type CanonicalErrorEnvelope,
  type MotherAccessValidateRequest,
  type MotherMeResponse,
  type MotherSessionResponse,
} from "@anc/contracts";

const REQUEST_TIMEOUT_MS = 8_000;

export type MotherApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly error: CanonicalErrorEnvelope };

export function motherApiValidate(
  input: MotherAccessValidateRequest,
): Promise<MotherApiResult<MotherSessionResponse>> {
  return motherApiRequest("/mother-access/validate", motherSessionResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function motherApiMe(sessionToken: string): Promise<MotherApiResult<MotherMeResponse>> {
  return motherApiRequest("/mother/me", motherMeResponseSchema, {
    headers: { authorization: `Bearer ${sessionToken}` },
  });
}

export async function motherApiLogout(sessionToken: string): Promise<void> {
  try {
    await fetch(apiUrl("/mother-access/logout"), {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Logout is best-effort: the BFF always clears its own cookies.
  }
}

async function motherApiRequest<T>(
  path: string,
  schema: {
    readonly safeParse: (input: unknown) => { success: true; data: T } | { success: false };
  },
  init: RequestInit,
): Promise<MotherApiResult<T>> {
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
    return failure(503, "SERVICE_UNAVAILABLE", "Layanan ibu hamil belum dapat dihubungi.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = canonicalErrorEnvelopeSchema.safeParse(body);
    return error.success
      ? { ok: false, status: response.status, error: error.data }
      : failure(
          response.status,
          "UPSTREAM_ERROR",
          "Layanan ibu hamil mengembalikan respons yang tidak valid.",
        );
  }

  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : failure(502, "UPSTREAM_CONTRACT_ERROR", "Kontrak layanan ibu hamil tidak valid.");
}

function apiUrl(path: string): string {
  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl === undefined) throw new Error("API_BASE_URL is required for mother session routes");
  return `${baseUrl.replace(/\/$/u, "")}${path}`;
}

function failure<T>(status: number, code: string, message: string): MotherApiResult<T> {
  return {
    ok: false,
    status,
    error: createCanonicalError({ code, message, requestId: crypto.randomUUID() }),
  };
}
