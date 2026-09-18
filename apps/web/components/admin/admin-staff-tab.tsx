"use client";

import { useState } from "react";

import type { StaffSummary } from "@anc/contracts";

interface AdminStaffTabProps {
  readonly staffList: readonly StaffSummary[];
  readonly staffIdentifier: string;
  readonly staffDisplayName: string;
  readonly staffRole: "BIDAN" | "PUSKESMAS";
  readonly staffPassword: string;
  readonly submitting: boolean;
  readonly editingStaff: StaffSummary | null;
  readonly editStaffDisplayName: string;
  readonly editStaffPassword: string;
  readonly onStaffIdentifierChange: (val: string) => void;
  readonly onStaffDisplayNameChange: (val: string) => void;
  readonly onStaffRoleChange: (val: "BIDAN" | "PUSKESMAS") => void;
  readonly onStaffPasswordChange: (val: string) => void;
  readonly onEditStaffDisplayNameChange: (val: string) => void;
  readonly onEditStaffPasswordChange: (val: string) => void;
  readonly onCreateStaff: (e: React.FormEvent) => void;
  readonly onUpdateStaff: (e: React.FormEvent) => void;
  readonly onToggleStaffStatus: (s: StaffSummary) => void;
  readonly onDeleteStaff: (s: StaffSummary) => void;
  readonly onStartEditStaff: (s: StaffSummary) => void;
  readonly onCancelEditStaff: () => void;
}

export function AdminStaffTab({
  staffList,
  staffIdentifier,
  staffDisplayName,
  staffRole,
  staffPassword,
  submitting,
  editingStaff,
  editStaffDisplayName,
  editStaffPassword,
  onStaffIdentifierChange,
  onStaffDisplayNameChange,
  onStaffRoleChange,
  onStaffPasswordChange,
  onEditStaffDisplayNameChange,
  onEditStaffPasswordChange,
  onCreateStaff,
  onUpdateStaff,
  onToggleStaffStatus,
  onDeleteStaff,
  onStartEditStaff,
  onCancelEditStaff,
}: AdminStaffTabProps) {
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  return (
    <div className="admin-subtab-pane">
      {/* Create / Edit Form */}
      {editingStaff ? (
        <div
          className="staff-panel-card"
          style={{ marginBottom: "1.5rem", border: "1px solid var(--ochre)" }}
        >
          <header className="staff-panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <span className="staff-kicker">Mode Koreksi</span>
              <h3>Edit Akun Petugas: @{editingStaff.login_identifier}</h3>
              <p className="field-hint">
                Perbarui nama tampilan atau setel ulang kata sandi petugas.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancelEditStaff}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
            >
              Batal Edit
            </button>
          </header>

          <form onSubmit={onUpdateStaff} className="staff-form-grid">
            <div className="form-group">
              <label htmlFor="edit-staff-display">Nama Lengkap Petugas *</label>
              <input
                id="edit-staff-display"
                className="staff-input"
                value={editStaffDisplayName}
                onChange={(e) => onEditStaffDisplayNameChange(e.target.value)}
                placeholder="Contoh: Bdn. Siti Rahma, S.Tr.Keb"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-staff-pass">
                Reset Password Baru (Kosongkan bila tidak diubah)
              </label>
              <div className="staff-password-wrapper">
                <input
                  id="edit-staff-pass"
                  type={showEditPassword ? "text" : "password"}
                  className="staff-input"
                  value={editStaffPassword}
                  onChange={(e) => onEditStaffPasswordChange(e.target.value)}
                  placeholder="Minimal 8 karakter"
                />
                <button
                  type="button"
                  className="staff-password-toggle"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  aria-label={showEditPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  title={showEditPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showEditPassword ? (
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <path
                        d="M3.5 3.5l13 13M8.5 8.5a3 3 0 0 0 4.24 4.24M10 5.5c3.5 0 6.5 2.5 7.5 4.5a10.8 10.8 0 0 1-3.23 3.63M6.27 6.27A10.6 10.6 0 0 0 2.5 10c1 2 4 4.5 7.5 4.5.9 0 1.77-.16 2.57-.45"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 10c1-2 4-4.5 7.5-4.5s6.5 2.5 7.5 4.5c-1 2-4 4.5-7.5 4.5S3.5 12 2.5 10z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="10" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
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
                onClick={onCancelEditStaff}
                disabled={submitting}
              >
                Batal
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Menyimpan..." : "Simpan Perubahan Akun"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="staff-panel-card" style={{ marginBottom: "1.5rem" }}>
          <header className="staff-panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <span className="staff-kicker">Petugas Baru</span>
              <h3>Buat Akun Staf / Bidan</h3>
              <p className="field-hint">
                Daftarkan akun login operasional untuk Bidan Desa atau Petugas Puskesmas.
              </p>
            </div>
          </header>

          <form onSubmit={onCreateStaff} className="staff-form-grid">
            <div className="form-group">
              <label htmlFor="new-staff-id">Username / NIP / ID Login *</label>
              <input
                id="new-staff-id"
                className="staff-input"
                value={staffIdentifier}
                onChange={(e) => onStaffIdentifierChange(e.target.value)}
                placeholder="Contoh: bidan.siti"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-staff-name">Nama Lengkap &amp; Gelar *</label>
              <input
                id="new-staff-name"
                className="staff-input"
                value={staffDisplayName}
                onChange={(e) => onStaffDisplayNameChange(e.target.value)}
                placeholder="Contoh: Bdn. Siti Rahma, S.Tr.Keb"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-staff-role">Peran Penugasan *</label>
              <select
                id="new-staff-role"
                className="staff-select"
                value={staffRole}
                onChange={(e) => onStaffRoleChange(e.target.value as "BIDAN" | "PUSKESMAS")}
              >
                <option value="BIDAN">Bidan Desa (Pelaksana Lapangan)</option>
                <option value="PUSKESMAS">Petugas / Operator Puskesmas</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="new-staff-pwd">Password Awal *</label>
              <div className="staff-password-wrapper">
                <input
                  id="new-staff-pwd"
                  type={showCreatePassword ? "text" : "password"}
                  className="staff-input"
                  value={staffPassword}
                  onChange={(e) => onStaffPasswordChange(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  required
                />
                <button
                  type="button"
                  className="staff-password-toggle"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  aria-label={
                    showCreatePassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                  }
                  title={showCreatePassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showCreatePassword ? (
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <path
                        d="M3.5 3.5l13 13M8.5 8.5a3 3 0 0 0 4.24 4.24M10 5.5c3.5 0 6.5 2.5 7.5 4.5a10.8 10.8 0 0 1-3.23 3.63M6.27 6.27A10.6 10.6 0 0 0 2.5 10c1 2 4 4.5 7.5 4.5.9 0 1.77-.16 2.57-.45"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 10c1-2 4-4.5 7.5-4.5s6.5 2.5 7.5 4.5c-1 2-4 4.5-7.5 4.5S3.5 12 2.5 10z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="10" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Mendaftarkan..." : "+ Daftarkan Petugas Baru"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Table */}
      <div className="table-responsive">
        <table className="staff-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Nama Petugas</th>
              <th>Peran</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {staffList.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ textAlign: "center", color: "var(--ink-muted)", padding: "2rem" }}
                >
                  Belum ada staf petugas yang terdaftar.
                </td>
              </tr>
            ) : (
              staffList.map((s) => (
                <tr key={s.id}>
                  <td>
                    <code>@{s.login_identifier}</code>
                  </td>
                  <td>
                    <strong>{s.display_name}</strong>
                  </td>
                  <td>
                    <span
                      className="badge-status"
                      style={{ fontSize: "0.75rem", background: "rgba(22, 61, 55, 0.08)" }}
                    >
                      {s.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge-status ${s.status === "ACTIVE" ? "status-confirmed" : "status-overdue"}`}
                      style={{ fontSize: "0.72rem" }}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                        onClick={() => onStartEditStaff(s)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.75rem",
                          color: s.status === "ACTIVE" ? "#b45309" : "#15803d",
                        }}
                        onClick={() => onToggleStaffStatus(s)}
                      >
                        {s.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      {s.role === "BIDAN" && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            padding: "0.35rem 0.65rem",
                            fontSize: "0.75rem",
                            color: "#b91c1c",
                            borderColor: "#fecaca",
                          }}
                          onClick={() => onDeleteStaff(s)}
                        >
                          Hapus
                        </button>
                      )}
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
