import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("copy access code button verification", () => {
  it("MotherAccessCodeModal contains Salin Kode Akses button", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/mothers/mother-access-code-modal.tsx"),
      "utf8",
    );
    expect(source).toContain("Salin Kode Akses");
    expect(source).toContain("Kode Tersalin!");
  });

  it("MotherAccessPanel contains copy access code handler and button", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/mother-access-panel.tsx"),
      "utf8",
    );
    expect(source).toContain("handleCopyCode");
    expect(source).toContain("Salin Kode Akses");
    expect(source).toContain("navigator.clipboard.writeText(issuedCodeResult.access_code)");
  });

  it("MotherRegistrationPanel contains copy access code handler and button", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/mother-registration-panel.tsx"),
      "utf8",
    );
    expect(source).toContain("handleCopyCode");
    expect(source).toContain("Salin Kode Akses");
    expect(source).toContain("navigator.clipboard.writeText(generatedCode)");
  });
});
