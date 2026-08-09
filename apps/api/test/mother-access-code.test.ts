import { describe, expect, it } from "vitest";
import { motherAccessCodeSchema } from "@anc/contracts";

import { PasswordHasher } from "../src/auth/password-hasher.js";
import { MotherAccessCodeService } from "../src/mother-access/mother-access-code.service.js";

describe("mother access code service", () => {
  it("issues an 80-bit display code and persists only a salted scrypt verifier", async () => {
    const service = new MotherAccessCodeService(new PasswordHasher());
    const issued = await service.issue();

    expect(motherAccessCodeSchema.parse(issued.plaintext)).toBe(issued.plaintext);
    expect(issued.hash).toMatch(/^scrypt\$131072\$8\$1\$/u);
    expect(issued.hash).not.toContain(issued.plaintext);
    await expect(service.verifyOrDummy(issued.plaintext, issued.hash)).resolves.toBe(true);
    await expect(service.verifyOrDummy("ANC-2222-2222-2222-2222", issued.hash)).resolves.toBe(
      false,
    );
  });
});
