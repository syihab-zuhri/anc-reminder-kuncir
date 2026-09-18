"use client";

import type {
  MotherAccessCredentialIssueResponse,
  MotherRegistrationResponse,
} from "@anc/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFacilities, useVillages } from "../hooks/use-organization-data";
import { useToast } from "../lib/toast-context";

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

const indonesianMonths = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function formatIndonesianDate(d: Date): string {
  return `${d.getUTCDate()} ${indonesianMonths[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function calculateDatingPreview(dateString: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dateString.trim())) return null;
  const hpht = new Date(`${dateString}T00:00:00.000Z`);
  if (isNaN(hpht.getTime())) return null;

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const diffTime = todayUtc.getTime() - hpht.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      isFuture: true,
      errorMessage:
        "Tanggal HPHT berada di masa depan. Mohon periksa kembali tanggal yang dipilih.",
    };
  }

  const completedWeeks = Math.floor(diffDays / 7);
  const completedDays = diffDays % 7;

  let trimester = "Trimester 1 (Minggu 1-12)";
  if (completedWeeks >= 28) {
    trimester = "Trimester 3 (Minggu 28-40+)";
  } else if (completedWeeks >= 13) {
    trimester = "Trimester 2 (Minggu 13-27)";
  }

  // Estimated Due Date (HPL): HPHT + 280 days
  const eddDate = new Date(hpht.getTime() + 280 * 24 * 60 * 60 * 1000);
  const eddFormatted = formatIndonesianDate(eddDate);

  return {
    isFuture: false,
    gestationalAge: `${completedWeeks} Minggu ${completedDays} Hari`,
    completedWeeks,
    completedDays,
    trimester,
    eddFormatted,
    isOverdue42Weeks: completedWeeks >= 42,
  };
}

export function MotherRegistrationPanel({ userRole, onNavigateTab }: MotherRegistrationPanelProps) {
  const toast = useToast();
  const [step, setStep] = useState<RegistrationStep>("FORM");

  // Form State
  const [fullName, setFullName] = useState("");
  const [nik, setNik] = useState("");
  const [villageId, setVillageId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [address, setAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pregnancyStartDate, setPregnancyStartDate] = useState("");

  const { villages } = useVillages();
  const { facilities } = useFacilities();

  // Filter facilities by selected village if any
  const availableFacilities = useMemo(() => {
    if (!villageId) return facilities;
    return facilities.filter((f) => f.village_id === villageId || !f.village_id);
  }, [facilities, villageId]);

  // Searchable Dropdown State for Facility
  const [facilitySearchQuery, setFacilitySearchQuery] = useState("");
  const [facilityDropdownOpen, setFacilityDropdownOpen] = useState(false);
  const facilityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (facilityDropdownRef.current && !facilityDropdownRef.current.contains(e.target as Node)) {
        setFacilityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedFacility = useMemo(
    () => availableFacilities.find((f) => f.id === facilityId),
    [availableFacilities, facilityId],
  );

  const filteredFacilities = useMemo(() => {
    if (!facilitySearchQuery.trim()) return availableFacilities;
    const q = facilitySearchQuery.toLowerCase();
    return availableFacilities.filter(
      (f) => f.name.toLowerCase().includes(q) || f.facility_type.toLowerCase().includes(q),
    );
  }, [availableFacilities, facilitySearchQuery]);

  // Consents
  const [consentReminder, setConsentReminder] = useState(true);
  const [consentDataProcessing, setConsentDataProcessing] = useState(true);

  // Status & Feedback
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    nik?: string;
    address?: string;
    phoneNumber?: string;
    pregnancyStartDate?: string;
    consent?: string;
    villageId?: string;
  }>({});
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
  const [copiedCode, setCopiedCode] = useState(false);

  const datingPreview = useMemo(
    () => calculateDatingPreview(pregnancyStartDate),
    [pregnancyStartDate],
  );

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
    const errs: {
      fullName?: string;
      nik?: string;
      address?: string;
      phoneNumber?: string;
      pregnancyStartDate?: string;
      consent?: string;
      villageId?: string;
    } = {};

    if (!fullName.trim()) {
      errs.fullName = "Nama lengkap ibu hamil wajib diisi.";
    }
    if (!/^\d{16}$/u.test(nik.trim())) {
      errs.nik = "NIK harus terdiri tepat dari 16 digit angka.";
    }
    if (!villageId) {
      errs.villageId =
        "Desa/kelurahan wajib dipilih agar data bumil tersinkronisasi dengan bidan wilayah.";
    }
    if (!address.trim()) {
      errs.address = "Alamat domisili lengkap wajib diisi.";
    }
    if (!/^08\d{8,12}$/u.test(phoneNumber.trim())) {
      errs.phoneNumber = "Nomor telepon harus diawali '08' dengan 10-14 digit angka.";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(pregnancyStartDate.trim())) {
      errs.pregnancyStartDate = "Tanggal awal kehamilan harus dalam format YYYY-MM-DD.";
    }
    if (!consentReminder && !consentDataProcessing) {
      errs.consent = "Minimal satu persetujuan (pemberitahuan atau pemrosesan) harus dipilih.";
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setValidationError(
        "Terdapat isian data yang belum valid. Mohon periksa field bertanda merah di bawah.",
      );
      toast.warning("Mohon lengkapi dan periksa kembali field bertanda merah.", "Validasi Form");
      return false;
    }

    setValidationError(null);
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
          village_id: villageId || null,
          registration_facility_id: facilityId || null,
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
        toast.error(errorMsg, "Pendaftaran Gagal");
        setStep("FORM");
        return;
      }

      setSuccessResult({
        mother_id: data.mother.id,
        pregnancy_id: data.pregnancy.id,
        registered_at: data.consent.recorded_at,
      });
      toast.success(
        `Ibu hamil "${fullName.trim()}" berhasil didaftarkan ke sistem.`,
        "Pendaftaran Berhasil",
      );
      setStep("SUCCESS");
    } catch {
      const connError = "Terjadi kesalahan koneksi saat menghubungi server.";
      setValidationError(connError);
      toast.error(connError, "Koneksi Terputus");
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
        const err =
          (data as { error?: { message?: string } })?.error?.message ??
          "Gagal menerbitkan kode akses ibu hamil.";
        setCodeError(err);
        toast.error(err, "Penerbitan Gagal");
        return;
      }

      setGeneratedCode(data.one_time_code);
      toast.success(`Kode akses ${data.one_time_code} berhasil diterbitkan.`, "Kode Akses Siap");
    } catch {
      const connErr = "Terjadi gangguan jaringan saat menerbitkan kode akses.";
      setCodeError(connErr);
      toast.error(connErr, "Koneksi Terputus");
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleCopyCode(): Promise<void> {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopiedCode(true);
      toast.success("Kode akses berhasil disalin ke clipboard.", "Tersalin");
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      toast.error("Gagal menyalin kode otomatis. Silakan salin secara manual.", "Salin Manual");
    }
  }

  function handleResetForm(): void {
    setFullName("");
    setNik("");
    setVillageId("");
    setFacilityId("");
    setAddress("");
    setPhoneNumber("");
    setPregnancyStartDate("");
    setConsentReminder(true);
    setConsentDataProcessing(true);
    setValidationError(null);
    setFieldErrors({});
    setSuccessResult(null);
    setGeneratedCode(null);
    setCodeError(null);
    setStep("FORM");
  }

  const maskedNikDisplay = nik.length >= 4 ? `${nik.slice(0, 4)}************` : "****************";

  return (
    <div className="staff-panel-card">
      <div className="staff-panel-header">
        <div>
          <span className="staff-panel-badge">PENDAFTARAN BARU</span>
          <h2>Pendaftaran Ibu Hamil</h2>
          <p>Registrasi profil ibu hamil & persetujuan pemantauan ANC.</p>
        </div>
      </div>

      {validationError && (
        <div
          className="staff-alert staff-alert-error"
          role="alert"
          style={{ marginBottom: "1.5rem" }}
        >
          <p>{validationError}</p>
        </div>
      )}

      {step === "FORM" && (
        <form onSubmit={handleGoToReview}>
          <div className="form-section-title" style={{ marginBottom: "1rem" }}>
            <h3>Field Wajib Pendaftaran (5 Komponen Wajib)</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--color-ink-muted)" }}>
              Pastikan seluruh data pasien terverifikasi dari KTP/KK resmi.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="reg-fullname">1. Nama Lengkap Ibu Hamil *</label>
            <input
              id="reg-fullname"
              className={`staff-input ${fieldErrors.fullName ? "input-has-error" : ""}`}
              type="text"
              required
              placeholder="e.g. Siti Aminah"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (fieldErrors.fullName)
                  setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
            />
            {fieldErrors.fullName && (
              <span className="inline-field-error" role="alert">
                {fieldErrors.fullName}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="reg-nik">2. Nomor Induk Kependudukan (NIK) *</label>
            <input
              id="reg-nik"
              className={`staff-input ${fieldErrors.nik ? "input-has-error" : ""}`}
              type="text"
              required
              maxLength={16}
              placeholder="16 digit NIK sesuai KTP/KK"
              value={nik}
              onChange={(e) => {
                setNik(e.target.value.replace(/\D/gu, ""));
                if (fieldErrors.nik) setFieldErrors((prev) => ({ ...prev, nik: undefined }));
              }}
            />
            {fieldErrors.nik ? (
              <span className="inline-field-error" role="alert">
                {fieldErrors.nik}
              </span>
            ) : (
              <small
                className="field-help"
                style={{ display: "block", marginTop: "0.25rem", color: "var(--color-ink-muted)" }}
              >
                Pastikan 16 digit NIK sesuai dengan data KTP atau Kartu Keluarga resmi.
              </small>
            )}
          </div>

          <div
            className="form-row"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
              alignItems: "start",
            }}
          >
            {/* 3. Wilayah Desa / Dusun Binaan (Dropdown) */}
            <div className="form-group">
              <label
                htmlFor="reg-village"
                style={{
                  display: "block",
                  marginBottom: "0.35rem",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                }}
              >
                3. Wilayah Desa / Dusun Binaan *
              </label>
              <select
                id="reg-village"
                className="staff-input"
                style={{
                  minHeight: "34px",
                  fontSize: "0.82rem",
                  borderRadius: "6px",
                }}
                value={villageId}
                onChange={(e) => {
                  setVillageId(e.target.value);
                  setFacilityId("");
                  setFacilitySearchQuery("");
                  if (fieldErrors.villageId)
                    setFieldErrors((prev) => ({ ...prev, villageId: undefined }));
                }}
                aria-invalid={!!fieldErrors.villageId}
                aria-describedby={fieldErrors.villageId ? "err-reg-village" : undefined}
              >
                <option value="">-- Pilih Wilayah Desa Binaan --</option>
                {villages.map((v) => (
                  <option key={v.id} value={v.id}>
                    Desa {v.name} ({v.code})
                  </option>
                ))}
              </select>
              {fieldErrors.villageId && (
                <span
                  id="err-reg-village"
                  className="inline-field-error"
                  role="alert"
                  style={{ marginTop: "0.35rem" }}
                >
                  {fieldErrors.villageId}
                </span>
              )}
            </div>

            {/* 4. TPMB / Faskes Pendaftaran (Searchable Dropdown) */}
            <div className="form-group">
              <label
                style={{
                  display: "block",
                  marginBottom: "0.35rem",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                }}
              >
                4. TPMB / Faskes Pendaftaran
              </label>
              <div ref={facilityDropdownRef} style={{ position: "relative" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    width="14"
                    height="14"
                    style={{
                      position: "absolute",
                      left: "0.65rem",
                      color: "var(--ink-faint, #777)",
                      pointerEvents: "none",
                    }}
                    aria-hidden="true"
                  >
                    <circle cx="8.5" cy="8.5" r="5.5" />
                    <line x1="12.5" y1="12.5" x2="17" y2="17" />
                  </svg>

                  <input
                    type="text"
                    className="staff-input"
                    style={{
                      minHeight: "34px",
                      paddingLeft: "2rem",
                      paddingRight: facilityId ? "2rem" : "0.75rem",
                      fontSize: "0.82rem",
                      borderRadius: "6px",
                      width: "100%",
                    }}
                    placeholder={
                      selectedFacility
                        ? `${selectedFacility.name} (${selectedFacility.facility_type})`
                        : "Ketik untuk cari TPMB / Posyandu…"
                    }
                    value={
                      facilityDropdownOpen
                        ? facilitySearchQuery
                        : selectedFacility
                          ? `${selectedFacility.name} (${selectedFacility.facility_type})`
                          : ""
                    }
                    onFocus={() => {
                      setFacilityDropdownOpen(true);
                      if (selectedFacility && !facilitySearchQuery) {
                        setFacilitySearchQuery("");
                      }
                    }}
                    onChange={(e) => {
                      setFacilitySearchQuery(e.target.value);
                      if (!facilityDropdownOpen) setFacilityDropdownOpen(true);
                    }}
                  />

                  {facilityId && (
                    <button
                      type="button"
                      onClick={() => {
                        setFacilityId("");
                        setFacilitySearchQuery("");
                      }}
                      style={{
                        position: "absolute",
                        right: "0.45rem",
                        background: "transparent",
                        border: "none",
                        color: "var(--ink-faint, #777)",
                        cursor: "pointer",
                        padding: "0.2rem",
                        fontSize: "0.85rem",
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Hapus pilihan faskes"
                      aria-label="Hapus pilihan faskes"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {facilityDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      backgroundColor: "var(--paper-raised, #ffffff)",
                      border: "1px solid var(--line, #ddd)",
                      borderRadius: "6px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      maxHeight: "220px",
                      overflowY: "auto",
                      padding: "0.3rem",
                    }}
                  >
                    <div
                      onClick={() => {
                        setFacilityId("");
                        setFacilitySearchQuery("");
                        setFacilityDropdownOpen(false);
                      }}
                      style={{
                        padding: "0.4rem 0.65rem",
                        fontSize: "0.8rem",
                        borderRadius: "4px",
                        cursor: "pointer",
                        backgroundColor: !facilityId ? "rgba(22, 61, 55, 0.08)" : "transparent",
                        fontWeight: !facilityId ? 650 : 400,
                        color: "var(--ink)",
                      }}
                    >
                      — Tanpa Faskes Khusus —
                    </div>

                    {filteredFacilities.length === 0 ? (
                      <div
                        style={{
                          padding: "0.5rem 0.65rem",
                          fontSize: "0.8rem",
                          color: "var(--ink-muted, #666)",
                          fontStyle: "italic",
                        }}
                      >
                        Tidak ada TPMB / Posyandu yang cocok
                      </div>
                    ) : (
                      filteredFacilities.map((f) => {
                        const isSelected = facilityId === f.id;
                        return (
                          <div
                            key={f.id}
                            onClick={() => {
                              setFacilityId(f.id);
                              setFacilitySearchQuery(f.name);
                              setFacilityDropdownOpen(false);
                            }}
                            style={{
                              padding: "0.4rem 0.65rem",
                              fontSize: "0.8rem",
                              borderRadius: "4px",
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              backgroundColor: isSelected
                                ? "rgba(22, 61, 55, 0.08)"
                                : "transparent",
                              fontWeight: isSelected ? 650 : 400,
                              color: "var(--ink)",
                            }}
                          >
                            <span>{f.name}</span>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--ink-muted, #777)",
                                backgroundColor: "rgba(0,0,0,0.05)",
                                padding: "0.1rem 0.35rem",
                                borderRadius: "3px",
                              }}
                            >
                              {f.facility_type}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                <small
                  className="field-help"
                  style={{
                    display: "block",
                    marginTop: "0.25rem",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  Ketik nama untuk mencari posyandu/faskes di wilayah desa yang dipilih.
                </small>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-address">5. Alamat Domisili Lengkap *</label>
            <input
              id="reg-address"
              className={`staff-input ${fieldErrors.address ? "input-has-error" : ""}`}
              type="text"
              required
              placeholder="Jalan, RT/RW, Dusun, Desa"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (fieldErrors.address)
                  setFieldErrors((prev) => ({ ...prev, address: undefined }));
              }}
            />
            {fieldErrors.address && (
              <span className="inline-field-error" role="alert">
                {fieldErrors.address}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="reg-phone">6. Nomor WhatsApp / Telepon *</label>
            <input
              id="reg-phone"
              className={`staff-input ${fieldErrors.phoneNumber ? "input-has-error" : ""}`}
              type="tel"
              required
              placeholder="e.g. 081234567890"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                if (fieldErrors.phoneNumber)
                  setFieldErrors((prev) => ({ ...prev, phoneNumber: undefined }));
              }}
            />
            {fieldErrors.phoneNumber && (
              <span className="inline-field-error" role="alert">
                {fieldErrors.phoneNumber}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="reg-dating">7. Tanggal Awal Kehamilan (HPHT / Dating Date) *</label>
            <input
              id="reg-dating"
              className={`staff-input ${fieldErrors.pregnancyStartDate ? "input-has-error" : ""}`}
              type="date"
              required
              value={pregnancyStartDate}
              onChange={(e) => {
                setPregnancyStartDate(e.target.value);
                if (fieldErrors.pregnancyStartDate)
                  setFieldErrors((prev) => ({ ...prev, pregnancyStartDate: undefined }));
              }}
            />
            {fieldErrors.pregnancyStartDate ? (
              <span className="inline-field-error" role="alert">
                {fieldErrors.pregnancyStartDate}
              </span>
            ) : (
              <small
                className="field-help"
                style={{ display: "block", marginTop: "0.25rem", color: "var(--color-ink-muted)" }}
              >
                Digunakan oleh server untuk menghitung usia kehamilan dan jadwal K1-K8 otomatis.
              </small>
            )}

            {datingPreview && (
              <div
                className="dating-live-preview-card"
                role="region"
                aria-label="Kalkulasi Usia Kehamilan dan Taksiran Persalinan"
              >
                {datingPreview.isFuture ? (
                  <p className="dating-preview-note" style={{ color: "#b91c1c" }}>
                    ⚠️ {datingPreview.errorMessage}
                  </p>
                ) : (
                  <>
                    <div className="preview-card-topline">
                      <span className="preview-badge-auto">✨ Kalkulasi Otomatis</span>
                      <span className="preview-badge-trimester">{datingPreview.trimester}</span>
                    </div>
                    <div className="dating-preview-grid">
                      <div className="dating-preview-item">
                        <span className="label">Usia Kehamilan Saat Ini</span>
                        <strong className="value">{datingPreview.gestationalAge}</strong>
                      </div>
                      <div className="dating-preview-item">
                        <span className="label">Taksiran Persalinan (HPL)</span>
                        <strong className="value">{datingPreview.eddFormatted}</strong>
                      </div>
                    </div>
                    {datingPreview.isOverdue42Weeks ? (
                      <p className="dating-preview-note" style={{ color: "#b91c1c" }}>
                        ⚠️ Usia kehamilan mencapai/melampaui 42 minggu. Pastikan tanggal HPHT telah
                        sesuai.
                      </p>
                    ) : (
                      <p className="dating-preview-note">
                        💡 Verifikasi taksiran ini dengan Hari Pertama Haid Terakhir (HPHT) pada
                        Buku KIA fisik ibu.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
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
                onChange={(e) => {
                  setConsentReminder(e.target.checked);
                  if (fieldErrors.consent)
                    setFieldErrors((prev) => ({ ...prev, consent: undefined }));
                }}
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
                onChange={(e) => {
                  setConsentDataProcessing(e.target.checked);
                  if (fieldErrors.consent)
                    setFieldErrors((prev) => ({ ...prev, consent: undefined }));
                }}
              />
              <span>
                Ibu hamil menyetujui pemrosesan data kesehatan kehamilan oleh Puskesmas &amp; Bidan
                setempat (DATA_PROCESSING)
              </span>
            </label>
            {fieldErrors.consent && (
              <span className="inline-field-error" role="alert" style={{ marginTop: "0.5rem" }}>
                {fieldErrors.consent}
              </span>
            )}
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
            Periksa kembali ringkasan data sebelum disimpan.
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
            {villageId && (
              <div>
                <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>
                  Wilayah Desa / Dusun
                </dt>
                <dd>{villages.find((v) => v.id === villageId)?.name ?? villageId}</dd>
              </div>
            )}
            {facilityId && (
              <div>
                <dt style={{ fontWeight: 600, color: "var(--color-ink-muted)" }}>
                  TPMB / Faskes Pendaftaran
                </dt>
                <dd>{facilities.find((f) => f.id === facilityId)?.name ?? facilityId}</dd>
              </div>
            )}
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
              <dd>{consentReminder ? "Disetujui" : "Ditolak"}</dd>
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
              {submitting ? "Menyimpan data..." : "Konfirmasi & Simpan Pendaftaran"}
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
          <h3>Pendaftaran Ibu Hamil Berhasil Disimpan!</h3>
          <p style={{ color: "var(--color-ink-muted)", marginBottom: "1.5rem" }}>
            Data ibu hamil, kehamilan aktif, dan jadwal pemeriksaan ANC (K1-K8) telah berhasil
            didaftarkan.
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
                <div style={{ marginBottom: "0.75rem" }}>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => void handleCopyCode()}
                    style={{ fontSize: "0.85rem", padding: "0.45rem 0.85rem" }}
                  >
                    <span
                      className="icon-label"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                    >
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
