"use client";

import type { MotherAccessCredentialIssueResponse, MotherSummary } from "@anc/contracts";
import { useEffect, useState } from "react";

interface MotherAccessPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

export function MotherAccessPanel({ userRole }: MotherAccessPanelProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "reissue" | "revoke">("issue");

  // Loaded mothers from Supabase
  const [mothers, setMothers] = useState<readonly MotherSummary[]>([]);
  const [loadingMothers, setLoadingMothers] = useState(false);

  // Selected mother for forms
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
        const res = await fetch("/api/staff-proxy/mothers", { signal });
        if (res.ok) {
          const data = (await res.json()) as { items: readonly MotherSummary[] };
          setMothers(data.items ?? []);
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

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Akses Pasien Mandiri</span>
          <h2>Penyerahan Kode Akses Ibu Hamil (Handoff &amp; Reissue)</h2>
        </div>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={activeTab === "issue" ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setActiveTab("issue");
            setErrorFeedback(null);
            setRevokedSuccess(false);
          }}
        >
          Terbitkan Kode Baru
        </button>
        <button
          type="button"
          className={activeTab === "reissue" ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setActiveTab("reissue");
            setErrorFeedback(null);
            setRevokedSuccess(false);
          }}
        >
          Terbitkan Ulang (Reissue)
        </button>
        <button
          type="button"
          className={activeTab === "revoke" ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setActiveTab("revoke");
            setErrorFeedback(null);
            setRevokedSuccess(false);
          }}
        >
          Cabut Akses (Revoke)
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
          className="staff-handoff-modal"
          style={{
            padding: "1.5rem",
            background: "var(--color-surface)",
            borderRadius: "8px",
            border: "2px solid var(--color-primary)",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "0.25rem 0.75rem",
              background: "var(--color-primary-light, #e0f2fe)",
              color: "var(--color-primary, #0369a1)",
              borderRadius: "9999px",
              fontSize: "0.85rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
            }}
          >
            {issuedCodeResult.action_kind === "INITIAL"
              ? "Penerbitan Pertama"
              : "Penerbitan Ulang (Reissued)"}
          </div>
          <h3>Serahkan Kode Akses kepada Ibu Hamil</h3>
          <p style={{ color: "var(--color-ink-muted)", marginBottom: "1rem" }}>
            Tunjukkan atau cetak kode di bawah ini untuk diserahkan secara pribadi kepada pasien
            saat pemeriksaan:
          </p>

          <div
            style={{
              padding: "1.25rem",
              background: "var(--color-bg, #0f172a)",
              color: "#38bdf8",
              fontSize: "1.6rem",
              fontWeight: "bold",
              fontFamily: "monospace",
              letterSpacing: "3px",
              borderRadius: "8px",
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            <code>{issuedCodeResult.access_code}</code>
          </div>

          <div
            style={{
              padding: "0.75rem 1rem",
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: "6px",
              color: "#be123c",
              fontSize: "0.9rem",
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
          <p>
            Akses ibu hamil berhasil dicabut. Seluruh sesi aktif pasien telah dinonaktifkan di
            database Supabase.
          </p>
        </div>
      )}

      {!issuedCodeResult && activeTab === "issue" && (
        <form className="staff-form-grid" onSubmit={(e) => void handleIssueCredential(e)}>
          <h3>Penerbitan Kode Akses Pasien</h3>
          <p
            className="form-lead"
            style={{ color: "var(--color-ink-muted)", marginBottom: "1rem" }}
          >
            Terbitkan kode akses 16-karakter format Crockford Base32 untuk ibu hamil yang terdaftar
            di Supabase.
          </p>

          <div className="form-group">
            <label htmlFor="issue-mother">Pilih Ibu Hamil *</label>
            <select
              id="issue-mother"
              className="staff-input"
              value={selectedMotherId}
              onChange={(e) => setSelectedMotherId(e.target.value)}
              required
            >
              <option value="">
                -- {loadingMothers ? "Memuat data ibu hamil..." : "Pilih Pasien Terdaftar"} --
              </option>
              {mothers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.phone_masked}) - {m.village_name ?? "Tanpa Desa"}
                </option>
              ))}
            </select>
          </div>

          <button className="btn-primary" type="submit" disabled={submitting || !selectedMotherId}>
            {submitting ? "Menerbitkan Kode..." : "Terbitkan Kode Akses Pasien"}
          </button>
        </form>
      )}

      {!issuedCodeResult && activeTab === "reissue" && (
        <form className="staff-form-grid" onSubmit={(e) => void handleReissueCredential(e)}>
          <h3>Penerbitan Ulang Kode Akses (Reissue)</h3>
          <p
            className="form-lead"
            style={{ color: "var(--color-ink-muted)", marginBottom: "1rem" }}
          >
            Gunakan menu ini jika kode pasien hilang atau lupa. Kode lama akan otomatis dicabut di
            Supabase.
          </p>

          <div className="form-group">
            <label htmlFor="reissue-mother">Pilih Ibu Hamil *</label>
            <select
              id="reissue-mother"
              className="staff-input"
              value={selectedMotherId}
              onChange={(e) => setSelectedMotherId(e.target.value)}
              required
            >
              <option value="">-- {loadingMothers ? "Memuat data..." : "Pilih Pasien"} --</option>
              {mothers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.phone_masked})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="reissue-reason">Alasan Penerbitan Ulang *</label>
            <input
              id="reissue-reason"
              className="staff-input"
              type="text"
              required
              placeholder="e.g. Kode pasien hilang / lupa"
              value={reissueReason}
              onChange={(e) => setReissueReason(e.target.value)}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting || !selectedMotherId}>
            {submitting ? "Memproses Reissue..." : "Terbitkan Kode Pengganti"}
          </button>
        </form>
      )}

      {!issuedCodeResult && activeTab === "revoke" && (
        <form className="staff-form-grid" onSubmit={(e) => void handleRevokeCredential(e)}>
          <h3>Pencabutan Akses Pasien (Revoke)</h3>
          <p
            className="form-lead"
            style={{ color: "var(--color-ink-muted)", marginBottom: "1rem" }}
          >
            Mencabut kredensial dan menghentikan seluruh sesi mandiri ibu hamil secara permanen.
          </p>

          <div className="form-group">
            <label htmlFor="revoke-mother">Pilih Ibu Hamil *</label>
            <select
              id="revoke-mother"
              className="staff-input"
              value={selectedMotherId}
              onChange={(e) => setSelectedMotherId(e.target.value)}
              required
            >
              <option value="">-- {loadingMothers ? "Memuat data..." : "Pilih Pasien"} --</option>
              {mothers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.phone_masked})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="revoke-reason">Alasan Pencabutan *</label>
            <input
              id="revoke-reason"
              className="staff-input"
              type="text"
              required
              placeholder="e.g. Pasien pindah domisili"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>

          <button className="btn-danger" type="submit" disabled={submitting || !selectedMotherId}>
            {submitting ? "Mencabut Akses..." : "Cabut Akses Pasien"}
          </button>
        </form>
      )}
    </div>
  );
}
