import { describe, expect, it } from "vitest";

import { DeviceTokenCrypto } from "../src/device-token-crypto.js";

describe("DeviceTokenCrypto", () => {
  const key = Buffer.from("p".repeat(32)).toString("base64");

  it("round-trips tokens with randomized authenticated ciphertext", () => {
    const crypto = new DeviceTokenCrypto(key);
    const token = "synthetic-fcm-token:alpha-123456789";
    const first = crypto.encrypt(token);
    const second = crypto.encrypt(token);

    expect(first).not.toBe(second);
    expect(first).not.toContain(token);
    expect(crypto.decrypt(first)).toBe(token);
    expect(crypto.decrypt(second)).toBe(token);
  });

  it("creates stable domain-keyed fingerprints and rejects tampering", () => {
    const crypto = new DeviceTokenCrypto(key);
    const token = "synthetic-fcm-token:alpha-123456789";
    const encrypted = crypto.encrypt(token);

    expect(crypto.fingerprint(token)).toBe(crypto.fingerprint(token));
    expect(crypto.fingerprint(token)).not.toBe(crypto.fingerprint(`${token}-different`));
    expect(() => crypto.decrypt(`${encrypted.slice(0, -1)}A`)).toThrow("authentication failed");
  });
});
