import type { PregnancyMilestoneListResponse } from "@anc/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MotherAccessCodeModal } from "../components/mothers/mother-access-code-modal";
import { MotherArchiveModal } from "../components/mothers/mother-archive-modal";
import { MotherDetailModal } from "../components/mothers/mother-detail-modal";
import { MotherEditModal } from "../components/mothers/mother-edit-modal";

const dummyMother = {
  id: "m-123",
  health_center_id: "hc-1",
  village_id: "v-1",
  village_name: "Kuncir",
  full_name: "Siti Fatimah",
  address: "Dusun Krajan RT 01",
  phone_masked: "+62812****7890",
  notification_allowed: true,
  created_at: "2026-01-15T00:00:00.000Z",
  registration_status: "APPROVED" as const,
  active_pregnancy: {
    id: "preg-1",
    status: "ACTIVE" as const,
    dating_date: "2025-10-01",
    completed_weeks: 20,
    completed_days: 3,
    trimester_label: "Trimester 2",
  },
};

const dummyMilestonesPayload: PregnancyMilestoneListResponse = {
  pregnancy_id: "preg-1",
  care_plan_version_id: "cp-1",
  plan_version_no: 1,
  plan_kind: "CLINICAL",
  production_eligible: true,
  dating_basis: "PREGNANCY_START_DATE",
  dating_date: "2025-10-01",
  pregnancy_status: "ACTIVE",
  as_of_date: "2026-01-15",
  gestational_age: {
    completed_weeks: 20,
    additional_days: 3,
    total_days: 143,
  },
  trimester_label: "Trimester 2",
  next_milestone_code: "K3",
  milestones: [
    {
      id: "ms-1",
      pregnancy_id: "preg-1",
      rule_id: "rule-1",
      code: "K1",
      trimester_label: "Trimester 1",
      target_week_start: 1,
      target_week_end: 12,
      milestone_category: "ANC",
      required_facility_policy: "PUSKESMAS_REQUIRED",
      allowed_facility_types: ["PUSKESMAS"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: "2025-11-01T00:00:00.000Z",
      target_date_start: "2025-10-15",
      target_date_end: "2025-11-15",
      schedule_source: "EXPLICIT_DUE_AT",
      visit_status: "CONFIRMED",
      record_validation_status: "VALIDATED",
      reminder_eligible: false,
    },
    {
      id: "ms-2",
      pregnancy_id: "preg-1",
      rule_id: "rule-2",
      code: "K2",
      trimester_label: "Trimester 1",
      target_week_start: 8,
      target_week_end: 12,
      milestone_category: "ANC",
      required_facility_policy: "FLEXIBLE",
      allowed_facility_types: ["PUSKESMAS", "POSYANDU"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: "2025-12-01T00:00:00.000Z",
      target_date_start: "2025-11-15",
      target_date_end: "2025-12-15",
      schedule_source: "EXPLICIT_DUE_AT",
      visit_status: "DUE",
      record_validation_status: "NOT_REQUIRED",
      reminder_eligible: true,
    },
    {
      id: "ms-3",
      pregnancy_id: "preg-1",
      rule_id: "rule-3",
      code: "K3",
      trimester_label: "Trimester 2",
      target_week_start: 13,
      target_week_end: 20,
      milestone_category: "ANC",
      required_facility_policy: "FLEXIBLE",
      allowed_facility_types: ["PUSKESMAS", "POSYANDU"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: null,
      target_date_start: "2026-01-01",
      target_date_end: "2026-02-01",
      schedule_source: "RULE_WINDOW",
      visit_status: "UPCOMING",
      record_validation_status: "NOT_REQUIRED",
      reminder_eligible: false,
    },
    {
      id: "ms-4",
      pregnancy_id: "preg-1",
      rule_id: "rule-4",
      code: "K4",
      trimester_label: "Trimester 2",
      target_week_start: 21,
      target_week_end: 27,
      milestone_category: "ANC",
      required_facility_policy: "FLEXIBLE",
      allowed_facility_types: ["PUSKESMAS", "POSYANDU"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: null,
      target_date_start: "2026-02-02",
      target_date_end: "2026-03-15",
      schedule_source: "RULE_WINDOW",
      visit_status: "UPCOMING",
      record_validation_status: "NOT_REQUIRED",
      reminder_eligible: false,
    },
    {
      id: "ms-5",
      pregnancy_id: "preg-1",
      rule_id: "rule-5",
      code: "K5",
      trimester_label: "Trimester 3",
      target_week_start: 28,
      target_week_end: 32,
      milestone_category: "ANC",
      required_facility_policy: "PUSKESMAS_REQUIRED",
      allowed_facility_types: ["PUSKESMAS"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: null,
      target_date_start: "2026-03-16",
      target_date_end: "2026-04-15",
      schedule_source: "RULE_WINDOW",
      visit_status: "UPCOMING",
      record_validation_status: "NOT_REQUIRED",
      reminder_eligible: false,
    },
    {
      id: "ms-6",
      pregnancy_id: "preg-1",
      rule_id: "rule-6",
      code: "K6",
      trimester_label: "Trimester 3",
      target_week_start: 33,
      target_week_end: 36,
      milestone_category: "ANC",
      required_facility_policy: "FLEXIBLE",
      allowed_facility_types: ["PUSKESMAS", "POSYANDU"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: null,
      target_date_start: "2026-04-16",
      target_date_end: "2026-05-15",
      schedule_source: "RULE_WINDOW",
      visit_status: "UPCOMING",
      record_validation_status: "NOT_REQUIRED",
      reminder_eligible: false,
    },
    {
      id: "ms-7",
      pregnancy_id: "preg-1",
      rule_id: "rule-7",
      code: "K7",
      trimester_label: "Trimester 3",
      target_week_start: 37,
      target_week_end: 38,
      milestone_category: "ANC",
      required_facility_policy: "FLEXIBLE",
      allowed_facility_types: ["PUSKESMAS", "POSYANDU"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: null,
      target_date_start: "2026-05-16",
      target_date_end: "2026-05-31",
      schedule_source: "RULE_WINDOW",
      visit_status: "UPCOMING",
      record_validation_status: "NOT_REQUIRED",
      reminder_eligible: false,
    },
    {
      id: "ms-8",
      pregnancy_id: "preg-1",
      rule_id: "rule-8",
      code: "K8",
      trimester_label: "Trimester 3",
      target_week_start: 39,
      target_week_end: 40,
      milestone_category: "DELIVERY",
      required_facility_policy: "FLEXIBLE",
      allowed_facility_types: ["PUSKESMAS", "POSYANDU"],
      reminder_enabled: true,
      reminder_interval_days: 3,
      due_at: null,
      target_date_start: "2026-06-01",
      target_date_end: "2026-06-15",
      schedule_source: "RULE_WINDOW",
      visit_status: "UPCOMING",
      record_validation_status: "NOT_REQUIRED",
      reminder_eligible: false,
    },
  ],
};

describe("mother modal sub-components", () => {
  it("renders mother detail modal with pregnancy details", () => {
    const markup = renderToStaticMarkup(
      createElement(MotherDetailModal, {
        mother: dummyMother,
        milestones: dummyMilestonesPayload,
        loading: false,
        error: null,
        onClose: () => {},
        isPuskesmas: true,
        onOpenAccessCode: () => {},
      }),
    );

    expect(markup).toContain("Siti Fatimah");
    expect(markup).toContain("20 Minggu 3 Hari");
    expect(markup).toContain("Linimasa Paket ANC (K1 – K8)");
    expect(markup).toContain("CONFIRMED");
    expect(markup).toContain("Terbitkan Kode Akses");
  });

  it("renders mother edit modal with form fields", () => {
    const markup = renderToStaticMarkup(
      createElement(MotherEditModal, {
        mother: dummyMother,
        fullName: "Siti Fatimah",
        address: "Dusun Krajan RT 01",
        phone: "",
        reason: "",
        saving: false,
        error: null,
        onFullNameChange: () => {},
        onAddressChange: () => {},
        onPhoneChange: () => {},
        onReasonChange: () => {},
        onSubmit: () => {},
        onClose: () => {},
      }),
    );

    expect(markup).toContain("Edit Data Pasien");
    expect(markup).toContain("Nama Lengkap Pasien *");
    expect(markup).toContain("Alasan Perubahan Data *");
  });

  it("renders mother archive modal with sensitive warning", () => {
    const markup = renderToStaticMarkup(
      createElement(MotherArchiveModal, {
        mother: dummyMother,
        reason: "",
        archiving: false,
        error: null,
        onReasonChange: () => {},
        onSubmit: () => {},
        onClose: () => {},
      }),
    );

    expect(markup).toContain("Arsipkan Rekam Ibu Siti Fatimah?");
    expect(markup).toContain("Data tidak dimusnahkan");
    expect(markup).toContain("Kehamilan aktif akan ditutup terlebih dahulu");
  });

  it("renders access code modal before and after code generation", () => {
    const initialMarkup = renderToStaticMarkup(
      createElement(MotherAccessCodeModal, {
        mother: dummyMother,
        issuedCode: null,
        issuingCode: false,
        accessCodeError: null,
        copiedCode: false,
        onIssueCode: () => {},
        onCopyCode: () => {},
        onClose: () => {},
      }),
    );
    expect(initialMarkup).toContain("Terbitkan Kode Baru");

    const codeMarkup = renderToStaticMarkup(
      createElement(MotherAccessCodeModal, {
        mother: dummyMother,
        issuedCode: "ANC-2345-6789-ABCD-EFGH",
        issuingCode: false,
        accessCodeError: null,
        copiedCode: false,
        onIssueCode: () => {},
        onCopyCode: () => {},
        onClose: () => {},
      }),
    );
    expect(codeMarkup).toContain("ANC-2345-6789-ABCD-EFGH");
    expect(codeMarkup).toContain("PERHATIAN KEAMANAN");
    expect(codeMarkup).toContain("Salin Kode Akses");
  });
});
