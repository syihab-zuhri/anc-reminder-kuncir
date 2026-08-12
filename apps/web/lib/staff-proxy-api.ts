import { NextRequest, NextResponse } from "next/server";

import { staffApiRefresh } from "./staff-api";
import { STAFF_ACCESS_COOKIE, STAFF_REFRESH_COOKIE } from "./staff-session-policy";
import { rejectUntrustedMutation, setStaffSessionCookies } from "./staff-session-response";

const REQUEST_TIMEOUT_MS = 10_000;

export async function handleStaffProxyRequest(
  request: NextRequest,
  apiPath: string,
): Promise<NextResponse> {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
    const rejected = rejectUntrustedMutation(request);
    if (rejected !== undefined) return rejected;
  }

  let accessToken = request.cookies.get(STAFF_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(STAFF_REFRESH_COOKIE)?.value;

  if (accessToken === undefined && refreshToken !== undefined) {
    const refresh = await staffApiRefresh(refreshToken);
    if (refresh.ok) {
      accessToken = refresh.value.access_token;
      const proxyRes = await executeProxyCall(request, apiPath, accessToken);
      setStaffSessionCookies(proxyRes, refresh.value);
      return proxyRes;
    }
  }

  if (accessToken === undefined) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sesi petugas belum aktif." } },
      { status: 401 },
    );
  }

  let proxyRes = await executeProxyCall(request, apiPath, accessToken);

  if (proxyRes.status === 401 && refreshToken !== undefined) {
    const refresh = await staffApiRefresh(refreshToken);
    if (refresh.ok) {
      accessToken = refresh.value.access_token;
      proxyRes = await executeProxyCall(request, apiPath, accessToken);
      setStaffSessionCookies(proxyRes, refresh.value);
    }
  }

  return proxyRes;
}

async function executeProxyCall(
  request: NextRequest,
  apiPath: string,
  accessToken: string,
): Promise<NextResponse> {
  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl === undefined) {
    return NextResponse.json(
      { error: { code: "CONFIG_ERROR", message: "API_BASE_URL belum dikonfigurasi." } },
      { status: 500 },
    );
  }

  const targetUrl = `${baseUrl.replace(/\/$/u, "")}${apiPath}${request.nextUrl.search}`;
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase());
  let requestBody: string | undefined;

  if (isMutating) {
    requestBody = await request.text().catch(() => "");
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const responseBody = await upstreamRes.text().catch(() => "");
    const headers = new Headers();
    const contentType = upstreamRes.headers.get("content-type");
    if (contentType !== null) headers.set("content-type", contentType);

    return new NextResponse(responseBody, {
      status: upstreamRes.status,
      headers,
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Layanan server API belum dapat dihubungi.",
        },
      },
      { status: 503 },
    );
  }
}
