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
  const [showPassword, setShowPassword] = useState(false);
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
          className={error ? "input-has-error" : ""}
          type="text"
          autoComplete="username"
          value={loginIdentifier}
          onChange={(event) => {
            setLoginIdentifier(event.target.value);
            if (error) setError(undefined);
          }}
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
        <div className="staff-password-wrapper">
          <input
            id="password"
            name="password"
            className={error ? "input-has-error" : ""}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(undefined);
            }}
            required
            disabled={pending}
            placeholder="Masukkan kata sandi"
          />
          <button
            type="button"
            className="staff-password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          >
            {showPassword ? (
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
