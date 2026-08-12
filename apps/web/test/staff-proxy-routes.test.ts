import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../app/api/staff-proxy/[...path]/route";
import { STAFF_ACCESS_COOKIE } from "../lib/staff-session-policy";

const accessToken = `anc_at_${"a".repeat(43)}`;

describe("staff proxy BFF routes", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "http://api.example/api/v1");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("proxies GET request with Authorization header from cookie", async () => {
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "ok" }, { status: 200 }));
    vi.stubGlobal("fetch", apiFetch);

    const req = new NextRequest(
      "http://localhost:3000/api/staff-proxy/organization/health-centers",
      {
        headers: { cookie: `${STAFF_ACCESS_COOKIE}=${accessToken}` },
      },
    );

    const response = await GET(req, {
      params: Promise.resolve({ path: ["organization", "health-centers"] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(apiFetch).toHaveBeenCalledWith(
      "http://api.example/api/v1/organization/health-centers",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
        }),
      }),
    );
  });

  it("proxies POST request with CSRF protection and payload", async () => {
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ mother_id: "m-123" }, { status: 201 }));
    vi.stubGlobal("fetch", apiFetch);

    const payload = { full_name: "Siti Aminah" };
    const req = new NextRequest("http://localhost:3000/api/staff-proxy/mothers/register", {
      method: "POST",
      headers: {
        cookie: `${STAFF_ACCESS_COOKIE}=${accessToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(req, {
      params: Promise.resolve({ path: ["mothers", "register"] }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ mother_id: "m-123" });
  });

  it("rejects cross-origin mutating proxy request before reaching API", async () => {
    const apiFetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", apiFetch);

    const req = new NextRequest("http://localhost:3000/api/staff-proxy/mothers/register", {
      method: "POST",
      headers: {
        cookie: `${STAFF_ACCESS_COOKIE}=${accessToken}`,
        origin: "https://evil.example",
      },
    });

    const response = await POST(req, {
      params: Promise.resolve({ path: ["mothers", "register"] }),
    });
    expect(response.status).toBe(403);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
