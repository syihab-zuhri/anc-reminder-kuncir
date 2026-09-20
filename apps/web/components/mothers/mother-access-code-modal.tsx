"use client";

import type { MotherSummary } from "@anc/contracts";

interface MotherAccessCodeModalProps {
  readonly mother: MotherSummary;
  readonly issuedCode: string | null;
  readonly issuingCode: boolean;
  readonly accessCodeError: string | null;
  readonly copiedCode: boolean;
  readonly onIssueCode: () => void;
  readonly onCopyCode: () => void;
  readonly onClose: () => void;
}

export function MotherAccessCodeModal({
  mother,
  issuedCode,
  issuingCode,
  accessCodeError,
  copiedCode,
  onIssueCode,
  onCopyCode,
  onClose,
}: MotherAccessCodeModalProps) {
  const phoneRaw = mother.phone_number || mother.phone_masked || "-";
  const phoneDisplay = phoneRaw.startsWith("62") ? "0" + phoneRaw.slice(2) : phoneRaw;

  return (
    <div
      className="staff-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-modal-title"
    >
      <div className="staff-modal-dialog modal-md">
        <header className="staff-modal-header">
          <div className="staff-modal-header-content">
            <span className="staff-modal-kicker">Portal Mandiri Pasien</span>
            <h3 id="access-modal-title" className="staff-modal-title">
              Kode Akses Pasien
            </h3>
            <p className="staff-modal-subtitle">
              {mother.full_name} ({phoneDisplay})
            </p>
          </div>
          <button
            type="button"
            className="staff-modal-close-btn"
            onClick={onClose}
            aria-label="Tutup"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="16"
              height="16"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        <div className="staff-modal-body">
          <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem", margin: 0 }}>
            Pasien dapat masuk ke portal mandiri di <code>/mother/login</code> menggunakan Nama
            Lengkap dan Kode Akses ini.
          </p>

          {accessCodeError && (
            <div className="staff-alert alert-error" style={{ margin: 0 }}>
              <p>{accessCodeError}</p>
            </div>
          )}

          {issuedCode ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div
                style={{
                  padding: "1rem 0.75rem",
                  background: "#0f172a",
                  color: "#38bdf8",
                  fontSize: "clamp(1.1rem, 4.5vw, 1.55rem)",
                  fontWeight: 900,
                  fontFamily: "monospace",
                  letterSpacing: "1.5px",
                  textAlign: "center",
                  borderRadius: "10px",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
                  wordBreak: "break-all",
                }}
              >
                <code>{issuedCode}</code>
              </div>

              <div
                style={{
                  padding: "0.65rem 0.85rem",
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: "8px",
                  color: "#be123c",
                  fontSize: "0.78rem",
                  lineHeight: 1.4,
                }}
              >
                <strong>PERHATIAN KEAMANAN:</strong> Kode ini <u>HANYA DITAMPILKAN SATU KALI</u>.
                Segera serahkan atau catat kode ini sebelum menutup jendela.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <p style={{ fontSize: "0.88rem", color: "var(--ink)", margin: 0 }}>
                Terbitkan kode akses 16-karakter format Crockford Base32 baru untuk{" "}
                <strong>{mother.full_name}</strong>.
              </p>
            </div>
          )}
        </div>

        <div className="staff-modal-footer">
          {issuedCode ? (
            <>
              <button type="button" className="btn-primary" onClick={onCopyCode}>
                <span className="icon-label">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    width="15"
                    height="15"
                  >
                    <rect x="7" y="7" width="10" height="10" rx="2" />
                    <path d="M4 13V5a2 2 0 0 1 2-2h8" />
                  </svg>
                  <span>{copiedCode ? "Kode Tersalin!" : "Salin Kode Akses"}</span>
                </span>
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Selesai &amp; Tutup
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={issuingCode}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onIssueCode}
                disabled={issuingCode}
              >
                {issuingCode ? "Menerbitkan..." : "Terbitkan Kode Baru"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
