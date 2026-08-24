"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

interface LoginFormProps {
  readonly notice?: "logged-out" | "session-expired";
}

const noticeCopy = {
  "logged-out": "Anda telah keluar dengan aman dari ruang petugas.",
  "session-expired": "Sesi telah berakhir. Masuk kembali untuk melanjutkan.",
} as const;

export function LoginForm({ notice }: LoginFormProps) {
  const router = useRouter();
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/staff-session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login_identifier: loginIdentifier, password }),
      });
      if (response.ok) {
        setPassword("");
        router.replace("/staff");
        router.refresh();
        return;
      }
      setError(
        response.status === 503
          ? "Layanan petugas sedang tidak tersedia. Coba beberapa saat lagi."
          : "Identitas atau kata sandi tidak dapat diverifikasi.",
      );
    } catch {
      setError("Koneksi ke layanan petugas terputus. Periksa jaringan lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="staff-login-form" onSubmit={submit} noValidate>
      {notice === undefined ? null : (
        <p className="staff-form-notice" role="status">
          <span aria-hidden="true"></span>
          {noticeCopy[notice]}
        </p>
      )}

      <div className="staff-field">
        <label htmlFor="login-identifier">Identitas petugas</label>
        <input
          id="login-identifier"
          name="login_identifier"
          type="text"
          autoComplete="username"
          value={loginIdentifier}
          onChange={(event) => setLoginIdentifier(event.target.value)}
          minLength={3}
          maxLength={120}
          required
          disabled={pending}
          placeholder="contoh: bidan.kuncir"
        />
      </div>

      <div className="staff-field">
        <div className="staff-field-label">
          <label htmlFor="password">Kata sandi</label>
          <span>Minimal 8 karakter, huruf dan angka</span>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={pending}
          placeholder="Masukkan kata sandi"
        />
      </div>

      {error === undefined ? null : (
        <p className="staff-form-error" role="alert">
          {error}
        </p>
      )}

      <button className="staff-submit" type="submit" disabled={pending}>
        <span>{pending ? "Memverifikasi…" : "Masuk ke ruang petugas"}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h13M14 7l5 5-5 5" />
        </svg>
      </button>

      <p className="staff-form-security">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5.5 8V6a4.5 4.5 0 0 1 9 0v2M4 8h12v9H4z" />
        </svg>
        Sesi disimpan di cookie aman dan tidak diletakkan di penyimpanan browser.
      </p>
    </form>
  );
}
