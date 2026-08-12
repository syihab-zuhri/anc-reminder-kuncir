"use client";

import type { AncPlanResponse } from "@anc/contracts";
import { useEffect, useState } from "react";

interface OrganizationAdminPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
  readonly healthCenterId: string | null;
}

export function OrganizationAdminPanel({ userRole, healthCenterId }: OrganizationAdminPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "facilities" | "villages" | "staff" | "assignments" | "careplan"
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

  // TASK-P5-005: Versioned Care Plan State
  const [carePlan, setCarePlan] = useState<AncPlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeSubTab === "careplan" && userRole === "PUSKESMAS") {
      void fetchActiveCarePlan();
    }

    async function fetchActiveCarePlan(): Promise<void> {
      setLoadingPlan(true);
      try {
        const res = await fetch("/api/staff-proxy/anc-plan/active");
        if (res.ok) {
          const data = (await res.json()) as AncPlanResponse;
          setCarePlan(data);
        }
      } catch {
        // Best-effort load for care plan rules
      } finally {
        setLoadingPlan(false);
      }
    }
  }, [activeSubTab, userRole]);

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
        message: `Fasilitas "${facilityName}" berhasil didaftarkan.`,
      });
      setFacilityName("");
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat mendaftarkan fasilitas." });
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
          district: villageDistrict.trim(),
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

      setFeedback({ type: "success", message: `Desa "${villageName}" berhasil didaftarkan.` });
      setVillageName("");
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat mendaftarkan desa." });
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

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal membuat akun petugas baru.",
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
      setFeedback({ type: "error", message: "Koneksi terputus saat membuat akun petugas." });
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
      const res = await fetch(`/api/staff-proxy/organization/staff/${assignStaffId}/assignments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          village_id: assignVillageId.trim(),
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
        message: "Penugasan desa untuk Bidan berhasil disimpan.",
      });
      setAssignStaffId("");
      setAssignVillageId("");
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menyimpan penugasan desa." });
    } finally {
      setSubmitting(false);
    }
  }

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
          onClick={() => setActiveSubTab("facilities")}
        >
          Fasilitas Kesehatan
        </button>
        <button
          className={activeSubTab === "villages" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => setActiveSubTab("villages")}
        >
          Desa / Kelurahan
        </button>
        <button
          className={activeSubTab === "staff" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => setActiveSubTab("staff")}
        >
          Akun Petugas
        </button>
        <button
          className={activeSubTab === "assignments" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => setActiveSubTab("assignments")}
        >
          Penugasan Bidan
        </button>
        <button
          className={activeSubTab === "careplan" ? "btn-primary" : "btn-secondary"}
          type="button"
          onClick={() => setActiveSubTab("careplan")}
        >
          Aturan Klinis K1-K8 (TASK-P5-005)
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
        <form onSubmit={(e) => void handleCreateFacility(e)} className="staff-form-grid">
          <h3>Tambah Fasilitas Kesehatan Baru</h3>
          <div className="form-group">
            <label htmlFor="facilityName">Nama Fasilitas</label>
            <input
              id="facilityName"
              className="staff-input"
              type="text"
              placeholder="Contoh: Posyandu Melati 01"
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="facilityType">Tipe Fasilitas</label>
            <select
              id="facilityType"
              className="staff-input"
              value={facilityType}
              onChange={(e) =>
                setFacilityType(
                  e.target.value as "PUSKESMAS" | "POSYANDU" | "KLINIK_PRIVATE" | "RUMAH_SAKIT",
                )
              }
            >
              <option value="POSYANDU">POSYANDU</option>
              <option value="PUSKESMAS">PUSKESMAS</option>
              <option value="KLINIK_PRIVATE">KLINIK PRIVATE</option>
              <option value="RUMAH_SAKIT">RUMAH SAKIT</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="facilityVillageId">UUID Desa (Opsional)</label>
            <input
              id="facilityVillageId"
              className="staff-input"
              type="text"
              placeholder="UUID desa tempat fasilitas..."
              value={facilityVillageId}
              onChange={(e) => setFacilityVillageId(e.target.value)}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Menyimpan..." : "Simpan Fasilitas"}
          </button>
        </form>
      )}

      {/* Sub-tab: Villages */}
      {activeSubTab === "villages" && (
        <form onSubmit={(e) => void handleCreateVillage(e)} className="staff-form-grid">
          <h3>Tambah Desa / Kelurahan Baru</h3>
          <div className="form-group">
            <label htmlFor="villageName">Nama Desa</label>
            <input
              id="villageName"
              className="staff-input"
              type="text"
              placeholder="Contoh: Desa Kuncir"
              value={villageName}
              onChange={(e) => setVillageName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="villageDistrict">Kecamatan</label>
            <input
              id="villageDistrict"
              className="staff-input"
              type="text"
              placeholder="Nama kecamatan..."
              value={villageDistrict}
              onChange={(e) => setVillageDistrict(e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Menyimpan..." : "Simpan Desa"}
          </button>
        </form>
      )}

      {/* Sub-tab: Staff Accounts */}
      {activeSubTab === "staff" && (
        <form onSubmit={(e) => void handleCreateStaff(e)} className="staff-form-grid">
          <h3>Buat Akun Petugas Baru</h3>
          <div className="form-group">
            <label htmlFor="staffIdentifier">Identifier Login (Username/Email)</label>
            <input
              id="staffIdentifier"
              className="staff-input"
              type="text"
              placeholder="Contoh: bidan.siti"
              value={staffIdentifier}
              onChange={(e) => setStaffIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="staffDisplayName">Nama Lengkap Petugas</label>
            <input
              id="staffDisplayName"
              className="staff-input"
              type="text"
              placeholder="Contoh: Bidan Siti Aminah, S.Tr.Keb"
              value={staffDisplayName}
              onChange={(e) => setStaffDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="staffRole">Peran Petugas</label>
            <select
              id="staffRole"
              className="staff-input"
              value={staffRole}
              onChange={(e) => setStaffRole(e.target.value as "PUSKESMAS" | "BIDAN")}
            >
              <option value="BIDAN">BIDAN (Bidan Desa)</option>
              <option value="PUSKESMAS">PUSKESMAS (Operator Puskesmas)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="staffPassword">Kata Sandi Awal</label>
            <input
              id="staffPassword"
              className="staff-input"
              type="password"
              placeholder="Minimal 8 karakter..."
              value={staffPassword}
              onChange={(e) => setStaffPassword(e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Membuat Akun..." : "Buat Akun Petugas"}
          </button>
        </form>
      )}

      {/* Sub-tab: Bidan Village Assignments */}
      {activeSubTab === "assignments" && (
        <form onSubmit={(e) => void handleAssignVillage(e)} className="staff-form-grid">
          <h3>Penugasan Wilayah Kerja Bidan</h3>
          <p className="field-hint">
            Bidan Desa hanya dapat mengakses dan mengonfirmasi ibu hamil yang berdomisili di desa
            terpenuhi penugasannya.
          </p>

          <div className="form-group">
            <label htmlFor="assignStaffId">UUID Petugas Bidan</label>
            <input
              id="assignStaffId"
              className="staff-input"
              type="text"
              placeholder="UUID akun Bidan..."
              value={assignStaffId}
              onChange={(e) => setAssignStaffId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="assignVillageId">UUID Desa Penugasan</label>
            <input
              id="assignVillageId"
              className="staff-input"
              type="text"
              placeholder="UUID desa penugasan..."
              value={assignVillageId}
              onChange={(e) => setAssignVillageId(e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Menyimpan Penugasan..." : "Tetapkan Wilayah Desa"}
          </button>
        </form>
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
