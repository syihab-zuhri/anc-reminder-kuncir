"use client";

import type { StaffAssignmentDetail, StaffSummary, Village } from "@anc/contracts";

interface AdminAssignmentsTabProps {
  readonly assignments: readonly StaffAssignmentDetail[];
  readonly bidanUsers: readonly StaffSummary[];
  readonly villages: readonly Village[];
  readonly assignStaffId: string;
  readonly assignVillageId: string;
  readonly submitting: boolean;
  readonly onAssignStaffIdChange: (val: string) => void;
  readonly onAssignVillageIdChange: (val: string) => void;
  readonly onAssignVillage: (e: React.FormEvent) => void;
  readonly onRevokeAssignment: (assignmentId: string) => void;
}

export function AdminAssignmentsTab({
  assignments,
  bidanUsers,
  villages,
  assignStaffId,
  assignVillageId,
  submitting,
  onAssignStaffIdChange,
  onAssignVillageIdChange,
  onAssignVillage,
  onRevokeAssignment,
}: AdminAssignmentsTabProps) {
  return (
    <div className="admin-subtab-pane">
      <div className="staff-panel-card" style={{ marginBottom: "1.5rem" }}>
        <header className="staff-panel-header" style={{ marginBottom: "1rem" }}>
          <div>
            <span className="staff-kicker">Penugasan Desa</span>
            <h3>Tetapkan Penugasan Wilayah Kerja Bidan</h3>
            <p className="field-hint">
              Bidan Desa hanya dapat mengakses dan mengonfirmasi ibu hamil yang berdomisili di desa
              terpenuhi penugasannya.
            </p>
          </div>
        </header>

        <form onSubmit={onAssignVillage} className="staff-form-grid">
          <div className="form-group">
            <label htmlFor="assign-staff-id">Pilih Akun Bidan *</label>
            <select
              id="assign-staff-id"
              className="staff-select"
              value={assignStaffId}
              onChange={(e) => onAssignStaffIdChange(e.target.value)}
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
            <label htmlFor="assign-village-id">Pilih Desa Penugasan *</label>
            <select
              id="assign-village-id"
              className="staff-select"
              value={assignVillageId}
              onChange={(e) => onAssignVillageIdChange(e.target.value)}
              required
            >
              <option value="">-- Pilih Desa / Kelurahan --</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  Desa {v.name} ({v.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Menyimpan Penugasan..." : "Tetapkan Wilayah Desa"}
            </button>
          </div>
        </form>
      </div>

      {/* Assignments Table */}
      <div className="table-responsive">
        <table className="staff-table">
          <thead>
            <tr>
              <th>Nama Petugas Bidan</th>
              <th>Username</th>
              <th>Tipe Cakupan</th>
              <th>Wilayah Penugasan</th>
              <th style={{ textAlign: "right" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ textAlign: "center", color: "var(--ink-muted)", padding: "2rem" }}
                >
                  Belum ada penugasan wilayah desa aktif.
                </td>
              </tr>
            ) : (
              assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.staff_name}</strong>
                  </td>
                  <td>
                    <code>@{a.staff_identifier}</code>
                  </td>
                  <td>
                    <span
                      className="badge-status"
                      style={{ fontSize: "0.75rem", background: "rgba(22, 61, 55, 0.08)" }}
                    >
                      {a.scope_type}
                    </span>
                  </td>
                  <td>
                    <strong>
                      {a.village_name
                        ? `Desa ${a.village_name}`
                        : villages.find((v) => v.id === a.scope_id)?.name
                          ? `Desa ${villages.find((v) => v.id === a.scope_id)?.name}`
                          : "Wilayah Penugasan"}
                    </strong>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        padding: "0.35rem 0.65rem",
                        fontSize: "0.75rem",
                        color: "#b91c1c",
                        borderColor: "#fecaca",
                      }}
                      onClick={() => onRevokeAssignment(a.id)}
                      disabled={submitting}
                    >
                      Cabut Wilayah
                    </button>
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
