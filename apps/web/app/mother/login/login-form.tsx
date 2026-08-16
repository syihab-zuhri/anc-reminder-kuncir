"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MotherLoginForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [accessCode, setAccessCode] = useState("");
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
          full_name: fullName.trim(),
          access_code: accessCode.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error?.message ?? "Nama atau kode akses tidak valid. Silakan coba lagi.");
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
        <label htmlFor="mother-fullname">Nama Lengkap</label>
        <input
          id="mother-fullname"
          type="text"
          required
          autoComplete="name"
          placeholder="Masukkan nama lengkap Anda"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="mother-access-code">Kode Akses</label>
        <input
          id="mother-access-code"
          type="text"
          required
          autoComplete="off"
          inputMode="text"
          placeholder="Masukkan kode akses 16 karakter"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
        />
        <small className="field-help">
          Kode akses diberikan oleh bidan atau petugas Puskesmas saat pendaftaran ANC.
        </small>
      </div>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Memverifikasi\u2026" : "Masuk"}
      </button>
    </form>
  );
}
