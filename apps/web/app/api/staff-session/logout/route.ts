import { NextRequest, NextResponse } from "next/server";

import { refreshStaffSession, staffApiLogout } from "../../../../lib/staff-api";
import { STAFF_ACCESS_COOKIE, STAFF_REFRESH_COOKIE } from "../../../../lib/staff-session-policy";
import {
  clearStaffSessionCookies,
  rejectUntrustedMutation,
} from "../../../../lib/staff-session-response";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejected = rejectUntrustedMutation(request);
  if (rejected !== undefined) return rejected;

  const accessToken = request.cookies.get(STAFF_ACCESS_COOKIE)?.value;
  const revoked = accessToken !== undefined && (await staffApiLogout(accessToken));
  // An expired access token cannot log out by itself; rotate the refresh token so the session is
  // still revoked on the server instead of staying usable until it expires.
  const refreshToken = request.cookies.get(STAFF_REFRESH_COOKIE)?.value;
  if (!revoked && refreshToken !== undefined) {
    const refresh = await refreshStaffSession(refreshToken);
    if (refresh.ok) await staffApiLogout(refresh.value.access_token);
  }

  const response = new NextResponse(null, { status: 204 });
  clearStaffSessionCookies(response);
  return response;
}
