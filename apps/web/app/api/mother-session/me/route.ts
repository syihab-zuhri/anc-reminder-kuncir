import { NextRequest, NextResponse } from "next/server";

import { motherApiMe } from "../../../../lib/mother-api";
import { MOTHER_SESSION_COOKIE } from "../../../../lib/mother-session-policy";
import { clearMotherSessionCookie } from "../../../../lib/mother-session-response";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionToken = request.cookies.get(MOTHER_SESSION_COOKIE)?.value;
  if (sessionToken !== undefined) {
    const identity = await motherApiMe(sessionToken);
    if (identity.ok) return NextResponse.json(identity.value);
    if (identity.status !== 401) {
      return NextResponse.json(identity.error, { status: identity.status });
    }
  }

  const response = NextResponse.json(
    { error: { code: "SESSION_EXPIRED", message: "Sesi ibu hamil telah berakhir." } },
    { status: 401 },
  );
  clearMotherSessionCookie(response);
  return response;
}
