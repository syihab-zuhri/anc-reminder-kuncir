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

  // Determine next milestone
  const nextMilestone =
    milestones.find((m) => m.visit_status === "DUE" || m.visit_status === "OVERDUE") ??
    milestones.find((m) => m.visit_status === "UPCOMING");

  return (
    <div className="staff-panel-card bumil-portal-wrap">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Pratinjau Portal Mandiri Ibu Hamil</span>
          <h2>Linimasa Pemeriksaan Kehamilan Pasien (K1–K8)</h2>
        </div>
      </header>

      {/* Patient Selector for Staff */}
      <div
        style={{
          marginBottom: "1.5rem",
          padding: "1.25rem",
          background: "var(--color-surface, #f8fafc)",
          borderRadius: "8px",
          border: "1px solid var(--color-border, #e2e8f0)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "flex-end",
            gap: "1rem",
          }}
        >
          <div>
            <label
              htmlFor="portal-mother-select"
              style={{
                display: "block",
                fontWeight: 600,
                fontSize: "0.95rem",
                marginBottom: "0.5rem",
                color: "var(--color-ink, #0f172a)",
              }}
            >
              Pilih Pasien Ibu Hamil untuk Melihat Pratinjau Portal
            </label>
            <select
              id="portal-mother-select"
              className="staff-input"
              style={{
                width: "100%",
                height: "44px",
                margin: 0,
              }}
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
          </div>

          <a
            className="btn-secondary"
            href="/mother/login"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              height: "44px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              whiteSpace: "nowrap",
              padding: "0 1.25rem",
              fontWeight: 600,
            }}
          >
            <span>Buka Halaman Login Pasien</span>
            <span aria-hidden="true" style={{ fontSize: "1.1rem" }}>
              ↗
            </span>
          </a>
        </div>
      </div>

      {error && (
        <div className="staff-alert alert-error" style={{ marginBottom: "1rem" }}>
          <p>{error}</p>
        </div>
      )}

      {loadingMilestones ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p className="staff-kicker">Memuat data linimasa kehamilan dari Supabase...</p>
        </div>
      ) : activeMother && activePregnancy ? (
        <div>
          {/* Hero Patient Card */}
          <section className="bumil-hero-card">
            <div className="bumil-profile-info">
              <h3>{activeMother.full_name}</h3>
              <p>
                {activeMother.address} &bull;{" "}
                {activeMother.village_name ?? "Wilayah Puskesmas Kuncir"}
              </p>
              <small style={{ color: "var(--color-ink-muted)" }}>
                HPHT: {activePregnancy.dating_date} &bull; No. Kontak: {activeMother.phone_masked}
              </small>
            </div>

            <div className="gestational-badge-box">
              <span className="trimester-badge">{activePregnancy.trimester_label}</span>
              <div className="gestational-age">
                <strong>
                  {activePregnancy.completed_weeks} Minggu {activePregnancy.completed_days} Hari
                </strong>
                <small>Usia Kehamilan (Server-Calculated)</small>
              </div>
            </div>
          </section>

          {/* Next Milestone Banner */}
          {nextMilestone && (
            <section className="next-milestone-banner" style={{ margin: "1.5rem 0" }}>
              <span className="banner-kicker">Rekomendasi Jadwal Berikutnya</span>
              <div className="banner-body">
                <div>
                  <h4>
                    Milestone {nextMilestone.code} ({nextMilestone.trimester_label})
                  </h4>
                  <p>
                    Tempat Pemeriksaan:{" "}
                    <strong>
                      {nextMilestone.required_facility_policy === "PUSKESMAS_REQUIRED"
                        ? "Puskesmas Kuncir (Skrining Dokter Terpadu)"
                        : "Posyandu / Praktik Bidan Desa Setempat"}
                    </strong>
                  </p>
                </div>
                <div className="banner-due">
                  <span className="due-label">Rentang Rekomendasi:</span>
                  <strong className="due-date">
                    {nextMilestone.target_date_start ?? "Sesuai Jadwal"} s/d{" "}
                    {nextMilestone.target_date_end ?? "Sesuai Jadwal"}
                  </strong>
                </div>
              </div>
            </section>
          )}

          {/* Live Milestone Timeline K1 - K8 */}
          <section className="milestone-timeline-section">
            <h3>Linimasa Lengkap K1 – K8 Pasien</h3>
            <p className="section-help">
              Status linimasa (CONFIRMED, DUE, OVERDUE, UPCOMING) dihitung dan dikirim langsung
              secara real-time oleh server backend Supabase.
            </p>

            <div className="timeline-grid">
              {milestones.map((m) => {
                const isConfirmed = m.visit_status === "CONFIRMED";
                const isDue = m.visit_status === "DUE";
                const isOverdue = m.visit_status === "OVERDUE";

                let statusBadge: React.ReactNode = "Akan Datang";
                let statusClass = "upcoming";

                if (isConfirmed) {
                  statusBadge = " Sudah Periksa";
                  statusClass = "completed";
                } else if (isOverdue) {
                  statusBadge = " Terlewat (Overdue)";
                  statusClass = "overdue";
                } else if (isDue) {
                  statusBadge = " Waktunya Periksa";
                  statusClass = "due";
                }

                return (
                  <div key={m.id} className={`timeline-card status-${statusClass}`}>
                    <div className="timeline-code">{m.code}</div>
                    <div className="timeline-detail">
                      <span className={`badge-status status-${statusClass}`}>{statusBadge}</span>
                      <small
                        className="timeline-date"
                        style={{ fontWeight: 600, display: "block", marginTop: "0.25rem" }}
                      >
                        {m.trimester_label}
                      </small>
                      <small style={{ color: "var(--color-ink-muted)", fontSize: "0.8rem" }}>
                        {isConfirmed
                          ? "Tercatat di Supabase"
                          : m.target_date_start && m.target_date_end
                            ? `${m.target_date_start} s/d ${m.target_date_end}`
                            : "Sesuai Usia Kehamilan"}
                      </small>
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
            padding: "2rem",
            textAlign: "center",
            background: "var(--color-surface)",
            borderRadius: "8px",
          }}
        >
          <h3>Belum Ada Data Pasien Kehamilan Aktif</h3>
          <p style={{ color: "var(--color-ink-muted)" }}>
            Silakan daftarkan pasien baru pada tab <strong>03 Register Bumil</strong> untuk melihat
            simulasi linimasa mandiri.
          </p>
        </div>
      )}

      <footer className="thin-client-footer" style={{ marginTop: "2rem" }}>
        <p>
          <strong>Prinsip Server-Driven Thin Client (ADR Server-Driven):</strong> Seluruh
          perhitungan usia kehamilan, tanggal rujukan, dan status K1-K8 dilakukan oleh server API
          Supabase. Aplikasi mandiri ibu hamil tidak menyimpan atau mengubah status lokal.
        </p>
      </footer>
    </div>
  );
}
