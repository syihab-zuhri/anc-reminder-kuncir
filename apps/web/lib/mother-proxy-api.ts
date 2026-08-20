import { NextRequest, NextResponse } from "next/server";

import { MOTHER_SESSION_COOKIE } from "./mother-session-policy";
import { rejectUntrustedMotherMutation } from "./mother-session-response";

const REQUEST_TIMEOUT_MS = 10_000;

export async function handleMotherProxyRequest(
  request: NextRequest,
  apiPath: string,
): Promise<NextResponse> {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
    const rejected = rejectUntrustedMotherMutation(request);
    if (rejected !== undefined) return rejected;
  }

  const sessionToken = request.cookies.get(MOTHER_SESSION_COOKIE)?.value;
  if (sessionToken === undefined) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sesi ibu hamil belum aktif." } },
      { status: 401 },
    );
  }

  return executeProxyCall(request, apiPath, sessionToken);
}

async function executeProxyCall(
  request: NextRequest,
  apiPath: string,
  sessionToken: string,
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
    const raw = await request.text().catch(() => "");
    if (raw.trim().length > 0) {
      requestBody = raw;
    }
  }

  const reqHeaders: Record<string, string> = {
    authorization: `Bearer ${sessionToken}`,
  };

  if (requestBody !== undefined) {
    reqHeaders["content-type"] = "application/json";
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: reqHeaders,
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const headers = new Headers();
    const contentType = upstreamRes.headers.get("content-type");
    if (contentType !== null) headers.set("content-type", contentType);

    if (upstreamRes.status === 204) {
      return new NextResponse(null, {
        status: 204,
        headers,
      });
    }

    const responseBody = await upstreamRes.text().catch(() => "");
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
