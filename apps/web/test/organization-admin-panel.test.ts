import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminFacilitiesTab } from "../components/admin/admin-facilities-tab";
import { AdminStaffTab } from "../components/admin/admin-staff-tab";
import { AdminVillagesTab } from "../components/admin/admin-villages-tab";
import { OrganizationAdminPanel } from "../components/organization-admin-panel";

describe("organization admin modular sub-tabs", () => {
  it("renders organization admin panel for PUSKESMAS with subtabs", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationAdminPanel, {
        userRole: "PUSKESMAS",
        healthCenterId: "hc-kuncir",
      }),
    );

    expect(markup).toContain("Pengaturan Fasilitas &amp; Petugas");
    expect(markup).toContain("Fasilitas");
    expect(markup).toContain("Desa Binaan");
    expect(markup).toContain("Akun Staf Bidan");
    expect(markup).toContain("Penugasan Wilayah");
    expect(markup).toContain("Aturan Jadwal ANC");
  });

  it("denies access to organization admin for BIDAN and SUPER_ADMIN", () => {
    const bidanMarkup = renderToStaticMarkup(
      createElement(OrganizationAdminPanel, {
        userRole: "BIDAN",
        healthCenterId: "hc-kuncir",
      }),
    );
    expect(bidanMarkup).toContain("Akses Terbatas");
    expect(bidanMarkup).toContain(
      "Pengaturan Fasilitas &amp; Petugas Hanya Tersedia untuk Petugas Puskesmas",
    );

    const superMarkup = renderToStaticMarkup(
      createElement(OrganizationAdminPanel, {
        userRole: "SUPER_ADMIN",
        healthCenterId: null,
      }),
    );
    expect(superMarkup).toContain("Akses Terbatas");
  });

  it("renders facilities tab with empty state and create form", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminFacilitiesTab, {
        facilities: [],
        villages: [
          {
            id: "v-1",
            health_center_id: "hc-1",
            code: "DS-01",
            name: "Kuncir",
            status: "ACTIVE" as const,
          },
        ],
        facilityName: "",
        facilityCode: "",
        facilityType: "POSYANDU",
        facilityVillageId: "",
        submitting: false,
        editingFacility: null,
        editFacilityName: "",
        editFacilityCode: "",
        editFacilityType: "POSYANDU",
        editFacilityVillageId: "",
        onFacilityNameChange: () => {},
        onFacilityCodeChange: () => {},
        onFacilityTypeChange: () => {},
        onFacilityVillageIdChange: () => {},
        onEditFacilityNameChange: () => {},
        onEditFacilityCodeChange: () => {},
        onEditFacilityTypeChange: () => {},
        onEditFacilityVillageIdChange: () => {},
        onCreateFacility: () => {},
        onUpdateFacility: () => {},
        onDeleteFacility: () => {},
        onStartEditFacility: () => {},
        onCancelEditFacility: () => {},
      }),
    );

    expect(markup).toContain("Tambah TPMB / Faskes");
    expect(markup).toContain("Belum ada fasilitas / posyandu yang terdaftar.");
    expect(markup).toContain("Desa Kuncir (DS-01)");
  });

  it("renders staff tab with staff member details", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminStaffTab, {
        staffList: [
          {
            id: "s-1",
            health_center_id: "hc-1",
            login_identifier: "bidan.ani",
            display_name: "Bdn. Ani, S.Tr.Keb",
            role: "BIDAN",
            status: "ACTIVE",
          },
        ],
        staffIdentifier: "",
        staffDisplayName: "",
        staffRole: "BIDAN",
        staffPassword: "",
        submitting: false,
        editingStaff: null,
        editStaffDisplayName: "",
        editStaffPassword: "",
        onStaffIdentifierChange: () => {},
        onStaffDisplayNameChange: () => {},
        onStaffRoleChange: () => {},
        onStaffPasswordChange: () => {},
        onEditStaffDisplayNameChange: () => {},
        onEditStaffPasswordChange: () => {},
        onCreateStaff: () => {},
        onUpdateStaff: () => {},
        onToggleStaffStatus: () => {},
        onDeleteStaff: () => {},
        onStartEditStaff: () => {},
        onCancelEditStaff: () => {},
      }),
    );

    expect(markup).toContain("Bdn. Ani, S.Tr.Keb");
    expect(markup).toContain("@bidan.ani");
    expect(markup).toContain("Nonaktifkan");
  });

  it("renders villages tab with list", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminVillagesTab, {
        villages: [
          {
            id: "v-1",
            health_center_id: "hc-1",
            code: "DS-01",
            name: "Kuncir",
            status: "ACTIVE" as const,
          },
        ],
        villageName: "",
        villageCode: "",
        submitting: false,
        editingVillage: null,
        editVillageName: "",
        editVillageCode: "",
        onVillageNameChange: () => {},
        onVillageCodeChange: () => {},
        onEditVillageNameChange: () => {},
        onEditVillageCodeChange: () => {},
        onCreateVillage: () => {},
        onUpdateVillage: () => {},
        onDeleteVillage: () => {},
        onStartEditVillage: () => {},
        onCancelEditVillage: () => {},
      }),
    );

    expect(markup).toContain("Tambah Desa Wilayah Kerja");
    expect(markup).toContain("Kuncir");
    expect(markup).toContain("DS-01");
  });
});
