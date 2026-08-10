import { describe, expect, it } from "vitest";
import { motherAccessCodeSchema } from "@anc/contracts";

import { PasswordHasher } from "../src/auth/password-hasher.js";
import { MotherAccessCodeService } from "../src/mother-access/mother-access-code.service.js";
import {
  MotherAccessCryptoService,
  normalizeMotherAccessCode,
  normalizeMotherName,
} from "../src/mother-access/mother-access-crypto.service.js";

describe("mother access code service", () => {
  it("issues an 80-bit display code and persists only a salted scrypt verifier", async () => {
    const service = new MotherAccessCodeService(
      new PasswordHasher(),
      new MotherAccessCryptoService("m".repeat(32), 30),
    );
    const issued = await service.issue();

    expect(motherAccessCodeSchema.parse(issued.plaintext)).toBe(issued.plaintext);
    expect(issued.hash).toMatch(/^scrypt\$131072\$8\$1\$/u);
    expect(issued.hash).not.toContain(issued.plaintext);
    expect(issued.lookupHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.lookupHash).not.toContain(issued.plaintext);
    await expect(service.verifyOrDummy(issued.plaintext, issued.hash)).resolves.toBe(true);
    await expect(service.verifyOrDummy("ANC-2222-2222-2222-2222", issued.hash)).resolves.toBe(
      false,
    );
  });

  it("normalizes human input and issues a revocable opaque mother session", () => {
    const crypto = new MotherAccessCryptoService("m".repeat(32), 30);
    const now = new Date("2026-08-10T09:00:00.000Z");
    const session = crypto.issueSession(now);

    expect(normalizeMotherAccessCode(" anc 2345-6789 abcd-efgh ")).toBe("ANC-2345-6789-ABCD-EFGH");
    expect(normalizeMotherAccessCode("ANC-0000-0000-0000-0000")).toBeNull();
    expect(normalizeMotherName("  SITI   Aminah ")).toBe("siti aminah");
    expect(crypto.namesEqual(" Siti  Aminah", "siti aminah ")).toBe(true);
    expect(crypto.namesEqual("Siti Aminah", "Siti Aminah Lain")).toBe(false);
    expect(session.token).toMatch(/^anc_mt_[A-Za-z0-9_-]{43}$/u);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(session.tokenHash).not.toContain(session.token);
    expect(session.expiresAt.toISOString()).toBe("2026-09-09T09:00:00.000Z");
  });
});
