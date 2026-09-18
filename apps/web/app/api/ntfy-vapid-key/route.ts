// Endpoint: GET /api/ntfy-vapid-key
// Return VAPID public key untuk dipakai WebView subscribe Web Push

import { NextResponse } from "next/server";

// VAPID public key dari ntfy server (generated: ntfy webpush keys)
const VAPID_PUBLIC_KEY =
  "BM16wxskq0O9VZT_uD7b0nghrfSG9Il2-TiW-WsoXPGPCS5fPzeOQnUHpDp2CErIHVxE3b4YQ6eFazkVBIgh80E";

export function GET(): NextResponse {
  return NextResponse.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
}
