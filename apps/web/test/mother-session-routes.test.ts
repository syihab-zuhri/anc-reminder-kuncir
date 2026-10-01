import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "../app/api/mother-session/login/route";
import { MOTHER_SESSION_COOKIE } from "../lib/mother-session-policy";

const sessionToken = `anc_mt_${"a".repeat(43)}`;
const identity = {
  id: "50000000-0000-4000-8000-000000000001",
  display_name: "Siti Aminah",
  active_pregnancy_id: "60000000-0000-4000-8000-000000000001",
  session_id: "70000000-0000-4000-8000-000000000001",
  session_expires_at: "2026-09-10T09:00:00.000Z",
} as const;

function loginRequest(extraHeaders: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/mother-session/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...extraHeaders,
    },
    body: JSON.stringify({ full_name: "Siti Aminah", access_code: "ANC-2345-6789-ABCD-EFGH" }),
  });
}

function stubApi() {
  const apiFetch = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        token_type: "Bearer",
        access_token: sessionToken,
        expires_at: "2026-09-10T09:00:00.000Z",
      }),
    )
    .mockResolvedValueOnce(Response.json(identity));
  vi.stubGlobal("fetch", apiFetch);
  return apiFetch;
}

describe("mother session BFF login", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "http://api.example/api/v1");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the browser address to the API so failed attempts are throttled per source", async () => {
    const apiFetch = stubApi();

    const response = await login(loginRequest({ "cf-connecting-ip": "203.0.113.9" }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(MOTHER_SESSION_COOKIE)?.value).toBe(sessionToken);
    const [url, init] = apiFetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api.example/api/v1/mother-access/validate");
    expect(new Headers(init?.headers).get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("does not forward a spoofed left-most X-Forwarded-For entry", async () => {
    const apiFetch = stubApi();

    await login(loginRequest({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 127.0.0.1" }));

    const [, init] = apiFetch.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("sends no forwarding header when the browser address is unknown", async () => {
    const apiFetch = stubApi();

    await login(loginRequest());

    const [, init] = apiFetch.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).has("x-forwarded-for")).toBe(false);
  });
});
