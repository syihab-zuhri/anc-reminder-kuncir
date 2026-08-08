import { NextResponse } from "next/server";
import { staffLoginRequestSchema } from "@anc/contracts";

import { staffApiLogin, staffApiLogout, staffApiMe } from "../../../../lib/staff-api";
import {
  rejectUntrustedMutation,
  setStaffSessionCookies,
} from "../../../../lib/staff-session-response";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const rejected = rejectUntrustedMutation(request);
  if (rejected !== undefined) return rejected;

  const body: unknown = await request.json().catch(() => null);
  const input = staffLoginRequestSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Identitas dan kata sandi wajib diisi." } },
      { status: 400 },
    );
  }

  const login = await staffApiLogin(input.data);
  if (!login.ok) return NextResponse.json(login.error, { status: login.status });

  const identity = await staffApiMe(login.value.access_token);
  if (!identity.ok) {
    await staffApiLogout(login.value.access_token);
    return NextResponse.json(
      { error: { code: "SESSION_SETUP_FAILED", message: "Sesi petugas tidak dapat disiapkan." } },
      { status: 502 },
    );
  }

  const response = NextResponse.json(identity.value);
  setStaffSessionCookies(response, login.value);
  return response;
}
