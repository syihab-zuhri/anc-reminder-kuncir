"use client";

import type { Village } from "@anc/contracts";

interface AdminVillagesTabProps {
  readonly villages: readonly Village[];
  readonly villageName: string;
  readonly villageCode: string;
  readonly submitting: boolean;
  readonly editingVillage: Village | null;
  readonly editVillageName: string;
  readonly editVillageCode: string;
  readonly onVillageNameChange: (val: string) => void;
  readonly onVillageCodeChange: (val: string) => void;
  readonly onEditVillageNameChange: (val: string) => void;
  readonly onEditVillageCodeChange: (val: string) => void;
  readonly onCreateVillage: (e: React.FormEvent) => void;
  readonly onUpdateVillage: (e: React.FormEvent) => void;
  readonly onDeleteVillage: (v: Village) => void;
  readonly onStartEditVillage: (v: Village) => void;
  readonly onCancelEditVillage: () => void;
}

export function AdminVillagesTab({
  villages,
  villageName,
  villageCode,
  submitting,
  editingVillage,
  editVillageName,
  editVillageCode,
  onVillageNameChange,
  onVillageCodeChange,
  onEditVillageNameChange,
  onEditVillageCodeChange,
  onCreateVillage,
  onUpdateVillage,
  onDeleteVillage,
  onStartEditVillage,
  onCancelEditVillage,
}: AdminVillagesTabProps) {
  return (
    <div className="admin-subtab-pane">
      {/* Create / Edit Form */}
      {editingVillage ? (
        <div
          className="staff-panel-card"
          style={{ marginBottom: "1.5rem", border: "1px solid var(--ochre)" }}
        >
          <header className="staff-panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <span className="staff-kicker">Mode Koreksi</span>
              <h3>Edit Data Desa: {editingVillage.name}</h3>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancelEditVillage}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
            >
              Batal Edit
            </button>
          </header>

          <form onSubmit={onUpdateVillage} className="staff-form-grid">
            <div className="form-group">
              <label htmlFor="edit-vil-name">Nama Desa *</label>
              <input
                id="edit-vil-name"
                className="staff-input"
                value={editVillageName}
                onChange={(e) => onEditVillageNameChange(e.target.value)}
                placeholder="Contoh: Kuncir"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-vil-code">Kode Desa *</label>
              <input
                id="edit-vil-code"
                className="staff-input"
                value={editVillageCode}
                onChange={(e) => onEditVillageCodeChange(e.target.value)}
                placeholder="Contoh: DS-KNC"
                required
              />
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
                onClick={onCancelEditVillage}
                disabled={submitting}
              >
                Batal
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Menyimpan..." : "Simpan Perubahan Desa"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="staff-panel-card" style={{ marginBottom: "1.5rem" }}>
          <header className="staff-panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <span className="staff-kicker">Desa Baru</span>
              <h3>Tambah Desa Wilayah Kerja</h3>
              <p className="field-hint">Daftarkan desa binaan di wilayah kerja Puskesmas.</p>
            </div>
          </header>

          <form onSubmit={onCreateVillage} className="staff-form-grid">
            <div className="form-group">
              <label htmlFor="new-vil-name">Nama Desa *</label>
              <input
                id="new-vil-name"
                className="staff-input"
                value={villageName}
                onChange={(e) => onVillageNameChange(e.target.value)}
                placeholder="Contoh: Sukomoro"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-vil-code">Kode Desa *</label>
              <input
                id="new-vil-code"
                className="staff-input"
                value={villageCode}
                onChange={(e) => onVillageCodeChange(e.target.value)}
                placeholder="Contoh: DS-SKM"
                required
              />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Mendaftarkan..." : "+ Daftarkan Desa Baru"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Villages Table */}
      <div className="table-responsive">
        <table className="staff-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Desa</th>
              <th style={{ textAlign: "right" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {villages.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  style={{ textAlign: "center", color: "var(--ink-muted)", padding: "2rem" }}
                >
                  Belum ada desa yang terdaftar.
                </td>
              </tr>
            ) : (
              villages.map((v) => (
                <tr key={v.id}>
                  <td>
                    <code>{v.code}</code>
                  </td>
                  <td>
                    <strong>{v.name}</strong>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                        onClick={() => onStartEditVillage(v)}
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
                        onClick={() => onDeleteVillage(v)}
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
