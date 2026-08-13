import { describe, expect, it } from "vitest";

import {
  registerAndroidDeviceRequestSchema,
  registeredDeviceResponseSchema,
} from "../src/device-registration.js";

describe("device registration contracts", () => {
  it("accepts an opaque FCM token and never exposes it in the response", () => {
    expect(
      registerAndroidDeviceRequestSchema.parse({
        push_token: "synthetic-fcm-token:abc1234567890",
      }),
    ).toEqual({ push_token: "synthetic-fcm-token:abc1234567890" });

    expect(
      registeredDeviceResponseSchema.parse({
        id: "10000000-0000-4000-8000-000000000001",
        platform: "ANDROID",
        status: "ACTIVE",
        registered_at: "2026-08-13T03:00:00.000Z",
        last_seen_at: "2026-08-13T03:00:00.000Z",
      }),
    ).not.toHaveProperty("push_token");
  });

  it("rejects whitespace, empty, and oversized token values", () => {
    expect(() => registerAndroidDeviceRequestSchema.parse({ push_token: "short" })).toThrow();
    expect(() =>
      registerAndroidDeviceRequestSchema.parse({ push_token: `token ${"a".repeat(30)}` }),
    ).toThrow();
    expect(() =>
      registerAndroidDeviceRequestSchema.parse({ push_token: "a".repeat(4097) }),
    ).toThrow();
  });
});
