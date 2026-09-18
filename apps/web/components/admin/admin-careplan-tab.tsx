"use client";

import type { AncPlanResponse, StaffSummary } from "@anc/contracts";

interface AdminCarePlanTabProps {
  readonly carePlan: AncPlanResponse | null;
  readonly loadingPlan: boolean;
  readonly staffList: readonly StaffSummary[];
}

export function AdminCarePlanTab({ carePlan, loadingPlan, staffList }: AdminCarePlanTabProps) {
  return (
    <div className="admin-subtab-pane">
      <div className="staff-alert alert-warning" style={{ marginBottom: "1rem" }}>
        <p>
          <strong>Acuan jadwal pemeriksaan kehamilan</strong>
          <br />
          Aturan K1-K8 berikut digunakan sebagai referensi operasional Puskesmas. Setiap perubahan
          jadwal, fasilitas, atau kebutuhan layanan harus ditinjau dan disetujui oleh penanggung
          jawab klinis.
        </p>
      </div>

      {loadingPlan ? (
        <p className="empty-notice">Memuat aturan klinis yang sedang berlaku…</p>
      ) : carePlan === null ? (
        <p className="empty-notice">Aturan klinis belum dapat dimuat.</p>
      ) : (
        <div>
          <div className="metrics-row" style={{ marginBottom: "1rem" }}>
            <div className="metric-card">
              <span className="metric-label">Versi aturan</span>
              <strong className="metric-value">Versi {carePlan.version_no}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Status aturan</span>
              <strong className="metric-value text-due">
                {carePlan.status === "APPROVED"
                  ? "Disetujui dan aktif"
                  : carePlan.status === "DRAFT"
                    ? "Draf untuk ditinjau"
                    : "Diarsipkan"}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Peninjau klinis</span>
              <strong className="metric-value" style={{ fontSize: "0.95rem" }}>
                {staffList.find((s) => s.id === carePlan.approved_by_staff_id)?.display_name ??
                  (carePlan.approved_by_staff_id
                    ? "Penanggung jawab klinis Puskesmas"
                    : "Belum ditetapkan")}
              </strong>
            </div>
          </div>

          <h4>Jadwal dan kebutuhan layanan</h4>
          <p className="section-help">
            Gunakan tabel ini untuk melihat rentang usia kehamilan, fasilitas layanan, dan kebutuhan
            pemeriksaan pada setiap kunjungan ANC.
          </p>
          <div className="table-responsive">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Kunjungan</th>
                  <th>Trimester</th>
                  <th>Rentang usia kehamilan</th>
                  <th>Fasilitas yang diperlukan</th>
                  <th>Jenis layanan</th>
                </tr>
              </thead>
              <tbody>
                {carePlan.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <span className="badge-code" style={{ fontWeight: 800 }}>
                        {rule.code}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{rule.trimester_label}</span>
                    </td>
                    <td>
                      {rule.target_week_start !== null && rule.target_week_end !== null
                        ? `Minggu ${rule.target_week_start}-${rule.target_week_end}`
                        : "Mengikuti jadwal kehamilan"}
                    </td>
                    <td>
                      <span
                        className={
                          rule.required_facility_policy === "PUSKESMAS_REQUIRED"
                            ? "badge-action"
                            : ""
                        }
                        style={{
                          display: "inline-block",
                          padding: "0.25rem 0.6rem",
                          borderRadius: "4px",
                          fontSize: "0.82rem",
                        }}
                      >
                        {rule.required_facility_policy === "PUSKESMAS_REQUIRED"
                          ? "Wajib di Puskesmas"
                          : "Posyandu, Bidan, atau Puskesmas"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge-status status-${
                          ["K1", "K2", "K3", "K4", "K5", "K6"].includes(rule.code)
                            ? "overdue"
                            : "upcoming"
                        }`}
                        style={{ fontSize: "0.8rem" }}
                      >
                        {rule.required_facility_policy === "PUSKESMAS_REQUIRED"
                          ? "USG dan skrining dokter"
                          : "Pemeriksaan rutin oleh bidan"}
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
  );
}
