import { NextRequest, NextResponse } from "next/server";

import { motherApiLogout } from "../../../../lib/mother-api";
import { MOTHER_SESSION_COOKIE } from "../../../../lib/mother-session-policy";
import {
  clearMotherSessionCookie,
  rejectUntrustedMotherMutation,
} from "../../../../lib/mother-session-response";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejected = rejectUntrustedMotherMutation(request);
  if (rejected !== undefined) return rejected;

  const sessionToken = request.cookies.get(MOTHER_SESSION_COOKIE)?.value;
  if (sessionToken !== undefined) await motherApiLogout(sessionToken);

  const response = new NextResponse(null, { status: 204 });
  clearMotherSessionCookie(response);
  return response;
}
