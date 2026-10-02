import { describe, expect, it } from "vitest";

import { landingCopy } from "../content/id";

describe("landing content invariants", () => {
  it("shows the K1–K8 schedule instead of placeholder operational numbers", () => {
    expect(landingCopy.preview.items.map((item) => item.value)).toEqual(["K1", "K2–K3", "K4–K8"]);
    const serializedCopy = JSON.stringify(landingCopy).toLocaleLowerCase("id");
    expect(serializedCopy).not.toContain("menunggu data server");
    expect(serializedCopy).not.toContain("siap disambungkan");
  });

  it("does not claim that WhatsApp is sent automatically", () => {
    const serializedCopy = JSON.stringify(landingCopy).toLocaleLowerCase("id");

    expect(serializedCopy).not.toContain("terkirim otomatis");
    expect(serializedCopy).not.toContain("whatsapp terkirim");
  });

  it("provides active access for both staff and mother portal", () => {
    expect(landingCopy.access.staffStatus).toBe("Buka portal");
    expect(landingCopy.access.motherStatus).toBe("Buka portal");
    expect(landingCopy.navigation.mother).toBe("Masuk ibu hamil");
    expect(landingCopy.navigation.staff).toBe("Masuk petugas");
  });
});
