"use client";

import type {
  AncPlanResponse,
  Facility,
  FacilityType,
  StaffAssignmentDetail,
  StaffSummary,
  Village,
} from "@anc/contracts";
import { useCallback, useEffect, useState } from "react";
import { AdminAssignmentsTab } from "./admin/admin-assignments-tab";
import { AdminCarePlanTab } from "./admin/admin-careplan-tab";
import { AdminFacilitiesTab } from "./admin/admin-facilities-tab";
import { AdminStaffTab } from "./admin/admin-staff-tab";
import { AdminVillagesTab } from "./admin/admin-villages-tab";

interface OrganizationAdminPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
  readonly healthCenterId: string | null;
}

export function OrganizationAdminPanel({ userRole }: OrganizationAdminPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "facilities" | "villages" | "staff" | "assignments" | "careplan"
  >("facilities");

  // Loaded data states
  const [facilities, setFacilities] = useState<readonly Facility[]>([]);
  const [villages, setVillages] = useState<readonly Village[]>([]);
  const [staffList, setStaffList] = useState<readonly StaffSummary[]>([]);
  const [assignments, setAssignments] = useState<readonly StaffAssignmentDetail[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Form states - Facility
  const [facilityName, setFacilityName] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [facilityType, setFacilityType] = useState<FacilityType>("POSYANDU");
  const [facilityVillageId, setFacilityVillageId] = useState("");

  // Edit states - Facility
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [editFacilityName, setEditFacilityName] = useState("");
  const [editFacilityCode, setEditFacilityCode] = useState("");
  const [editFacilityType, setEditFacilityType] = useState<FacilityType>("POSYANDU");
  const [editFacilityVillageId, setEditFacilityVillageId] = useState("");

  // Form states - Village
  const [villageName, setVillageName] = useState("");
  const [villageCode, setVillageCode] = useState("");

  // Edit states - Village
  const [editingVillage, setEditingVillage] = useState<Village | null>(null);
  const [editVillageName, setEditVillageName] = useState("");
  const [editVillageCode, setEditVillageCode] = useState("");

  // Form states - Staff
  const [staffIdentifier, setStaffIdentifier] = useState("");
  const [staffDisplayName, setStaffDisplayName] = useState("");
  const [staffRole, setStaffRole] = useState<"BIDAN" | "PUSKESMAS">("BIDAN");
  const [staffPassword, setStaffPassword] = useState("");

  // Edit states - Staff
  const [editingStaff, setEditingStaff] = useState<StaffSummary | null>(null);
  const [editStaffDisplayName, setEditStaffDisplayName] = useState("");
  const [editStaffPassword, setEditStaffPassword] = useState("");

  // Form states - Assignment
  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignVillageId, setAssignVillageId] = useState("");

  // Versioned Care Plan State
  const [carePlan, setCarePlan] = useState<AncPlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const fetchVillages = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/staff-proxy/staff/organization/villages");
      if (res.ok) {
        const data = (await res.json()) as readonly Village[];
        setVillages(data);
      }
    } catch {
      // Best-effort load
    }
  }, []);

  const fetchFacilities = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/staff-proxy/staff/organization/facilities");
      if (res.ok) {
        const data = (await res.json()) as readonly Facility[];
        setFacilities(data);
      }
    } catch {
      // Best-effort load
    }
  }, []);

  const fetchStaff = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/staff-proxy/staff/users");
      if (res.ok) {
        const data = (await res.json()) as readonly StaffSummary[];
        setStaffList(data);
      }
    } catch {
      // Best-effort load
    }
  }, []);

  const fetchAssignments = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/staff-proxy/staff/assignments");
      if (res.ok) {
        const data = (await res.json()) as readonly StaffAssignmentDetail[];
        setAssignments(data);
      }
    } catch {
      // Best-effort load
    }
  }, []);

  const fetchCarePlan = useCallback(async (): Promise<void> => {
    setLoadingPlan(true);
    try {
      const res = await fetch("/api/staff-proxy/staff/organization/careplan");
      if (res.ok) {
        const data = (await res.json()) as AncPlanResponse;
        setCarePlan(data);
      }
    } catch {
      // Best-effort load
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  useEffect(() => {
    if (userRole !== "PUSKESMAS") return;

    const controller = new AbortController();
    void loadData();
    return () => controller.abort();

    async function loadData(): Promise<void> {
      setLoadingData(true);
      try {
        await Promise.all([
          fetchFacilities(),
          fetchVillages(),
          fetchStaff(),
          fetchAssignments(),
          fetchCarePlan(),
        ]);
      } finally {
        setLoadingData(false);
      }
    }
  }, [userRole, fetchFacilities, fetchVillages, fetchStaff, fetchAssignments, fetchCarePlan]);

  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Akses Terbatas</span>
        <h3>Pengaturan Fasilitas &amp; Petugas Hanya Tersedia untuk Petugas Puskesmas</h3>
        <p>
          Manajemen organisasi faskes, desa binaan, dan akun staf bidan dikelola oleh Puskesmas.
        </p>
      </div>
    );
  }

  // --- FACILITY CRUD ---
  async function handleCreateFacility(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!facilityName.trim() || !facilityCode.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/staff/organization/facilities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: facilityCode.trim(),
          name: facilityName.trim(),
          facility_type: facilityType,
          village_id: facilityVillageId.trim() || null,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal mendaftarkan fasilitas baru.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Fasilitas "${facilityName}" (${facilityCode}) berhasil didaftarkan.`,
      });
      setFacilityName("");
      setFacilityCode("");
      setFacilityType("POSYANDU");
      setFacilityVillageId("");
      await fetchFacilities();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat mendaftarkan fasilitas." });
    } finally {
      setSubmitting(false);
    }
  }

  const startEditFacility = (f: Facility) => {
    setEditingFacility(f);
    setEditFacilityName(f.name);
    setEditFacilityCode(f.code);
    setEditFacilityType(f.facility_type);
    setEditFacilityVillageId(f.village_id ?? "");
  };

  async function handleUpdateFacility(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!editingFacility || !editFacilityName.trim() || !editFacilityCode.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/staff/organization/facilities/${encodeURIComponent(editingFacility.id)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: editFacilityName.trim(),
            code: editFacilityCode.trim(),
            facility_type: editFacilityType,
            village_id: editFacilityVillageId.trim() || null,
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal memperbarui data fasilitas.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Data fasilitas "${editFacilityName}" berhasil diperbarui.`,
      });
      setEditingFacility(null);
      await fetchFacilities();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat memperbarui fasilitas." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFacility(f: Facility): Promise<void> {
    if (!window.confirm(`Yakin ingin menghapus fasilitas "${f.name}" (${f.code})?`)) {
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/staff/organization/facilities/${encodeURIComponent(f.id)}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setFeedback({
          type: "error",
          message:
            data?.error?.message ??
            "Gagal menghapus fasilitas. Fasilitas mungkin masih terhubung dengan riwayat pemeriksaan.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Fasilitas "${f.name}" berhasil dihapus.`,
      });
      await fetchFacilities();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghapus fasilitas." });
    } finally {
      setSubmitting(false);
    }
  }

  // --- VILLAGE CRUD ---
  async function handleCreateVillage(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!villageName.trim() || !villageCode.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/staff/organization/villages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: villageCode.trim(),
          name: villageName.trim(),
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal mendaftarkan desa baru.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Desa "${villageName}" (${villageCode}) berhasil didaftarkan.`,
      });
      setVillageName("");
      setVillageCode("");
      await fetchVillages();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat mendaftarkan desa." });
    } finally {
      setSubmitting(false);
    }
  }

  const startEditVillage = (v: Village) => {
    setEditingVillage(v);
    setEditVillageName(v.name);
    setEditVillageCode(v.code);
  };

  async function handleUpdateVillage(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!editingVillage || !editVillageName.trim() || !editVillageCode.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/staff/organization/villages/${encodeURIComponent(editingVillage.id)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: editVillageName.trim(),
            code: editVillageCode.trim(),
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal memperbarui data desa.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Data desa "${editVillageName}" berhasil diperbarui.`,
      });
      setEditingVillage(null);
      await fetchVillages();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat memperbarui desa." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteVillage(v: Village): Promise<void> {
    if (!window.confirm(`Yakin ingin menghapus desa "${v.name}" (${v.code})?`)) {
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/staff/organization/villages/${encodeURIComponent(v.id)}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setFeedback({
          type: "error",
          message:
            data?.error?.message ??
            "Gagal menghapus desa. Desa mungkin masih memiliki data warga atau fasilitas terdaftar.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Desa "${v.name}" berhasil dihapus.`,
      });
      await fetchVillages();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghapus desa." });
    } finally {
      setSubmitting(false);
    }
  }

  // --- STAFF CRUD ---
  async function handleCreateStaff(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (
      !staffIdentifier.trim() ||
      !staffDisplayName.trim() ||
      !staffPassword.trim() ||
      staffPassword.length < 8
    ) {
      setFeedback({
        type: "error",
        message: "Semua field wajib diisi dan kata sandi minimal 8 karakter.",
      });
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/staff/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login_identifier: staffIdentifier.trim(),
          display_name: staffDisplayName.trim(),
          role: staffRole,
          password: staffPassword.trim(),
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal membuat akun staf baru.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Akun ${staffRole} "${staffDisplayName}" (@${staffIdentifier}) berhasil dibuat.`,
      });
      setStaffIdentifier("");
      setStaffDisplayName("");
      setStaffPassword("");
      await fetchStaff();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat membuat akun petugas." });
    } finally {
      setSubmitting(false);
    }
  }

  const startEditStaff = (s: StaffSummary) => {
    setEditingStaff(s);
    setEditStaffDisplayName(s.display_name);
    setEditStaffPassword("");
  };

  async function handleUpdateStaff(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!editingStaff || !editStaffDisplayName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const bodyPayload: { display_name: string; password?: string } = {
        display_name: editStaffDisplayName.trim(),
      };
      if (editStaffPassword.trim()) {
        bodyPayload.password = editStaffPassword.trim();
      }

      const res = await fetch(
        `/api/staff-proxy/staff/users/${encodeURIComponent(editingStaff.id)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bodyPayload),
        },
      );

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal memperbarui akun petugas.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Akun petugas "${editStaffDisplayName}" berhasil diperbarui.`,
      });
      setEditingStaff(null);
      await fetchStaff();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat memperbarui akun petugas." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStaffStatus(s: StaffSummary): Promise<void> {
    const nextStatus = s.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const promptMsg =
      nextStatus === "SUSPENDED"
        ? `Nonaktifkan akun Bidan "${s.display_name}"? Sesi aktifnya akan otomatis dicabut.`
        : `Aktifkan kembali akun Bidan "${s.display_name}"?`;

    if (!window.confirm(promptMsg)) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/staff-proxy/staff/users/${encodeURIComponent(s.id)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          reason:
            nextStatus === "SUSPENDED"
              ? "Dinonaktifkan oleh administrator Puskesmas"
              : "Diaktifkan kembali oleh administrator Puskesmas",
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal mengubah status akun.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Status akun "${s.display_name}" berhasil diubah menjadi ${nextStatus}.`,
      });
      await fetchStaff();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat mengubah status akun." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteStaff(s: StaffSummary): Promise<void> {
    if (
      !window.confirm(
        `Yakin ingin menghapus permanen akun Bidan "${s.display_name}" (@${s.login_identifier})?`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/staff-proxy/staff/users/${encodeURIComponent(s.id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setFeedback({
          type: "error",
          message:
            data?.error?.message ??
            "Gagal menghapus akun staf. Akun mungkin memiliki riwayat audit atau penugasan aktif.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Akun Bidan "${s.display_name}" berhasil dihapus.`,
      });
      await fetchStaff();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghapus akun petugas." });
    } finally {
      setSubmitting(false);
    }
  }

  // --- ASSIGNMENT CRUD ---
  async function handleAssignVillage(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!assignStaffId || !assignVillageId) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/staff/users/${encodeURIComponent(assignStaffId)}/assignments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scope_type: "VILLAGE",
            scope_id: assignVillageId,
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menetapkan penugasan wilayah.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: "Penugasan wilayah desa berhasil disimpan.",
      });
      setAssignStaffId("");
      setAssignVillageId("");
      await fetchAssignments();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menyimpan penugasan." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeAssignment(assignmentId: string): Promise<void> {
    if (!window.confirm("Cabut penugasan wilayah desa untuk petugas ini?")) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/staff/assignments/${encodeURIComponent(assignmentId)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason: "Dicabut oleh administrator Puskesmas",
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal mencabut penugasan wilayah.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: "Penugasan wilayah desa berhasil dicabut.",
      });
      await fetchAssignments();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat mencabut penugasan." });
    } finally {
      setSubmitting(false);
    }
  }

  const bidanUsers = staffList.filter((s) => s.role === "BIDAN" && s.status === "ACTIVE");

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Administrasi Wilayah</span>
          <h2>Pengaturan Fasilitas &amp; Petugas</h2>
          <p className="field-hint">
            Kelola fasilitas kesehatan, desa binaan, dan akun staf bidan.
          </p>
        </div>
      </header>

      {/* Sub-tab Navigation */}
      <div className="admin-subtab-bar" role="tablist" aria-label="Navigasi Administrasi Wilayah">
        <button
          className={`admin-subtab-btn ${activeSubTab === "facilities" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeSubTab === "facilities"}
          onClick={() => {
            setActiveSubTab("facilities");
            setFeedback(null);
          }}
        >
          <span className="admin-subtab-btn-content">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <path
                d="M3 17V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12M2 17h16M7 7h6M10 4v6M8 17v-4h4v4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Fasilitas</span>
          </span>
          <span className="admin-subtab-badge">{facilities.length}</span>
        </button>

        <button
          className={`admin-subtab-btn ${activeSubTab === "villages" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeSubTab === "villages"}
          onClick={() => {
            setActiveSubTab("villages");
            setFeedback(null);
          }}
        >
          <span className="admin-subtab-btn-content">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <path
                d="M10 2a5 5 0 0 0-5 5c0 3.75 5 9 5 9s5-5.25 5-9a5 5 0 0 0-5-5Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="7" r="1.75" />
            </svg>
            <span>Desa Binaan</span>
          </span>
          <span className="admin-subtab-badge">{villages.length}</span>
        </button>

        <button
          className={`admin-subtab-btn ${activeSubTab === "staff" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeSubTab === "staff"}
          onClick={() => {
            setActiveSubTab("staff");
            setFeedback(null);
          }}
        >
          <span className="admin-subtab-btn-content">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <path
                d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM4 17a6 6 0 0 1 12 0"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Akun Staf Bidan</span>
          </span>
          <span className="admin-subtab-badge">{staffList.length}</span>
        </button>

        <button
          className={`admin-subtab-btn ${activeSubTab === "assignments" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeSubTab === "assignments"}
          onClick={() => {
            setActiveSubTab("assignments");
            setFeedback(null);
          }}
        >
          <span className="admin-subtab-btn-content">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <path d="M4 4h12v12H4zM4 8h12M8 4v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Penugasan Wilayah</span>
          </span>
          <span className="admin-subtab-badge">{assignments.length}</span>
        </button>

        <button
          className={`admin-subtab-btn ${activeSubTab === "careplan" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeSubTab === "careplan"}
          onClick={() => {
            setActiveSubTab("careplan");
            setFeedback(null);
          }}
        >
          <span className="admin-subtab-btn-content">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <path
                d="M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 7h6M7 10h6M7 13h4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Aturan Jadwal ANC</span>
          </span>
          <span className="admin-subtab-badge">K1–K8</span>
        </button>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
          style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      {loadingData && (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--ink-muted)" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 0.5rem" }} />
          <p>Memuat konfigurasi organisasi Puskesmas...</p>
        </div>
      )}

      {/* Sub-tab 1: Facilities */}
      {!loadingData && activeSubTab === "facilities" && (
        <AdminFacilitiesTab
          facilities={facilities}
          villages={villages}
          facilityName={facilityName}
          facilityCode={facilityCode}
          facilityType={facilityType}
          facilityVillageId={facilityVillageId}
          submitting={submitting}
          editingFacility={editingFacility}
          editFacilityName={editFacilityName}
          editFacilityCode={editFacilityCode}
          editFacilityType={editFacilityType}
          editFacilityVillageId={editFacilityVillageId}
          onFacilityNameChange={setFacilityName}
          onFacilityCodeChange={setFacilityCode}
          onFacilityTypeChange={setFacilityType}
          onFacilityVillageIdChange={setFacilityVillageId}
          onEditFacilityNameChange={setEditFacilityName}
          onEditFacilityCodeChange={setEditFacilityCode}
          onEditFacilityTypeChange={setEditFacilityType}
          onEditFacilityVillageIdChange={setEditFacilityVillageId}
          onCreateFacility={(e) => void handleCreateFacility(e)}
          onUpdateFacility={(e) => void handleUpdateFacility(e)}
          onDeleteFacility={(f) => void handleDeleteFacility(f)}
          onStartEditFacility={startEditFacility}
          onCancelEditFacility={() => setEditingFacility(null)}
        />
      )}

      {/* Sub-tab 2: Villages */}
      {!loadingData && activeSubTab === "villages" && (
        <AdminVillagesTab
          villages={villages}
          villageName={villageName}
          villageCode={villageCode}
          submitting={submitting}
          editingVillage={editingVillage}
          editVillageName={editVillageName}
          editVillageCode={editVillageCode}
          onVillageNameChange={setVillageName}
          onVillageCodeChange={setVillageCode}
          onEditVillageNameChange={setEditVillageName}
          onEditVillageCodeChange={setEditVillageCode}
          onCreateVillage={(e) => void handleCreateVillage(e)}
          onUpdateVillage={(e) => void handleUpdateVillage(e)}
          onDeleteVillage={(v) => void handleDeleteVillage(v)}
          onStartEditVillage={startEditVillage}
          onCancelEditVillage={() => setEditingVillage(null)}
        />
      )}

      {/* Sub-tab 3: Staff */}
      {!loadingData && activeSubTab === "staff" && (
        <AdminStaffTab
          staffList={staffList}
          staffIdentifier={staffIdentifier}
          staffDisplayName={staffDisplayName}
          staffRole={staffRole}
          staffPassword={staffPassword}
          submitting={submitting}
          editingStaff={editingStaff}
          editStaffDisplayName={editStaffDisplayName}
          editStaffPassword={editStaffPassword}
          onStaffIdentifierChange={setStaffIdentifier}
          onStaffDisplayNameChange={setStaffDisplayName}
          onStaffRoleChange={setStaffRole}
          onStaffPasswordChange={setStaffPassword}
          onEditStaffDisplayNameChange={setEditStaffDisplayName}
          onEditStaffPasswordChange={setEditStaffPassword}
          onCreateStaff={(e) => void handleCreateStaff(e)}
          onUpdateStaff={(e) => void handleUpdateStaff(e)}
          onToggleStaffStatus={(s) => void handleToggleStaffStatus(s)}
          onDeleteStaff={(s) => void handleDeleteStaff(s)}
          onStartEditStaff={startEditStaff}
          onCancelEditStaff={() => setEditingStaff(null)}
        />
      )}

      {/* Sub-tab 4: Assignments */}
      {!loadingData && activeSubTab === "assignments" && (
        <AdminAssignmentsTab
          assignments={assignments}
          bidanUsers={bidanUsers}
          villages={villages}
          assignStaffId={assignStaffId}
          assignVillageId={assignVillageId}
          submitting={submitting}
          onAssignStaffIdChange={setAssignStaffId}
          onAssignVillageIdChange={setAssignVillageId}
          onAssignVillage={(e) => void handleAssignVillage(e)}
          onRevokeAssignment={(id) => void handleRevokeAssignment(id)}
        />
      )}

      {/* Sub-tab 5: Care Plan */}
      {!loadingData && activeSubTab === "careplan" && (
        <AdminCarePlanTab carePlan={carePlan} loadingPlan={loadingPlan} staffList={staffList} />
      )}
    </div>
  );
}
