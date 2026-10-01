import { describe, expect, it } from "vitest";

import { clientIpFromHeaders } from "../lib/client-ip";

function ipFor(headers: Record<string, string>): string | undefined {
  return clientIpFromHeaders(new Headers(headers));
}

describe("clientIpFromHeaders", () => {
  it("prefers the Cloudflare header over anything a client could put in X-Forwarded-For", () => {
    expect(
      ipFor({
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "198.51.100.1, 203.0.113.9, 127.0.0.1",
      }),
    ).toBe("203.0.113.9");
  });

  it("falls back to the right-most non-loopback hop, not the spoofable left-most one", () => {
    expect(ipFor({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 127.0.0.1" })).toBe("203.0.113.9");
    expect(ipFor({ "x-forwarded-for": "203.0.113.9" })).toBe("203.0.113.9");
  });

  it("ignores loopback hops entirely", () => {
    expect(ipFor({ "x-forwarded-for": "127.0.0.1, ::1" })).toBeUndefined();
  });

  it("accepts IPv6, bracketed forms, ports, and IPv4-mapped addresses", () => {
    expect(ipFor({ "cf-connecting-ip": "2001:DB8::1" })).toBe("2001:db8::1");
    expect(ipFor({ "x-forwarded-for": "[2001:db8::2]:443" })).toBe("2001:db8::2");
    expect(ipFor({ "x-forwarded-for": "203.0.113.9:51234" })).toBe("203.0.113.9");
    expect(ipFor({ "x-forwarded-for": "::ffff:203.0.113.9" })).toBe("203.0.113.9");
  });

  it("rejects values that are not IP addresses", () => {
    expect(ipFor({ "cf-connecting-ip": "not-an-ip" })).toBeUndefined();
    expect(ipFor({ "cf-connecting-ip": "999.1.1.1" })).toBeUndefined();
    expect(ipFor({ "cf-connecting-ip": "1.2.3.4; DROP TABLE" })).toBeUndefined();
    expect(ipFor({ "x-forwarded-for": "x".repeat(200) })).toBeUndefined();
  });

  it("skips an invalid Cloudflare value and uses the forwarded chain instead", () => {
    expect(ipFor({ "cf-connecting-ip": "garbage", "x-forwarded-for": "203.0.113.9" })).toBe(
      "203.0.113.9",
    );
  });

  it("returns undefined when no proxy header is present", () => {
    expect(ipFor({})).toBeUndefined();
  });
});
