"use client";

import type {
  BidanDashboardResponse,
  MotherSummary,
  OrganizationReportResponse,
  PuskesmasDashboardResponse,
  WaFallbackItem,
} from "@anc/contracts";
import { useEffect, useState } from "react";

interface RoleDashboardShellProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
  readonly healthCenterId: string | null;
}

export function RoleDashboardShell({ userRole }: RoleDashboardShellProps) {
  const [puskesmasData, setPuskesmasData] = useState<PuskesmasDashboardResponse | null>(null);
  const [bidanData, setBidanData] = useState<BidanDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Operational Mother Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MotherSummary[]>([]);
  const [searching, setSearching] = useState(false);

  // TASK-P4-013: WhatsApp Fallback Actions Queue
  const [waQueue, setWaQueue] = useState<WaFallbackItem[]>([]);
  const [waLoading, setWaLoading] = useState(false);
  const [waActionMessage, setWaActionMessage] = useState<string | null>(null);

  // TASK-P5-004: Organization Summary Reports
  const [reportData, setReportData] = useState<OrganizationReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    void fetchDashboardData();
    if (userRole !== "SUPER_ADMIN") {
      void fetchWaQueue();
    }
    if (userRole === "PUSKESMAS") {
      void fetchReportSummary();
    }

    async function fetchDashboardData(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        if (userRole === "PUSKESMAS") {
          const res = await fetch("/api/staff-proxy/dashboard/puskesmas");
          if (!res.ok) {
            setError("Gagal memuat dashboard Puskesmas.");
            return;
          }
          const data = (await res.json()) as PuskesmasDashboardResponse;
          setPuskesmasData(data);
        } else if (userRole === "BIDAN") {
          const res = await fetch("/api/staff-proxy/dashboard/bidan");
          if (!res.ok) {
            setError("Gagal memuat dashboard Bidan.");
            return;
          }
          const data = (await res.json()) as BidanDashboardResponse;
          setBidanData(data);
        }
      } catch {
        setError("Koneksi terputus saat memuat data dashboard.");
      } finally {
        setLoading(false);
      }
    }
  }, [userRole]);

  async function fetchWaQueue(): Promise<void> {
    setWaLoading(true);
    try {
      const res = await fetch("/api/staff-proxy/wa-fallback/queue");
      if (res.ok) {
        const data = (await res.json()) as { items: WaFallbackItem[] };
        setWaQueue(data.items);
      }
    } catch {
      // Best-effort load for fallback queue
    } finally {
      setWaLoading(false);
    }
  }

  async function fetchReportSummary(): Promise<void> {
    setReportLoading(true);
    try {
      const res = await fetch("/api/staff-proxy/reports/summary");
      if (res.ok) {
        const data = (await res.json()) as OrganizationReportResponse;
        setReportData(data);
      }
    } catch {
      // Best-effort load for reports summary
    } finally {
      setReportLoading(false);
    }
  }

  async function handleSearchMothers(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/staff-proxy/mothers?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = (await res.json()) as { items: MotherSummary[] };
        setSearchResults(data.items);
      }
    } catch {
      // Handle search network failure gracefully
    } finally {
      setSearching(false);
    }
  }

  async function handleGenerateWaLink(id: string): Promise<void> {
    setWaActionMessage(null);
    try {
      const res = await fetch(`/api/staff-proxy/wa-fallback/${id}/generate-link`, {
        method: "POST",
      });
      if (!res.ok) {
        setWaActionMessage("Gagal membuat link wa.me server-side.");
        return;
      }
      const data = (await res.json()) as { wa_me_url: string; disclaimer: string };
      window.open(data.wa_me_url, "_blank");
      setWaActionMessage(`[READY → LINK_GENERATED] ${data.disclaimer}`);
      void fetchWaQueue();
    } catch {
      setWaActionMessage("Gagal menghubungkan ke server.");
    }
  }

  async function handleResolveWaFallback(id: string): Promise<void> {
    setWaActionMessage(null);
    try {
      const res = await fetch(`/api/staff-proxy/wa-fallback/${id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manual_note: "Tindak lanjut dikirim manual via HP Bidan." }),
      });
      if (!res.ok) {
        setWaActionMessage("Gagal menyelesaikan status pengingat WhatsApp.");
        return;
      }
      setWaActionMessage("Tindak lanjut WhatsApp berhasil diselesaikan.");
      void fetchWaQueue();
    } catch {
      setWaActionMessage("Gagal menghubungkan ke server.");
    }
  }

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card">
        <div className="staff-alert alert-warning">
          <p>
            <strong>Pemberitahuan Akses Terisolasi Super Admin (TASK-P3-007):</strong>
            <br />
            Sesuai kebijakan keamanan dan privasi data (PRD-SECURITY, ADR-004), akun Super Admin
            diberi hak akses <em>deny-by-default</em> dan dilarang melihat data kesehatan
            operasional rutin ibu hamil.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="staff-panel-card">
        <p>Memuat data dashboard operasional...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="staff-panel-card">
        <div className="staff-alert alert-error">
          <p>{error}</p>
        </div>
        <button className="btn-secondary" type="button" onClick={() => window.location.reload()}>
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">TASK-P3-006 / Dashboard Operasional Server-Driven</span>
          <h2>
            {userRole === "PUSKESMAS"
              ? "Ringkasan Wilayah Kerja Puskesmas"
              : "Ringkasan Wilayah Penugasan Bidan"}
          </h2>
        </div>
      </header>

      {/* Puskesmas Dashboard Metrics */}
      {userRole === "PUSKESMAS" && puskesmasData && (
        <div className="dashboard-content-grid">
          <div className="metrics-row">
            <div className="metric-card">
              <span className="metric-label">Bumil Aktif</span>
              <strong className="metric-value">
                {puskesmasData.summary.total_active_pregnancies}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Jadwal Due (Jatuh Tempo)</span>
              <strong className="metric-value text-due">
                {puskesmasData.summary.milestones_due_count}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Overdue (Terlewat)</span>
              <strong className="metric-value text-overdue">
                {puskesmasData.summary.milestones_overdue_count}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Pending Validasi (K1-K6)</span>
              <strong className="metric-value text-pending">
                {puskesmasData.summary.pending_validations_count}
              </strong>
            </div>
          </div>

          <div className="queue-section">
            <h3>Antrean Tindakan Prioritas (Priority Action Queue)</h3>
            {puskesmasData.priority_action_queue.length === 0 ? (
              <p className="empty-notice">Tidak ada antrean tindakan prioritas saat ini.</p>
            ) : (
              <div className="table-responsive">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Nama Pasien</th>
                      <th>Desa</th>
                      <th>Milestone</th>
                      <th>Status Visit</th>
                      <th>Jatuh Tempo</th>
                      <th>Tindakan Diperlukan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puskesmasData.priority_action_queue.map((item, idx) => (
                      <tr key={`${item.mother_id}-${item.milestone_code}-${idx}`}>
                        <td>
                          <strong>{item.mother_full_name}</strong>
                        </td>
                        <td>{item.village_name ?? "-"}</td>
                        <td>
                          <span className="badge-code">{item.milestone_code}</span>
                        </td>
                        <td>
                          <span
                            className={`badge-status status-${item.visit_status.toLowerCase()}`}
                          >
                            {item.visit_status}
                          </span>
                        </td>
                        <td>{item.due_at ?? "-"}</td>
                        <td>
                          <span className="badge-action">
                            {item.action_type === "VALIDATION_NEEDED"
                              ? "Butuh Validasi Detail K1-K6"
                              : item.action_type === "WA_FALLBACK_REQUIRED"
                                ? "Tindak Lanjut Fallback WA"
                                : "Konfirmasi Pemeriksaan"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bidan Dashboard Metrics */}
      {userRole === "BIDAN" && bidanData && (
        <div className="dashboard-content-grid">
          <div className="metrics-row">
            <div className="metric-card">
              <span className="metric-label">Bumil Terdaftar di Desa Anda</span>
              <strong className="metric-value">{bidanData.summary.assigned_mothers_count}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Jadwal Due Periode Ini</span>
              <strong className="metric-value text-due">
                {bidanData.summary.milestones_due_count}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Milestone Overdue</span>
              <strong className="metric-value text-overdue">
                {bidanData.summary.milestones_overdue_count}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Perlu Tindakan Bidan</span>
              <strong className="metric-value text-pending">
                {bidanData.summary.action_required_count}
              </strong>
            </div>
          </div>

          <div className="queue-section">
            <h3>Antrean Konfirmasi Pemeriksaan Bidan (K2 / K3 / K6 / K7)</h3>
            {bidanData.confirmation_queue.length === 0 ? (
              <p className="empty-notice">
                Tidak ada antrean konfirmasi pemeriksaan Bidan saat ini.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Nama Pasien</th>
                      <th>Telepon</th>
                      <th>Desa</th>
                      <th>Milestone</th>
                      <th>Status</th>
                      <th>Jatuh Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bidanData.confirmation_queue.map((item, idx) => (
                      <tr key={`${item.mother_id}-${item.milestone_code}-${idx}`}>
                        <td>
                          <strong>{item.mother_full_name}</strong>
                        </td>
                        <td>{item.mother_phone_masked}</td>
                        <td>{item.village_name ?? "-"}</td>
                        <td>
                          <span className="badge-code">{item.milestone_code}</span>
                        </td>
                        <td>
                          <span
                            className={`badge-status status-${item.visit_status.toLowerCase()}`}
                          >
                            {item.visit_status}
                          </span>
                        </td>
                        <td>{item.due_at ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TASK-P5-004: Organization Summary Reports per Village */}
      {userRole === "PUSKESMAS" && (
        <div className="queue-section" style={{ marginTop: "2rem" }}>
          <header
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <h3>Laporan Ringkasan Aggregat Wilayah Per Desa (TASK-P5-004)</h3>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => void fetchReportSummary()}
            >
              {reportLoading ? "Memuat..." : "Refresh Laporan"}
            </button>
          </header>

          {reportData === null ? (
            <p className="empty-notice">Memuat data laporan agregat wilayah...</p>
          ) : reportData.village_breakdown.length === 0 ? (
            <p className="empty-notice">Belum ada data desa terdaftar di wilayah kerja ini.</p>
          ) : (
            <div className="table-responsive" style={{ marginTop: "1rem" }}>
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Desa / Kelurahan</th>
                    <th>Total Ibu Hamil</th>
                    <th>Kehamilan Aktif</th>
                    <th>Pemeriksaan Dikonfirmasi (K1-K8)</th>
                    <th>Rekam Klinis Tervalidasi</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.village_breakdown.map((row, idx) => (
                    <tr key={row.village_id ?? `v-${idx}`}>
                      <td>
                        <strong>{row.village_name ?? "Luar Wilayah"}</strong>
                      </td>
                      <td>{row.total_mothers} orang</td>
                      <td>{row.active_pregnancies} bumil</td>
                      <td>{row.confirmed_visits} visit</td>
                      <td>
                        <span className="badge-code">{row.validated_records} rekam</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TASK-P4-013: WhatsApp Fallback Actions Queue */}
      <div className="queue-section" style={{ marginTop: "2rem" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Antrean Tindak Lanjut WhatsApp (TASK-P4-013)</h3>
          <button className="btn-secondary" type="button" onClick={() => void fetchWaQueue()}>
            {waLoading ? "Memuat..." : "Refresh Queue"}
          </button>
        </header>

        <p className="field-hint" style={{ marginBottom: "1rem" }}>
          Link <code>wa.me</code> ini adalah aksi manual Bidan/Puskesmas. Sistem{" "}
          <strong>tidak pernah</strong> mengklaim pengiriman otomatis (<code>SENT</code>/
          <code>DELIVERED</code>).
        </p>

        {waActionMessage && (
          <div className="staff-alert alert-info" style={{ marginBottom: "1rem" }}>
            <p>{waActionMessage}</p>
          </div>
        )}

        {waQueue.length === 0 ? (
          <p className="empty-notice">Tidak ada antrean tindak lanjut WhatsApp aktif saat ini.</p>
        ) : (
          <div className="table-responsive">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Nama Ibu Hamil</th>
                  <th>Nomor Telepon</th>
                  <th>Milestone</th>
                  <th>Jatuh Tempo</th>
                  <th>Status</th>
                  <th>Aksi Manual</th>
                </tr>
              </thead>
              <tbody>
                {waQueue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.mother_full_name}</strong>
                    </td>
                    <td>{item.phone_number_masked}</td>
                    <td>
                      <span className="badge-code">{item.milestone_code}</span>
                    </td>
                    <td>{item.due_at ?? "-"}</td>
                    <td>
                      <span className={`badge-status status-${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          className="btn-primary"
                          type="button"
                          onClick={() => void handleGenerateWaLink(item.id)}
                        >
                          Buka WhatsApp
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => void handleResolveWaFallback(item.id)}
                        >
                          Selesai
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scoped Operational Search */}
      <div className="search-section" style={{ marginTop: "2rem" }}>
        <h3>Cari Ibu Hamil Terdaftar</h3>
        <form onSubmit={(e) => void handleSearchMothers(e)} className="search-form">
          <input
            className="staff-input"
            type="text"
            placeholder="Ketik nama atau telepon..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="btn-primary" type="submit" disabled={searching}>
            {searching ? "Mencari..." : "Cari Pasien"}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="table-responsive" style={{ marginTop: "1rem" }}>
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Nama Lengkap</th>
                  <th>Telepon Tereduksi</th>
                  <th>Desa</th>
                  <th>Kehamilan Aktif</th>
                  <th>Usia Kehamilan</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.full_name}</strong>
                    </td>
                    <td>{m.phone_masked}</td>
                    <td>{m.village_name ?? "-"}</td>
                    <td>
                      <span
                        className={`badge-status status-${
                          m.active_pregnancy?.status.toLowerCase() ?? "none"
                        }`}
                      >
                        {m.active_pregnancy?.status ?? "TIDAK ADA"}
                      </span>
                    </td>
                    <td>
                      {m.active_pregnancy
                        ? `${m.active_pregnancy.completed_weeks} mgg ${m.active_pregnancy.completed_days} hari (${m.active_pregnancy.trimester_label})`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
