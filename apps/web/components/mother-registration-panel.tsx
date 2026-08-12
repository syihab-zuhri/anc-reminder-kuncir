"use client";

import { useState } from "react";

interface MotherRegistrationPanelProps {
  readonly healthCenterId: string | null;
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

type RegistrationStep = "FORM" | "REVIEW" | "SUCCESS";

export function MotherRegistrationPanel({
  healthCenterId,
  userRole,
}: MotherRegistrationPanelProps) {
  const [step, setStep] = useState<RegistrationStep>("FORM");

  // Form State - 5 Required Fields
  const [fullName, setFullName] = useState("");
  const [nik, setNik] = useState("");
  const [address, setAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pregnancyStartDate, setPregnancyStartDate] = useState("");
  const [villageId, setVillageId] = useState("");

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

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Deny by Default</span>
        <h3>Pendaftaran Ibu Hamil Tidak Tersedia untuk Super Admin</h3>
        <p>
          Sesuai kebijakan keamanan, Super Admin tidak diperkenankan mendaftarkan atau membaca data
          kesehatan pasien secara rutin.
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

    const consents: Array<{
      purpose: "REMINDER" | "DATA_PROCESSING";
      status: "GRANTED" | "WITHDRAWN";
    }> = [];
    consents.push({
      purpose: "REMINDER",
      status: consentReminder ? "GRANTED" : "WITHDRAWN",
    });
    consents.push({
      purpose: "DATA_PROCESSING",
      status: consentDataProcessing ? "GRANTED" : "WITHDRAWN",
    });

    try {
      const res = await fetch("/api/staff-proxy/mothers/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          health_center_id: healthCenterId,
          village_id: villageId.trim() || null,
          full_name: fullName.trim(),
          nik: nik.trim(),
          address: address.trim(),
          phone_number: phoneNumber.trim(),
          pregnancy_start_date: pregnancyStartDate.trim(),
          consents,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setValidationError(data?.error?.message ?? "Gagal mendaftarkan ibu hamil.");
        setStep("FORM");
        return;
      }

      setSuccessResult({
        mother_id: data.mother_id,
        pregnancy_id: data.pregnancy_id,
        registered_at: data.registered_at,
      });
      setStep("SUCCESS");
    } catch {
      setValidationError("Terjadi kesalahan koneksi saat menghubungi server.");
      setStep("FORM");
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetForm(): void {
    setFullName("");
    setNik("");
    setAddress("");
    setPhoneNumber("");
    setPregnancyStartDate("");
    setVillageId("");
    setConsentReminder(true);
    setConsentDataProcessing(true);
    setValidationError(null);
    setSuccessResult(null);
    setStep("FORM");
  }

  const maskedNikDisplay = nik.length >= 4 ? `${nik.slice(0, 4)}************` : "****************";

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">TASK-P3-002 / Registry Pendaftaran</span>
          <h2>Pendaftaran Ibu Hamil &amp; Formulir Persetujuan (Consent)</h2>
        </div>
      </header>

      {validationError && (
        <div className="staff-alert alert-error">
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
              type="text"
              required
              maxLength={16}
              placeholder="16 digit NIK sesuai KTP/KK"
              value={nik}
              onChange={(e) => setNik(e.target.value.replace(/\D/gu, ""))}
            />
            <small className="field-help">
              NIK dienkripsi server dengan kunci base64 dan tidak pernah disimpan dalam bentuk teks
              jernih.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="reg-address">3. Alamat Domisili Lengkap *</label>
            <input
              id="reg-address"
              type="text"
              required
              placeholder="Jalan, RT/RW, Dusun"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-phone">4. Nomor WhatsApp / Telepon *</label>
            <input
              id="reg-phone"
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
              type="date"
              required
              value={pregnancyStartDate}
              onChange={(e) => setPregnancyStartDate(e.target.value)}
            />
            <small className="field-help">
              Digunakan oleh server untuk menghitung usia kehamilan dan jadwal K1-K8 otomatis.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="reg-village">Desa Domisili (Opsional)</label>
            <input
              id="reg-village"
              type="text"
              placeholder="UUID desa domisili"
              value={villageId}
              onChange={(e) => setVillageId(e.target.value)}
            />
          </div>

          <fieldset className="consent-fieldset">
            <legend>Persetujuan Layanan (Consent Purposes)</legend>
            <label className="checkbox-label">
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
            <label className="checkbox-label">
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
          <p className="review-lead">
            Periksa kembali ringkasan data sebelum disimpan secara permanen ke server.
          </p>

          <dl className="review-list">
            <div>
              <dt>Nama Ibu Hamil</dt>
              <dd>{fullName}</dd>
            </div>
            <div>
              <dt>NIK (Tampilan Tersamar)</dt>
              <dd>
                <code>{maskedNikDisplay}</code>
              </dd>
            </div>
            <div>
              <dt>Alamat Domisili</dt>
              <dd>{address}</dd>
            </div>
            <div>
              <dt>Nomor Kontak Telepon/WA</dt>
              <dd>{phoneNumber}</dd>
            </div>
            <div>
              <dt>Tanggal Awal Kehamilan</dt>
              <dd>{pregnancyStartDate}</dd>
            </div>
            <div>
              <dt>Persetujuan Pengingat WA</dt>
              <dd>{consentReminder ? "Disetujui (GRANTED)" : "Ditolak (WITHDRAWN)"}</dd>
            </div>
            <div>
              <dt>Persetujuan Pemrosesan ANC</dt>
              <dd>{consentDataProcessing ? "Disetujui (GRANTED)" : "Ditolak (WITHDRAWN)"}</dd>
            </div>
          </dl>

          <div className="button-row">
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
              onClick={handleConfirmRegistration}
              disabled={submitting}
            >
              {submitting ? "Mendaftarkan ke Server…" : "Konfirmasi &amp; Simpan Registration"}
            </button>
          </div>
        </div>
      )}

      {step === "SUCCESS" && successResult && (
        <div className="staff-success-box">
          <div className="success-icon">&#10003;</div>
          <h3>Pendaftaran Ibu Hamil Berhasil Disimpan</h3>
          <p>Data pendaftaran dan jadwal ANC awal telah dibuat di server.</p>

          <dl className="review-list">
            <div>
              <dt>Nama Ibu Hamil</dt>
              <dd>
                <strong>{fullName}</strong>
              </dd>
            </div>
            <div>
              <dt>NIK Pasien (Privasi Terjaga)</dt>
              <dd>
                <code>{maskedNikDisplay}</code>
              </dd>
            </div>
            <div>
              <dt>ID Ibu Hamil (Mother ID)</dt>
              <dd>
                <code>{successResult.mother_id}</code>
              </dd>
            </div>
            <div>
              <dt>ID Kehamilan Aktif (Pregnancy ID)</dt>
              <dd>
                <code>{successResult.pregnancy_id}</code>
              </dd>
            </div>
            <div>
              <dt>Waktu Terdaftar Server</dt>
              <dd>{new Date(successResult.registered_at).toLocaleString("id-ID")}</dd>
            </div>
          </dl>

          <div className="security-notice">
            <strong>Proteksi Privasi Redaksi NIK:</strong> NIK lengkap dienkripsi secara
            irreversibel menggunakan <code>NIK_ENCRYPTION_KEY</code> pada server. Halaman ini tidak
            lagi menyimpan atau menampilkan plaintext NIK.
          </div>

          <button className="btn-primary" type="button" onClick={handleResetForm}>
            Daftarkan Ibu Hamil Lainnya
          </button>
        </div>
      )}
    </div>
  );
}
