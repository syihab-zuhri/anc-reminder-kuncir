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
      <div className="staff-panel-card bumil-portal-wrap">
        <header className="staff-panel-header">
          <div>
            <span className="staff-kicker">TASK-P3-010 / Portal Mandiri Ibu Hamil</span>
            <h2>Linimasa Pemeriksaan Kehamilan (K1–K8)</h2>
          </div>
        </header>

        <div className="staff-alert alert-info">
          <p>
            <strong>Portal Mandiri Ibu Hamil:</strong> Halaman ini merupakan antarmuka khusus ibu
            hamil yang diakses secara terpisah melalui <code>/mother/login</code> menggunakan Nama
            Lengkap dan Kode Akses 16 karakter yang diterbitkan saat pendaftaran.
          </p>
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <a
            className="btn-primary"
            href="/mother/login"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span>Buka Portal Ibu Hamil</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        {/* Informational Preview of Thin-Client Mother Portal */}
        <section className="bumil-hero-card">
          <div className="bumil-profile-info">
            <h3>Contoh Tampilan Pasien Ibu Hamil</h3>
            <p>Dusun Kuncir, Desa Kuncir (Puskesmas Kuncir)</p>
          </div>

          <div className="gestational-badge-box">
            <span className="trimester-badge">Trimester 2</span>
            <div className="gestational-age">
              <strong>18 Minggu 4 Hari</strong>
              <small>Usia Kehamilan (Kalkulasi Otomatis Server)</small>
            </div>
          </div>
        </section>

        {/* Milestone Banner Preview */}
        <section className="next-milestone-banner">
          <span className="banner-kicker">Rekomendasi Jadwal Berikutnya</span>
          <div className="banner-body">
            <div>
              <h4>Milestone K2 (Kunjungan Kedua)</h4>
              <p>
                Fasilitas Rujukan: <strong>Posyandu Melati 01 / Bidan Desa</strong>
              </p>
            </div>
            <div className="banner-due">
              <span className="due-label">Jatuh Tempo:</span>
              <strong className="due-date">Sesuai Rekomendasi Server</strong>
            </div>
          </div>
        </section>

        {/* Timeline Structure */}
        <section className="milestone-timeline-section">
          <h3>Struktur Linimasa K1 – K8 Server-Driven</h3>
          <p className="section-help">
            Status pemeriksaan (CONFIRMED, DUE, OVERDUE, UPCOMING) dihitung dan dikirim langsung
            oleh server backend tanpa komputasi lokal.
          </p>

          <div className="timeline-grid">
            {[
              { code: "K1", name: "K1 (TM 1 - Skrining Dokter)", status: "CONFIRMED", label: "Sudah Periksa" },
              { code: "K2", name: "K2 (TM 2 - Pemeriksaan Bidan)", status: "DUE", label: "Jatuh Tempo" },
              { code: "K3", name: "K3 (TM 2 - Evaluasi Janin)", status: "UPCOMING", label: "Akan Datang" },
              { code: "K4", name: "K4 (TM 3 - Pemantauan TM3)", status: "UPCOMING", label: "Akan Datang" },
              { code: "K5", name: "K5 (TM 3 - Dokter & Persalinan)", status: "UPCOMING", label: "Akan Datang" },
              { code: "K6", name: "K6 (TM 3 - Skrining Akhir)", status: "UPCOMING", label: "Akan Datang" },
              { code: "K7", name: "K7 (TM 3 - Bidan/Posyandu)", status: "UPCOMING", label: "Akan Datang" },
              { code: "K8", name: "K8 (TM 3 - Evaluasi Akhir)", status: "UPCOMING", label: "Akan Datang" },
            ].map((m) => (
              <div key={m.code} className={`timeline-card status-${m.status.toLowerCase()}`}>
                <div className="timeline-code">{m.code}</div>
                <div className="timeline-detail">
                  <span className={`badge-status status-${m.status.toLowerCase()}`}>{m.label}</span>
                  <small className="timeline-date">{m.name}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="thin-client-footer">
          <p>
            <strong>Prinsip Server-Driven Thin Client (ADR Server-Driven):</strong> Seluruh
            perhitungan usia kehamilan, tanggal rujukan, dan status K1-K8 dilakukan oleh server API.
            Aplikasi mandiri ibu hamil tidak menyimpan atau mengubah status lokal.
          </p>
        </footer>
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
