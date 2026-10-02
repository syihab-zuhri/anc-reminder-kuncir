import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { NikCipher } from "../src/registry/nik-cipher.js";
import { apiConfigFixture } from "./fixtures.js";

describe("NikCipher", () => {
  it("uses authenticated randomized encryption rather than retaining plaintext", () => {
    const cipher = new NikCipher(apiConfigFixture().nikEncryptionKey);
    const nik = "3273014901010001";
    const first = cipher.encrypt(nik);
    const second = cipher.encrypt(nik);

    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(first).not.toContain(nik);
    expect(second).not.toBe(first);
    expect(cipher.decrypt(first)).toBe(nik);
  });

  it("fails closed when ciphertext integrity does not verify", () => {
    const cipher = new NikCipher(apiConfigFixture().nikEncryptionKey);
    const [version, iv, tag, ciphertext] = cipher.encrypt("3273014901010001").split(".");
    const alteredTag = `${tag?.startsWith("A") ? "B" : "A"}${tag?.slice(1)}`;
    expect(() => cipher.decrypt([version, iv, alteredTag, ciphertext].join("."))).toThrow(
      "authentication failed",
    );
  });

  it("derives a deterministic keyed fingerprint that reveals neither the NIK nor the ciphertext", () => {
    const cipher = new NikCipher(apiConfigFixture().nikEncryptionKey);
    const nik = "3273014901010001";
    const fingerprint = cipher.fingerprint(nik);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(cipher.fingerprint(nik)).toBe(fingerprint);
    expect(cipher.fingerprint("3273014901010002")).not.toBe(fingerprint);
    expect(fingerprint).not.toContain(nik);
    // Unlike the randomized ciphertext, equal NIKs always collide, which is the point.
    expect(cipher.encrypt(nik)).not.toBe(cipher.encrypt(nik));
  });

  it("depends on the secret, so a database leak alone cannot confirm a guessed NIK", () => {
    const other = Buffer.from("q".repeat(32)).toString("base64");
    const nik = "3273014901010001";

    expect(new NikCipher(other).fingerprint(nik)).not.toBe(
      new NikCipher(apiConfigFixture().nikEncryptionKey).fingerprint(nik),
    );
  });

  it("uses a key distinct from the encryption key", () => {
    const key = apiConfigFixture().nikEncryptionKey;
    const plainHmac = createHmac("sha256", Buffer.from(key, "base64"))
      .update("3273014901010001", "utf8")
      .digest("hex");

    expect(new NikCipher(key).fingerprint("3273014901010001")).not.toBe(plainHmac);
  });
});
