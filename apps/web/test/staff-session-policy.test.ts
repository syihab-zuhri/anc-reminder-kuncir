import { describe, expect, it } from "vitest";

import {
  STAFF_ACCESS_COOKIE,
  STAFF_REFRESH_COOKIE,
  staffCookieOptions,
  trustedMutationOrigin,
} from "../lib/staff-session-policy";

describe("staff session browser policy", () => {
  it("uses distinct opaque cookie names and strict HttpOnly cookies", () => {
    const options = staffCookieOptions("2030-08-08T08:00:00.000Z", "production");

    expect(STAFF_ACCESS_COOKIE).not.toBe(STAFF_REFRESH_COOKIE);
    expect(options).toEqual(
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        priority: "high",
      }),
    );
  });

  it("does not mark local development cookies as Secure", () => {
    expect(staffCookieOptions("2030-08-08T08:00:00.000Z", "development").secure).toBe(false);
  });

  it("accepts only the exact configured same origin for mutations", () => {
    const requestUrl = "https://anc.example/api/staff-session/login";

    expect(trustedMutationOrigin(requestUrl, "https://anc.example", "https://anc.example")).toBe(
      true,
    );
    expect(trustedMutationOrigin(requestUrl, null, "https://anc.example")).toBe(false);
    expect(
      trustedMutationOrigin(requestUrl, "https://attacker.example", "https://anc.example"),
    ).toBe(false);
    expect(
      trustedMutationOrigin(requestUrl, "https://anc.example/path", "https://anc.example"),
    ).toBe(false);
  });
});
