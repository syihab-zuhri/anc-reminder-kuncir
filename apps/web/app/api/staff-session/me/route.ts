import { NextRequest, NextResponse } from "next/server";

import { staffApiMe, staffApiRefresh } from "../../../../lib/staff-api";
import {
  clearStaffSessionCookies,
  setStaffSessionCookies,
} from "../../../../lib/staff-session-response";
import { STAFF_ACCESS_COOKIE, STAFF_REFRESH_COOKIE } from "../../../../lib/staff-session-policy";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(STAFF_ACCESS_COOKIE)?.value;
  if (accessToken !== undefined) {
    const identity = await staffApiMe(accessToken);
    if (identity.ok) return NextResponse.json(identity.value);
    if (identity.status !== 401)
      return NextResponse.json(identity.error, { status: identity.status });
  }

  const refreshToken = request.cookies.get(STAFF_REFRESH_COOKIE)?.value;
  if (refreshToken !== undefined) {
    const refresh = await staffApiRefresh(refreshToken);
    if (refresh.ok) {
      const identity = await staffApiMe(refresh.value.access_token);
      if (identity.ok) {
        const response = NextResponse.json(identity.value);
        setStaffSessionCookies(response, refresh.value);
        return response;
      }
      if (identity.status !== 401) {
        const response = NextResponse.json(identity.error, { status: identity.status });
        setStaffSessionCookies(response, refresh.value);
        return response;
      }
    } else if (refresh.status !== 401) {
      return NextResponse.json(refresh.error, { status: refresh.status });
    }
  }

  const response = NextResponse.json(
    { error: { code: "SESSION_EXPIRED", message: "Sesi petugas telah berakhir." } },
    { status: 401 },
  );
  clearStaffSessionCookies(response);
  return response;
}
