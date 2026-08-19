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

  const fetchActiveCarePlan = useCallback(async (): Promise<void> => {
    setLoadingPlan(true);
    try {
      const res = await fetch("/api/staff-proxy/anc-plan/active");
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

  // Initial load
  useEffect(() => {
    if (userRole !== "PUSKESMAS") return;

    async function loadData(): Promise<void> {
      setLoadingData(true);
      try {
        await Promise.all([fetchVillages(), fetchFacilities(), fetchStaff(), fetchAssignments()]);
      } finally {
        setLoadingData(false);
      }
    }

    void loadData();
  }, [userRole, fetchVillages, fetchFacilities, fetchStaff, fetchAssignments]);

  // Subtab-specific load
  useEffect(() => {
    if (activeSubTab === "careplan" && userRole === "PUSKESMAS") {
      void fetchActiveCarePlan();
    }
    if (activeSubTab === "assignments" && userRole === "PUSKESMAS") {
      void fetchAssignments();
    }
  }, [activeSubTab, userRole, fetchActiveCarePlan, fetchAssignments]);

  // Auto-fill codes when names change if code is empty or untouched
  const handleFacilityNameChange = (val: string) => {
    setFacilityName(val);
    if (!facilityCode || facilityCode.startsWith("POS_") || facilityCode.startsWith("PKM_")) {
      const slug = val
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 30);
      setFacilityCode(slug ? (facilityType === "PUSKESMAS" ? `PKM_${slug}` : `POS_${slug}`) : "");
    }
  };

  const handleVillageNameChange = (val: string) => {
    setVillageName(val);
    if (!villageCode || villageCode.startsWith("DS_")) {
      const slug = val
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 30);
      setVillageCode(slug ? `DS_${slug}` : "");
    }
  };

  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Akses Terbatas</span>
        <h3>Administrasi Organisasi Khusus Puskesmas</h3>
        <p>
          Pengelolaan fasilitas, desa, akun petugas, penugasan wilayah kerja, dan aturan klinis
          K1-K8 hanya dapat diakses oleh akun berwenang Puskesmas.
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
        message: `Fasilitas "${facilityName}" (${facilityCode}) berhasil didaftarkan ke Supabase.`,
      });
      setFacilityName("");
      setFacilityCode("");
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
        message: `Data fasilitas "${editFacilityName}" berhasil diperbarui di Supabase.`,
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
    if (!window.confirm(`Yakin ingin menghapus fasilitas "${f.name}" (${f.code}) dari Supabase?`)) {
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
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
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
        message: `Fasilitas "${f.name}" berhasil dihapus dari Supabase.`,
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
        message: `Desa "${villageName}" (${villageCode}) berhasil didaftarkan ke Supabase.`,
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
        message: `Data desa "${editVillageName}" berhasil diperbarui di Supabase.`,
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
    if (!window.confirm(`Yakin ingin menghapus desa "${v.name}" (${v.code}) dari Supabase?`)) {
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
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setFeedback({
          type: "error",
          message:
            data?.error?.message ??
            "Gagal menghapus desa. Desa mungkin masih terhubung dengan fasilitas atau ibu hamil.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Desa "${v.name}" berhasil dihapus dari Supabase.`,
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
    if (!staffIdentifier.trim() || !staffDisplayName.trim() || !staffPassword.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/staff/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login_identifier: staffIdentifier.trim(),
          display_name: staffDisplayName.trim(),
          role: "BIDAN",
          password: staffPassword,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal membuat akun Bidan baru.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Akun Bidan "${staffDisplayName}" (@${staffIdentifier}) berhasil dibuat di Supabase.`,
      });
      setStaffIdentifier("");
      setStaffDisplayName("");
      setStaffPassword("");
      await fetchStaff();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat membuat akun Bidan." });
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
        message: `Akun petugas "${editStaffDisplayName}" berhasil diperbarui di Supabase.`,
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
      const res = await fetch(
        `/api/staff-proxy/staff/users/${encodeURIComponent(s.id)}/status`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: nextStatus,
            reason:
              nextStatus === "SUSPENDED"
                ? "Dinonaktifkan oleh administrator Puskesmas"
                : "Diaktifkan kembali oleh administrator Puskesmas",
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
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
    if (!window.confirm(`Yakin ingin menghapus permanen akun Bidan "${s.display_name}" (@${s.login_identifier}) dari Supabase?`)) {
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/staff/users/${encodeURIComponent(s.id)}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menghapus akun petugas.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Akun Bidan "${s.display_name}" berhasil dihapus dari Supabase.`,
      });
      await fetchStaff();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghapus akun." });
    } finally {
      setSubmitting(false);
    }
  }

  // --- ASSIGNMENT CRUD ---
  async function handleAssignVillage(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!assignStaffId.trim() || !assignVillageId.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/staff/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          staff_user_id: assignStaffId.trim(),
          scope_type: "AREA",
          scope_id: assignVillageId.trim(),
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menetapkan penugasan wilayah Bidan.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: "Penugasan desa untuk Bidan berhasil disimpan ke Supabase.",
      });
      setAssignStaffId("");
      setAssignVillageId("");
      await fetchAssignments();
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menyimpan penugasan desa." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeAssignment(assignmentId: string): Promise<void> {
    if (!window.confirm("Cabut penugasan wilayah desa ini untuk Bidan yang bersangkutan?")) {
      return;
    }
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
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal mencabut penugasan wilayah.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: "Penugasan wilayah desa berhasil dicabut dari Supabase.",
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
          <span className="staff-kicker">Administrasi & Konfigurasi Organisasi</span>
          <h2>Pengelolaan Wilayah, Petugas & Aturan Klinis</h2>
        </div>
      </header>

      {/* Sub-tab Navigation */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button
          className={activeSubTab === "facilities" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => {
            setActiveSubTab("facilities");
            setFeedback(null);
          }}
        >
          Fasilitas Kesehatan ({facilities.length})
        </button>
        <button
          className={activeSubTab === "villages" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => {
            setActiveSubTab("villages");
            setFeedback(null);
          }}
        >
          Desa / Kelurahan ({villages.length})
        </button>
        <button
          className={activeSubTab === "staff" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => {
            setActiveSubTab("staff");
            setFeedback(null);
          }}
        >
          Akun Bidan & Petugas ({staffList.length})
        </button>
        <button
          className={activeSubTab === "assignments" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => {
            setActiveSubTab("assignments");
            setFeedback(null);
          }}
        >
          Penugasan Wilayah ({assignments.length})
        </button>
        <button
          className={activeSubTab === "careplan" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => {
            setActiveSubTab("careplan");
            setFeedback(null);
          }}
        >
          Aturan Klinis K1-K8
        </button>
      </div>

      {feedback && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
          style={{ marginBottom: "1rem" }}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      {/* Sub-tab: Facilities */}
      {activeSubTab === "facilities" && (
        <div>
          {editingFacility ? (
            <div style={{ padding: "1.25rem", background: "var(--color-surface, #f8fafc)", borderRadius: "8px", border: "2px solid var(--color-primary, #0284c7)", marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>✏️ Ubah Data Fasilitas</h3>
                <button className="btn-secondary" type="button" onClick={() => setEditingFacility(null)}>
                  Batal
                </button>
              </div>
              <form onSubmit={(e) => void handleUpdateFacility(e)} className="staff-form-grid">
                <div className="form-group">
                  <label htmlFor="editFacilityName">Nama Fasilitas *</label>
                  <input
                    id="editFacilityName"
                    className="staff-input"
                    type="text"
                    value={editFacilityName}
                    onChange={(e) => setEditFacilityName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editFacilityCode">Kode Fasilitas *</label>
                  <input
                    id="editFacilityCode"
                    className="staff-input"
                    type="text"
                    value={editFacilityCode}
                    onChange={(e) => setEditFacilityCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editFacilityType">Tipe Fasilitas *</label>
                  <select
                    id="editFacilityType"
                    className="staff-input"
                    value={editFacilityType}
                    onChange={(e) => setEditFacilityType(e.target.value as FacilityType)}
                  >
                    <option value="POSYANDU">POSYANDU</option>
                    <option value="PUSKESMAS">PUSKESMAS</option>
                    <option value="MIDWIFE_PRACTICE">MIDWIFE_PRACTICE</option>
                    <option value="PONED">PONED</option>
                    <option value="HOSPITAL">HOSPITAL</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="editFacilityVillageId">Desa / Kelurahan</label>
                  <select
                    id="editFacilityVillageId"
                    className="staff-input"
                    value={editFacilityVillageId}
                    onChange={(e) => setEditFacilityVillageId(e.target.value)}
                  >
                    <option value="">-- Tanpa Desa / Cakupan Luas --</option>
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <button className="btn-primary" type="submit" disabled={submitting}>
                    {submitting ? "Menyimpan Perubahan..." : "Simpan Perubahan Fasilitas"}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setEditingFacility(null)}>
                    Batal
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <form onSubmit={(e) => void handleCreateFacility(e)} className="staff-form-grid" style={{ marginBottom: "2rem" }}>
              <h3>Tambah Fasilitas Kesehatan Baru</h3>
              <div className="form-group">
                <label htmlFor="facilityName">Nama Fasilitas</label>
                <input
                  id="facilityName"
                  className="staff-input"
                  type="text"
                  placeholder="Contoh: Posyandu Melati 02"
                  value={facilityName}
                  onChange={(e) => handleFacilityNameChange(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="facilityCode">Kode Fasilitas (Identifier Unik)</label>
                <input
                  id="facilityCode"
                  className="staff-input"
                  type="text"
                  placeholder="Contoh: POS_MELATI_02"
                  value={facilityCode}
                  onChange={(e) => setFacilityCode(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="facilityType">Tipe Fasilitas</label>
                <select
                  id="facilityType"
                  className="staff-input"
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value as FacilityType)}
                >
                  <option value="POSYANDU">POSYANDU (Pos Pelayanan Terpadu)</option>
                  <option value="PUSKESMAS">PUSKESMAS (Pusat Kesehatan Masyarakat)</option>
                  <option value="MIDWIFE_PRACTICE">MIDWIFE_PRACTICE (Praktik Mandiri Bidan)</option>
                  <option value="PONED">PONED (Pelayanan Obstetri Neonatal Emergensi Dasar)</option>
                  <option value="HOSPITAL">HOSPITAL (Rumah Sakit Rujukan)</option>
                  <option value="OTHER">OTHER (Lainnya)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="facilityVillageId">Desa / Kelurahan (Opsional)</label>
                <select
                  id="facilityVillageId"
                  className="staff-input"
                  value={facilityVillageId}
                  onChange={(e) => setFacilityVillageId(e.target.value)}
                >
                  <option value="">-- Tanpa Desa / Cakupan Luas --</option>
                  {villages.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.code})
                    </option>
                  ))}
                </select>
              </div>

              <button className="btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Menyimpan ke Supabase..." : "Simpan Fasilitas"}
              </button>
            </form>
          )}

          <h4>Daftar Fasilitas Terdaftar ({facilities.length})</h4>
          {facilities.length === 0 ? (
            <p className="empty-notice">{loadingData ? "Memuat data fasilitas..." : "Belum ada fasilitas terdaftar."}</p>
          ) : (
            <div className="table-responsive">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama Fasilitas</th>
                    <th>Tipe</th>
                    <th>Status</th>
                    <th style={{ textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {facilities.map((f) => (
                    <tr key={f.id}>
                      <td><span className="badge-code">{f.code}</span></td>
                      <td><strong>{f.name}</strong></td>
                      <td><span className="badge-action">{f.facility_type}</span></td>
                      <td><span className="badge-status status-completed">{f.status}</span></td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                          <button
                            className="btn-secondary"
                            type="button"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                            onClick={() => startEditFacility(f)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="btn-danger"
                            type="button"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                            onClick={() => void handleDeleteFacility(f)}
                            disabled={submitting}
                          >
                            🗑️ Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab: Villages */}
      {activeSubTab === "villages" && (
        <div>
          {editingVillage ? (
            <div style={{ padding: "1.25rem", background: "var(--color-surface, #f8fafc)", borderRadius: "8px", border: "2px solid var(--color-primary, #0284c7)", marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>✏️ Ubah Data Desa / Kelurahan</h3>
                <button className="btn-secondary" type="button" onClick={() => setEditingVillage(null)}>
                  Batal
                </button>
              </div>
              <form onSubmit={(e) => void handleUpdateVillage(e)} className="staff-form-grid">
                <div className="form-group">
                  <label htmlFor="editVillageName">Nama Desa *</label>
                  <input
                    id="editVillageName"
                    className="staff-input"
                    type="text"
                    value={editVillageName}
                    onChange={(e) => setEditVillageName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editVillageCode">Kode Desa *</label>
                  <input
                    id="editVillageCode"
                    className="staff-input"
                    type="text"
                    value={editVillageCode}
                    onChange={(e) => setEditVillageCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <button className="btn-primary" type="submit" disabled={submitting}>
                    {submitting ? "Menyimpan Perubahan..." : "Simpan Perubahan Desa"}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setEditingVillage(null)}>
                    Batal
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <form onSubmit={(e) => void handleCreateVillage(e)} className="staff-form-grid" style={{ marginBottom: "2rem" }}>
              <h3>Tambah Desa / Kelurahan Baru</h3>
              <div className="form-group">
                <label htmlFor="villageName">Nama Desa</label>
                <input
                  id="villageName"
                  className="staff-input"
                  type="text"
                  placeholder="Contoh: Desa Kuncir Barat"
                  value={villageName}
                  onChange={(e) => handleVillageNameChange(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="villageCode">Kode Desa (Identifier Unik)</label>
                <input
                  id="villageCode"
                  className="staff-input"
                  type="text"
                  placeholder="Contoh: DS_KUNCIR_BARAT"
                  value={villageCode}
                  onChange={(e) => setVillageCode(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <button className="btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Menyimpan ke Supabase..." : "Simpan Desa"}
              </button>
            </form>
          )}

          <h4>Daftar Desa Terdaftar ({villages.length})</h4>
          {villages.length === 0 ? (
            <p className="empty-notice">{loadingData ? "Memuat data desa..." : "Belum ada desa terdaftar."}</p>
          ) : (
            <div className="table-responsive">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Kode Desa</th>
                    <th>Nama Desa</th>
                    <th>Status</th>
                    <th style={{ textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {villages.map((v) => (
                    <tr key={v.id}>
                      <td><span className="badge-code">{v.code}</span></td>
                      <td><strong>{v.name}</strong></td>
                      <td><span className="badge-status status-completed">{v.status}</span></td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                          <button
                            className="btn-secondary"
                            type="button"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                            onClick={() => startEditVillage(v)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="btn-danger"
                            type="button"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                            onClick={() => void handleDeleteVillage(v)}
                            disabled={submitting}
                          >
                            🗑️ Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab: Staff Accounts */}
      {activeSubTab === "staff" && (
        <div>
          {editingStaff ? (
            <div style={{ padding: "1.25rem", background: "var(--color-surface, #f8fafc)", borderRadius: "8px", border: "2px solid var(--color-primary, #0284c7)", marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>✏️ Ubah Data Akun Petugas (@{editingStaff.login_identifier})</h3>
                <button className="btn-secondary" type="button" onClick={() => setEditingStaff(null)}>
                  Batal
                </button>
              </div>
              <form onSubmit={(e) => void handleUpdateStaff(e)} className="staff-form-grid">
                <div className="form-group">
                  <label htmlFor="editStaffDisplayName">Nama Lengkap &amp; Gelar *</label>
                  <input
                    id="editStaffDisplayName"
                    className="staff-input"
                    type="text"
                    value={editStaffDisplayName}
                    onChange={(e) => setEditStaffDisplayName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editStaffPassword">Reset Kata Sandi (Kosongkan jika tidak ingin mengubah)</label>
                  <input
                    id="editStaffPassword"
                    className="staff-input"
                    type="password"
                    placeholder="Masukkan sandi baru (min 12 karakter)"
                    value={editStaffPassword}
                    onChange={(e) => setEditStaffPassword(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <button className="btn-primary" type="submit" disabled={submitting}>
                    {submitting ? "Menyimpan Perubahan..." : "Simpan Perubahan Akun"}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setEditingStaff(null)}>
                    Batal
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <form onSubmit={(e) => void handleCreateStaff(e)} className="staff-form-grid" style={{ marginBottom: "2rem" }}>
              <h3>Buat Akun Bidan Baru</h3>
              <div className="form-group">
                <label htmlFor="staffIdentifier">Identifier Login (Username)</label>
                <input
                  id="staffIdentifier"
                  className="staff-input"
                  type="text"
                  placeholder="Contoh: bidan.ani"
                  value={staffIdentifier}
                  onChange={(e) => setStaffIdentifier(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="staffDisplayName">Nama Lengkap Petugas & Gelar</label>
                <input
                  id="staffDisplayName"
                  className="staff-input"
                  type="text"
                  placeholder="Contoh: Bidan Ani Sulastri, S.Tr.Keb"
                  value={staffDisplayName}
                  onChange={(e) => setStaffDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="staffPassword">Kata Sandi Awal (Minimal 12 karakter kombinasi huruf & angka)</label>
                <input
                  id="staffPassword"
                  className="staff-input"
                  type="password"
                  placeholder="Contoh: PosyanduKuncir2026!"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  required
                />
              </div>

              <button className="btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Membuat Akun di Supabase..." : "Buat Akun Bidan"}
              </button>
            </form>
          )}

          <h4>Daftar Akun Petugas & Bidan ({staffList.length})</h4>
          {staffList.length === 0 ? (
            <p className="empty-notice">{loadingData ? "Memuat data petugas..." : "Belum ada petugas terdaftar."}</p>
          ) : (
            <div className="table-responsive">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Nama Petugas</th>
                    <th>Peran</th>
                    <th>Status</th>
                    <th style={{ textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((s) => (
                    <tr key={s.id}>
                      <td><span className="badge-code">@{s.login_identifier}</span></td>
                      <td><strong>{s.display_name}</strong></td>
                      <td><span className="badge-action">{s.role}</span></td>
                      <td>
                        <span className={`badge-status status-${s.status === "ACTIVE" ? "completed" : "overdue"}`}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {s.role === "BIDAN" ? (
                          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                            <button
                              className="btn-secondary"
                              type="button"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                              onClick={() => startEditStaff(s)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              className={s.status === "ACTIVE" ? "btn-secondary" : "btn-primary"}
                              type="button"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                              onClick={() => void handleToggleStaffStatus(s)}
                              disabled={submitting}
                            >
                              {s.status === "ACTIVE" ? "⏸️ Suspend" : "▶️ Aktifkan"}
                            </button>
                            <button
                              className="btn-danger"
                              type="button"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                              onClick={() => void handleDeleteStaff(s)}
                              disabled={submitting}
                            >
                              🗑️ Hapus
                            </button>
                          </div>
                        ) : (
                          <small style={{ color: "var(--color-ink-muted)" }}>Admin Inti</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab: Bidan Village Assignments */}
      {activeSubTab === "assignments" && (
        <div>
          <form onSubmit={(e) => void handleAssignVillage(e)} className="staff-form-grid" style={{ marginBottom: "2rem" }}>
            <h3>Tetapkan Penugasan Wilayah Kerja Bidan</h3>
            <p className="field-hint">
              Bidan Desa hanya dapat mengakses dan mengonfirmasi ibu hamil yang berdomisili di desa
              terpenuhi penugasannya.
            </p>

            <div className="form-group">
              <label htmlFor="assignStaffId">Pilih Akun Bidan</label>
              <select
                id="assignStaffId"
                className="staff-input"
                value={assignStaffId}
                onChange={(e) => setAssignStaffId(e.target.value)}
                required
              >
                <option value="">-- Pilih Petugas Bidan --</option>
                {bidanUsers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.display_name} (@{b.login_identifier})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="assignVillageId">Pilih Desa Penugasan</label>
              <select
                id="assignVillageId"
                className="staff-input"
                value={assignVillageId}
                onChange={(e) => setAssignVillageId(e.target.value)}
                required
              >
                <option value="">-- Pilih Desa / Kelurahan --</option>
                {villages.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.code})
                  </option>
                ))}
              </select>
            </div>

            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Menyimpan Penugasan..." : "Tetapkan Wilayah Desa"}
            </button>
          </form>

          <h4>Daftar Penugasan Wilayah Aktif ({assignments.length})</h4>
          {assignments.length === 0 ? (
            <p className="empty-notice">{loadingData ? "Memuat penugasan..." : "Belum ada penugasan wilayah aktif."}</p>
          ) : (
            <div className="table-responsive">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Nama Petugas Bidan</th>
                    <th>Username</th>
                    <th>Tipe Cakupan</th>
                    <th>Wilayah Penugasan</th>
                    <th style={{ textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.staff_name}</strong></td>
                      <td><span className="badge-code">@{a.staff_identifier}</span></td>
                      <td><span className="badge-action">{a.scope_type}</span></td>
                      <td>{a.village_name ?? "Seluruh Wilayah"}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className="btn-danger"
                          type="button"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                          onClick={() => void handleRevokeAssignment(a.id)}
                          disabled={submitting}
                        >
                          Cabut Penugasan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TASK-P5-005: Versioned ANC Care Plan & Milestone Rules */}
      {activeSubTab === "careplan" && (
        <div className="queue-section">
          <h3>Konfigurasi Aturan Klinis ANC Versioned (TASK-P5-005)</h3>

          <div className="staff-alert alert-warning" style={{ marginBottom: "1rem" }}>
            <p>
              <strong>Status Plan Klinis: SYNTHETIC DRAFT (Locked for Testing)</strong>
              <br />
              Sesuai kebijakan tata kelola klinis (ADR-CLINICAL, OPEN-CLIN-001), plan aktif saat ini
              terkunci pada mode <em>SYNTHETIC DRAFT</em>. Perubahan aturan produksi wajib memiliki
              grant persetujuan dari Clinical Program Owner.
            </p>
          </div>

          {loadingPlan ? (
            <p className="empty-notice">Memuat aturan klinis ANC aktif...</p>
          ) : carePlan === null ? (
            <p className="empty-notice">Gagal memuat aturan plan klinis.</p>
          ) : (
            <div>
              <div className="metrics-row" style={{ marginBottom: "1rem" }}>
                <div className="metric-card">
                  <span className="metric-label">Versi Plan</span>
                  <strong className="metric-value">v{carePlan.version_no}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Status Persetujuan</span>
                  <strong className="metric-value text-due">{carePlan.status}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Clinical Owner</span>
                  <strong className="metric-value">
                    {carePlan.approved_by_staff_id ?? "Belum Ditetapkan"}
                  </strong>
                </div>
              </div>

              <h4>Daftar Aturan Milestone K1–K8 Aktiv</h4>
              <div className="table-responsive">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Trimester</th>
                      <th>Rentang Minggu Target</th>
                      <th>Kebijakan Fasilitas</th>
                      <th>Fasilitas Diizinkan</th>
                      <th>Validasi Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carePlan.rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <span className="badge-code">{rule.code}</span>
                        </td>
                        <td>{rule.trimester_label}</td>
                        <td>
                          {rule.target_week_start !== null && rule.target_week_end !== null
                            ? `${rule.target_week_start} - ${rule.target_week_end} mgg`
                            : "Sesuai Jadwal"}
                        </td>
                        <td>
                          <span className="badge-action">{rule.required_facility_policy}</span>
                        </td>
                        <td>{rule.allowed_facility_types.join(", ")}</td>
                        <td>
                          <span
                            className={`badge-status status-${
                              ["K1", "K2", "K3", "K4", "K5", "K6"].includes(rule.code)
                                ? "overdue"
                                : "upcoming"
                            }`}
                          >
                            {["K1", "K2", "K3", "K4", "K5", "K6"].includes(rule.code)
                              ? "MANDATORY"
                              : "NONE"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
