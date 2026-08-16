import { NextResponse } from "next/server";
import { motherAccessValidateRequestSchema } from "@anc/contracts";

import { motherApiMe, motherApiLogout, motherApiValidate } from "../../../../lib/mother-api";
import {
  rejectUntrustedMotherMutation,
  setMotherSessionCookie,
} from "../../../../lib/mother-session-response";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const rejected = rejectUntrustedMotherMutation(request);
  if (rejected !== undefined) return rejected;

  const body: unknown = await request.json().catch(() => null);
  const input = motherAccessValidateRequestSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Nama lengkap dan kode akses wajib diisi." } },
      { status: 400 },
    );
  }

  const validate = await motherApiValidate(input.data);
  if (!validate.ok) return NextResponse.json(validate.error, { status: validate.status });

  const identity = await motherApiMe(validate.value.access_token);
  if (!identity.ok) {
    await motherApiLogout(validate.value.access_token);
    return NextResponse.json(
      { error: { code: "SESSION_SETUP_FAILED", message: "Sesi ibu hamil tidak dapat disiapkan." } },
      { status: 502 },
    );
  }

  const response = NextResponse.json(identity.value);
  setMotherSessionCookie(response, validate.value);
  return response;
}
