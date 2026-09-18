"use client";

import type {
  MotherAccessCredentialIssueResponse,
  MotherSummary,
  PregnancyMilestoneListResponse,
  Village,
} from "@anc/contracts";
import { useCallback, useEffect, useId, useState } from "react";
import { useToast } from "../lib/toast-context";
import { MotherAccessCodeModal } from "./mothers/mother-access-code-modal";
import { MotherArchiveModal } from "./mothers/mother-archive-modal";
import { MotherDetailModal } from "./mothers/mother-detail-modal";
import { MotherEditModal } from "./mothers/mother-edit-modal";

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
  const toast = useToast();
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

  // Edit Patient Modal State
  const [editingMother, setEditingMother] = useState<MotherSummary | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editReason, setEditReason] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Archive Patient Modal State
  const [archiveMother, setArchiveMother] = useState<MotherSummary | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Keyboard Escape Handler to close active modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (accessCodeMother) {
          setAccessCodeMother(null);
          setIssuedCode(null);
          setAccessCodeError(null);
        } else if (detailMother) {
          setDetailMother(null);
          setMilestones(null);
        } else if (editingMother) {
          setEditingMother(null);
          setEditError(null);
        } else if (archiveMother) {
          setArchiveMother(null);
          setArchiveError(null);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accessCodeMother, detailMother, editingMother, archiveMother]);

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
        params.set("limit", "10");
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
        params.set("limit", "10");
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

  // Handle Export to CSV
  function handleExportCSV(): void {
    if (mothers.length === 0) {
      toast.info("Tidak ada data untuk diekspor");
      return;
    }

    const headers = [
      "No",
      "ID Pasien",
      "Nama Lengkap",
      "Desa / Dusun",
      "Alamat Domisili",
      "Nomor HP (Tersamar)",
      "Status Kehamilan",
      "Tanggal HPHT",
      "Usia Kehamilan (Minggu)",
      "Trimester",
      "Tanggal Terdaftar",
    ];

    const rows = mothers.map((m, idx) => {
      const villageName =
        m.village_name ?? villages.find((v) => v.id === m.village_id)?.name ?? "-";
      const pregnancy = m.active_pregnancy;
      const statusLabel = pregnancy
        ? pregnancy.status === "ACTIVE"
          ? "Aktif"
          : pregnancy.status
        : "Tidak Ada";

      const hpht = pregnancy?.dating_date ?? "-";
      const gaDisplay = pregnancy
        ? `${pregnancy.completed_weeks} mgg ${pregnancy.completed_days} hr`
        : "-";
      const trimester = pregnancy?.trimester_label ?? "-";
      const registeredAt = m.created_at ? new Date(m.created_at).toLocaleDateString("id-ID") : "-";

      return [
        idx + 1,
        `"${m.id}"`,
        `"${(m.full_name || "").replace(/"/g, '""')}"`,
        `"${villageName.replace(/"/g, '""')}"`,
        `"${(m.address || "").replace(/"/g, '""')}"`,
        `"${m.phone_masked || "-"}"`,
        `"${statusLabel}"`,
        `"${hpht}"`,
        `"${gaDisplay}"`,
        `"${trimester}"`,
        `"${registeredAt}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `data-ibu-hamil-anc-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Data ibu hamil berhasil diekspor ke format CSV/Excel");
  }

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
        const err =
          (data as { error?: { message?: string } })?.error?.message ??
          "Gagal menerbitkan kode akses ibu hamil.";
        setAccessCodeError(err);
        toast.error(err, "Penerbitan Gagal");
        return;
      }

      setIssuedCode(data.one_time_code);
      toast.success(`Kode akses ${data.one_time_code} berhasil diterbitkan.`, "Kode Akses Siap");
    } catch {
      const connErr = "Terjadi gangguan jaringan saat menerbitkan kode akses.";
      setAccessCodeError(connErr);
      toast.error(connErr, "Koneksi Terputus");
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
      toast.success("Kode akses berhasil disalin ke clipboard.", "Tersalin");
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      toast.error("Gagal menyalin kode otomatis. Silakan salin secara manual.", "Salin Manual");
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

  async function handleSaveEdit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!editingMother) return;
    setSavingEdit(true);
    setEditError(null);

    const bodyPayload: Record<string, unknown> = {
      idempotency_key: crypto.randomUUID(),
      full_name: editFullName.trim(),
      address: editAddress.trim(),
      reason: editReason.trim(),
    };
    if (editPhone.trim()) {
      bodyPayload.phone_number = editPhone.trim();
    }

    try {
      const res = await fetch(`/api/staff-proxy/mothers/${encodeURIComponent(editingMother.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const msg = errData?.error?.message ?? errData?.message ?? "Gagal memperbarui data ibu.";
        setEditError(msg);
        toast.error(msg, "Perubahan Gagal");
        return;
      }

      const updated = (await res.json()) as MotherSummary;
      setMothers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      toast.success(
        `Data ibu hamil "${updated.full_name}" berhasil diperbarui.`,
        "Pembaruan Berhasil",
      );
      setEditingMother(null);
    } catch {
      const msg = "Terjadi gangguan koneksi saat menyimpan perubahan data.";
      setEditError(msg);
      toast.error(msg, "Koneksi Terputus");
    } finally {
      setSavingEdit(false);
    }
  }

  function handleOpenArchive(mother: MotherSummary): void {
    setArchiveMother(mother);
    setArchiveReason("");
    setArchiveError(null);
  }

  async function handleArchive(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!archiveMother) return;
    setArchiving(true);
    setArchiveError(null);

    try {
      if (archiveMother.active_pregnancy) {
        const closeRes = await fetch(
          `/api/staff-proxy/pregnancies/${encodeURIComponent(archiveMother.active_pregnancy.id)}/close`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              idempotency_key: crypto.randomUUID(),
              reason: `Penutupan sebelum pengarsipan: ${archiveReason.trim()}`,
            }),
          },
        );
        if (!closeRes.ok) {
          const errData = await closeRes.json().catch(() => null);
          const msg =
            errData?.error?.message ??
            errData?.message ??
            "Gagal menutup kehamilan aktif pasien sebelum pengarsipan.";
          setArchiveError(msg);
          toast.error(msg, "Pengarsipan Gagal");
          return;
        }
      }

      const res = await fetch(`/api/staff-proxy/mothers/${encodeURIComponent(archiveMother.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          reason: archiveReason.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const msg = errData?.error?.message ?? errData?.message ?? "Gagal mengarsipkan data ibu.";
        setArchiveError(msg);
        toast.error(msg, "Pengarsipan Gagal");
        return;
      }

      setMothers((prev) => prev.filter((m) => m.id !== archiveMother.id));
      toast.success(
        `Data rekam medis "${archiveMother.full_name}" berhasil diarsipkan.`,
        "Pengarsipan Berhasil",
      );
      setArchiveMother(null);
    } catch {
      const msg = "Terjadi gangguan jaringan saat mengarsipkan data.";
      setArchiveError(msg);
      toast.error(msg, "Koneksi Terputus");
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
          Sesuai standar privasi data medis (Permenkes 24/2022), Super Admin hanya mengelola
          konfigurasi teknis sistem dan tidak diberikan akses membaca rekam medis pasien.
        </p>
      </div>
    );
  }

  return (
    <div className="staff-panel-card mothers-registry-panel">
      {/* Header */}
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Data Pasien Wilayah Kerja</span>
          <h2>Daftar Ibu Hamil Terdaftar</h2>
          <p className="field-hint">
            Kelola dan pantau seluruh data kehamilan ibu di wilayah Puskesmas &amp; Posyandu.
          </p>
        </div>
        <div>
          {onNavigateTab && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onNavigateTab("register")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path d="M10 4v12M4 10h12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Daftarkan Pasien Baru</span>
            </button>
          )}
        </div>
      </header>

      {/* Filter & Search Bar */}
      <section className="mothers-filter-card" aria-label="Filter dan Pencarian Ibu Hamil">
        <form onSubmit={handleSearchSubmit} className="mothers-filter-form">
          {/* Search Query Input */}
          <div className="filter-group">
            <label htmlFor={searchInputId}>Pencarian Pasien</label>
            <div className="input-with-icon">
              <input
                id={searchInputId}
                type="search"
                className="staff-input"
                placeholder="Cari nama lengkap pasien…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="submit"
                className="btn-search"
                aria-label="Jalankan Pencarian"
                title="Cari"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <circle cx="8.5" cy="8.5" r="5.5" />
                  <path d="m13 13 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Village Filter Dropdown */}
          <div className="filter-group">
            <label htmlFor={villageFilterId}>Filter Desa / Dusun</label>
            <select
              id={villageFilterId}
              className="staff-select"
              value={selectedVillageId}
              onChange={(e) => setSelectedVillageId(e.target.value)}
            >
              <option value="">Semua Desa ({villages.length} Desa Terdaftar)</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  Desa {v.name} ({v.code})
                </option>
              ))}
            </select>
          </div>

          {/* Pregnancy Status Filter */}
          <div className="filter-group">
            <label htmlFor={statusFilterId}>Status Kehamilan</label>
            <select
              id={statusFilterId}
              className="staff-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as "ALL" | "ACTIVE" | "CLOSED")}
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Kehamilan Aktif</option>
              <option value="CLOSED">Selesai / Ditutup</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          {(searchQuery || selectedVillageId || selectedStatus !== "ALL") && (
            <div className="filter-group filter-actions">
              <button
                type="button"
                className="btn-secondary btn-reset-filters"
                onClick={handleResetFilters}
              >
                Reset Filter
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Loading State */}
      {loading && (
        <div className="mothers-loading-state" aria-busy="true">
          <div className="loading-spinner" />
          <p>Memuat daftar ibu hamil dari database…</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="staff-alert alert-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void fetchMothers()}
            style={{ marginTop: "0.5rem" }}
          >
            Coba Muat Ulang
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && mothers.length === 0 && (
        <div className="mothers-empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              width="48"
              height="48"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3>Tidak Ada Data Ibu Hamil Ditemukan</h3>
          <p>
            {searchQuery || selectedVillageId || selectedStatus !== "ALL"
              ? "Tidak ada data ibu hamil yang sesuai dengan kriteria filter yang Anda pilih."
              : "Belum ada ibu hamil yang didaftarkan ke sistem di fasilitas ini."}
          </p>
          {searchQuery || selectedVillageId || selectedStatus !== "ALL" ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetFilters}
              style={{ marginTop: "0.75rem" }}
            >
              Hapus Semua Filter
            </button>
          ) : onNavigateTab ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onNavigateTab("register")}
              style={{ marginTop: "0.75rem" }}
            >
              Daftarkan Ibu Hamil Pertama
            </button>
          ) : null}
        </div>
      )}

      {/* Table Toolbar: Info Counter & Ekspor CSV */}
      {!loading && !error && mothers.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1.25rem",
            marginBottom: "0.5rem",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <span className="field-hint" style={{ fontWeight: 600, color: "var(--ink-muted)" }}>
            Menampilkan {mothers.length} data ibu hamil
          </span>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCSV}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.76rem",
              padding: "0.25rem 0.65rem",
              minHeight: "30px",
            }}
            title="Unduh seluruh data tabel ke file CSV/Excel"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Ekspor CSV / Excel</span>
          </button>
        </div>
      )}

      {/* Data Table */}
      {!loading && !error && mothers.length > 0 && (
        <div className="table-responsive">
          <table className="staff-table mothers-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: "30%" }}>
                  Identitas Ibu Hamil
                </th>
                <th scope="col" style={{ width: "20%" }}>
                  Wilayah / Kontak
                </th>
                <th scope="col" style={{ width: "25%" }}>
                  Status Kehamilan Aktif
                </th>
                <th scope="col" style={{ width: "12%" }}>
                  Terdaftar
                </th>
                <th scope="col" style={{ width: "13%", textAlign: "right" }}>
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {mothers.map((mother) => {
                const preg = mother.active_pregnancy;
                return (
                  <tr key={mother.id} className="mother-row">
                    {/* Column 1: Identity */}
                    <td data-label="Identitas">
                      <div className="mother-name-cell">
                        <span className="mother-avatar-chip" aria-hidden="true">
                          {mother.full_name.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <strong className="mother-name-link">{mother.full_name}</strong>
                          <div className="mother-meta-nik">
                            Kontak: <code>{mother.phone_masked}</code>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Region & Contact */}
                    <td data-label="Wilayah & Kontak">
                      <div style={{ display: "grid", gap: "0.2rem" }}>
                        <span className="village-badge">
                          {mother.village_name ? `Desa ${mother.village_name}` : "Tanpa Desa"}
                        </span>
                        <small style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                          {mother.phone_masked}
                        </small>
                      </div>
                    </td>

                    {/* Column 3: Active Pregnancy Status */}
                    <td data-label="Status Kehamilan">
                      {preg ? (
                        <div style={{ display: "grid", gap: "0.25rem" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                            }}
                          >
                            <span
                              className="badge-status status-confirmed"
                              style={{
                                background: "#163d37",
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

      {/* Edit Modal */}
      {editingMother && (
        <MotherEditModal
          mother={editingMother}
          fullName={editFullName}
          address={editAddress}
          phone={editPhone}
          reason={editReason}
          saving={savingEdit}
          error={editError}
          onFullNameChange={setEditFullName}
          onAddressChange={setEditAddress}
          onPhoneChange={setEditPhone}
          onReasonChange={setEditReason}
          onSubmit={handleSaveEdit}
          onClose={() => setEditingMother(null)}
        />
      )}

      {/* Archive Modal */}
      {archiveMother && (
        <MotherArchiveModal
          mother={archiveMother}
          reason={archiveReason}
          archiving={archiving}
          error={archiveError}
          onReasonChange={setArchiveReason}
          onSubmit={handleArchive}
          onClose={() => setArchiveMother(null)}
        />
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

      {/* Detail Modal */}
      {detailMother && (
        <MotherDetailModal
          mother={detailMother}
          milestones={milestones}
          loading={loadingMilestones}
          error={milestonesError}
          onClose={() => setDetailMother(null)}
          onOpenAccessCode={handleOpenAccessCode}
          isPuskesmas={userRole === "PUSKESMAS"}
        />
      )}

      {/* Quick Access Code Modal */}
      {accessCodeMother && (
        <MotherAccessCodeModal
          mother={accessCodeMother}
          issuedCode={issuedCode}
          issuingCode={issuingCode}
          accessCodeError={accessCodeError}
          copiedCode={copiedCode}
          onIssueCode={() => void handleGenerateCode()}
          onCopyCode={() => void handleCopyCode()}
          onClose={() => setAccessCodeMother(null)}
        />
      )}
    </div>
  );
}
