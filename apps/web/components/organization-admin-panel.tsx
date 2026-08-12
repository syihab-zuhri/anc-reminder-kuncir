"use client";

import { useState } from "react";

interface OrganizationAdminPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
  readonly healthCenterId: string | null;
}

export function OrganizationAdminPanel({ userRole, healthCenterId }: OrganizationAdminPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "facilities" | "villages" | "staff" | "assignments"
  >("facilities");

  // Form states
  const [facilityName, setFacilityName] = useState("");
  const [facilityType, setFacilityType] = useState<
    "PUSKESMAS" | "POSYANDU" | "KLINIK_PRIVATE" | "RUMAH_SAKIT"
  >("POSYANDU");
  const [facilityVillageId, setFacilityVillageId] = useState("");

  const [villageName, setVillageName] = useState("");
  const [villageDistrict, setVillageDistrict] = useState("Kecamatan Kuncir");

  const [staffIdentifier, setStaffIdentifier] = useState("");
  const [staffDisplayName, setStaffDisplayName] = useState("");
  const [staffRole, setStaffRole] = useState<"PUSKESMAS" | "BIDAN">("BIDAN");
  const [staffPassword, setStaffPassword] = useState("");

  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignVillageId, setAssignVillageId] = useState("");

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Akses Terbatas</span>
        <h3>Administrasi Organisasi Khusus Puskesmas</h3>
        <p>
          Pengelolaan fasilitas, desa, akun petugas, dan penugasan wilayah kerja hanya dapat diakses
          oleh akun berwenang Puskesmas.
        </p>
      </div>
    );
  }

  async function handleCreateFacility(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!facilityName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/organization/facilities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          health_center_id: healthCenterId,
          name: facilityName.trim(),
          type: facilityType,
          village_id: facilityVillageId.trim() || null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menambahkan fasilitas.",
        });
        return;
      }
      setFeedback({
        type: "success",
        message: `Fasilitas "${facilityName}" berhasil ditambahkan.`,
      });
      setFacilityName("");
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghubungi server." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateVillage(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!villageName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/organization/villages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          health_center_id: healthCenterId,
          name: villageName.trim(),
          district_name: villageDistrict.trim() || null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ type: "error", message: data?.error?.message ?? "Gagal menambahkan desa." });
        return;
      }
      setFeedback({
        type: "success",
        message: `Desa/Kelurahan "${villageName}" berhasil didaftarkan.`,
      });
      setVillageName("");
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghubungi server." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateStaff(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!staffIdentifier.trim() || !staffDisplayName.trim() || !staffPassword.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/organization/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          health_center_id: healthCenterId,
          login_identifier: staffIdentifier.trim(),
          display_name: staffDisplayName.trim(),
          role: staffRole,
          password: staffPassword,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal membuat akun petugas.",
        });
        return;
      }
      setFeedback({
        type: "success",
        message: `Akun petugas "${staffDisplayName}" (${staffRole}) berhasil dibuat.`,
      });
      setStaffIdentifier("");
      setStaffDisplayName("");
      setStaffPassword("");
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghubungi server." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignVillage(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!assignStaffId.trim() || !assignVillageId.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/organization/staff/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          staff_user_id: assignStaffId.trim(),
          village_id: assignVillageId.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal memberikan penugasan desa.",
        });
        return;
      }
      setFeedback({ type: "success", message: "Penugasan wilayah desa berhasil disimpan." });
      setAssignStaffId("");
      setAssignVillageId("");
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghubungi server." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">TASK-P3-001 / Admin Organisasi</span>
          <h2>Pengelolaan Struktur &amp; Akun Petugas</h2>
        </div>
      </header>

      <nav className="staff-tab-nav" aria-label="Menu administrasi organisasi">
        <button
          type="button"
          className={activeSubTab === "facilities" ? "is-active" : ""}
          onClick={() => setActiveSubTab("facilities")}
        >
          Fasilitas
        </button>
        <button
          type="button"
          className={activeSubTab === "villages" ? "is-active" : ""}
          onClick={() => setActiveSubTab("villages")}
        >
          Desa / Wilayah
        </button>
        <button
          type="button"
          className={activeSubTab === "staff" ? "is-active" : ""}
          onClick={() => setActiveSubTab("staff")}
        >
          Akun Petugas
        </button>
        <button
          type="button"
          className={activeSubTab === "assignments" ? "is-active" : ""}
          onClick={() => setActiveSubTab("assignments")}
        >
          Penugasan Bidan
        </button>
      </nav>

      {feedback && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      {activeSubTab === "facilities" && (
        <form className="staff-form-grid" onSubmit={handleCreateFacility}>
          <h3>Tambah Fasilitas Kesehatan</h3>
          <div className="form-group">
            <label htmlFor="facility-name">Nama Fasilitas *</label>
            <input
              id="facility-name"
              type="text"
              required
              placeholder="e.g. Posyandu Mawar Kuncir"
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="facility-type">Tipe Fasilitas *</label>
            <select
              id="facility-type"
              value={facilityType}
              onChange={(e) =>
                setFacilityType(
                  e.target.value as "PUSKESMAS" | "POSYANDU" | "KLINIK_PRIVATE" | "RUMAH_SAKIT",
                )
              }
            >
              <option value="POSYANDU">Posyandu</option>
              <option value="PUSKESMAS">Puskesmas</option>
              <option value="KLINIK_PRIVATE">Klinik Swasta / Mandiri</option>
              <option value="RUMAH_SAKIT">Rumah Sakit Rujukan</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="facility-village">ID Desa (Opsional)</label>
            <input
              id="facility-village"
              type="text"
              placeholder="UUID desa atau kosongkan"
              value={facilityVillageId}
              onChange={(e) => setFacilityVillageId(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Menyimpan…" : "Simpan Fasilitas"}
          </button>
        </form>
      )}

      {activeSubTab === "villages" && (
        <form className="staff-form-grid" onSubmit={handleCreateVillage}>
          <h3>Tambah Desa / Kelurahan Binaan</h3>
          <div className="form-group">
            <label htmlFor="village-name">Nama Desa *</label>
            <input
              id="village-name"
              type="text"
              required
              placeholder="e.g. Desa Kuncir"
              value={villageName}
              onChange={(e) => setVillageName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="village-district">Nama Kecamatan</label>
            <input
              id="village-district"
              type="text"
              placeholder="e.g. Kecamatan Kuncir"
              value={villageDistrict}
              onChange={(e) => setVillageDistrict(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Mendaftarkan…" : "Daftarkan Desa"}
          </button>
        </form>
      )}

      {activeSubTab === "staff" && (
        <form className="staff-form-grid" onSubmit={handleCreateStaff}>
          <h3>Buat Akun Petugas Baru</h3>
          <div className="form-group">
            <label htmlFor="staff-identifier">ID Login (Username) *</label>
            <input
              id="staff-identifier"
              type="text"
              required
              placeholder="e.g. bidan.kuncir"
              value={staffIdentifier}
              onChange={(e) => setStaffIdentifier(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="staff-display">Nama Lengkap Petugas *</label>
            <input
              id="staff-display"
              type="text"
              required
              placeholder="e.g. Bidan Rahmawati, S.Tr.Keb"
              value={staffDisplayName}
              onChange={(e) => setStaffDisplayName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="staff-role">Peran (Role) *</label>
            <select
              id="staff-role"
              value={staffRole}
              onChange={(e) => setStaffRole(e.target.value as "PUSKESMAS" | "BIDAN")}
            >
              <option value="BIDAN">Bidan Village / Lapangan</option>
              <option value="PUSKESMAS">Operator Puskesmas</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="staff-password">Kata Sandi Awal *</label>
            <input
              id="staff-password"
              type="password"
              required
              minLength={8}
              placeholder="Minimal 8 karakter"
              value={staffPassword}
              onChange={(e) => setStaffPassword(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Membuat Akun…" : "Buat Akun Petugas"}
          </button>
        </form>
      )}

      {activeSubTab === "assignments" && (
        <form className="staff-form-grid" onSubmit={handleAssignVillage}>
          <h3>Penugasan Wilayah Desa untuk Bidan</h3>
          <div className="form-group">
            <label htmlFor="assign-staff">ID Petugas Bidan (UUID) *</label>
            <input
              id="assign-staff"
              type="text"
              required
              placeholder="UUID akun Bidan"
              value={assignStaffId}
              onChange={(e) => setAssignStaffId(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="assign-village">ID Desa Binaan (UUID) *</label>
            <input
              id="assign-village"
              type="text"
              required
              placeholder="UUID desa binaan"
              value={assignVillageId}
              onChange={(e) => setAssignVillageId(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Menugaskan…" : "Simpan Penugasan"}
          </button>
        </form>
      )}
    </div>
  );
}
