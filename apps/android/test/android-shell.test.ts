import { describe, expect, it } from "vitest";

import { parseTrustedDeepLink } from "../src/deep-link.js";
import { AndroidSecureStorage } from "../src/secure-storage.js";

describe("Android WebView Shell (TASK-P4-004)", () => {
  it("stores mother session with token validation and clears safely", async () => {
    const storage = new AndroidSecureStorage();
    const token = `anc_mt_${"a".repeat(43)}`;
    const session = {
      access_token: token,
      mother_id: "m-123",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    await storage.setMotherSession(session);
    const retrieved = await storage.getMotherSession();
    expect(retrieved).toEqual(session);

    await storage.clearSession();
    expect(await storage.getMotherSession()).toBeNull();
  });

  it("rejects malformed mother access token format", async () => {
    const storage = new AndroidSecureStorage();
    await expect(
      storage.setMotherSession({
        access_token: "invalid-token",
        mother_id: "m-123",
        expires_at: new Date().toISOString(),
      }),
    ).rejects.toThrow("Invalid mother access token format");
  });

  it("parses deep links allowing only trusted paths on allowed host", () => {
    const host = "anc.example.id";
    expect(parseTrustedDeepLink("https://anc.example.id/staff", host)).toEqual({
      isTrusted: true,
      targetPath: "/staff",
    });

    expect(parseTrustedDeepLink("https://evil.example/staff", host)).toEqual({
      isTrusted: false,
      targetPath: "/",
    });
  });
});
