import { NextResponse } from "next/server";
import type { StaffTokenResponse } from "@anc/contracts";

import {
  STAFF_ACCESS_COOKIE,
  STAFF_REFRESH_COOKIE,
  staffCookieOptions,
  trustedMutationOrigin,
} from "./staff-session-policy";

export function rejectUntrustedMutation(request: Request): NextResponse | undefined {
  return trustedMutationOrigin(request.url, request.headers.get("origin"), process.env.APP_BASE_URL)
    ? undefined
    : NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Permintaan lintas situs ditolak." } },
        { status: 403 },
      );
}

export function setStaffSessionCookies(response: NextResponse, tokens: StaffTokenResponse): void {
  response.cookies.set(
    STAFF_ACCESS_COOKIE,
    tokens.access_token,
    staffCookieOptions(tokens.access_expires_at, process.env.NODE_ENV),
  );
  response.cookies.set(
    STAFF_REFRESH_COOKIE,
    tokens.refresh_token,
    staffCookieOptions(tokens.refresh_expires_at, process.env.NODE_ENV),
  );
}

export function clearStaffSessionCookies(response: NextResponse): void {
  for (const name of [STAFF_ACCESS_COOKIE, STAFF_REFRESH_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      priority: "high",
    });
  }
}
