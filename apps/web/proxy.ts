import { NextResponse, type NextRequest } from "next/server";

import { contentSecurityPolicy } from "./lib/content-security-policy";

/**
 * Per-request Content Security Policy with a script nonce, so the browser runs only the scripts
 * Next.js renders for this response and no injected inline script. Next.js reads the nonce from
 * the request's CSP header and adds it to its own scripts; that only works for dynamically
 * rendered pages, which the root layout enforces. Styles keep 'unsafe-inline' because components
 * use inline style attributes, which a nonce cannot cover.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes return JSON and static files run no script.
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|json)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
