"use client";

import type {
  MotherAccessCredentialIssueResponse,
  MotherSummary,
  Village,
} from "@anc/contracts";
import { useEffect, useState } from "react";

interface MotherAccessPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

export function MotherAccessPanel({ userRole }: MotherAccessPanelProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "reissue" | "revoke">("issue");

  // Loaded mothers and villages from Supabase
  const [mothers, setMothers] = useState<readonly MotherSummary[]>([]);
  const [villages, setVillages] = useState<readonly Village[]>([]);
  const [loadingMothers, setLoadingMothers] = useState(false);

  // Selected filters and form states
  const [selectedVillageId, setSelectedVillageId] = useState("");
  const [selectedMotherId, setSelectedMotherId] = useState("");
  const [reissueReason, setReissueReason] = useState("Kode pasien hilang / lupa");
  const [revokeReason, setRevokeReason] = useState("Pasien pindah domisili atau atas permintaan");

  // Feedback & Plaintext Code State
  const [submitting, setSubmitting] = useState(false);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [issuedCodeResult, setIssuedCodeResult] = useState<{
    mother_id: string;
    access_code: string;
    action_kind: "INITIAL" | "REISSUE";
  } | null>(null);

  const [revokedSuccess, setRevokedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (userRole === "SUPER_ADMIN") return;

    const controller = new AbortController();
    void loadMothers(controller.signal);
    return () => controller.abort();

    async function loadMothers(signal: AbortSignal): Promise<void> {
      setLoadingMothers(true);
      try {
        const [mRes, vRes] = await Promise.all([
          fetch("/api/staff-proxy/mothers", { signal }),
          fetch("/api/staff-proxy/staff/organization/villages", { signal }).catch(() => null),
        ]);

        if (mRes.ok) {
          const data = (await mRes.json()) as { items: readonly MotherSummary[] };
          setMothers(data.items ?? []);
        }
        if (vRes && vRes.ok) {
          const vData = (await vRes.json()) as readonly Village[];
          setVillages(vData ?? []);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          // Best-effort load
        }
      } finally {
        setLoadingMothers(false);
      }
    }
  }, [userRole]);

  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Akses Terbatas</span>
        <h3>Pengelolaan Kode Akses Hanya Tersedia untuk Petugas Puskesmas</h3>
        <p>
          Penerbitan dan pencabutan kode akses portal mandiri pasien dikelola oleh operator
          Puskesmas.
        </p>
      </div>
    );
  }

  async function handleIssueCredential(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!selectedMotherId.trim()) return;
    setSubmitting(true);
    setErrorFeedback(null);
    setIssuedCodeResult(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/mothers/${encodeURIComponent(selectedMotherId.trim())}/access-code/reissue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            reason: "Penerbitan kode akses awal untuk pasien",
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as
        MotherAccessCredentialIssueResponse | { error?: { message?: string } } | null;

      if (!res.ok || !data || "error" in data || !("one_time_code" in data)) {
        setErrorFeedback(
          (data as { error?: { message?: string } })?.error?.message ??
            "Gagal menerbitkan kode akses ibu hamil.",
        );
        return;
      }

      setIssuedCodeResult({
        mother_id: selectedMotherId,
        access_code: data.one_time_code ?? "-",
        action_kind: "INITIAL",
      });
      setSelectedMotherId("");
    } catch {
      setErrorFeedback("Terjadi kesalahan jaringan saat menerbitkan kode akses.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReissueCredential(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!selectedMotherId.trim() || !reissueReason.trim()) return;
    setSubmitting(true);
    setErrorFeedback(null);
    setIssuedCodeResult(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/mothers/${encodeURIComponent(selectedMotherId.trim())}/access-code/reissue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            reason: reissueReason.trim(),
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as
        MotherAccessCredentialIssueResponse | { error?: { message?: string } } | null;

      if (!res.ok || !data || "error" in data || !("one_time_code" in data)) {
        setErrorFeedback(
          (data as { error?: { message?: string } })?.error?.message ??
            "Gagal menerbitkan ulang kode akses.",
        );
        return;
      }

      setIssuedCodeResult({
        mother_id: selectedMotherId,
        access_code: data.one_time_code ?? "-",
        action_kind: "REISSUE",
      });
      setSelectedMotherId("");
    } catch {
      setErrorFeedback("Terjadi kesalahan jaringan saat menerbitkan ulang kode akses.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeCredential(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!selectedMotherId.trim() || !revokeReason.trim()) return;
    setSubmitting(true);
    setErrorFeedback(null);
    setRevokedSuccess(false);

    try {
      const res = await fetch(
        `/api/staff-proxy/mothers/${encodeURIComponent(selectedMotherId.trim())}/access-code/revoke`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            reason: revokeReason.trim(),
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErrorFeedback(data?.error?.message ?? "Gagal mencabut kode akses.");
        return;
      }

      setRevokedSuccess(true);
      setSelectedMotherId("");
    } catch {
      setErrorFeedback("Terjadi kesalahan jaringan saat mencabut kode akses.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredMothers = selectedVillageId
    ? mothers.filter((m) => m.village_id === selectedVillageId)
    : mothers;

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Akses Mandiri</span>
          <h2>Kelola Kode Akses Pasien</h2>
          <p className="field-hint">
            Penerbitan dan pencabutan kode akses portal mandiri ibu hamil.
          </p>
        </div>
      </header>

      {/* Subtab Pill Navigation */}
      <div className="staff-tab-pill-bar">
        <button
          type="button"
          className={`staff-tab-pill-btn ${activeTab === "issue" ? "is-active" : ""}`}
          onClick={() => {
            setActiveTab("issue");
            setErrorFeedback(null);
            setRevokedSuccess(false);
          }}
        >
          <span className="icon-label">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              width="15"
              height="15"
            >
              <path
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Terbitkan Kode Baru</span>
          </span>
        </button>
        <button
          type="button"
          className={`staff-tab-pill-btn ${activeTab === "reissue" ? "is-active" : ""}`}
          onClick={() => {
            setActiveTab("reissue");
            setErrorFeedback(null);
            setRevokedSuccess(false);
          }}
        >
          <span className="icon-label">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              width="15"
              height="15"
            >
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Terbitkan Ulang (Reissue)</span>
          </span>
        </button>
        <button
          type="button"
          className={`staff-tab-pill-btn ${activeTab === "revoke" ? "is-active" : ""}`}
          onClick={() => {
            setActiveTab("revoke");
            setErrorFeedback(null);
            setRevokedSuccess(false);
          }}
        >
          <span className="icon-label">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              width="15"
              height="15"
            >
              <path
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Cabut Akses (Revoke)</span>
          </span>
        </button>
      </div>

      {errorFeedback && (
        <div className="staff-alert alert-error" style={{ marginBottom: "1rem" }}>
          <p>{errorFeedback}</p>
        </div>
      )}

      {/* Security Handoff Card displaying Plaintext Access Code ONCE */}
      {issuedCodeResult && (
        <div
          className="admin-form-card"
          style={{
            borderColor: "var(--ink, #123832)",
            boxShadow: "0 8px 24px rgba(18, 56, 50, 0.12)",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "0.25rem 0.75rem",
              background: "#e0f2fe",
              color: "#0369a1",
              borderRadius: "9999px",
              fontSize: "0.82rem",
              fontWeight: 800,
              marginBottom: "0.5rem",
            }}
          >
            {issuedCodeResult.action_kind === "INITIAL"
              ? "Penerbitan Pertama"
              : "Penerbitan Ulang (Reissued)"}
          </div>
          <h3 className="admin-form-card-title" style={{ borderBottom: "none", margin: 0 }}>
            Serahkan Kode Akses kepada Ibu Hamil
          </h3>
          <p className="admin-form-card-desc" style={{ marginTop: "0.25rem" }}>
            Tunjukkan atau catat kode di bawah ini untuk diserahkan secara pribadi kepada pasien:
          </p>

          <div
            style={{
              padding: "1.25rem",
              background: "#0f172a",
              color: "#38bdf8",
              fontSize: "1.6rem",
              fontWeight: 900,
              fontFamily: "monospace",
              letterSpacing: "3px",
              borderRadius: "10px",
              textAlign: "center",
              margin: "1rem 0",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            <code>{issuedCodeResult.access_code}</code>
          </div>

          <div
            style={{
              padding: "0.85rem 1rem",
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: "8px",
              color: "#be123c",
              fontSize: "0.85rem",
              lineHeight: 1.45,
              marginBottom: "1.25rem",
            }}
          >
            <strong>PERHATIAN KEAMANAN KETAT:</strong> Kode di atas{" "}
            <u>HANYA DITAMPILKAN SEKALI INI</u>. Server hanya menyimpan verifikasi salted scrypt
            hash dan tidak dapat menampilkan kembali teks jernih kode ini setelah ditutup.
          </div>

          <button className="btn-primary" type="button" onClick={() => setIssuedCodeResult(null)}>
            Saya Sudah Menyerahkan Kode Kepada Pasien
          </button>
        </div>
      )}

      {revokedSuccess && (
        <div className="staff-alert alert-success" style={{ marginBottom: "1rem" }}>
          <p>Akses ibu hamil berhasil dicabut. Seluruh sesi aktif pasien telah dinonaktifkan.</p>
        </div>
      )}

      {/* Tab 1: Penerbitan Baru */}
      {!issuedCodeResult && activeTab === "issue" && (
        <div className="admin-form-card">
          <h3 className="admin-form-card-title">Penerbitan Kode Akses Pasien</h3>
          <p className="admin-form-card-desc">
            Terbitkan kode akses mandiri baru berformat Crockford Base32 untuk ibu hamil yang terdaftar.
          </p>

          <form onSubmit={(e) => void handleIssueCredential(e)}>
            <div className="admin-form-grid-2col">
              <div className="form-group">
                <label htmlFor="issue-village">1. Filter Desa / Wilayah Binaan</label>
                <select
                  id="issue-village"
                  className="staff-input"
                  value={selectedVillageId}
                  onChange={(e) => {
                    setSelectedVillageId(e.target.value);
                    setSelectedMotherId("");
                  }}
                  disabled={loadingMothers}
                >
                  <option value="">
                    -- Semua Wilayah ({mothers.length} Pasien Terdaftar) --
                  </option>
                  {villages.map((v) => {
                    const countInVillage = mothers.filter((m) => m.village_id === v.id).length;
                    return (
                      <option key={v.id} value={v.id}>
                        {v.name} ({countInVillage} Pasien)
                      </option>
                    );
                  })}
                </select>
                <small className="field-hint">
                  Saring daftar ibu hamil berdasarkan domisili desa.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="issue-mother">2. Pilih Pasien Ibu Hamil *</label>
                <select
                  id="issue-mother"
                  className="staff-input"
                  value={selectedMotherId}
                  onChange={(e) => setSelectedMotherId(e.target.value)}
                  disabled={loadingMothers}
                  required
                >
                  <option value="">
                    -- {loadingMothers
                      ? "Memuat data ibu hamil..."
                      : filteredMothers.length === 0
                        ? "Tidak ada pasien di wilayah ini"
                        : `Pilih Pasien (${filteredMothers.length} Tersedia)`} --
                  </option>
                  {filteredMothers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone_masked}) - {m.village_name ?? "Tanpa Desa"}
                    </option>
                  ))}
                </select>
                <small className="field-hint">
                  Pilih pasien yang akan diterbitkan kode aksesnya.
                </small>
              </div>
            </div>

            <div className="admin-form-actions">
              <button
                className="btn-primary"
                type="submit"
                disabled={submitting || !selectedMotherId}
              >
                {submitting ? "Menerbitkan Kode..." : "Terbitkan Kode Akses Pasien"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Penerbitan Ulang (Reissue) */}
      {!issuedCodeResult && activeTab === "reissue" && (
        <div className="admin-form-card">
          <h3 className="admin-form-card-title">Penerbitan Ulang Kode Akses (Reissue)</h3>
          <p className="admin-form-card-desc">
            Gunakan menu ini jika kode pasien hilang atau lupa. Kredensial lama otomatis dibatalkan.
          </p>

          <form onSubmit={(e) => void handleReissueCredential(e)}>
            <div className="admin-form-grid-2col">
              <div className="form-group">
                <label htmlFor="reissue-village">1. Filter Desa / Wilayah Binaan</label>
                <select
                  id="reissue-village"
                  className="staff-input"
                  value={selectedVillageId}
                  onChange={(e) => {
                    setSelectedVillageId(e.target.value);
                    setSelectedMotherId("");
                  }}
                  disabled={loadingMothers}
                >
                  <option value="">
                    -- Semua Wilayah ({mothers.length} Pasien Terdaftar) --
                  </option>
                  {villages.map((v) => {
                    const countInVillage = mothers.filter((m) => m.village_id === v.id).length;
                    return (
                      <option key={v.id} value={v.id}>
                        {v.name} ({countInVillage} Pasien)
                      </option>
                    );
                  })}
                </select>
                <small className="field-hint">
                  Saring daftar ibu hamil berdasarkan domisili desa.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="reissue-mother">2. Pilih Pasien Ibu Hamil *</label>
                <select
                  id="reissue-mother"
                  className="staff-input"
                  value={selectedMotherId}
                  onChange={(e) => setSelectedMotherId(e.target.value)}
                  disabled={loadingMothers}
                  required
                >
                  <option value="">
                    -- {loadingMothers
                      ? "Memuat data..."
                      : filteredMothers.length === 0
                        ? "Tidak ada pasien di wilayah ini"
                        : `Pilih Pasien (${filteredMothers.length} Tersedia)`} --
                  </option>
                  {filteredMothers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone_masked}) - {m.village_name ?? "Tanpa Desa"}
                    </option>
                  ))}
                </select>
                <small className="field-hint">
                  Pilih pasien yang meminta penerbitan ulang kode akses.
                </small>
              </div>

              <div className="form-group form-group-full">
                <label htmlFor="reissue-reason">3. Alasan Penerbitan Ulang *</label>
                <input
                  id="reissue-reason"
                  className="staff-input"
                  type="text"
                  required
                  placeholder="Contoh: Kode pasien hilang / lupa"
                  value={reissueReason}
                  onChange={(e) => setReissueReason(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-form-actions">
              <button
                className="btn-primary"
                type="submit"
                disabled={submitting || !selectedMotherId}
              >
                {submitting ? "Memproses Reissue..." : "Terbitkan Kode Pengganti"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Pencabutan Akses (Revoke) */}
      {!issuedCodeResult && activeTab === "revoke" && (
        <div className="admin-form-card">
          <h3 className="admin-form-card-title">Pencabutan Akses Pasien (Revoke)</h3>
          <p className="admin-form-card-desc">
            Mencabut kredensial dan menghentikan seluruh sesi mandiri ibu hamil secara permanen.
          </p>

          <form onSubmit={(e) => void handleRevokeCredential(e)}>
            <div className="admin-form-grid-2col">
              <div className="form-group">
                <label htmlFor="revoke-village">1. Filter Desa / Wilayah Binaan</label>
                <select
                  id="revoke-village"
                  className="staff-input"
                  value={selectedVillageId}
                  onChange={(e) => {
                    setSelectedVillageId(e.target.value);
                    setSelectedMotherId("");
                  }}
                  disabled={loadingMothers}
                >
                  <option value="">
                    -- Semua Wilayah ({mothers.length} Pasien Terdaftar) --
                  </option>
                  {villages.map((v) => {
                    const countInVillage = mothers.filter((m) => m.village_id === v.id).length;
                    return (
                      <option key={v.id} value={v.id}>
                        {v.name} ({countInVillage} Pasien)
                      </option>
                    );
                  })}
                </select>
                <small className="field-hint">
                  Saring daftar ibu hamil berdasarkan domisili desa.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="revoke-mother">2. Pilih Pasien Ibu Hamil *</label>
                <select
                  id="revoke-mother"
                  className="staff-input"
                  value={selectedMotherId}
                  onChange={(e) => setSelectedMotherId(e.target.value)}
                  disabled={loadingMothers}
                  required
                >
                  <option value="">
                    -- {loadingMothers
                      ? "Memuat data..."
                      : filteredMothers.length === 0
                        ? "Tidak ada pasien di wilayah ini"
                        : `Pilih Pasien (${filteredMothers.length} Tersedia)`} --
                  </option>
                  {filteredMothers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone_masked}) - {m.village_name ?? "Tanpa Desa"}
                    </option>
                  ))}
                </select>
                <small className="field-hint">
                  Pilih pasien yang hak akses mandirinya akan dicabut.
                </small>
              </div>

              <div className="form-group form-group-full">
                <label htmlFor="revoke-reason">3. Alasan Pencabutan *</label>
                <input
                  id="revoke-reason"
                  className="staff-input"
                  type="text"
                  required
                  placeholder="Contoh: Pasien pindah domisili luar wilayah"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-form-actions">
              <button
                className="btn-danger"
                type="submit"
                disabled={submitting || !selectedMotherId}
              >
                {submitting ? "Mencabut Akses..." : "Cabut Akses Pasien"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
