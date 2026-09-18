"use client";

import type { MotherSummary, PregnancyMilestoneListResponse } from "@anc/contracts";

interface MotherDetailModalProps {
  readonly mother: MotherSummary;
  readonly milestones: PregnancyMilestoneListResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onOpenAccessCode?: (mother: MotherSummary) => void;
  readonly isPuskesmas: boolean;
}

export function MotherDetailModal({
  mother,
  milestones,
  loading,
  error,
  onClose,
  onOpenAccessCode,
  isPuskesmas,
}: MotherDetailModalProps) {
  return (
    <div
      className="staff-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="staff-modal-dialog modal-lg">
        {/* Modal Header */}
        <header className="staff-modal-header">
          <div className="staff-modal-header-content">
            <span className="staff-modal-kicker">Detail Rekam Medis &amp; Linimasa</span>
            <h3 id="detail-modal-title" className="staff-modal-title">
              {mother.full_name}
            </h3>
            <p className="staff-modal-subtitle">
              {mother.phone_masked} ·{" "}
              {mother.village_name ? `Desa ${mother.village_name}` : "Tanpa Desa"} ·{" "}
              {mother.address}
            </p>
          </div>
          <button
            type="button"
            className="staff-modal-close-btn"
            onClick={onClose}
            aria-label="Tutup Detail"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="16"
              height="16"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        {/* Modal Body */}
        <div className="staff-modal-body">
          {/* Gestational Age Card */}
          {mother.active_pregnancy ? (
            <div className="mother-profile-card" style={{ padding: "1.15rem 1.25rem", margin: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.74rem",
                      fontWeight: 800,
                      color: "var(--ink-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Usia Kehamilan Saat Ini
                  </span>
                  <div
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 800,
                      color: "var(--ink)",
                      marginTop: "0.15rem",
                    }}
                  >
                    {mother.active_pregnancy.completed_weeks} Minggu{" "}
                    {mother.active_pregnancy.completed_days} Hari
                  </div>
                  <small style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
                    Tanggal HPHT: <strong>{mother.active_pregnancy.dating_date}</strong>
                  </small>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    className="badge-status status-confirmed"
                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem", fontWeight: 800 }}
                  >
                    {mother.active_pregnancy.trimester_label}
                  </span>
                  <div
                    style={{
                      marginTop: "0.3rem",
                      fontSize: "0.75rem",
                      color: "var(--ink-muted)",
                    }}
                  >
                    Status: <strong>{mother.active_pregnancy.status}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="staff-alert alert-info" style={{ margin: 0 }}>
              <p>Pasien ini tidak memiliki riwayat kehamilan aktif saat ini.</p>
            </div>
          )}

          {/* Milestones K1-K8 Section */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  color: "var(--ink)",
                }}
              >
                Linimasa Paket ANC (K1 – K8)
              </h4>
              {milestones?.next_milestone_code && (
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    color: "var(--ochre)",
                    background: "rgba(225, 180, 92, 0.12)",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "9999px",
                  }}
                >
                  Target: Milestone {milestones.next_milestone_code}
                </span>
              )}
            </div>

            {loading && (
              <div style={{ padding: "2rem", textAlign: "center" }}>
                <div className="loading-spinner" style={{ margin: "0 auto 0.5rem" }} />
                <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                  Memuat jadwal pemeriksaan K1–K8…
                </p>
              </div>
            )}

            {error && (
              <div className="staff-alert alert-error">
                <p>{error}</p>
              </div>
            )}

            {milestones && (
              <div
                className="timeline-grid"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
                  gap: "0.65rem",
                }}
              >
                {milestones.milestones.map((m) => {
                  const isConfirmed = m.visit_status === "CONFIRMED";
                  const isDue = m.visit_status === "DUE";
                  const isOverdue = m.visit_status === "OVERDUE";

                  return (
                    <div
                      key={m.code}
                      className="timeline-card"
                      style={{
                        padding: "0.75rem",
                        background: isConfirmed
                          ? "#f0fdf4"
                          : isOverdue
                            ? "#fef2f2"
                            : isDue
                              ? "#fffbeb"
                              : "var(--paper)",
                        borderColor: isConfirmed
                          ? "#86efac"
                          : isOverdue
                            ? "#fca5a5"
                            : isDue
                              ? "#fde047"
                              : "var(--line)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span className="timeline-code">{m.code}</span>
                        <span
                          className={`badge-status status-${m.visit_status.toLowerCase()}`}
                          style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}
                        >
                          {m.visit_status}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: "0.74rem",
                          color: "var(--ink-muted)",
                          fontWeight: 700,
                        }}
                      >
                        {m.trimester_label}
                      </div>

                      <div style={{ fontSize: "0.74rem", color: "var(--ink)" }}>
                        {m.due_at ? (
                          <span>
                            Jatuh Tempo: <strong>{m.due_at.slice(0, 10)}</strong>
                          </span>
                        ) : m.target_date_start && m.target_date_end ? (
                          <span>
                            {m.target_date_start} s/d {m.target_date_end}
                          </span>
                        ) : (
                          <span>Sesuai Rekomendasi</span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--ink-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          width="12"
                          height="12"
                        >
                          <path d="M10 2a5 5 0 0 0-5 5c0 3.75 5 9 5 9s5-5.25 5-9a5 5 0 0 0-5-5Z" />
                          <circle cx="10" cy="7" r="1.5" />
                        </svg>
                        <span>
                          {m.required_facility_policy === "PUSKESMAS_REQUIRED"
                            ? "Puskesmas"
                            : "TPMB / Bidan"}
                        </span>
                      </div>

                      {m.visit_status === "CONFIRMED" && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            background: "rgba(52, 112, 95, 0.12)",
                            padding: "0.25rem 0.4rem",
                            borderRadius: "4px",
                            color: "var(--ink)",
                          }}
                        >
                          Pemeriksaan Terkonfirmasi
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="staff-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.print()}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            title="Cetak ringkasan profil pasien & riwayat K1–K8"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Cetak Rekam Pasien</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Tutup
          </button>
          {isPuskesmas && onOpenAccessCode && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onClose();
                onOpenAccessCode(mother);
              }}
            >
              Terbitkan Kode Akses
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
