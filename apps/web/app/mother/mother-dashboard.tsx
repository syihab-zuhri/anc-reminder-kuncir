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
        <p>Memeriksa sesi Anda\u2026</p>
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

  return (
    <div className="mother-dashboard">
      <header className="mother-dashboard-header">
        <div>
          <span className="mother-greeting">Selamat datang,</span>
          <h2>{session.identity.display_name}</h2>
        </div>
        <button
          className="btn-logout"
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
        >
          {loggingOut ? "Keluar\u2026" : "Keluar"}
        </button>
      </header>

      {dataError && (
        <div className="mother-alert alert-error">
          <p>{dataError}</p>
        </div>
      )}

      {data === null && dataError === null && (
        <div className="mother-loading">
          <p>Memuat data kehamilan\u2026</p>
        </div>
      )}

      {data !== null && (
        <>
          {/* Profile & Gestational Age */}
          <section className="mother-profile-card">
            <div className="mother-profile-info">
              <h3>{data.mother_info.full_name}</h3>
              <p>
                {data.mother_info.address}{" "}
                {data.mother_info.village_name ? `(${data.mother_info.village_name})` : ""}
              </p>
            </div>

            {data.active_pregnancy ? (
              <div className="gestational-age-box">
                <span className="trimester-badge">{data.active_pregnancy.trimester_label}</span>
                <div className="gestational-age">
                  <strong>
                    {data.active_pregnancy.completed_weeks} Minggu{" "}
                    {data.active_pregnancy.completed_days} Hari
                  </strong>
                  <small>Usia Kehamilan</small>
                </div>
              </div>
            ) : (
              <p className="empty-notice">Tidak ada kehamilan aktif terdaftar saat ini.</p>
            )}
          </section>

          {/* Next Milestone */}
          {data.next_milestone && (
            <section className="next-milestone-card">
              <span className="card-kicker">Jadwal Kunjungan Berikutnya</span>
              <div className="next-milestone-body">
                <div>
                  <h4>{data.next_milestone.milestone_code}</h4>
                  <p>
                    Fasilitas:{" "}
                    <strong>
                      {data.next_milestone.recommended_facility_name ?? "Puskesmas / Posyandu"}
                    </strong>
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
            <h3>Linimasa Pemeriksaan K1 – K8</h3>
            <p className="section-help">
              Status diperbarui otomatis oleh bidan/petugas Puskesmas saat kunjungan.
            </p>
            <div className="timeline-grid">
              {data.milestones.map((m) => (
                <div
                  key={m.milestone_code}
                  className={`timeline-card status-${m.visit_status.toLowerCase()}`}
                >
                  <div className="timeline-code">{m.milestone_code}</div>
                  <div className="timeline-detail">
                    <span className={`badge-status status-${m.visit_status.toLowerCase()}`}>
                      {m.visit_status === "CONFIRMED"
                        ? "Sudah Periksa"
                        : m.visit_status === "DUE"
                          ? "Jatuh Tempo"
                          : m.visit_status === "OVERDUE"
                            ? "Terlewat"
                            : "Akan Datang"}
                    </span>
                    <small className="timeline-date">
                      {m.occurred_on
                        ? `Periksa: ${m.occurred_on}`
                        : m.due_at
                          ? `Jatuh Tempo: ${m.due_at}`
                          : "Sesuai Jadwal"}
                    </small>
                  </div>
                </div>
              ))}
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
