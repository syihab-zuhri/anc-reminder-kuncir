"use client";

import { useState } from "react";

interface MotherAccessPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

export function MotherAccessPanel({ userRole }: MotherAccessPanelProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "reissue" | "revoke">("issue");

  // Issue Form State
  const [issueMotherId, setIssueMotherId] = useState("");
  const [issuePregnancyId, setIssuePregnancyId] = useState("");

  // Reissue Form State
  const [reissueCredentialId, setReissueCredentialId] = useState("");
  const [reissueReason, setReissueReason] = useState("Kode pasien hilang / lupa");

  // Revoke Form State
  const [revokeCredentialId, setRevokeCredentialId] = useState("");

  // Feedback & Plaintext Code State
  const [submitting, setSubmitting] = useState(false);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [issuedCodeResult, setIssuedCodeResult] = useState<{
    credential_id: string;
    mother_id: string;
    pregnancy_id: string;
    access_code: string;
    expires_at: string;
    action_kind: "INITIAL" | "REISSUE";
  } | null>(null);

  const [revokedSuccess, setRevokedSuccess] = useState<boolean>(false);

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Deny by Default</span>
        <h3>Pengelolaan Kode Akses Tidak Tersedia untuk Super Admin</h3>
        <p>Akses pasien tidak dapat diberikan atau diperbarui oleh peran Super Admin.</p>
      </div>
    );
  }

  async function handleIssueCredential(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!issueMotherId.trim() || !issuePregnancyId.trim()) return;
    setSubmitting(true);
    setErrorFeedback(null);
    setIssuedCodeResult(null);

    try {
      const res = await fetch("/api/staff-proxy/mother-access/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mother_id: issueMotherId.trim(),
          pregnancy_id: issuePregnancyId.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorFeedback(data?.error?.message ?? "Gagal menerbitkan kode akses ibu hamil.");
        return;
      }

      setIssuedCodeResult({
        credential_id: data.credential_id,
        mother_id: data.mother_id,
        pregnancy_id: data.pregnancy_id,
        access_code: data.access_code,
        expires_at: data.expires_at,
        action_kind: "INITIAL",
      });
      setIssueMotherId("");
      setIssuePregnancyId("");
    } catch {
      setErrorFeedback("Terjadi kesalahan jaringan saat menerbitkan kode akses.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReissueCredential(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!reissueCredentialId.trim() || !reissueReason.trim()) return;
    setSubmitting(true);
    setErrorFeedback(null);
    setIssuedCodeResult(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/mother-access/credentials/${encodeURIComponent(reissueCredentialId.trim())}/reissue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: reissueReason.trim() }),
        },
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorFeedback(data?.error?.message ?? "Gagal memperbarui kode akses.");
        return;
      }

      setIssuedCodeResult({
        credential_id: data.credential_id,
        mother_id: data.mother_id,
        pregnancy_id: data.pregnancy_id,
        access_code: data.access_code,
        expires_at: data.expires_at,
        action_kind: "REISSUE",
      });
      setReissueCredentialId("");
    } catch {
      setErrorFeedback("Terjadi kesalahan jaringan saat menerbitkan ulang kode akses.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeCredential(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!revokeCredentialId.trim()) return;
    setSubmitting(true);
    setErrorFeedback(null);
    setRevokedSuccess(false);

    try {
      const res = await fetch(
        `/api/staff-proxy/mother-access/credentials/${encodeURIComponent(revokeCredentialId.trim())}/revoke`,
        { method: "POST" },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorFeedback(data?.error?.message ?? "Gagal mencabut kode akses.");
        return;
      }

      setRevokedSuccess(true);
      setRevokeCredentialId("");
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
          <span className="staff-kicker">TASK-P3-003 / Akses Pasien</span>
          <h2>Penyerahan Kode Akses Ibu Hamil (Handoff &amp; Reissue)</h2>
        </div>
      </header>

      <nav className="staff-tab-nav" aria-label="Menu kredensial ibu hamil">
        <button
          type="button"
          className={activeTab === "issue" ? "is-active" : ""}
          onClick={() => {
            setActiveTab("issue");
            setErrorFeedback(null);
          }}
        >
          Terbitkan Kode Baru
        </button>
        <button
          type="button"
          className={activeTab === "reissue" ? "is-active" : ""}
          onClick={() => {
            setActiveTab("reissue");
            setErrorFeedback(null);
          }}
        >
          Terbitkan Ulang (Reissue)
        </button>
        <button
          type="button"
          className={activeTab === "revoke" ? "is-active" : ""}
          onClick={() => {
            setActiveTab("revoke");
            setErrorFeedback(null);
          }}
        >
          Cabut Akses (Revoke)
        </button>
      </nav>

      {errorFeedback && (
        <div className="staff-alert alert-error">
          <p>{errorFeedback}</p>
        </div>
      )}

      {/* Security Handoff Card displaying Plaintext Access Code ONCE */}
      {issuedCodeResult && (
        <div className="staff-handoff-modal">
          <div className="handoff-badge">
            {issuedCodeResult.action_kind === "INITIAL"
              ? "Penerbitan Pertama"
              : "Penerbitan Ulang (Reissued)"}
          </div>
          <h3>Serahkan Kode Akses kepada Ibu Hamil</h3>
          <p>
            Tunjukkan atau cetak kode di bawah ini untuk diserahkan secara pribadi kepada pasien
            saat pemeriksaan.
          </p>

          <div className="access-code-box">
            <code>{issuedCodeResult.access_code}</code>
          </div>

          <div className="security-warning-callout">
            <strong>PERHATIAN KEAMANAN KETAT (ADR-001):</strong> Kode di atas{" "}
            <u>HANYA DITAMPILKAN SEKALI INI</u>. Server hanya menyimpan verifikasi salted hash dan
            tidak dapat menampilkan kembali teks jernih kode ini setelah halaman ditutup.
          </div>

          <dl className="review-list compact">
            <div>
              <dt>ID Kredensial</dt>
              <dd>
                <code>{issuedCodeResult.credential_id}</code>
              </dd>
            </div>
            <div>
              <dt>ID Ibu Hamil</dt>
              <dd>
                <code>{issuedCodeResult.mother_id}</code>
              </dd>
            </div>
            <div>
              <dt>Berlaku Sampai</dt>
              <dd>{new Date(issuedCodeResult.expires_at).toLocaleDateString("id-ID")}</dd>
            </div>
          </dl>

          <button className="btn-primary" type="button" onClick={() => setIssuedCodeResult(null)}>
            Saya Sudah Menyerahkan Kode Kepada Pasien
          </button>
        </div>
      )}

      {revokedSuccess && (
        <div className="staff-alert alert-success">
          <p>Akses ibu hamil berhasil dicabut. Sesi aktif pasien telah dinonaktifkan di server.</p>
        </div>
      )}

      {!issuedCodeResult && activeTab === "issue" && (
        <form className="staff-form-grid" onSubmit={handleIssueCredential}>
          <h3>Penerbitan Kode Akses Pertama</h3>
          <p className="form-lead">
            Terbitkan kode akses awal 16 karakter untuk ibu hamil yang baru terdaftar.
          </p>

          <div className="form-group">
            <label htmlFor="issue-mother">ID Ibu Hamil (Mother ID) *</label>
            <input
              id="issue-mother"
              type="text"
              required
              placeholder="UUID Ibu Hamil (e.g. 60000000-0000-4000-...)"
              value={issueMotherId}
              onChange={(e) => setIssueMotherId(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="issue-pregnancy">ID Kehamilan Aktif (Pregnancy ID) *</label>
            <input
              id="issue-pregnancy"
              type="text"
              required
              placeholder="UUID Kehamilan (e.g. 70000000-0000-4000-...)"
              value={issuePregnancyId}
              onChange={(e) => setIssuePregnancyId(e.target.value)}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Menerbitkan Kode…" : "Terbitkan Kode Akses Pasien"}
          </button>
        </form>
      )}

      {!issuedCodeResult && activeTab === "reissue" && (
        <form className="staff-form-grid" onSubmit={handleReissueCredential}>
          <h3>Penerbitan Ulang Kode Akses (Reissue)</h3>
          <p className="form-lead">
            Gunakan menu ini jika kode pasien hilang atau bocor. Kode lama akan otomatis dicabut.
          </p>

          <div className="form-group">
            <label htmlFor="reissue-cred-id">ID Kredensial Lama (Credential ID) *</label>
            <input
              id="reissue-cred-id"
              type="text"
              required
              placeholder="UUID kredensial lama"
              value={reissueCredentialId}
              onChange={(e) => setReissueCredentialId(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reissue-reason">Alasan Penerbitan Ulang *</label>
            <input
              id="reissue-reason"
              type="text"
              required
              placeholder="e.g. Kode pasien hilang / lupa"
              value={reissueReason}
              onChange={(e) => setReissueReason(e.target.value)}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Memproses Reissue…" : "Terbitkan Kode Pengganti"}
          </button>
        </form>
      )}

      {!issuedCodeResult && activeTab === "revoke" && (
        <form className="staff-form-grid" onSubmit={handleRevokeCredential}>
          <h3>Pencabutan Akses Pasien (Revoke)</h3>
          <p className="form-lead">
            Mencabut kredensial dan menghentikan seluruh sesi mandiri ibu hamil.
          </p>

          <div className="form-group">
            <label htmlFor="revoke-cred-id">ID Kredensial (Credential ID) *</label>
            <input
              id="revoke-cred-id"
              type="text"
              required
              placeholder="UUID kredensial yang akan dicabut"
              value={revokeCredentialId}
              onChange={(e) => setRevokeCredentialId(e.target.value)}
            />
          </div>

          <button className="btn-danger" type="submit" disabled={submitting}>
            {submitting ? "Mencabut…" : "Cabut Akses Pasien"}
          </button>
        </form>
      )}
    </div>
  );
}
