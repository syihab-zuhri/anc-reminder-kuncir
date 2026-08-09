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
});
