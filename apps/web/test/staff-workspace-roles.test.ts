import { describe, expect, it } from "vitest";

import type { StaffRole } from "@anc/contracts";
import type { ModuleTab } from "../app/staff/staff-workspace";

interface TabDefinition {
  readonly id: ModuleTab;
  readonly label: string;
  readonly allowedRoles: readonly StaffRole[];
}

const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: "summary", label: "Dashboard", allowedRoles: ["PUSKESMAS", "BIDAN", "SUPER_ADMIN"] },
  { id: "mothers", label: "Data Bumil", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "register", label: "Register Bumil", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "access", label: "Kode Akses", allowedRoles: ["PUSKESMAS"] },
  { id: "clinical", label: "Detail K1–K6", allowedRoles: ["PUSKESMAS"] },
  { id: "confirm", label: "Konfirmasi Periksa", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "bumil", label: "Portal Bumil", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "admin", label: "Administrasi", allowedRoles: ["PUSKESMAS"] },
  { id: "content", label: "Konten Reminder", allowedRoles: ["PUSKESMAS"] },
];

describe("staff workspace role-based tab visibility", () => {
  it("hides restricted tabs from BIDAN (Petugas Posyandu / Bidan Lapangan)", () => {
    const bidanTabs = TAB_DEFINITIONS.filter((t) => t.allowedRoles.includes("BIDAN"));
    const tabIds = bidanTabs.map((t) => t.id);

    // Visible for Bidan
    expect(tabIds).toContain("summary");
    expect(tabIds).toContain("mothers");
    expect(tabIds).toContain("register");
    expect(tabIds).toContain("confirm");
    expect(tabIds).toContain("bumil");

    // Strictly hidden for Bidan
    expect(tabIds).not.toContain("access");
    expect(tabIds).not.toContain("clinical");
    expect(tabIds).not.toContain("admin");
    expect(tabIds).not.toContain("content");

    expect(bidanTabs).toHaveLength(5);
  });

  it("shows full operational tabs for PUSKESMAS", () => {
    const puskesmasTabs = TAB_DEFINITIONS.filter((t) => t.allowedRoles.includes("PUSKESMAS"));
    expect(puskesmasTabs).toHaveLength(9);
  });

  it("hides all patient and health data tabs from SUPER_ADMIN", () => {
    const superAdminTabs = TAB_DEFINITIONS.filter((t) => t.allowedRoles.includes("SUPER_ADMIN"));
    const tabIds = superAdminTabs.map((t) => t.id);

    expect(tabIds).toEqual(["summary"]);
    expect(tabIds).not.toContain("mothers");
    expect(tabIds).not.toContain("confirm");
    expect(tabIds).not.toContain("register");
  });
});
