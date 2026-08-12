"use client";

import type { BumilDashboardResponse } from "@anc/contracts";
import { useEffect, useState } from "react";

export function BumilPatientPortal() {
  const [data, setData] = useState<BumilDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBumilDashboard();

    async function fetchBumilDashboard(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/staff-proxy/mother/me/dashboard");
        if (!res.ok) {
          // Try alternative mother endpoint or show fallback
          setError("Sesi mandiri Ibu Hamil belum terhubung.");
          return;
        }
        const parsed = (await res.json()) as BumilDashboardResponse;
        setData(parsed);
      } catch {
        setError("Koneksi terputus saat memuat linimasa Ibu Hamil.");
      } finally {
        setLoading(false);
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="staff-panel-card">
        <p className="staff-kicker">Memuat Linimasa Ibu Hamil…</p>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="staff-panel-card">
        <header className="staff-panel-header">
          <div>
            <span className="staff-kicker">TASK-P3-010 / Portal Mandiri Ibu Hamil</span>
            <h2>Linimasa Pemeriksaan Kehamilan (K1–K8)</h2>
          </div>
        </header>
        <div className="staff-alert alert-error">
          <p>{error ?? "Data kehamilan belum tersedia."}</p>
        </div>
        <p>
          Halaman ini menampilkan linimasa K1-K8, rekomendasi jadwal berikutnya, dan usia kehamilan
          yang dihitung secara aman oleh server.
        </p>
      </div>
    );
  }

  return (
    <div className="staff-panel-card bumil-portal-wrap">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">TASK-P3-010 / Thin-Client Ibu Hamil</span>
          <h2>Linimasa Pemeriksaan ANC Ibu Hamil</h2>
        </div>
      </header>

      {/* Profile & Gestational Age Card */}
      <section className="bumil-hero-card">
        <div className="bumil-profile-info">
          <h3>{data.mother_info.full_name}</h3>
          <p>
            {data.mother_info.address}{" "}
            {data.mother_info.village_name ? `(${data.mother_info.village_name})` : ""}
          </p>
        </div>

        {data.active_pregnancy ? (
          <div className="gestational-badge-box">
            <span className="trimester-badge">{data.active_pregnancy.trimester_label}</span>
            <div className="gestational-age">
              <strong>
                {data.active_pregnancy.completed_weeks} Minggu{" "}
                {data.active_pregnancy.completed_days} Hari
              </strong>
              <small>Usia Kehamilan (Hasil Kalkulasi Server)</small>
            </div>
          </div>
        ) : (
          <p className="empty-notice">Tidak ada kehamilan aktif terdaftar saat ini.</p>
        )}
      </section>

      {/* Next Milestone Banner */}
      {data.next_milestone && (
        <section className="next-milestone-banner">
          <span className="banner-kicker">Rekomendasi Jadwal Berikutnya</span>
          <div className="banner-body">
            <div>
              <h4>Milestone {data.next_milestone.milestone_code}</h4>
              <p>
                Fasilitas Rujukan:{" "}
                <strong>
                  {data.next_milestone.recommended_facility_name ?? "Puskesmas / Posyandu"}
                </strong>
              </p>
            </div>
            <div className="banner-due">
              <span className="due-label">Jatuh Tempo:</span>
              <strong className="due-date">
                {data.next_milestone.due_at ??
                  data.next_milestone.expected_due_date ??
                  "Sesuai Jadwal"}
              </strong>
            </div>
          </div>
        </section>
      )}

      {/* Timeline K1 - K8 */}
      <section className="milestone-timeline-section">
        <h3>Linimasa Lengkap K1 – K8</h3>
        <p className="section-help">
          Status pemeriksaan diperbarui otomatis oleh bidan/petugas Puskesmas saat kunjungan.
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

      <footer className="thin-client-footer">
        <p>
          <strong>Prinsip Server-Driven Thin Client (ADR Server-Driven):</strong> Seluruh
          perhitungan usia kehamilan, tanggal rujukan, dan status K1-K8 dilakukan oleh server API.
          Halaman ini tidak menyimpan atau mengubah status lokal.
        </p>
      </footer>
    </div>
  );
}
