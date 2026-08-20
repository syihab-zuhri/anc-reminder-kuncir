"use client";

import type {
  MotherAccessCredentialIssueResponse,
  MotherSummary,
  PregnancyMilestoneListResponse,
  Village,
} from "@anc/contracts";
import { useCallback, useEffect, useId, useState } from "react";

interface RegisteredMothersPanelProps {
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

export function RegisteredMothersPanel({ userRole, onNavigateTab }: RegisteredMothersPanelProps) {
  const searchInputId = useId();
  const villageFilterId = useId();
  const statusFilterId = useId();

  // Data State
  const [mothers, setMothers] = useState<readonly MotherSummary[]>([]);
  const [villages, setVillages] = useState<readonly Village[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVillageId, setSelectedVillageId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | "ACTIVE" | "CLOSED">("ALL");

  // Patient Detail & ANC Milestones Modal State
  const [detailMother, setDetailMother] = useState<MotherSummary | null>(null);
  const [milestones, setMilestones] = useState<PregnancyMilestoneListResponse | null>(null);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [milestonesError, setMilestonesError] = useState<string | null>(null);

  // Quick Access Code Issue Modal State
  const [accessCodeMother, setAccessCodeMother] = useState<MotherSummary | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuingCode, setIssuingCode] = useState(false);
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [editingMother, setEditingMother] = useState<MotherSummary | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editReason, setEditReason] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [archiveMother, setArchiveMother] = useState<MotherSummary | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Load Villages for Filter
  useEffect(() => {
    if (userRole === "SUPER_ADMIN") return;

    const controller = new AbortController();
    void fetchVillages(controller.signal);
    return () => controller.abort();

    async function fetchVillages(signal: AbortSignal): Promise<void> {
      try {
        const res = await fetch("/api/staff-proxy/staff/organization/villages", { signal });
        if (res.ok) {
          const data = (await res.json()) as readonly Village[];
          setVillages(data);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          // Village list is optional for filter dropdown
        }
      }
    }
  }, [userRole]);

  // Fetch Mothers Query Helper
  const fetchMothers = useCallback(
    async (
      options: {
        search?: string;
        villageId?: string;
        status?: "ALL" | "ACTIVE" | "CLOSED";
        cursor?: string | null;
        isLoadMore?: boolean;
        signal?: AbortSignal;
      } = {},
    ): Promise<void> => {
      const {
        search = searchQuery,
        villageId = selectedVillageId,
        status = selectedStatus,
        cursor = null,
        isLoadMore = false,
        signal,
      } = options;

      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (search.trim()) params.set("search", search.trim());
        if (villageId.trim()) params.set("village_id", villageId.trim());
        if (status !== "ALL") params.set("pregnancy_status", status);
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/staff-proxy/mothers?${params.toString()}`, { signal });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          setError(
            errData?.error?.message ??
              errData?.message ??
              "Gagal memuat daftar ibu hamil dari server.",
          );
          return;
        }

        const data = (await res.json()) as {
          items: readonly MotherSummary[];
          next_cursor: string | null;
          has_more: boolean;
        };

        if (isLoadMore) {
          setMothers((prev) => [...prev, ...(data.items ?? [])]);
        } else {
          setMothers(data.items ?? []);
        }
        setNextCursor(data.next_cursor);
        setHasMore(data.has_more);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Terjadi kesalahan koneksi saat memuat data ibu hamil.");
        }
      } finally {
        if (isLoadMore) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [searchQuery, selectedVillageId, selectedStatus],
  );

  // Trigger fetch on mount or when filter changes
  useEffect(() => {
    if (userRole === "SUPER_ADMIN") return;

    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();

    async function loadData(signal: AbortSignal): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (searchQuery.trim()) params.set("search", searchQuery.trim());
        if (selectedVillageId.trim()) params.set("village_id", selectedVillageId.trim());
        if (selectedStatus !== "ALL") params.set("pregnancy_status", selectedStatus);

        const res = await fetch(`/api/staff-proxy/mothers?${params.toString()}`, { signal });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          setError(
            errData?.error?.message ??
              errData?.message ??
              "Gagal memuat daftar ibu hamil dari server.",
          );
          return;
        }

        const data = (await res.json()) as {
          items: readonly MotherSummary[];
          next_cursor: string | null;
          has_more: boolean;
        };

        setMothers(data.items ?? []);
        setNextCursor(data.next_cursor);
        setHasMore(data.has_more);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Terjadi kesalahan koneksi saat memuat data ibu hamil.");
        }
      } finally {
        setLoading(false);
      }
    }
  }, [userRole, selectedVillageId, selectedStatus, searchQuery]);

  // Handle Search Submission
  function handleSearchSubmit(e: React.FormEvent): void {
    e.preventDefault();
    void fetchMothers();
  }

  // Handle Filter Reset
  function handleResetFilters(): void {
    setSearchQuery("");
    setSelectedVillageId("");
    setSelectedStatus("ALL");
    void fetchMothers({ search: "", villageId: "", status: "ALL" });
  }

  // Handle Load More Pagination
  function handleLoadMore(): void {
    if (nextCursor && !loadingMore) {
      void fetchMothers({ cursor: nextCursor, isLoadMore: true });
    }
  }

  // Handle Open Patient Milestones Modal
  async function handleOpenDetail(mother: MotherSummary): Promise<void> {
    setDetailMother(mother);
    setMilestones(null);
    setMilestonesError(null);

    if (!mother.active_pregnancy) return;

    setLoadingMilestones(true);
    try {
      const res = await fetch(
        `/api/staff-proxy/pregnancies/${encodeURIComponent(mother.active_pregnancy.id)}/milestones`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMilestonesError(
          data?.error?.message ?? "Gagal memuat detail linimasa ANC pasien dari server.",
        );
        return;
      }
      const data = (await res.json()) as PregnancyMilestoneListResponse;
      setMilestones(data);
    } catch {
      setMilestonesError("Koneksi terputus saat mengambil detail linimasa pemeriksaan.");
    } finally {
      setLoadingMilestones(false);
    }
  }

  // Handle Open Quick Access Code Modal
  function handleOpenAccessCode(mother: MotherSummary): void {
    setAccessCodeMother(mother);
    setIssuedCode(null);
    setAccessCodeError(null);
    setCopiedCode(false);
  }

  // Handle Issue/Reissue Access Code
  async function handleGenerateCode(): Promise<void> {
    if (!accessCodeMother) return;
    setIssuingCode(true);
    setAccessCodeError(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/mothers/${encodeURIComponent(accessCodeMother.id)}/access-code/reissue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            reason: "Penerbitan kode akses melalui daftar ibu hamil",
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as
        MotherAccessCredentialIssueResponse | { error?: { message?: string } } | null;

      if (!res.ok || !data || "error" in data || !("one_time_code" in data)) {
        setAccessCodeError(
          (data as { error?: { message?: string } })?.error?.message ??
            "Gagal menerbitkan kode akses ibu hamil.",
        );
        return;
      }

      setIssuedCode(data.one_time_code);
    } catch {
      setAccessCodeError("Terjadi gangguan jaringan saat menerbitkan kode akses.");
    } finally {
      setIssuingCode(false);
    }
  }

  // Handle Copy Code to Clipboard
  async function handleCopyCode(): Promise<void> {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(issuedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      // Best-effort copy fallback
    }
  }

  function handleOpenEdit(mother: MotherSummary): void {
    setEditingMother(mother);
    setEditFullName(mother.full_name);
    setEditAddress(mother.address);
    setEditPhone("");
    setEditReason("");
    setEditError(null);
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingMother) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const response = await fetch(
        `/api/staff-proxy/mothers/${encodeURIComponent(editingMother.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            full_name: editFullName.trim(),
            address: editAddress.trim(),
            ...(editPhone.trim() ? { phone_number: editPhone.trim() } : {}),
            reason: editReason.trim(),
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setEditError(data?.error?.message ?? "Data Ibu Hamil belum dapat diperbarui.");
        return;
      }
      setEditingMother(null);
      await fetchMothers();
    } catch {
      setEditError("Koneksi terputus saat menyimpan perubahan data.");
    } finally {
      setSavingEdit(false);
    }
  }

  function handleOpenArchive(mother: MotherSummary): void {
    setArchiveMother(mother);
    setArchiveReason("");
    setArchiveError(null);
  }

  async function handleArchive(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!archiveMother) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const activePregnancy = archiveMother.active_pregnancy;
      if (activePregnancy !== null) {
        const closeResponse = await fetch(
          `/api/staff-proxy/pregnancies/${encodeURIComponent(activePregnancy.id)}/close`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              idempotency_key: crypto.randomUUID(),
              reason: `Pengarsipan data Ibu Hamil: ${archiveReason.trim()}`,
            }),
          },
        );
        if (!closeResponse.ok) {
          const data = await closeResponse.json().catch(() => null);
          setArchiveError(
            data?.error?.message ?? "Kehamilan aktif belum dapat ditutup untuk pengarsipan.",
          );
          return;
        }
        setArchiveMother({ ...archiveMother, active_pregnancy: null });
      }

      const response = await fetch(
        `/api/staff-proxy/mothers/${encodeURIComponent(archiveMother.id)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            reason: archiveReason.trim(),
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setArchiveError(data?.error?.message ?? "Data Ibu Hamil belum dapat diarsipkan.");
        return;
      }
      setArchiveMother(null);
      await fetchMothers();
    } catch {
      setArchiveError("Koneksi terputus saat mengarsipkan data.");
    } finally {
      setArchiving(false);
    }
  }

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Deny by Default</span>
        <h3>Data Ibu Hamil Terdaftar Tidak Tersedia untuk Super Admin</h3>
        <p>
          Sesuai kebijakan keamanan dan privasi data kesehatan pasien, akun Super Admin dibatasi
          secara ketat dan tidak diperkenankan membaca data medis operasional pasien.
        </p>
      </div>
    );
  }

  // Compute Summary Counters from loaded items
  const totalLoaded = mothers.length;
  const activeCount = mothers.filter((m) => m.active_pregnancy?.status === "ACTIVE").length;
  const closedCount = mothers.filter(
    (m) => !m.active_pregnancy || m.active_pregnancy.status === "CLOSED",
  ).length;

  return (
    <div className="staff-panel-card mothers-registry-panel">
      {/* Header */}
      <header className="staff-panel-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <span className="staff-kicker">Data Pasien Terdaftar / Registry Wilayah</span>
            <h2>Daftar Ibu Hamil Terdaftar</h2>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.92rem", margin: "0.25rem 0 0" }}>
              Kelola, pantau linimasa ANC (K1–K8), dan terbitkan kode akses mandiri pasien dalam
              wilayah binaan Anda.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void fetchMothers()}
              disabled={loading}
            >
              {loading ? "Memuat..." : "Segarkan Data"}
            </button>
            {onNavigateTab && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => onNavigateTab("register")}
              >
                + Daftarkan Ibu Hamil Baru
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Summary Metrics Row */}
      <div className="metrics-row" style={{ marginBottom: "1.75rem" }}>
        <div className="metric-card">
          <span className="metric-label">Total Terdaftar (Tampil)</span>
          <strong className="metric-value">{totalLoaded}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Kehamilan Aktif</span>
          <strong className="metric-value" style={{ color: "#059669" }}>
            {activeCount}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Riwayat / Selesai</span>
          <strong className="metric-value" style={{ color: "var(--ink-muted)" }}>
            {closedCount}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Cakupan Wilayah</span>
          <strong
            className="metric-value"
            style={{ fontSize: "1.4rem", alignSelf: "center", margin: "auto 0" }}
          >
            {villages.length > 0 ? `${villages.length} Desa Binaan` : "Wilayah Puskesmas"}
          </strong>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div
        className="mothers-filter-card"
        style={{
          padding: "1.25rem",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          marginBottom: "1.5rem",
        }}
      >
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr)) auto",
            gap: "1rem",
            alignItems: "end",
          }}
        >
          {/* Search Input */}
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor={searchInputId}>Pencarian Pasien</label>
            <input
              id={searchInputId}
              className="staff-input"
              type="text"
              placeholder="Cari nama ibu hamil atau telepon…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Village Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor={villageFilterId}>Filter Desa / Dusun</label>
            <select
              id={villageFilterId}
              className="staff-input"
              value={selectedVillageId}
              onChange={(e) => setSelectedVillageId(e.target.value)}
            >
              <option value="">-- Semua Desa --</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  Desa {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor={statusFilterId}>Status Kehamilan</label>
            <select
              id={statusFilterId}
              className="staff-input"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as "ALL" | "ACTIVE" | "CLOSED")}
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Kehamilan Aktif Saja</option>
              <option value="CLOSED">Selesai / Riwayat</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="mothers-filter-actions" style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-primary" type="submit" disabled={loading}>
              Cari
            </button>
            {(searchQuery || selectedVillageId || selectedStatus !== "ALL") && (
              <button
                className="btn-secondary"
                type="button"
                onClick={handleResetFilters}
                disabled={loading}
              >
                Reset
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="staff-alert alert-error" style={{ marginBottom: "1.5rem" }}>
          <p>{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--ink-muted)", fontSize: "0.95rem" }}>
            Memuat data ibu hamil dari database Supabase…
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && mothers.length === 0 && (
        <div
          style={{
            padding: "3.5rem 1.5rem",
            textAlign: "center",
            background: "var(--paper)",
            border: "1px dashed var(--line-strong)",
            borderRadius: "4px",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>Data</div>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
            Belum Ada Data Ibu Hamil yang Ditemukan
          </h3>
          <p
            style={{
              color: "var(--ink-muted)",
              fontSize: "0.9rem",
              maxWidth: "28rem",
              margin: "0 auto 1.5rem",
            }}
          >
            {searchQuery || selectedVillageId || selectedStatus !== "ALL"
              ? "Tidak ada pasien yang sesuai dengan kata kunci pencarian atau filter yang dipilih."
              : "Belum ada ibu hamil yang terdaftar di sistem. Mulai dengan mendaftarkan ibu hamil baru."}
          </p>
          {onNavigateTab && (
            <button type="button" className="btn-primary" onClick={() => onNavigateTab("register")}>
              + Daftarkan Ibu Hamil Sekarang
            </button>
          )}
        </div>
      )}

      {/* Mothers Table */}
      {!loading && mothers.length > 0 && (
        <div className="table-responsive mothers-table-responsive">
          <table className="staff-table mothers-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ minWidth: "12rem" }}>Nama &amp; Identitas</th>
                <th style={{ minWidth: "11rem" }}>Kontak &amp; Wilayah</th>
                <th style={{ minWidth: "14rem" }}>Usia Kehamilan &amp; Trimester</th>
                <th style={{ minWidth: "9rem" }}>Waktu Terdaftar</th>
                <th style={{ minWidth: "12rem", textAlign: "right" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {mothers.map((mother) => {
                const preg = mother.active_pregnancy;
                const isPregnant = preg && preg.status === "ACTIVE";

                return (
                  <tr key={mother.id} style={{ transition: "background 0.15s ease" }}>
                    {/* Column 1: Identity */}
                    <td data-label="Nama & Identitas">
                      <div style={{ display: "grid", gap: "0.2rem" }}>
                        <strong style={{ fontSize: "1rem", color: "var(--ink)" }}>
                          {mother.full_name}
                        </strong>
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                          <span
                            className={`badge-status status-${isPregnant ? "active" : "due"}`}
                            style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem" }}
                          >
                            {isPregnant ? "Hamil Aktif" : "Selesai / Non-Aktif"}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Contact & Address */}
                    <td data-label="Kontak & Wilayah">
                      <div style={{ display: "grid", gap: "0.25rem", fontSize: "0.86rem" }}>
                        <div>
                          <strong style={{ color: "#0369a1" }}> {mother.phone_masked}</strong>
                        </div>
                        <div style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}>
                          {mother.village_name ? `Desa ${mother.village_name}` : "Tanpa Desa"}
                        </div>
                        <small style={{ color: "var(--ink-faint)", lineHeight: 1.3 }}>
                          {mother.address}
                        </small>
                      </div>
                    </td>

                    {/* Column 3: Gestational Age & Trimester */}
                    <td data-label="Kehamilan">
                      {preg ? (
                        <div style={{ display: "grid", gap: "0.3rem" }}>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <span
                              style={{
                                padding: "0.2rem 0.5rem",
                                background: "#1e3a8a",
                                color: "#ffffff",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                borderRadius: "3px",
                              }}
                            >
                              {preg.trimester_label}
                            </span>
                            <strong style={{ fontSize: "0.95rem" }}>
                              {preg.completed_weeks} mgg {preg.completed_days} hari
                            </strong>
                          </div>
                          <small style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
                            HPHT: <code>{preg.dating_date}</code>
                          </small>
                        </div>
                      ) : (
                        <span
                          style={{
                            color: "var(--ink-faint)",
                            fontStyle: "italic",
                            fontSize: "0.85rem",
                          }}
                        >
                          Tidak ada kehamilan aktif
                        </span>
                      )}
                    </td>

                    {/* Column 4: Registration Date */}
                    <td data-label="Terdaftar">
                      <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                        {new Date(mother.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>

                    {/* Column 5: Actions */}
                    <td
                      className="mothers-action-cell"
                      data-label="Aksi"
                      style={{ textAlign: "right" }}
                    >
                      <div
                        className="mothers-action-group"
                        style={{
                          display: "inline-flex",
                          gap: "0.4rem",
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        {/* Detail / ANC Milestones Button */}
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: "0.45rem 0.75rem", fontSize: "0.78rem" }}
                          onClick={() => void handleOpenDetail(mother)}
                          title="Lihat Linimasa ANC K1–K8"
                        >
                          Linimasa K1–K8
                        </button>

                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: "0.45rem 0.75rem", fontSize: "0.78rem" }}
                          onClick={() => handleOpenEdit(mother)}
                          title="Edit data administrasi Ibu Hamil"
                        >
                          Edit Data
                        </button>

                        {/* Access Code Button - Puskesmas Only */}
                        {userRole === "PUSKESMAS" && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: "0.45rem 0.75rem", fontSize: "0.78rem" }}
                              onClick={() => handleOpenAccessCode(mother)}
                              title="Terbitkan Kode Akses Pasien"
                            >
                              Kode Akses
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{
                                padding: "0.45rem 0.75rem",
                                fontSize: "0.78rem",
                                color: "#b91c1c",
                                borderColor: "#fecaca",
                              }}
                              onClick={() => handleOpenArchive(mother)}
                              title={
                                mother.active_pregnancy
                                  ? "Tutup kehamilan aktif lalu arsipkan data."
                                  : "Arsipkan data Ibu Hamil"
                              }
                            >
                              Hapus Data
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingMother && (
        <div className="staff-modal-backdrop" role="presentation">
          <form
            className="staff-panel-card"
            onSubmit={handleSaveEdit}
            style={{ width: "min(100%, 36rem)" }}
          >
            <span className="staff-kicker">Koreksi Data Administrasi</span>
            <h3 style={{ marginTop: "0.25rem" }}>Edit Data: {editingMother.full_name}</h3>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.88rem" }}>
              NIK tidak ditampilkan atau diubah di formulir ini. Kosongkan nomor telepon bila tidak
              berubah.
            </p>
            {editError && (
              <div className="staff-alert alert-error">
                <p>{editError}</p>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="edit-mother-name">Nama lengkap</label>
              <input
                id="edit-mother-name"
                className="staff-input"
                value={editFullName}
                onChange={(event) => setEditFullName(event.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-mother-address">Alamat</label>
              <textarea
                id="edit-mother-address"
                className="staff-input"
                value={editAddress}
                onChange={(event) => setEditAddress(event.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-mother-phone">Nomor telepon baru (opsional)</label>
              <input
                id="edit-mother-phone"
                className="staff-input"
                inputMode="tel"
                value={editPhone}
                onChange={(event) => setEditPhone(event.target.value)}
                placeholder="Contoh: 0812 3456 7890"
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-mother-reason">Alasan perubahan</label>
              <input
                id="edit-mother-reason"
                className="staff-input"
                value={editReason}
                onChange={(event) => setEditReason(event.target.value)}
                minLength={3}
                required
              />
            </div>
            <div
              className="mothers-modal-actions"
              style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingMother(null)}
                disabled={savingEdit}
              >
                Batal
              </button>
              <button type="submit" className="btn-primary" disabled={savingEdit}>
                {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {archiveMother && (
        <div className="staff-modal-backdrop" role="presentation">
          <form
            className="staff-panel-card"
            onSubmit={handleArchive}
            style={{ width: "min(100%, 36rem)" }}
          >
            <span className="staff-kicker">Arsip Rekam Pasien</span>
            <h3 style={{ marginTop: "0.25rem" }}>Hapus Data: {archiveMother.full_name}</h3>
            <div className="staff-alert alert-error">
              <p>
                Data tidak dimusnahkan. Rekam dan jejak audit dipertahankan, sedangkan akses portal
                dan perangkat pasien dicabut.
              </p>
            </div>
            {archiveMother.active_pregnancy && (
              <div className="staff-alert alert-info">
                <p>
                  Kehamilan aktif akan ditutup terlebih dahulu. Pengingat yang belum selesai akan
                  dibatalkan secara tercatat sebelum data diarsipkan.
                </p>
              </div>
            )}
            {archiveError && (
              <div className="staff-alert alert-error">
                <p>{archiveError}</p>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="archive-mother-reason">Alasan pengarsipan</label>
              <textarea
                id="archive-mother-reason"
                className="staff-input"
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                minLength={3}
                required
              />
            </div>
            <div
              className="mothers-modal-actions"
              style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setArchiveMother(null)}
                disabled={archiving}
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ background: "#b91c1c" }}
                disabled={archiving}
              >
                {archiving ? "Mengarsipkan..." : "Arsipkan Data"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pagination / Load More Button */}
      {hasMore && (
        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{ minWidth: "12rem" }}
          >
            {loadingMore ? "Memuat…" : "Muat 20 Ibu Hamil Berikutnya ↓"}
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PATIENT DETAIL & ANC TIMELINE MODAL                                       */}
      {/* ========================================================================= */}
      {detailMother && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(10, 25, 22, 0.65)",
            backdropFilter: "blur(3px)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              width: "min(100%, 54rem)",
              maxHeight: "90vh",
              background: "var(--paper-raised, #ffffff)",
              border: "1px solid var(--line-strong)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <header
              style={{
                padding: "1.5rem 1.75rem",
                background: "#123832",
                color: "#fbf8f1",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "0.72rem",
                    letterSpacing: "0.08em",
                    color: "#e1b45c",
                    textTransform: "uppercase",
                    fontWeight: 800,
                  }}
                >
                  Detail Rekam Ibu Hamil &amp; Linimasa
                </span>
                <h3
                  id="detail-modal-title"
                  style={{ fontSize: "1.5rem", margin: "0.25rem 0 0", color: "#fbf8f1" }}
                >
                  {detailMother.full_name}
                </h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.85 }}>
                  {detailMother.phone_masked} ·{" "}
                  {detailMother.village_name ? `Desa ${detailMother.village_name}` : "Tanpa Desa"} ·{" "}
                  {detailMother.address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailMother(null)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "#fbf8f1",
                  width: "2.25rem",
                  height: "2.25rem",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
                aria-label="Tutup Detail"
              >
                ×
              </button>
            </header>

            {/* Modal Body */}
            <div style={{ padding: "1.75rem", overflowY: "auto", display: "grid", gap: "1.5rem" }}>
              {/* Gestational Age Card */}
              {detailMother.active_pregnancy ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1.25rem 1.5rem",
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--ink-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Usia Kehamilan (Server-Driven)
                    </span>
                    <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 800,
                        color: "var(--ink)",
                        marginTop: "0.2rem",
                      }}
                    >
                      {detailMother.active_pregnancy.completed_weeks} Minggu{" "}
                      {detailMother.active_pregnancy.completed_days} Hari
                    </div>
                    <small style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                      Tanggal HPHT: <strong>{detailMother.active_pregnancy.dating_date}</strong>
                    </small>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.35rem 0.85rem",
                        background: "#1e3a8a",
                        color: "#ffffff",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                        borderRadius: "4px",
                      }}
                    >
                      {detailMother.active_pregnancy.trimester_label}
                    </span>
                    <div
                      style={{
                        marginTop: "0.3rem",
                        fontSize: "0.78rem",
                        color: "var(--ink-muted)",
                      }}
                    >
                      Status: <strong>{detailMother.active_pregnancy.status}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="staff-alert alert-info">
                  <p>Pasien ini tidak memiliki kehamilan aktif saat ini.</p>
                </div>
              )}

              {/* Milestones K1-K8 Section */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "0.75rem",
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
                    Linimasa Paket ANC (K1 – K8)
                  </h4>
                  {milestones?.next_milestone_code && (
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#d97706" }}>
                      Target Berikutnya: Milestone {milestones.next_milestone_code}
                    </span>
                  )}
                </div>

                {loadingMilestones && (
                  <div style={{ padding: "2rem", textAlign: "center" }}>
                    <div className="loading-spinner" style={{ margin: "0 auto 0.5rem" }} />
                    <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                      Memuat jadwal pemeriksaan K1–K8…
                    </p>
                  </div>
                )}

                {milestonesError && (
                  <div className="staff-alert alert-error">
                    <p>{milestonesError}</p>
                  </div>
                )}

                {milestones && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(11.5rem, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    {milestones.milestones.map((m) => {
                      const isConfirmed = m.visit_status === "CONFIRMED";
                      const isDue = m.visit_status === "DUE";
                      const isOverdue = m.visit_status === "OVERDUE";

                      return (
                        <div
                          key={m.code}
                          style={{
                            padding: "0.85rem",
                            background: isConfirmed
                              ? "#f0fdf4"
                              : isOverdue
                                ? "#fef2f2"
                                : isDue
                                  ? "#fffbeb"
                                  : "var(--paper)",
                            border: `1px solid ${
                              isConfirmed
                                ? "#86efac"
                                : isOverdue
                                  ? "#fca5a5"
                                  : isDue
                                    ? "#fde047"
                                    : "var(--line)"
                            }`,
                            display: "grid",
                            gap: "0.4rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 900,
                                fontSize: "1.1rem",
                                color: "var(--ink)",
                              }}
                            >
                              {m.code}
                            </span>
                            <span
                              className={`badge-status status-${m.visit_status.toLowerCase()}`}
                              style={{ fontSize: "0.68rem", padding: "0.15rem 0.4rem" }}
                            >
                              {m.visit_status}
                            </span>
                          </div>

                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--ink-muted)",
                              fontWeight: 600,
                            }}
                          >
                            {m.trimester_label}
                          </div>

                          <div style={{ fontSize: "0.75rem", color: "var(--ink)" }}>
                            {m.due_at ? (
                              <span>
                                Jatuh Tempo: <strong>{m.due_at.slice(0, 10)}</strong>
                              </span>
                            ) : m.target_date_start && m.target_date_end ? (
                              <span>
                                Rentang: {m.target_date_start} s/d {m.target_date_end}
                              </span>
                            ) : (
                              <span>Sesuai Rekomendasi</span>
                            )}
                          </div>

                          <div style={{ fontSize: "0.7rem", color: "var(--ink-faint)" }}>
                            Fasilitas:{" "}
                            {m.required_facility_policy === "PUSKESMAS_REQUIRED"
                              ? " Puskesmas"
                              : " Posyandu / Bidan"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Actions Inside Modal */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: "1rem",
                  borderTop: "1px solid var(--line)",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {userRole === "PUSKESMAS" && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        const target = detailMother;
                        setDetailMother(null);
                        handleOpenAccessCode(target);
                      }}
                    >
                      Terbitkan Kode Akses Pasien
                    </button>
                  )}
                  {onNavigateTab && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setDetailMother(null);
                        onNavigateTab("confirm");
                      }}
                    >
                      Konfirmasi Periksa
                    </button>
                  )}
                </div>

                <button type="button" className="btn-primary" onClick={() => setDetailMother(null)}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK ACCESS CODE MODAL                                                   */}
      {/* ========================================================================= */}
      {accessCodeMother && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-modal-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(10, 25, 22, 0.65)",
            backdropFilter: "blur(3px)",
            display: "grid",
            placeItems: "center",
            zIndex: 110,
            padding: "1rem",
          }}
        >
          <div
            style={{
              width: "min(100%, 36rem)",
              background: "var(--paper-raised, #ffffff)",
              border: "1px solid var(--line-strong)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              padding: "2rem",
              display: "grid",
              gap: "1.25rem",
            }}
          >
            <div>
              <span className="staff-kicker">Portal Mandiri Pasien</span>
              <h3 id="access-modal-title" style={{ fontSize: "1.4rem", margin: "0.25rem 0 0" }}>
                Kode Akses: {accessCodeMother.full_name}
              </h3>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.88rem", margin: "0.25rem 0 0" }}>
                Pasien dapat masuk ke portal mandiri di <code>/mother/login</code> menggunakan Nama
                Lengkap dan Kode Akses ini.
              </p>
            </div>

            {accessCodeError && (
              <div className="staff-alert alert-error" style={{ margin: 0 }}>
                <p>{accessCodeError}</p>
              </div>
            )}

            {/* If Code Is Generated */}
            {issuedCode ? (
              <div style={{ display: "grid", gap: "1rem" }}>
                <div
                  style={{
                    padding: "1.5rem 1rem",
                    background: "#0f172a",
                    color: "#38bdf8",
                    fontSize: "1.6rem",
                    fontWeight: 900,
                    fontFamily: "monospace",
                    letterSpacing: "2.5px",
                    textAlign: "center",
                    borderRadius: "6px",
                  }}
                >
                  <code>{issuedCode}</code>
                </div>

                <div
                  style={{
                    padding: "0.85rem 1rem",
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    borderRadius: "6px",
                    color: "#be123c",
                    fontSize: "0.82rem",
                    lineHeight: 1.45,
                  }}
                >
                  <strong>PERHATIAN KEAMANAN:</strong> Kode ini <u>HANYA DITAMPILKAN SATU KALI</u>.
                  Server mengenkripsi kunci menggunakan salted scrypt hash. Segera serahkan atau
                  catat kode ini sebelum menutup jendela.
                </div>

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleCopyCode()}
                  >
                    {copiedCode ? "Kode Tersalin!" : "Salin Kode Akses"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setAccessCodeMother(null)}
                  >
                    Selesai &amp; Tutup
                  </button>
                </div>
              </div>
            ) : (
              /* Generate Code Prompt */
              <div style={{ display: "grid", gap: "1rem" }}>
                <p style={{ fontSize: "0.9rem", color: "var(--ink)" }}>
                  Terbitkan kode akses 16-karakter format Crockford Base32 baru untuk{" "}
                  <strong>{accessCodeMother.full_name}</strong> ({accessCodeMother.phone_masked}).
                </p>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleGenerateCode()}
                    disabled={issuingCode}
                  >
                    {issuingCode ? "Menerbitkan Kode…" : "Terbitkan Kode Akses Sekarang"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setAccessCodeMother(null)}
                    disabled={issuingCode}
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
