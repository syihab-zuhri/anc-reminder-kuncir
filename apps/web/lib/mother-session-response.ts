import { NextResponse } from "next/server";
import type { MotherSessionResponse } from "@anc/contracts";

import { MOTHER_SESSION_COOKIE, motherCookieOptions } from "./mother-session-policy";
import { trustedMutationOrigin } from "./staff-session-policy";

export function rejectUntrustedMotherMutation(request: Request): NextResponse | undefined {
  return trustedMutationOrigin(request.url, request.headers.get("origin"), process.env.APP_BASE_URL)
    ? undefined
    : NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Permintaan lintas situs ditolak." } },
        { status: 403 },
      );
}

export function setMotherSessionCookie(
  response: NextResponse,
  session: MotherSessionResponse,
): void {
  response.cookies.set(
    MOTHER_SESSION_COOKIE,
    session.access_token,
    motherCookieOptions(session.expires_at, process.env.NODE_ENV),
  );
}

export function clearMotherSessionCookie(response: NextResponse): void {
  response.cookies.set(MOTHER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    priority: "high",
  });
}
