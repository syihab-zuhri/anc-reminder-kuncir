import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "../app/api/staff-session/login/route";
import { POST as logout } from "../app/api/staff-session/logout/route";
import { GET as me } from "../app/api/staff-session/me/route";
import { STAFF_ACCESS_COOKIE, STAFF_REFRESH_COOKIE } from "../lib/staff-session-policy";

const accessToken = `anc_at_${"a".repeat(43)}`;
const refreshToken = `anc_rt_${"b".repeat(43)}`;
const rotatedAccessToken = `anc_at_${"c".repeat(43)}`;
const rotatedRefreshToken = `anc_rt_${"d".repeat(43)}`;
const identity = {
  id: "20000000-0000-4000-8000-000000000001",
  health_center_id: "10000000-0000-4000-8000-000000000001",
  display_name: "Puskesmas Kuncir",
  role: "PUSKESMAS",
  status: "ACTIVE",
  session_id: "30000000-0000-4000-8000-000000000001",
} as const;

describe("staff session BFF routes", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "http://api.example/api/v1");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("logs in without exposing credentials and sets two HttpOnly cookies", async () => {
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(tokens(accessToken, refreshToken)))
      .mockResolvedValueOnce(jsonResponse(identity));
    vi.stubGlobal("fetch", apiFetch);

    const response = await login(
      new Request("http://localhost:3000/api/staff-session/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ login_identifier: "puskesmas.kuncir", password: "Rahasia2026A" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(identity);
    expect(response.cookies.get(STAFF_ACCESS_COOKIE)?.value).toBe(accessToken);
    expect(response.cookies.get(STAFF_REFRESH_COOKIE)?.value).toBe(refreshToken);
    const setCookie = response.headers.getSetCookie().join(";");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");
    expect(setCookie).not.toContain("Rahasia2026A");
  });

  it("rejects cross-origin login before contacting the API", async () => {
    const apiFetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", apiFetch);

    const response = await login(
      new Request("http://localhost:3000/api/staff-session/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example" },
        body: JSON.stringify({ login_identifier: "puskesmas.kuncir", password: "Rahasia2026A" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("rotates an expired access session through the refresh cookie", async () => {
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, "SESSION_INVALID"))
      .mockResolvedValueOnce(jsonResponse(tokens(rotatedAccessToken, rotatedRefreshToken)))
      .mockResolvedValueOnce(jsonResponse(identity));
    vi.stubGlobal("fetch", apiFetch);

    const response = await me(
      new NextRequest("http://localhost:3000/api/staff-session/me", {
        headers: {
          cookie: `${STAFF_ACCESS_COOKIE}=${accessToken}; ${STAFF_REFRESH_COOKIE}=${refreshToken}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(STAFF_ACCESS_COOKIE)?.value).toBe(rotatedAccessToken);
    expect(response.cookies.get(STAFF_REFRESH_COOKIE)?.value).toBe(rotatedRefreshToken);
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it("keeps the current cookies when the refresh service is temporarily unavailable", async () => {
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, "SESSION_INVALID"))
      .mockResolvedValueOnce(errorResponse(503, "SERVICE_UNAVAILABLE"));
    vi.stubGlobal("fetch", apiFetch);

    const response = await me(
      new NextRequest("http://localhost:3000/api/staff-session/me", {
        headers: {
          cookie: `${STAFF_ACCESS_COOKIE}=${accessToken}; ${STAFF_REFRESH_COOKIE}=${refreshToken}`,
        },
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("returns rotated cookies if identity lookup fails after a successful refresh", async () => {
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, "SESSION_INVALID"))
      .mockResolvedValueOnce(jsonResponse(tokens(rotatedAccessToken, rotatedRefreshToken)))
      .mockResolvedValueOnce(errorResponse(503, "SERVICE_UNAVAILABLE"));
    vi.stubGlobal("fetch", apiFetch);

    const response = await me(
      new NextRequest("http://localhost:3000/api/staff-session/me", {
        headers: {
          cookie: `${STAFF_ACCESS_COOKIE}=${accessToken}; ${STAFF_REFRESH_COOKIE}=${refreshToken}`,
        },
      }),
    );

    expect(response.status).toBe(503);
    expect(response.cookies.get(STAFF_ACCESS_COOKIE)?.value).toBe(rotatedAccessToken);
    expect(response.cookies.get(STAFF_REFRESH_COOKIE)?.value).toBe(rotatedRefreshToken);
  });

  it("always clears local cookies on a trusted logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    const response = await logout(
      new NextRequest("http://localhost:3000/api/staff-session/logout", {
        method: "POST",
        headers: {
          cookie: `${STAFF_ACCESS_COOKIE}=${accessToken}; ${STAFF_REFRESH_COOKIE}=${refreshToken}`,
          origin: "http://localhost:3000",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.cookies.get(STAFF_ACCESS_COOKIE)?.value).toBe("");
    expect(response.cookies.get(STAFF_REFRESH_COOKIE)?.value).toBe("");
  });
});

function tokens(access: string, refresh: string) {
  return {
    token_type: "Bearer",
    access_token: access,
    access_expires_at: "2030-08-08T08:15:00.000Z",
    refresh_token: refresh,
    refresh_expires_at: "2030-08-15T08:00:00.000Z",
  } as const;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function errorResponse(status: number, code: string): Response {
  return jsonResponse(
    {
      error: {
        code,
        message: "Sesi tidak valid.",
        request_id: "40000000-0000-4000-8000-000000000001",
        details: null,
      },
    },
    status,
  );
}
