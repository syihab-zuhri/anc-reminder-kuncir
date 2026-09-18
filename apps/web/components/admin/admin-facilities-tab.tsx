"use client";

import type { Facility, FacilityType, Village } from "@anc/contracts";

interface AdminFacilitiesTabProps {
  readonly facilities: readonly Facility[];
  readonly villages: readonly Village[];
  readonly facilityName: string;
  readonly facilityCode: string;
  readonly facilityType: FacilityType;
  readonly facilityVillageId: string;
  readonly submitting: boolean;
  readonly editingFacility: Facility | null;
  readonly editFacilityName: string;
  readonly editFacilityCode: string;
  readonly editFacilityType: FacilityType;
  readonly editFacilityVillageId: string;
  readonly onFacilityNameChange: (val: string) => void;
  readonly onFacilityCodeChange: (val: string) => void;
  readonly onFacilityTypeChange: (val: FacilityType) => void;
  readonly onFacilityVillageIdChange: (val: string) => void;
  readonly onEditFacilityNameChange: (val: string) => void;
  readonly onEditFacilityCodeChange: (val: string) => void;
  readonly onEditFacilityTypeChange: (val: FacilityType) => void;
  readonly onEditFacilityVillageIdChange: (val: string) => void;
  readonly onCreateFacility: (e: React.FormEvent) => void;
  readonly onUpdateFacility: (e: React.FormEvent) => void;
  readonly onDeleteFacility: (f: Facility) => void;
  readonly onStartEditFacility: (f: Facility) => void;
  readonly onCancelEditFacility: () => void;
}

export function AdminFacilitiesTab({
  facilities,
  villages,
  facilityName,
  facilityCode,
  facilityType,
  facilityVillageId,
  submitting,
  editingFacility,
  editFacilityName,
  editFacilityCode,
  editFacilityType,
  editFacilityVillageId,
  onFacilityNameChange,
  onFacilityCodeChange,
  onFacilityTypeChange,
  onFacilityVillageIdChange,
  onEditFacilityNameChange,
  onEditFacilityCodeChange,
  onEditFacilityTypeChange,
  onEditFacilityVillageIdChange,
  onCreateFacility,
  onUpdateFacility,
  onDeleteFacility,
  onStartEditFacility,
  onCancelEditFacility,
}: AdminFacilitiesTabProps) {
  return (
    <div className="admin-subtab-pane">
      {/* Create / Edit Form */}
      {editingFacility ? (
        <div
          className="staff-panel-card"
          style={{ marginBottom: "1.5rem", border: "1px solid var(--ochre)" }}
        >
          <header className="staff-panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <span className="staff-kicker">Mode Koreksi</span>
              <h3>Edit Data Fasilitas: {editingFacility.name}</h3>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancelEditFacility}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
            >
              Batal Edit
            </button>
          </header>

          <form onSubmit={onUpdateFacility} className="staff-form-grid">
            <div className="form-group">
              <label htmlFor="edit-fac-name">Nama Fasilitas *</label>
              <input
                id="edit-fac-name"
                className="staff-input"
                value={editFacilityName}
                onChange={(e) => onEditFacilityNameChange(e.target.value)}
                placeholder="Contoh: Posyandu Mawar 1"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-fac-code">Kode Fasilitas *</label>
              <input
                id="edit-fac-code"
                className="staff-input"
                value={editFacilityCode}
                onChange={(e) => onEditFacilityCodeChange(e.target.value)}
                placeholder="Contoh: POS-MW-01"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-fac-type">Tipe Fasilitas *</label>
              <select
                id="edit-fac-type"
                className="staff-select"
                value={editFacilityType}
                onChange={(e) => onEditFacilityTypeChange(e.target.value as FacilityType)}
              >
                <option value="POSYANDU">Posyandu</option>
                <option value="PUSKESMAS">Puskesmas</option>
                <option value="PUSTU">Puskesmas Pembantu (Pustu)</option>
                <option value="POLINDES">Pondok Bersalin Desa (Polindes)</option>
                <option value="MIDWIFE_PRACTICE">TPMB / Praktik Mandiri Bidan</option>
                <option value="PONED">PONED</option>
                <option value="HOSPITAL">Rumah Sakit / SpOG</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="edit-fac-village">Desa Wilayah (Opsional)</label>
              <select
                id="edit-fac-village"
                className="staff-select"
                value={editFacilityVillageId}
                onChange={(e) => onEditFacilityVillageIdChange(e.target.value)}
              >
                <option value="">-- Tanpa Relasi Desa Khusus --</option>
                {villages.map((v) => (
                  <option key={v.id} value={v.id}>
                    Desa {v.name} ({v.code})
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={onCancelEditFacility}
                disabled={submitting}
              >
                Batal
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Menyimpan..." : "Simpan Perubahan Fasilitas"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="staff-panel-card" style={{ marginBottom: "1.5rem" }}>
          <header className="staff-panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <span className="staff-kicker">Fasilitas Baru</span>
              <h3>Tambah TPMB / Faskes</h3>
              <p className="field-hint">
                Daftarkan pos pelayanan kesehatan baru di wilayah Puskesmas.
              </p>
            </div>
          </header>

          <form onSubmit={onCreateFacility} className="staff-form-grid">
            <div className="form-group">
              <label htmlFor="new-fac-name">Nama Fasilitas *</label>
              <input
                id="new-fac-name"
                className="staff-input"
                value={facilityName}
                onChange={(e) => onFacilityNameChange(e.target.value)}
                placeholder="Contoh: Posyandu Melati 2"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-fac-code">Kode Fasilitas *</label>
              <input
                id="new-fac-code"
                className="staff-input"
                value={facilityCode}
                onChange={(e) => onFacilityCodeChange(e.target.value)}
                placeholder="Contoh: POS-MLT-02"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-fac-type">Tipe Fasilitas *</label>
              <select
                id="new-fac-type"
                className="staff-select"
                value={facilityType}
                onChange={(e) => onFacilityTypeChange(e.target.value as FacilityType)}
              >
                <option value="POSYANDU">Posyandu</option>
                <option value="PUSKESMAS">Puskesmas</option>
                <option value="PUSTU">Puskesmas Pembantu (Pustu)</option>
                <option value="POLINDES">Pondok Bersalin Desa (Polindes)</option>
                <option value="MIDWIFE_PRACTICE">TPMB / Praktik Mandiri Bidan</option>
                <option value="PONED">PONED</option>
                <option value="HOSPITAL">Rumah Sakit / SpOG</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="new-fac-village">Desa Wilayah (Opsional)</label>
              <select
                id="new-fac-village"
                className="staff-select"
                value={facilityVillageId}
                onChange={(e) => onFacilityVillageIdChange(e.target.value)}
              >
                <option value="">-- Tanpa Relasi Desa Khusus --</option>
                {villages.map((v) => (
                  <option key={v.id} value={v.id}>
                    Desa {v.name} ({v.code})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Mendaftarkan..." : "+ Daftarkan Fasilitas Baru"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Facilities Table */}
      <div className="table-responsive">
        <table className="staff-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Fasilitas</th>
              <th>Tipe</th>
              <th>Wilayah Desa</th>
              <th style={{ textAlign: "right" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {facilities.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ textAlign: "center", color: "var(--ink-muted)", padding: "2rem" }}
                >
                  Belum ada fasilitas / posyandu yang terdaftar.
                </td>
              </tr>
            ) : (
              facilities.map((f) => (
                <tr key={f.id}>
                  <td>
                    <code>{f.code}</code>
                  </td>
                  <td>
                    <strong>{f.name}</strong>
                  </td>
                  <td>
                    <span
                      className="badge-status"
                      style={{ fontSize: "0.75rem", background: "rgba(22, 61, 55, 0.08)" }}
                    >
                      {f.facility_type}
                    </span>
                  </td>
                  <td>
                    {f.village_id
                      ? `Desa ${villages.find((v) => v.id === f.village_id)?.name ?? f.village_id}`
                      : "-"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                        onClick={() => onStartEditFacility(f)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.75rem",
                          color: "#b91c1c",
                          borderColor: "#fecaca",
                        }}
                        onClick={() => onDeleteFacility(f)}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
