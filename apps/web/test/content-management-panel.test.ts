import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ContentManagementPanel,
  nextLifecycleAction,
  renderSyntheticContentPreview,
  SYNTHETIC_PREVIEW_VALUES,
} from "../components/content-management-panel";

describe("content management panel (TASK-P4-010)", () => {
  it("renders placeholders with fixed non-patient synthetic values", () => {
    const preview = renderSyntheticContentPreview(
      "Pengingat {{milestone_code}} dari {{facility_name}}.",
    );

    expect(preview).toBe(
      `Pengingat ${SYNTHETIC_PREVIEW_VALUES.milestone_code} dari ${SYNTHETIC_PREVIEW_VALUES.facility_name}.`,
    );
    expect(preview).not.toContain("{{");
    expect(JSON.stringify(SYNTHETIC_PREVIEW_VALUES).toLocaleLowerCase("id")).not.toMatch(
      /nik|telepon|diagnosis|hasil_lab|nama_ibu/u,
    );
  });

  it("maps UI actions to the exact server lifecycle order", () => {
    expect([
      nextLifecycleAction("DRAFT"),
      nextLifecycleAction("REVIEW"),
      nextLifecycleAction("APPROVED"),
      nextLifecycleAction("PUBLISHED"),
      nextLifecycleAction("ARCHIVED"),
    ]).toEqual(["submit-review", "approve", "publish", "archive", null]);
  });

  it("announces synthetic preview policy in the Puskesmas workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(ContentManagementPanel, { userRole: "PUSKESMAS" }),
    );

    expect(markup).toContain("Meja editorial klinis");
    expect(markup).toContain("Preview selalu menggunakan milestone dan fasilitas sintetis");
    expect(markup).not.toContain("WhatsApp terkirim");
  });

  it.each(["BIDAN", "SUPER_ADMIN"] as const)("denies the content desk to %s", (userRole) => {
    const markup = renderToStaticMarkup(createElement(ContentManagementPanel, { userRole }));

    expect(markup).toContain("Akses Terbatas");
    expect(markup).toContain("hanya tersedia untuk Puskesmas");
    expect(markup).not.toContain("Template baru");
  });
});
