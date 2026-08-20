import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RegisteredMothersPanel } from "../components/registered-mothers-panel";

describe("registered mothers panel", () => {
  it("renders registered mothers registry header and search elements for PUSKESMAS", () => {
    const markup = renderToStaticMarkup(
      createElement(RegisteredMothersPanel, {
        userRole: "PUSKESMAS",
        healthCenterId: "hc-123",
      }),
    );

    expect(markup).toContain("Daftar Ibu Hamil Terdaftar");
    expect(markup).toContain("Pencarian Pasien");
    expect(markup).toContain("Filter Desa / Dusun");
    expect(markup).toContain("Status Kehamilan");
  });

  it("renders registered mothers registry for BIDAN", () => {
    const markup = renderToStaticMarkup(
      createElement(RegisteredMothersPanel, {
        userRole: "BIDAN",
        healthCenterId: "hc-123",
      }),
    );

    expect(markup).toContain("Daftar Ibu Hamil Terdaftar");
    expect(markup).toContain("Kehamilan Aktif");
  });

  it("denies access and shows security notice for SUPER_ADMIN", () => {
    const markup = renderToStaticMarkup(
      createElement(RegisteredMothersPanel, {
        userRole: "SUPER_ADMIN",
        healthCenterId: null,
      }),
    );

    expect(markup).toContain("Data Ibu Hamil Terdaftar Tidak Tersedia untuk Super Admin");
    expect(markup).toContain("Deny by Default");
    expect(markup).not.toContain("Pencarian Pasien");
  });
});
