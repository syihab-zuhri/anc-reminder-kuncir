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

  // Synchronize push notification registration when running inside Capacitor Android app
  useEffect(() => {
    if (session.kind !== "ready") return;

    let unmounted = false;
    async function syncCapacitorPush() {
      try {
        const cap = (
          window as unknown as {
            Capacitor?: {
              isNativePlatform?: () => boolean;
              Plugins?: {
                PushNotifications?: {
                  checkPermissions: () => Promise<{ receive: string }>;
                  requestPermissions: () => Promise<{ receive: string }>;
                  register: () => Promise<void>;
                  addListener: (
                    event: string,
                    cb: (payload: { value: string }) => void,
                  ) => Promise<{ remove: () => Promise<void> }>;
                };
              };
            };
          }
        ).Capacitor;

        if (cap?.isNativePlatform?.() && cap.Plugins?.PushNotifications) {
          const pn = cap.Plugins.PushNotifications;
          let perm = await pn.checkPermissions();
          if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
            perm = await pn.requestPermissions();
          }
          if (perm.receive === "granted") {
            await pn.register();
            await pn.addListener("registration", async (token) => {
              if (unmounted) return;
              await fetch("/api/mother-proxy/mother/me/devices/android", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ push_token: token.value }),
              });
            });
          }
        }
      } catch (err) {
        console.warn("Capacitor push sync skipped:", err);
      }
    }

    void syncCapacitorPush();
    return () => {
      unmounted = true;
    };
  }, [session.kind]);

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
                        {data.next_milestone.recommended_facility_name ?? "TPMB / Bidan"}
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

          {/* Notifikasi Pengingat HP Pasien (ntfy) */}
          <section
            style={{
              marginTop: "1rem",
              padding: "1.1rem",
              background: "#eff6ff",
              border: "1.5px solid #bfdbfe",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    borderRadius: "8px",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    width="18"
                    height="18"
                    aria-hidden="true"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#1e3a8a", fontWeight: 600 }}>
                    Pengingat Jadwal di HP (Push Notifikasi)
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "#3b82f6" }}>
                    Dapatkan alarm & pemberitahuan otomatis H-3 & H-1 sebelum jadwal kunjungan.
                  </p>
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "9999px",
                  background: "#dbeafe",
                  color: "#1e40af",
                  fontWeight: 600,
                }}
              >
                Aktif & Siaga
              </span>
            </div>

            <div
              style={{
                fontSize: "0.83rem",
                color: "#1e293b",
                background: "#ffffff",
                padding: "0.85rem",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                lineHeight: 1.5,
              }}
            >
              <div style={{ marginBottom: "0.5rem" }}>
                <strong>Topik Notifikasi Anda:</strong>{" "}
                <code
                  style={{
                    background: "#f1f5f9",
                    padding: "0.2rem 0.45rem",
                    borderRadius: "4px",
                    color: "#0f172a",
                    fontWeight: 600,
                  }}
                >
                  posyandukkn26-bumil-
                  {session.kind === "ready" ? session.identity.id.split("-")[0] : "pasien"}
                </code>
              </div>
              <div
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
              >
                <a
                  href={`https://ntfy.posyandukkn26.my.id/posyandukkn26-bumil-${session.kind === "ready" ? session.identity.id.split("-")[0] : "pasien"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "#2563eb",
                    color: "#ffffff",
                    textDecoration: "none",
                    padding: "0.45rem 0.9rem",
                    borderRadius: "6px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Buka Saluran Pengingat HP
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const motherIdShort =
                      session.kind === "ready" ? session.identity.id.split("-")[0] : "pasien";
                    const topic = `posyandukkn26-bumil-${motherIdShort}`;
                    void navigator.clipboard.writeText(topic);
                    alert(
                      `Nama topik "${topic}" berhasil disalin. Buka aplikasi ntfy lalu tambahkan topik ini.`,
                    );
                  }}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    padding: "0.45rem 0.85rem",
                    borderRadius: "6px",
                    fontSize: "0.82rem",
                    color: "#334155",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Salin Nama Topik
                </button>
              </div>
            </div>
          </section>

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

          {/* Edukasi Tanda Bahaya Kehamilan & Bantuan Bidan */}
          <section
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: "12px",
            }}
          >
            <h4
              style={{
                margin: "0 0 0.5rem",
                color: "#9f1239",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Tanda Bahaya Kehamilan (Segera ke Puskesmas/IGD)</span>
            </h4>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.25rem",
                fontSize: "0.85rem",
                color: "#881337",
                display: "grid",
                gap: "0.3rem",
              }}
            >
              <li>Perdarahan dari jalan lahir atau keluar cairan ketuban sebelum waktunya.</li>
              <li>Sakit kepala hebat, pandangan kabur, atau kejang/bengkak pada kaki dan wajah.</li>
              <li>Demam tinggi, muntah terus-menerus hingga tidak mau makan.</li>
              <li>Gerakan janin berkurang atau tidak terasa sama sekali.</li>
            </ul>
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
