import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("Next.js security headers", () => {
  it("applies the hardened browser policy to every route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    if (nextConfig.headers === undefined) throw new Error("Expected Next.js headers configuration");

    const rules = await nextConfig.headers();
    const globalRule = rules.find((rule) => rule.source === "/(.*)");
    const headers = Object.fromEntries(
      (globalRule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(headers["content-security-policy"]).toContain("default-src 'self'");
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
});
