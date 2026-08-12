"use client";

import type {
  BidanDashboardResponse,
  MotherSummary,
  PuskesmasDashboardResponse,
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

  useEffect(() => {
    void fetchDashboardData();

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

  async function handleSearchMothers(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);

    try {
      const res = await fetch(
        `/api/staff-proxy/mothers?search=${encodeURIComponent(searchQuery.trim())}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items: MotherSummary[] };
        setSearchResults(data.items ?? []);
      }
    } catch {
      // Best effort operational search
    } finally {
      setSearching(false);
    }
  }

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Deny by Default</span>
        <h3>Dashboard Operasional Tidak Tersedia untuk Super Admin</h3>
        <p>
          Super Admin tidak memiliki akses ke data operasional kesehatan pasien rutin sesuai
          kebijakan keamanan terisolasi.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="staff-panel-card">
        <p className="staff-kicker">Memuat Dashboard Operasional…</p>
        <div className="loading-spinner" />
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
              <span className="metric-label">Bumil Dalam Penugasan</span>
              <strong className="metric-value">{bidanData.summary.assigned_mothers_count}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Jadwal Due</span>
              <strong className="metric-value text-due">
                {bidanData.summary.milestones_due_count}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Jadwal Overdue</span>
              <strong className="metric-value text-overdue">
                {bidanData.summary.milestones_overdue_count}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Total Tindakan</span>
              <strong className="metric-value">{bidanData.summary.action_required_count}</strong>
            </div>
          </div>

          <div className="village-chips">
            <h4>Desa Binaan Aktif:</h4>
            {bidanData.assigned_villages.length === 0 ? (
              <span className="chip">Belum ada penugasan desa</span>
            ) : (
              bidanData.assigned_villages.map((v) => (
                <span key={v.village_id} className="chip chip-active">
                  {v.village_name}
                </span>
              ))
            )}
          </div>

          <div className="queue-section">
            <h3>Antrean Konfirmasi Pemeriksaan (Confirmation Queue)</h3>
            {bidanData.confirmation_queue.length === 0 ? (
              <p className="empty-notice">Tidak ada antrean konfirmasi pemeriksaan saat ini.</p>
            ) : (
              <div className="table-responsive">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Nama Pasien</th>
                      <th>No. Telepon</th>
                      <th>Desa</th>
                      <th>Milestone</th>
                      <th>Status Visit</th>
                      <th>Jatuh Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bidanData.confirmation_queue.map((item, idx) => (
                      <tr key={`${item.mother_id}-${item.milestone_code}-${idx}`}>
                        <td>
                          <strong>{item.mother_full_name}</strong>
                        </td>
                        <td>
                          <code>{item.mother_phone_masked}</code>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Operational Search Section */}
      <section className="operational-search-section">
        <h3>Pencarian Pasien Ibu Hamil (Pencarian Operasional Terlingkup)</h3>
        <form className="search-form" onSubmit={handleSearchMothers}>
          <input
            type="text"
            placeholder="Cari nama ibu hamil..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="btn-primary" type="submit" disabled={searching}>
            {searching ? "Mencari…" : "Cari Pasien"}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="table-responsive search-results-table">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Nama Lengkap</th>
                  <th>Nomor Telepon</th>
                  <th>Desa</th>
                  <th>Status Kehamilan</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((mother) => (
                  <tr key={mother.id}>
                    <td>
                      <strong>{mother.full_name}</strong>
                    </td>
                    <td>
                      <code>{mother.phone_masked}</code>
                    </td>
                    <td>{mother.village_name ?? "-"}</td>
                    <td>
                      <span className="badge-status status-active">
                        {mother.active_pregnancy?.status ?? "AKTIF"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
