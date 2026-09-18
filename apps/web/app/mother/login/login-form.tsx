"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MotherLoginForm() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/mother-session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_code: accessCode.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(
          data?.error?.message ??
            "Kode akses tidak valid atau sudah tidak aktif. Silakan coba lagi.",
        );
        return;
      }

      router.replace("/mother");
      router.refresh();
    } catch {
      setError("Koneksi ke server terputus. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mother-login-form" onSubmit={(e) => void handleSubmit(e)}>
      {error && (
        <div className="mother-alert alert-error">
          <p>{error}</p>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="mother-access-code">Kode Akses Pemeriksaan Kehamilan</label>
        <div className="mother-input-wrapper">
          <input
            id="mother-access-code"
            className={error ? "input-has-error" : ""}
            type={showAccessCode ? "text" : "password"}
            required
            autoComplete="off"
            autoFocus
            inputMode="text"
            placeholder="Contoh: ANC-CR89-HUYQ-XKBT-FWLP"
            value={accessCode}
            onChange={(e) => {
              setAccessCode(e.target.value);
              if (error) setError(null);
            }}
          />
          <button
            type="button"
            className="mother-toggle-btn"
            onClick={() => setShowAccessCode(!showAccessCode)}
            aria-label={showAccessCode ? "Sembunyikan kode akses" : "Tampilkan kode akses"}
            title={showAccessCode ? "Sembunyikan kode akses" : "Tampilkan kode akses"}
          >
            {showAccessCode ? (
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  d="M3.5 3.5l13 13M8.5 8.5a3 3 0 0 0 4.24 4.24M10 5.5c3.5 0 6.5 2.5 7.5 4.5a10.8 10.8 0 0 1-3.23 3.63M6.27 6.27A10.6 10.6 0 0 0 2.5 10c1 2 4 4.5 7.5 4.5.9 0 1.77-.16 2.57-.45"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  d="M2.5 10c1-2 4-4.5 7.5-4.5s6.5 2.5 7.5 4.5c-1 2-4 4.5-7.5 4.5S3.5 12 2.5 10z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        <small className="field-help">
          Cukup masukkan kode akses 16 karakter yang tertera di buku KIA atau diberikan oleh Bidan.
          Sistem otomatis mengenali identitas Anda.
        </small>
      </div>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Memverifikasi…" : "Masuk ke Portal Ibu"}
      </button>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.75rem",
          background: "rgba(52, 112, 95, 0.08)",
          borderRadius: "8px",
          textAlign: "center",
          fontSize: "0.85rem",
        }}
      >
        <span style={{ color: "var(--ink-muted)" }}>Belum punya atau lupa kode akses? </span>
        <p style={{ margin: "0.35rem 0 0", fontWeight: 600, color: "var(--primary)" }}>
          Hubungi Bidan Desa Anda atau kunjungi Posyandu / Puskesmas terdekat untuk mendapatkan kode
          akses mandiri.
        </p>
      </div>
    </form>
  );
}
