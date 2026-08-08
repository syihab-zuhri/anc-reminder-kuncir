import { NextRequest, NextResponse } from "next/server";

import { staffApiLogout } from "../../../../lib/staff-api";
import { STAFF_ACCESS_COOKIE } from "../../../../lib/staff-session-policy";
import {
  clearStaffSessionCookies,
  rejectUntrustedMutation,
} from "../../../../lib/staff-session-response";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejected = rejectUntrustedMutation(request);
  if (rejected !== undefined) return rejected;

  const accessToken = request.cookies.get(STAFF_ACCESS_COOKIE)?.value;
  if (accessToken !== undefined) await staffApiLogout(accessToken);

  const response = new NextResponse(null, { status: 204 });
  clearStaffSessionCookies(response);
  return response;
}
