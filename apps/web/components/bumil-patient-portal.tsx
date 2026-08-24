"use client";

import type {
  MotherSummary,
  PregnancyMilestoneListResponse,
  PregnancyMilestoneResponse,
} from "@anc/contracts";
import { useEffect, useState } from "react";

export function BumilPatientPortal() {
  const [mothers, setMothers] = useState<readonly MotherSummary[]>([]);
  const [selectedMotherId, setSelectedMotherId] = useState<string>("");
  const [loadingMothers, setLoadingMothers] = useState(true);

  const [milestones, setMilestones] = useState<readonly PregnancyMilestoneResponse[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load mothers list from Supabase
  useEffect(() => {
    const controller = new AbortController();
    void loadMothers(controller.signal);
    return () => controller.abort();

    async function loadMothers(signal: AbortSignal): Promise<void> {
      setLoadingMothers(true);
      try {
        const res = await fetch("/api/staff-proxy/mothers", { signal });
        if (res.ok) {
          const data = (await res.json()) as { items: readonly MotherSummary[] };
          const items = data.items ?? [];
          setMothers(items);
          if (items.length > 0) {
            const firstWithPregnancy = items.find((m) => m.active_pregnancy) ?? items[0];
            if (firstWithPregnancy) {
              setSelectedMotherId(firstWithPregnancy.id);
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Gagal memuat daftar ibu hamil dari database.");
        }
      } finally {
        setLoadingMothers(false);
      }
    }
  }, []);

  // When selected mother changes, load pregnancy milestones
  useEffect(() => {
    const mother = mothers.find((m) => m.id === selectedMotherId);
    if (!mother || !mother.active_pregnancy) {
      async function clearMilestones(): Promise<void> {
        setMilestones([]);
      }
      void clearMilestones();
      return;
    }

    const pregnancyId = mother.active_pregnancy.id;
    const controller = new AbortController();
    void loadMilestones(controller.signal);
    return () => controller.abort();

    async function loadMilestones(signal: AbortSignal): Promise<void> {
      setLoadingMilestones(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/staff-proxy/pregnancies/${encodeURIComponent(pregnancyId)}/milestones`,
          { signal },
        );
        if (res.ok) {
          const data = (await res.json()) as PregnancyMilestoneListResponse;
          setMilestones(data.milestones ?? []);
        } else {
          setError("Gagal memuat linimasa pemeriksaan kehamilan.");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Koneksi terputus saat memuat linimasa.");
        }
      } finally {
        setLoadingMilestones(false);
      }
    }
  }, [selectedMotherId, mothers]);

  const activeMother = mothers.find((m) => m.id === selectedMotherId);
  const activePregnancy = activeMother?.active_pregnancy;

  // Calculate gestational progress percent (towards 40 weeks = 280 days)
  const totalDays = activePregnancy
    ? activePregnancy.completed_weeks * 7 + activePregnancy.completed_days
    : 0;
  const progressPercent = Math.min(100, Math.max(0, Math.round((totalDays / 280) * 100)));

  // Determine next milestone
  const nextMilestone =
    milestones.find((m) => m.visit_status === "DUE" || m.visit_status === "OVERDUE") ??
    milestones.find((m) => m.visit_status === "UPCOMING") ??
    milestones[0];

  return (
    <div className="staff-panel-card bumil-portal-wrap">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Pratinjau Pasien</span>
          <h2>Portal Mandiri Bumil (K1–K8)</h2>
          <p className="field-hint">Simulasi tampilan linimasa mandiri dari sisi ibu hamil.</p>
        </div>
      </header>

      {/* Patient Selector for Staff */}
      <div className="staff-portal-selector-card">
        <label htmlFor="portal-mother-select" className="staff-portal-selector-label">
          Pilih Pasien Ibu Hamil untuk Pratinjau Portal
        </label>
        <div className="staff-portal-selector-controls">
          <select
            id="portal-mother-select"
            className="staff-input staff-portal-select"
            value={selectedMotherId}
            onChange={(e) => setSelectedMotherId(e.target.value)}
            disabled={loadingMothers}
          >
            {loadingMothers ? (
              <option value="">Memuat data pasien...</option>
            ) : mothers.length === 0 ? (
              <option value="">Belum ada ibu hamil terdaftar</option>
            ) : (
              mothers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.phone_masked}) - {m.village_name ?? "Tanpa Desa"} [
                  {m.active_pregnancy
                    ? `${m.active_pregnancy.completed_weeks} mg ${m.active_pregnancy.completed_days} hr`
                    : "Tidak Aktif"}
                  ]
                </option>
              ))
            )}
          </select>

          <a
            className="btn-secondary staff-portal-login-link"
            href="/mother/login"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Buka Halaman Login Pasien</span>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <path d="M5 15L15 5M15 5H7M15 5V13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>

      {error && (
        <div className="staff-alert alert-error" style={{ marginBottom: "1rem" }}>
          <p>{error}</p>
        </div>
      )}

      {loadingMilestones ? (
        <div style={{ padding: "2.5rem", textAlign: "center" }}>
          <p className="staff-kicker">Memuat data linimasa kehamilan...</p>
        </div>
      ) : activeMother && activePregnancy ? (
        <div>
          {/* Profile & Gestational Age Card */}
          <section className="mother-profile-card">
            <div className="mother-profile-info">
              <div>
                <h3>{activeMother.full_name}</h3>
                <p className="mother-profile-meta">
                  {activeMother.village_name
                    ? `Desa ${activeMother.village_name}`
                    : "Wilayah Puskesmas Kuncir"}
                  {activeMother.address ? ` · ${activeMother.address}` : ""}
                  {activeMother.phone_masked ? ` · ${activeMother.phone_masked}` : ""}
                </p>
              </div>
            </div>

            <div className="gestational-age-container">
              <div className="gestational-age-box">
                <div className="gestational-age">
                  <span className="gestational-label">Usia Kehamilan Saat Ini</span>
                  <strong>
                    {activePregnancy.completed_weeks} <span>Minggu</span>{" "}
                    {activePregnancy.completed_days} <span>Hari</span>
                  </strong>
                </div>
                <span
                  className={`trimester-badge trimester-${activePregnancy.trimester_label.toLowerCase().replace(/\s+/gu, "-")}`}
                >
                  {activePregnancy.trimester_label}
                </span>
              </div>

              {/* Pregnancy Progress Bar */}
              <div className="pregnancy-progress-wrap">
                <div className="pregnancy-progress-header">
                  <small>Perkembangan Kehamilan (Menuju 40 Minggu)</small>
                  <strong>{progressPercent}%</strong>
                </div>
                <div className="pregnancy-progress-bar">
                  <div
                    className="pregnancy-progress-fill"
                    style={{ width: `${progressPercent}%` }}
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <div className="pregnancy-progress-markers" aria-hidden="true">
                  <span>Trimester 1 (0-13 mg)</span>
                  <span>Trimester 2 (14-27 mg)</span>
                  <span>Trimester 3 (28-40 mg)</span>
                </div>
              </div>
            </div>
          </section>

          {/* Next Milestone Card */}
          {nextMilestone && (
            <section className="next-milestone-card">
              <div className="card-kicker-row">
                <span className="card-kicker">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 2v3M14 2v3M3 8h14M4 4h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Rekomendasi Jadwal Berikutnya
                </span>
                <span className="milestone-pill-badge">{nextMilestone.code}</span>
              </div>
              <div className="next-milestone-body">
                <div>
                  <h4>
                    Milestone {nextMilestone.code} ({nextMilestone.trimester_label})
                  </h4>
                  <p className="milestone-facility">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      width="16"
                      height="16"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 17V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12M2 17h16M9 7h2M10 6v2M8 17v-4h4v4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>
                      Rekomendasi Tempat:{" "}
                      <strong>
                        {nextMilestone.required_facility_policy === "PUSKESMAS_REQUIRED"
                          ? "Puskesmas Kuncir (Skrining Dokter Terpadu)"
                          : "Posyandu / Praktik Bidan Desa Setempat"}
                      </strong>
                    </span>
                  </p>
                </div>
                <div className="next-milestone-due">
                  <span>Rentang Jadwal:</span>
                  <strong>
                    {nextMilestone.target_date_start && nextMilestone.target_date_end
                      ? `${nextMilestone.target_date_start} s/d ${nextMilestone.target_date_end}`
                      : "Sesuai Jadwal"}
                  </strong>
                </div>
              </div>
            </section>
          )}

          {/* Timeline Section K1-K8 */}
          <section className="timeline-section">
            <div className="timeline-header-wrap">
              <h3>Linimasa Lengkap K1 – K8 Pasien</h3>
              <p className="field-hint">
                Status linimasa pemeriksaan diperbarui otomatis oleh bidan/Puskesmas saat kunjungan.
              </p>
            </div>

            <div className="timeline-grid">
              {milestones.map((m) => {
                const status = m.visit_status.toLowerCase();
                const isConfirmed = m.visit_status === "CONFIRMED";
                const isDue = m.visit_status === "DUE";
                const isOverdue = m.visit_status === "OVERDUE";

                return (
                  <div key={m.id} className={`timeline-card status-${status}`}>
                    <div className="timeline-card-top">
                      <span className="timeline-code">{m.code}</span>
                      <span className={`badge-status status-${status}`}>
                        {isConfirmed && (
                          <svg
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            width="12"
                            height="12"
                            aria-hidden="true"
                          >
                            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                          </svg>
                        )}
                        {isDue && (
                          <svg
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            width="12"
                            height="12"
                            aria-hidden="true"
                          >
                            <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v1.884l-.845 2.112A1 1 0 0 0 3.582 11.5h8.836a1 1 0 0 0 .927-1.504L12.5 7.884V6A4.5 4.5 0 0 0 8 1.5ZM6.5 13a1.5 1.5 0 0 0 3 0h-3Z" />
                          </svg>
                        )}
                        {isOverdue && (
                          <svg
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            width="12"
                            height="12"
                            aria-hidden="true"
                          >
                            <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 5a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0V5Zm.75 6.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                          </svg>
                        )}
                        <span>
                          {isConfirmed
                            ? "Sudah Periksa"
                            : isDue
                              ? "Waktunya Periksa"
                              : isOverdue
                                ? "Terlewat"
                                : "Akan Datang"}
                        </span>
                      </span>
                    </div>

                    <div className="timeline-detail">
                      <p className="timeline-date">
                        {isConfirmed
                          ? "Sudah Terverifikasi"
                          : m.due_at
                            ? `Jatuh Tempo: ${m.due_at.slice(0, 10)}`
                            : m.target_date_start && m.target_date_end
                              ? `${m.target_date_start} s/d ${m.target_date_end}`
                              : "Sesuai Usia Kehamilan"}
                      </p>
                      <p className="timeline-facility-tag">
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          width="12"
                          height="12"
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            verticalAlign: "-0.1em",
                            marginRight: "0.25rem",
                          }}
                        >
                          <path
                            d="M10 2a5 5 0 0 0-5 5c0 3.75 5 9 5 9s5-5.25 5-9a5 5 0 0 0-5-5Z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="10" cy="7" r="1.75" />
                        </svg>
                        <span>
                          {m.code === "K1" || m.code === "K5"
                            ? "Puskesmas (Dokter)"
                            : "Posyandu / Bidan Desa"}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div
          style={{
            padding: "2.5rem 1.5rem",
            textAlign: "center",
            background: "var(--paper)",
            borderRadius: "12px",
            border: "1px dashed var(--line-strong)",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem" }}>Belum Ada Data Pasien Kehamilan Aktif</h3>
          <p className="field-hint" style={{ maxWidth: "26rem", margin: "0 auto" }}>
            Silakan daftarkan pasien baru pada tab Register Bumil untuk melihat simulasi linimasa
            mandiri pasien.
          </p>
        </div>
      )}

      <footer className="thin-client-footer" style={{ marginTop: "2rem" }}>
        <p>
          Seluruh perhitungan usia kehamilan, tanggal rekomendasi, dan status K1–K8 dihitung
          otomatis oleh server.
        </p>
      </footer>
    </div>
  );
}
