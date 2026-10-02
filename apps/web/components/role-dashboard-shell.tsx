"use client";

import type {
  BidanDashboardResponse,
  MotherSummary,
  OrganizationReportResponse,
  PuskesmasDashboardResponse,
  ReminderSummaryResponse,
  WaFallbackItem,
} from "@anc/contracts";
import { useEffect, useState } from "react";

interface RoleDashboardShellProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
  readonly healthCenterId: string | null;
  readonly onNavigateTab?: (
    tab:
      | "summary"
      | "mothers"
      | "register"
      | "access"
      | "clinical"
      | "confirm"
      | "bumil"
      | "admin"
      | "content",
  ) => void;
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
  const [reminderSummary, setReminderSummary] = useState<ReminderSummaryResponse | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);

  // Re-confirmation modal state for WhatsApp Fallback Actions
  const [waConfirmDialog, setWaConfirmDialog] = useState<{
    type: "GENERATE_LINK" | "RESOLVE" | "UNREACHABLE";
    item: WaFallbackItem;
  } | null>(null);
  const [waActionSubmitting, setWaActionSubmitting] = useState(false);

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
      void fetchReminderSummary();
    }

    async function fetchDashboardData(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        if (userRole === "PUSKESMAS") {
          const res = await fetch("/api/staff-proxy/dashboard/puskesmas");
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            setError(data?.error?.message ?? data?.message ?? "Gagal memuat dashboard Puskesmas.");
            return;
          }
          const data = (await res.json()) as PuskesmasDashboardResponse;
          setPuskesmasData(data);
        } else if (userRole === "BIDAN") {
          const res = await fetch("/api/staff-proxy/dashboard/bidan");
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            setError(data?.error?.message ?? data?.message ?? "Gagal memuat dashboard Bidan.");
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

  async function fetchReminderSummary(): Promise<void> {
    setReminderLoading(true);
    try {
      const res = await fetch("/api/staff-proxy/reminders/summary", { cache: "no-store" });
      if (res.ok) {
        setReminderSummary((await res.json()) as ReminderSummaryResponse);
      }
    } catch {
      // The clinical dashboard remains usable when observability is unavailable.
    } finally {
      setReminderLoading(false);
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
      setWaActionMessage("Link WhatsApp berhasil dibuka di tab baru.");
      void fetchWaQueue();
      if (userRole === "PUSKESMAS") void fetchReminderSummary();
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
      if (userRole === "PUSKESMAS") void fetchReminderSummary();
    } catch {
      setWaActionMessage("Gagal menghubungkan ke server.");
    }
  }

  async function handleUnreachableWaFallback(id: string): Promise<void> {
    setWaActionMessage(null);
    try {
      const res = await fetch(`/api/staff-proxy/reminders/fallback-actions/${id}/unreachable`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manual_note: "Nomor tidak dapat dihubungi setelah percobaan tindak lanjut manual.",
        }),
      });
      if (!res.ok) {
        setWaActionMessage("Gagal mencatat bahwa nomor tidak dapat dihubungi.");
        return;
      }
      setWaActionMessage("Hasil tindak lanjut dicatat: nomor tidak dapat dihubungi.");
      void fetchWaQueue();
      if (userRole === "PUSKESMAS") void fetchReminderSummary();
    } catch {
      setWaActionMessage("Gagal menghubungkan ke server.");
    }
  }

  async function handleExecuteWaConfirm(): Promise<void> {
    if (!waConfirmDialog) return;
    const { type, item } = waConfirmDialog;
    setWaActionSubmitting(true);
    try {
      if (type === "GENERATE_LINK") {
        await handleGenerateWaLink(item.id);
      } else if (type === "RESOLVE") {
        await handleResolveWaFallback(item.id);
      } else if (type === "UNREACHABLE") {
        await handleUnreachableWaFallback(item.id);
      }
      setWaConfirmDialog(null);
    } finally {
      setWaActionSubmitting(false);
    }
  }

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card">
        <div className="staff-alert alert-warning">
          <p>
            <strong>Pemberitahuan Akses Terisolasi Super Admin:</strong>
            <br />
            Sesuai kebijakan keamanan dan privasi data, akun Super Admin diberi hak akses{" "}
            <em>deny-by-default</em> dan dilarang melihat data kesehatan operasional rutin ibu
            hamil.
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
          <span className="staff-kicker">Dashboard Operasional</span>
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
            {/* Fitur Tambahan: Detail Klinis K1-K6 (Disembunyikan sementara) */}
          </div>
          <div className="queue-section">
            <h3>Antrean Tindakan Prioritas (Priority Action Queue)</h3>
            {puskesmasData.priority_action_queue.filter(
              (item) => item.action_type !== "VALIDATION_NEEDED",
            ).length === 0 ? (
              <p className="empty-notice">Tidak ada antrean tindakan prioritas saat ini.</p>
            ) : (
              <div className="table-responsive" style={{ marginTop: "1rem" }}>
                <table className="staff-table priority-action-table">
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
                    {puskesmasData.priority_action_queue
                      .filter((item) => item.action_type !== "VALIDATION_NEEDED")
                      .map((item, idx) => (
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

      {/* TASK-P4-008: Puskesmas reminder/job failure dashboard */}
      {userRole === "PUSKESMAS" && (
        <div className="queue-section" style={{ marginTop: "2rem" }}>
          <header
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <h3>Kegagalan Reminder &amp; Tindak Lanjut</h3>
              {reminderSummary && (
                <p className="field-hint">
                  SLA tindak lanjut {reminderSummary.fallback_sla_hours} jam · status pengiriman
                  WhatsApp selalu <strong>UNKNOWN</strong>.
                </p>
              )}
            </div>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => void fetchReminderSummary()}
            >
              {reminderLoading ? "Memuat..." : "Refresh Reminder"}
            </button>
          </header>

          {reminderSummary === null ? (
            <p className="empty-notice">Ringkasan operasional reminder belum tersedia.</p>
          ) : (
            <>
              <div className="metrics-row" style={{ marginTop: "1rem" }}>
                <div className="metric-card">
                  <span className="metric-label">Push Menunggu</span>
                  <strong className="metric-value">
                    {reminderSummary.summary.pending_push_attempts_count}
                  </strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Gagal, Bisa Dicoba Ulang</span>
                  <strong className="metric-value text-pending">
                    {reminderSummary.summary.retryable_push_failures_count}
                  </strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Gagal Terminal</span>
                  <strong className="metric-value text-overdue">
                    {reminderSummary.summary.terminal_push_failures_count}
                  </strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Melewati SLA / Tidak Terhubung</span>
                  <strong className="metric-value text-overdue">
                    {reminderSummary.summary.escalated_fallbacks_count +
                      reminderSummary.summary.unreachable_fallbacks_count}
                  </strong>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Organization Summary Reports per Village */}
      {userRole === "PUSKESMAS" && (
        <div className="queue-section" style={{ marginTop: "2rem" }}>
          <header
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <h3>Laporan Ringkasan Agregat Wilayah Per Desa</h3>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp Fallback Actions Queue */}
      <div className="queue-section" style={{ marginTop: "2rem" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Antrean Tindak Lanjut WhatsApp</h3>
          <button className="btn-secondary" type="button" onClick={() => void fetchWaQueue()}>
            {waLoading ? "Memuat..." : "Refresh Queue"}
          </button>
        </header>

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
                          onClick={() => setWaConfirmDialog({ type: "GENERATE_LINK", item })}
                        >
                          Buka WhatsApp
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => setWaConfirmDialog({ type: "RESOLVE", item })}
                        >
                          Selesai
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => setWaConfirmDialog({ type: "UNREACHABLE", item })}
                        >
                          Tidak Dapat Dihubungi
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

      {/* Re-confirmation Modal for WhatsApp Fallback Actions */}
      {waConfirmDialog && (
        <div
          className="staff-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !waActionSubmitting) {
              setWaConfirmDialog(null);
            }
          }}
        >
          <div
            className="staff-modal-dialog modal-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-confirm-modal-title"
          >
            <header className="staff-modal-header">
              <div className="staff-modal-header-content">
                <span className="staff-modal-kicker">Konfirmasi Tindak Lanjut</span>
                <h3
                  id="wa-confirm-modal-title"
                  className="staff-modal-title"
                  style={{ fontSize: "1.15rem" }}
                >
                  {waConfirmDialog.type === "GENERATE_LINK" && "Buka Pesan WhatsApp?"}
                  {waConfirmDialog.type === "RESOLVE" && "Tandai Pengingat Selesai?"}
                  {waConfirmDialog.type === "UNREACHABLE" && "Tandai Tidak Dapat Dihubungi?"}
                </h3>
              </div>
              <button
                type="button"
                className="staff-modal-close-btn"
                aria-label="Tutup dialog konfirmasi"
                disabled={waActionSubmitting}
                onClick={() => setWaConfirmDialog(null)}
              >
                ✕
              </button>
            </header>

            <div className="staff-modal-body" style={{ gap: "1rem", fontSize: "0.86rem" }}>
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "var(--paper, #fdfbf7)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <div>
                  <span style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
                    Nama Pasien:{" "}
                  </span>
                  <strong>{waConfirmDialog.item.mother_full_name}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>Nomor HP: </span>
                  <code>{waConfirmDialog.item.phone_number_masked}</code>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
                    Jadwal / Kode:{" "}
                  </span>
                  <span className="badge-code" style={{ marginLeft: "0.25rem" }}>
                    {waConfirmDialog.item.milestone_code}
                  </span>
                </div>
              </div>

              <p style={{ margin: 0, color: "var(--ink-muted)", lineHeight: 1.55 }}>
                {waConfirmDialog.type === "GENERATE_LINK" &&
                  "Sistem akan membuat link chat resmi wa.me dan membukanya di tab baru. Pastikan nomor WhatsApp aktif untuk mengirim pesan pengingat ke ibu hamil."}
                {waConfirmDialog.type === "RESOLVE" &&
                  "Apakah Anda yakin pengingat pemeriksaan ini sudah berhasil disampaikan ke ibu hamil? Antrean tindak lanjut ini akan ditandai SELESAI dan dikeluarkan dari daftar."}
                {waConfirmDialog.type === "UNREACHABLE" &&
                  "Apakah Anda yakin nomor pasien tidak dapat dihubungi? Status antrean ini akan dicatat sebagai GAGAL / TIDAK DAPAT DIHUBUNGI."}
              </p>
            </div>

            <div
              className="staff-modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                padding: "0.85rem 1.25rem",
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                disabled={waActionSubmitting}
                onClick={() => setWaConfirmDialog(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className={waConfirmDialog.type === "UNREACHABLE" ? "btn-danger" : "btn-primary"}
                disabled={waActionSubmitting}
                onClick={() => void handleExecuteWaConfirm()}
              >
                {waActionSubmitting
                  ? "Memproses…"
                  : waConfirmDialog.type === "GENERATE_LINK"
                    ? "Ya, Buka WhatsApp"
                    : waConfirmDialog.type === "RESOLVE"
                      ? "Ya, Selesaikan"
                      : "Ya, Catat Tidak Dapat Dihubungi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scoped Operational Search */}
      <div className="search-section" style={{ marginTop: "2rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <h3 style={{ margin: 0 }}>Cari Ibu Hamil Terdaftar</h3>
        </div>
        <form onSubmit={(e) => void handleSearchMothers(e)} className="search-form">
          <input
            className="staff-input"
            type="text"
            placeholder="Ketik nama atau telepon..."
            aria-label="Cari ibu hamil terdaftar"
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
