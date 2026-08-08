import { describe, expect, it } from "vitest";

import { landingCopy } from "../content/id";

describe("landing content invariants", () => {
  it("states that operational data comes from the server", () => {
    expect(landingCopy.preview.description.toLocaleLowerCase("id")).toContain("server");
    expect(landingCopy.preview.footnote.toLocaleLowerCase("id")).toContain("tidak menghitung");
  });

  it("does not claim that WhatsApp is sent automatically", () => {
    const serializedCopy = JSON.stringify(landingCopy).toLocaleLowerCase("id");

    expect(serializedCopy).not.toContain("terkirim otomatis");
    expect(serializedCopy).not.toContain("whatsapp terkirim");
  });

  it("distinguishes the active staff portal from pending mother access", () => {
    expect(landingCopy.access.staffStatus).toBe("Buka portal");
    expect(landingCopy.access.motherStatus).toBe("Segera tersedia");
  });
});
