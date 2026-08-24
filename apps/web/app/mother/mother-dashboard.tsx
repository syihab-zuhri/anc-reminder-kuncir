"use client";

import type { BumilDashboardResponse, MotherMeResponse } from "@anc/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly identity: MotherMeResponse }
  | { readonly kind: "unavailable" };

export function MotherDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
  const [data, setData] = useState<BumilDashboardResponse | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();

    async function loadSession(signal: AbortSignal): Promise<void> {
      try {
        const res = await fetch("/api/mother-session/me", { cache: "no-store", signal });
        if (res.status === 401) {
          router.replace("/mother/login?reason=session-expired");
          return;
        }
        if (!res.ok) {
          setSession({ kind: "unavailable" });
          return;
        }
        const identity = (await res.json()) as MotherMeResponse;
        setSession({ kind: "ready", identity });
        void loadDashboard(signal);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSession({ kind: "unavailable" });
        }
      }
    }

    async function loadDashboard(signal: AbortSignal): Promise<void> {
      try {
        const res = await fetch("/api/mother-proxy/mother/me/dashboard", {
          cache: "no-store",
          signal,
        });
        if (!res.ok) {
          setDataError("Gagal memuat data kehamilan Anda.");
          return;
        }
        setData((await res.json()) as BumilDashboardResponse);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDataError("Koneksi terputus saat memuat data kehamilan.");
        }
      }
    }
  }, [router]);

  async function handleLogout(): Promise<void> {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/mother-session/logout", { method: "POST" });
    } finally {
      router.replace("/mother/login?reason=logged-out");
      router.refresh();
    }
  }

  if (session.kind === "loading") {
    return (
      <div className="mother-loading" aria-busy="true">
        <p>Memeriksa sesi Anda…</p>
      </div>
    );
  }

  if (session.kind === "unavailable") {
    return (
      <div className="mother-error-card">
        <h2>Koneksi Terputus</h2>
        <p>Tidak dapat menghubungi server. Coba muat ulang halaman.</p>
        <button className="btn-primary" type="button" onClick={() => window.location.reload()}>
          Coba Lagi
        </button>
      </div>
    );
  }

  const activePregnancy = data?.active_pregnancy;
  const totalDays = activePregnancy
    ? activePregnancy.completed_weeks * 7 + activePregnancy.completed_days
    : 0;
  const progressPercent = Math.min(100, Math.max(0, Math.round((totalDays / 280) * 100)));

  return (
    <div className="mother-dashboard">
      <header className="mother-dashboard-header">
        <div className="mother-user-greeting">
          <span className="mother-avatar-chip" aria-hidden="true">
            {session.identity.display_name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <span className="mother-greeting">Halo Ibu,</span>
            <h2>{session.identity.display_name}</h2>
          </div>
        </div>
        <button
          className="btn-logout"
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          aria-label="Keluar dari akun"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path
              d="M7 17H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3M13 14l4-4-4-4M17 10H7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{loggingOut ? "Keluar…" : "Keluar"}</span>
        </button>
      </header>

      {dataError && (
        <div className="mother-alert alert-error" role="alert">
          <p>{dataError}</p>
        </div>
      )}

      {data === null && dataError === null && (
        <div className="mother-loading" aria-busy="true">
          <div className="mother-spinner" aria-hidden="true" />
          <p>Memuat data kehamilan Anda…</p>
        </div>
      )}

      {data !== null && (
        <>
          {/* Profile & Gestational Age Card */}
          <section className="mother-profile-card">
            <div className="mother-profile-info">
              <div>
                <h3>{data.mother_info.full_name}</h3>
                <p className="mother-profile-meta">
                  {data.mother_info.village_name
                    ? `Desa ${data.mother_info.village_name}`
                    : "Wilayah Puskesmas Kuncir"}
                  {data.mother_info.address ? ` · ${data.mother_info.address}` : ""}
                </p>
              </div>
            </div>

            {data.active_pregnancy ? (
              <div className="gestational-age-container">
                <div className="gestational-age-box">
                  <div className="gestational-age">
                    <span className="gestational-label">Usia Kehamilan Saat Ini</span>
                    <strong>
                      {data.active_pregnancy.completed_weeks} <span>Minggu</span>{" "}
                      {data.active_pregnancy.completed_days} <span>Hari</span>
                    </strong>
                  </div>
                  <span
                    className={`trimester-badge trimester-${data.active_pregnancy.trimester_label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {data.active_pregnancy.trimester_label}
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
            ) : (
              <p className="empty-notice">Tidak ada kehamilan aktif terdaftar saat ini.</p>
            )}
          </section>

          {/* Next Milestone Card */}
          {data.next_milestone && (
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
                  Jadwal Kunjungan Berikutnya
                </span>
                <span className="milestone-pill-badge">{data.next_milestone.milestone_code}</span>
              </div>
              <div className="next-milestone-body">
                <div>
                  <h4>Milestone {data.next_milestone.milestone_code}</h4>
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
                      Rekomendasi:{" "}
                      <strong>
                        {data.next_milestone.recommended_facility_name ?? "Posyandu / Bidan Desa"}
                      </strong>
                    </span>
                  </p>
                </div>
                <div className="next-milestone-due">
                  <span>Jatuh Tempo:</span>
                  <strong>
                    {data.next_milestone.due_at ??
                      data.next_milestone.expected_due_date ??
                      "Sesuai Jadwal"}
                  </strong>
                </div>
              </div>
            </section>
          )}

          {/* Timeline K1-K8 */}
          <section className="timeline-section">
            <div className="timeline-header-wrap">
              <div>
                <h3>Linimasa Pemeriksaan K1 – K8</h3>
                <p className="section-help">
                  Status diperbarui otomatis oleh bidan/Puskesmas saat kunjungan.
                </p>
              </div>
            </div>

            <div className="timeline-grid">
              {data.milestones.map((m) => {
                const status = m.visit_status.toLowerCase();
                const isConfirmed = m.visit_status === "CONFIRMED";
                const isDue = m.visit_status === "DUE";
                const isOverdue = m.visit_status === "OVERDUE";

                return (
                  <div key={m.milestone_code} className={`timeline-card status-${status}`}>
                    <div className="timeline-card-top">
                      <span className="timeline-code">{m.milestone_code}</span>
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
                        {m.occurred_on
                          ? `Periksa: ${m.occurred_on}`
                          : m.due_at
                            ? `Jatuh Tempo: ${m.due_at}`
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
                          style={{ display: "inline-block", verticalAlign: "-0.1em", marginRight: "0.25rem" }}
                        >
                          <path
                            d="M10 2a5 5 0 0 0-5 5c0 3.75 5 9 5 9s5-5.25 5-9a5 5 0 0 0-5-5Z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="10" cy="7" r="1.75" />
                        </svg>
                        <span>
                          {m.milestone_code === "K1" || m.milestone_code === "K5"
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

          <footer className="mother-dashboard-footer">
            <p>
              Seluruh perhitungan usia kehamilan dan status pemeriksaan dihitung oleh server.
              Halaman ini tidak menyimpan data lokal.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
