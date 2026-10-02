import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import { contentSecurityPolicy } from "../lib/content-security-policy";
import { proxy } from "../proxy";

describe("Next.js security headers", () => {
  it("applies the hardened browser policy to every route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    if (nextConfig.headers === undefined) throw new Error("Expected Next.js headers configuration");

    const rules = await nextConfig.headers();
    const globalRule = rules.find((rule) => rule.source === "/(.*)");
    const headers = Object.fromEntries(
      (globalRule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });

  it("prevents authenticated staff HTML from retaining stale build references", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    if (nextConfig.headers === undefined) throw new Error("Expected Next.js headers configuration");

    const rules = await nextConfig.headers();
    const staffRule = rules.find((rule) => rule.source === "/staff/:path*");
    const headers = Object.fromEntries(
      (staffRule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(headers["cache-control"]).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  it("sends a fresh script nonce with every page and no inline-script allowance", () => {
    const first = proxy(new NextRequest("http://localhost:3000/staff"));
    const second = proxy(new NextRequest("http://localhost:3000/staff"));
    const policy = first.headers.get("content-security-policy") ?? "";
    const scriptSrc = policy.split("; ").find((directive) => directive.startsWith("script-src"));

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(scriptSrc).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/u);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(second.headers.get("content-security-policy")).not.toBe(policy);
  });

  it("allows eval only for local development tooling", () => {
    expect(contentSecurityPolicy("n", true)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("n", false)).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("n", false)).toContain("upgrade-insecure-requests");
  });
});
