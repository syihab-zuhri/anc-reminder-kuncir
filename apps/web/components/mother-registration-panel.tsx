"use client";

import type {
  MotherRegistrationResponse,
  MotherAccessCredentialIssueResponse,
} from "@anc/contracts";
import { useState } from "react";

interface MotherRegistrationPanelProps {
  readonly healthCenterId: string | null;
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
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

type RegistrationStep = "FORM" | "REVIEW" | "SUCCESS";

export function MotherRegistrationPanel({ userRole, onNavigateTab }: MotherRegistrationPanelProps) {
  const [step, setStep] = useState<RegistrationStep>("FORM");

  // Form State - 5 Required Fields
  const [fullName, setFullName] = useState("");
  const [nik, setNik] = useState("");
  const [address, setAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pregnancyStartDate, setPregnancyStartDate] = useState("");

  // Consents
  const [consentReminder, setConsentReminder] = useState(true);
  const [consentDataProcessing, setConsentDataProcessing] = useState(true);

  // Status & Feedback
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    mother_id: string;
    pregnancy_id: string;
    registered_at: string;
  } | null>(null);

  // Immediate access code handoff state
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Deny by Default</span>
        <h3>Pendaftaran Ibu Hamil Tidak Tersedia untuk Super Admin</h3>
        <p>
          Sesuai kebijakan keamanan data, peran Super Admin tidak diperkenankan mendaftarkan atau
          mengelola data rekam medis ibu hamil secara rutin.
        </p>
      </div>
    );
  }

  function validateForm(): boolean {
    setValidationError(null);
    if (!fullName.trim()) {
      setValidationError("Nama lengkap ibu hamil wajib diisi.");
      return false;
    }
    if (!/^\d{16}$/u.test(nik.trim())) {
      setValidationError("NIK harus terdiri tepat dari 16 digit angka.");
      return false;
    }
    if (!address.trim()) {
      setValidationError("Alamat domisili wajib diisi.");
      return false;
    }
    if (!/^08\d{8,12}$/u.test(phoneNumber.trim())) {
      setValidationError("Nomor telepon harus diawali '08' dengan 10-14 digit angka.");
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(pregnancyStartDate.trim())) {
      setValidationError("Tanggal awal kehamilan harus dalam format YYYY-MM-DD.");
      return false;
    }
    if (!consentReminder && !consentDataProcessing) {
      setValidationError("Minimal satu persetujuan (pemberitahuan atau pemrosesan) harus dipilih.");
      return false;
    }
    return true;
  }

  function handleGoToReview(e: React.FormEvent): void {
    e.preventDefault();
    if (validateForm()) {
      setStep("REVIEW");
    }
  }

  async function handleConfirmRegistration(): Promise<void> {
    setSubmitting(true);
    setValidationError(null);

    try {
      const res = await fetch("/api/staff-proxy/mothers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          full_name: fullName.trim(),
          nik: nik.trim(),
          address: address.trim(),
          phone_number: phoneNumber.trim(),
          pregnancy_start_date: pregnancyStartDate.trim(),
          consent: {
            notification_allowed: consentReminder,
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as
        MotherRegistrationResponse | { error?: { message?: string } } | null;

      if (!res.ok || !data || !("mother" in data)) {
        const errorMsg =
          (data as { error?: { message?: string } } | null)?.error?.message ??
          "Gagal mendaftarkan ibu hamil ke database.";
        setValidationError(errorMsg);
        setStep("FORM");
        return;
      }

      setSuccessResult({
        mother_id: data.mother.id,
        pregnancy_id: data.pregnancy.id,
        registered_at: data.consent.recorded_at,
      });
      setStep("SUCCESS");
    } catch {
      setValidationError("Terjadi kesalahan koneksi saat menghubungi server.");
      setStep("FORM");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateAccessCode(): Promise<void> {
    if (!successResult) return;
    setGeneratingCode(true);
    setCodeError(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/mothers/${encodeURIComponent(successResult.mother_id)}/access-code/reissue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            reason: "Penerbitan awal saat pendaftaran pasien",
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as
        MotherAccessCredentialIssueResponse | { error?: { message?: string } } | null;

      if (!res.ok || !data || "error" in data || !("one_time_code" in data)) {
        setCodeError(
          (data as { error?: { message?: string } })?.error?.message ??
            "Gagal menerbitkan kode akses ibu hamil.",
        );
        return;
      }

      setGeneratedCode(data.one_time_code);
    } catch {
      setCodeError("Terjadi gangguan jaringan saat menerbitkan kode akses.");
    } finally {
      setGeneratingCode(false);
    }
  }

  function handleResetForm(): void {
    setFullName("");
    setNik("");
    setAddress("");
    setPhoneNumber("");
    setPregnancyStartDate("");
    setConsentReminder(true);
    setConsentDataProcessing(true);
    setValidationError(null);
    setSuccessResult(null);
    setGeneratedCode(null);
    setCodeError(null);
    setStep("FORM");
  }

  const maskedNikDisplay = nik.length >= 4 ? `${nik.slice(0, 4)}************` : "****************";

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Registry Pendaftaran Ibu Hamil</span>
          <h2>Pendaftaran Ibu Hamil &amp; Formulir Persetujuan (Consent)</h2>
        </div>
      </header>

      {validationError && (
        <div className="staff-alert alert-error" style={{ marginBottom: "1rem" }}>
          <p>{validationError}</p>
        </div>
      )}

      {step === "FORM" && (
        <form className="staff-form-grid" onSubmit={handleGoToReview}>
          <div className="staff-section-subhead">
            <h3>Field Wajib Pendaftaran (5 Komponen Wajib)</h3>
            <p>Pastikan seluruh data pasien terverifikasi dari KTP/KK resmi.</p>
          </div>

          <div className="form-group">
            <label htmlFor="reg-fullname">1. Nama Lengkap Ibu Hamil *</label>
            <input
              id="reg-fullname"
              className="staff-input"
              type="text"
              required
              placeholder="e.g. Siti Aminah"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-nik">2. Nomor Induk Kependudukan (NIK) *</label>
            <input
              id="reg-nik"
              className="staff-input"
              type="text"
              required
              maxLength={16}
              placeholder="16 digit NIK sesuai KTP/KK"
              value={nik}
              onChange={(e) => setNik(e.target.value.replace(/\D/gu, ""))}
            />
            <small
              className="field-help"
              style={{ display: "block", marginTop: "0.25rem", color: "var(--color-ink-muted)" }}
            >
              NIK dienkripsi kuat di server dengan kunci base64 dan tidak pernah disimpan dalam
              bentuk teks jernih.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="reg-address">3. Alamat Domisili Lengkap *</label>
            <input
              id="reg-address"
              className="staff-input"
              type="text"
              required
              placeholder="Jalan, RT/RW, Dusun, Desa"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-phone">4. Nomor WhatsApp / Telepon *</label>
            <input
              id="reg-phone"
              className="staff-input"
              type="tel"
              required
              placeholder="e.g. 081234567890"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-dating">5. Tanggal Awal Kehamilan (HPHT / Dating Date) *</label>
            <input
              id="reg-dating"
              className="staff-input"
              type="date"
              required
              value={pregnancyStartDate}
              onChange={(e) => setPregnancyStartDate(e.target.value)}
            />
            <small
              className="field-help"
              style={{ display: "block", marginTop: "0.25rem", color: "var(--color-ink-muted)" }}
            >
              Digunakan oleh server untuk menghitung usia kehamilan dan jadwal K1-K8 otomatis.
            </small>
          </div>

          <fieldset
            className="consent-fieldset"
            style={{
              padding: "1rem",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              margin: "1rem 0",
            }}
          >
            <legend style={{ fontWeight: 600, padding: "0 0.5rem" }}>
              Persetujuan Layanan (Consent Purposes)
            </legend>
            <label
              className="checkbox-label"
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
                marginBottom: "0.5rem",
              }}
            >
              <input
                type="checkbox"
                checked={consentReminder}
                onChange={(e) => setConsentReminder(e.target.checked)}
              />
              <span>
                Ibu hamil menyetujui pengiriman pesan pengingat jadwal ANC via WhatsApp/Push
                Notification (REMINDER)
              </span>
            </label>
            <label
              className="checkbox-label"
              style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}
            >
              <input
                type="checkbox"
                checked={consentDataProcessing}
                onChange={(e) => setConsentDataProcessing(e.target.checked)}
              />
              <span>
                Ibu hamil menyetujui pemrosesan data kesehatan kehamilan oleh Puskesmas &amp; Bidan
                setempat (DATA_PROCESSING)
              </span>
            </label>
          </fieldset>

          <button className="btn-primary" type="submit">
            Tinjau Pendaftaran &rarr;
          </button>
        </form>
      )}

      {step === "REVIEW" && (
        <div className="staff-review-box">
          <h3>Konfirmasi Tinjauan Data Pendaftaran</h3>
          <p className="review-lead" style={{ marginBottom: "1.5rem" }}>
            Periksa kembali ringkasan data sebelum disimpan secara permanen ke database Supabase.
          </p>

          <dl
            className="review-list"
            style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}
          >
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>Nama Ibu Hamil</dt>
              <dd style={{ fontSize: "1.1rem", fontWeight: 600 }}>{fullName}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>
                NIK (Tersamar untuk Keamanan)
              </dt>
              <dd>
                <code>{maskedNikDisplay}</code>
              </dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>Alamat Domisili</dt>
              <dd>{address}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>
                Nomor Kontak WhatsApp
              </dt>
              <dd>{phoneNumber}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>
                Tanggal Awal Kehamilan (HPHT)
              </dt>
              <dd>{pregnancyStartDate}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>
                Persetujuan Pengingat
              </dt>
              <dd>{consentReminder ? "Disetujui (GRANTED)" : "Ditolak (WITHDRAWN)"}</dd>
            </div>
          </dl>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setStep("FORM")}
              disabled={submitting}
            >
              &larr; Ubah Data
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={() => void handleConfirmRegistration()}
              disabled={submitting}
            >
              {submitting ? "Mendaftarkan ke Database..." : "Konfirmasi & Simpan Pendaftaran"}
            </button>
          </div>
        </div>
      )}

      {step === "SUCCESS" && successResult && (
        <div
          className="staff-success-box"
          style={{
            padding: "1.5rem",
            background: "var(--color-surface)",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{ fontSize: "2.5rem", color: "var(--color-primary)", marginBottom: "0.5rem" }}
          ></div>
          <h3>Pendaftaran Ibu Hamil Berhasil Disimpan ke Supabase!</h3>
          <p style={{ color: "var(--color-ink-muted)", marginBottom: "1.5rem" }}>
            Data ibu hamil, kehamilan aktif, persetujuan, dan jadwal ANC (K1-K8) telah otomatis
            dibuat di database.
          </p>

          <dl
            className="review-list"
            style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}
          >
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>Nama Ibu Hamil</dt>
              <dd style={{ fontSize: "1.2rem", fontWeight: 700 }}>{fullName}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>
                NIK Pasien (Tersamar)
              </dt>
              <dd>
                <code>{maskedNikDisplay}</code>
              </dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>Waktu Terdaftar</dt>
              <dd>{new Date(successResult.registered_at).toLocaleString("id-ID")}</dd>
            </div>
          </dl>

          {/* Quick Access Code Generator Box */}
          <div
            style={{
              margin: "1.5rem 0",
              padding: "1.25rem",
              background: "var(--color-surface-raised, #f8fafc)",
              borderRadius: "8px",
              border: "1px solid var(--color-primary-light, #cbd5e1)",
            }}
          >
            <h4 style={{ margin: "0 0 0.5rem 0" }}>Kode Akses Portal Ibu Hamil</h4>
            {generatedCode ? (
              <div>
                <p
                  style={{
                    margin: "0 0 0.75rem 0",
                    fontSize: "0.9rem",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  Serahkan kode akses di bawah ini kepada pasien untuk login ke Portal Ibu Hamil
                  mandiri:
                </p>
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--color-bg, #0f172a)",
                    color: "#38bdf8",
                    fontSize: "1.4rem",
                    fontWeight: "bold",
                    fontFamily: "monospace",
                    letterSpacing: "2px",
                    borderRadius: "6px",
                    textAlign: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  {generatedCode}
                </div>
                <small style={{ color: "#e11d48", fontWeight: 600 }}>
                  Perhatian: Kode hanya ditampilkan satu kali ini. Catat atau serahkan langsung ke
                  pasien.
                </small>
              </div>
            ) : (
              <div>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.9rem" }}>
                  Terbitkan kode akses 16-karakter sekarang agar ibu hamil dapat langsung memantau
                  kehamilannya di Portal Ibu Hamil.
                </p>
                {codeError && (
                  <p style={{ color: "#e11d48", marginBottom: "0.5rem" }}>{codeError}</p>
                )}
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void handleGenerateAccessCode()}
                  disabled={generatingCode}
                >
                  {generatingCode ? "Menerbitkan Kode Akses..." : "Terbitkan Kode Akses Sekarang"}
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {onNavigateTab && (
              <button
                className="btn-primary"
                type="button"
                onClick={() => onNavigateTab("mothers")}
              >
                Lihat di Daftar Ibu Hamil
              </button>
            )}
            <button className="btn-secondary" type="button" onClick={handleResetForm}>
              + Daftarkan Ibu Hamil Lainnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
