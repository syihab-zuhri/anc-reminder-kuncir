"use client";

import type { MotherSummary, PregnancyMilestoneListResponse } from "@anc/contracts";

import { useHealthCenterProfile } from "../../hooks/use-health-center-profile";
import { deviceEnvironment, OUTDATED_APP_MESSAGE } from "../../lib/native-device";
import { useToast } from "../../lib/toast-context";
import {
  facilityPolicyLabel,
  formatDate,
  formatDateRange,
  villageLabel,
  visitStatusLabel,
} from "../../lib/display-format";

interface MotherDetailModalProps {
  readonly mother: MotherSummary;
  readonly milestones: PregnancyMilestoneListResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onOpenAccessCode?: (mother: MotherSummary) => void;
  readonly isPuskesmas: boolean;
}

export function MotherDetailModal({
  mother,
  milestones,
  loading,
  error,
  onClose,
  onOpenAccessCode,
  isPuskesmas,
}: MotherDetailModalProps) {
  const healthCenter = useHealthCenterProfile();
  const toast = useToast();
  const healthCenterName = healthCenter?.name ?? "Puskesmas";
  const phoneRaw = mother.phone_number || mother.phone_masked || "-";
  const phoneDisplay = phoneRaw.startsWith("62") ? "0" + phoneRaw.slice(2) : phoneRaw;

  const villageDisplay = mother.village_name
    ? villageLabel(mother.village_name)
    : `Wilayah ${healthCenterName}`;

  // Where each visit takes place, from the active ANC plan rules of this pregnancy.
  const codesWithPolicy = (policy: string): string =>
    (milestones?.milestones ?? [])
      .filter((m) => m.required_facility_policy === policy)
      .map((m) => m.code)
      .join(", ");
  const puskesmasCodes = codesWithPolicy("PUSKESMAS_REQUIRED");
  const ponedCodes = codesWithPolicy("PONED_OR_RS_REQUIRED");
  const flexibleCodes = codesWithPolicy("FLEXIBLE");

  const now = new Date();
  const printDateStr = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const printTimeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handlePrint = async () => {
    const jobName = `Rekam_ANC_${mother.full_name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    // Inside the Android app window.print() does nothing; the app's print dialog is used instead.
    const device = deviceEnvironment();
    if (device.kind === "outdated-app") {
      toast.warning(OUTDATED_APP_MESSAGE, "Perbarui Aplikasi");
      return;
    }
    const prevTitle = document.title;
    document.title = jobName;
    try {
      if (device.kind === "app") await device.plugin.print({ jobName });
      else window.print();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : "Dialog cetak tidak bisa dibuka.",
        "Cetak Gagal",
      );
    } finally {
      document.title = prevTitle;
    }
  };

  return (
    <div
      className="staff-modal-backdrop detail-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="staff-modal-dialog modal-lg modal-detail-centered printable-patient-record">
        {/* ── Screen-only Modal Header ── */}
        <header className="staff-modal-header no-print">
          <div className="staff-modal-header-content">
            <span className="staff-modal-kicker">Detail Rekam Medis &amp; Linimasa</span>
            <h3 id="detail-modal-title" className="staff-modal-title">
              {mother.full_name}
            </h3>
            <p className="staff-modal-subtitle">
              {phoneDisplay} · {villageDisplay} · {mother.address}
            </p>
          </div>
          <button
            type="button"
            className="staff-modal-close-btn"
            onClick={onClose}
            aria-label="Tutup Detail"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        {/* ── Print-only Official Healthcare Header / Kop Surat ── */}
        <div className="print-record-header print-only">
          <div className="print-header-content">
            <div className="print-header-logo-group">
              <div className="print-inst-info">
                <p className="print-inst-sub">SISTEM PENGINGAT PEMERIKSAAN KEHAMILAN (ANC)</p>
                <h2 className="print-inst-name">{healthCenterName.toUpperCase()}</h2>
                {(healthCenter?.address || healthCenter?.facility_code) && (
                  <p className="print-inst-address">
                    {[
                      healthCenter.address,
                      healthCenter.facility_code
                        ? `Kode Faskes: ${healthCenter.facility_code}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="print-header-right">
              <span className="print-doc-badge">REKAM MEDIS ANC</span>
              <span className="print-doc-code">PELAYANAN TERPADU</span>
            </div>
          </div>
          <div className="print-header-line" />
          <div className="print-header-subline" />
          <div className="print-doc-heading">
            <h1>LEMBAR PEMANTAUAN PEMERIKSAAN KUNJUNGAN IBU HAMIL (K1 – K8)</h1>
            <p>
              Jadwal 8 kontak ANC (model WHO 2016) · Dicetak: {printDateStr}, {printTimeStr} WIB
            </p>
          </div>
        </div>

        {/* ── Print-only Patient Data & Pregnancy Info Table ── */}
        <div className="print-patient-info print-only">
          <h3 className="print-section-heading">
            I. IDENTITAS IBU HAMIL &amp; INFORMASI KEHAMILAN
          </h3>
          <table className="print-data-table">
            <tbody>
              <tr>
                <th style={{ width: "22%" }}>Nama Lengkap Pasien</th>
                <td style={{ width: "36%" }}>
                  <strong>{mother.full_name}</strong>
                </td>
                <th style={{ width: "20%" }}>Status Kehamilan</th>
                <td style={{ width: "22%" }}>
                  {mother.active_pregnancy
                    ? mother.active_pregnancy.status === "ACTIVE"
                      ? "Kehamilan Aktif"
                      : mother.active_pregnancy.status
                    : "Tidak Ada Kehamilan Aktif"}
                </td>
              </tr>
              <tr>
                <th>Nomor Kontak / WhatsApp</th>
                <td>{phoneDisplay}</td>
                <th>Usia Kehamilan Saat Ini</th>
                <td>
                  {mother.active_pregnancy
                    ? `${mother.active_pregnancy.completed_weeks} Minggu ${mother.active_pregnancy.completed_days} Hari`
                    : "-"}
                </td>
              </tr>
              <tr>
                <th>Desa / Dusun</th>
                <td>{villageDisplay}</td>
                <th>Tahap Trimester</th>
                <td>
                  <strong>{mother.active_pregnancy?.trimester_label ?? "-"}</strong>
                </td>
              </tr>
              <tr>
                <th>Alamat Domisili</th>
                <td>{mother.address || "-"}</td>
                <th>HPHT (Hari Pertama Haid)</th>
                <td>{formatDate(mother.active_pregnancy?.dating_date)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Modal Body (Screen & General View) */}
        <div className="staff-modal-body">
          {/* Screen Gestational Age Card */}
          <div className="no-print">
            {mother.active_pregnancy ? (
              <div className="mother-profile-card detail-gestational-card" style={{ margin: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <span
                      className="ga-label"
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 800,
                        color: "var(--ink-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Usia Kehamilan Saat Ini
                    </span>
                    <div
                      className="ga-value"
                      style={{
                        fontSize: "1.15rem",
                        fontWeight: 800,
                        color: "var(--ink)",
                        marginTop: "0.1rem",
                      }}
                    >
                      {mother.active_pregnancy.completed_weeks} Minggu{" "}
                      {mother.active_pregnancy.completed_days} Hari
                    </div>
                    <small style={{ color: "var(--ink-muted)", fontSize: "0.72rem" }}>
                      Tanggal HPHT:{" "}
                      <strong>{formatDate(mother.active_pregnancy.dating_date)}</strong>
                    </small>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      className="badge-status status-confirmed"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", fontWeight: 800 }}
                    >
                      {mother.active_pregnancy.trimester_label}
                    </span>
                    <div
                      style={{
                        marginTop: "0.2rem",
                        fontSize: "0.72rem",
                        color: "var(--ink-muted)",
                      }}
                    >
                      Status: <strong>{mother.active_pregnancy.status}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="staff-alert alert-info" style={{ margin: 0 }}>
                <p>Pasien ini tidak memiliki riwayat kehamilan aktif saat ini.</p>
              </div>
            )}
          </div>

          {/* ── Screen Milestones K1-K8 Section ── */}
          <div className="no-print" style={{ marginTop: "0.65rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.45rem",
                flexWrap: "wrap",
                gap: "0.4rem",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  color: "var(--ink)",
                }}
              >
                Linimasa Paket ANC (K1 – K8)
              </h4>
              {milestones?.next_milestone_code && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    color: "var(--ochre)",
                    background: "rgba(225, 180, 92, 0.12)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "9999px",
                  }}
                >
                  Kunjungan berikutnya: {milestones.next_milestone_code}
                </span>
              )}
            </div>

            {loading && (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <div className="loading-spinner" style={{ margin: "0 auto 0.5rem" }} />
                <p style={{ fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                  Memuat jadwal pemeriksaan K1–K8…
                </p>
              </div>
            )}

            {error && (
              <div className="staff-alert alert-error">
                <p>{error}</p>
              </div>
            )}

            {milestones && (
              <div className="timeline-grid detail-timeline-grid">
                {milestones.milestones.map((m) => {
                  const isConfirmed = m.visit_status === "CONFIRMED";
                  const isDue = m.visit_status === "DUE";
                  const isOverdue = m.visit_status === "OVERDUE";
                  const targetDate = m.due_at
                    ? formatDate(m.due_at)
                    : m.target_date_start && m.target_date_end
                      ? formatDateRange(m.target_date_start, m.target_date_end)
                      : "Sesuai jadwal";

                  const facility = facilityPolicyLabel(m.required_facility_policy, true);

                  return (
                    <div
                      key={m.code}
                      className={`timeline-card detail-timeline-card status-${m.visit_status.toLowerCase()}`}
                      style={{
                        background: isConfirmed
                          ? "#f0fdf4"
                          : isOverdue
                            ? "#fef2f2"
                            : isDue
                              ? "#fffbeb"
                              : "var(--paper)",
                        borderColor: isConfirmed
                          ? "#86efac"
                          : isOverdue
                            ? "#fca5a5"
                            : isDue
                              ? "#fde047"
                              : "var(--line)",
                      }}
                    >
                      <div className="detail-card-top">
                        <span
                          className="timeline-code"
                          style={{ fontSize: "0.82rem", fontWeight: 800 }}
                        >
                          {m.code}
                        </span>
                        <span
                          className={`badge-status status-${m.visit_status.toLowerCase()}`}
                          style={{ fontSize: "0.62rem", padding: "0.1rem 0.35rem" }}
                        >
                          {visitStatusLabel(m.visit_status)}
                        </span>
                      </div>

                      <div className="detail-card-meta">
                        <span>{m.trimester_label.replace("Trimester ", "T")}</span>
                        <span>·</span>
                        <span>{facility}</span>
                      </div>

                      <div
                        className="detail-card-date"
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          color: isConfirmed
                            ? "var(--success)"
                            : isOverdue
                              ? "var(--accent)"
                              : "var(--ink)",
                        }}
                      >
                        {isConfirmed ? <span>✓ Selesai</span> : <span>{targetDate}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Print-only Milestones Table ── */}
          {milestones && (
            <div className="print-milestones-block print-only">
              <h3 className="print-section-heading">
                II. JADWAL &amp; REALISASI PEMERIKSAAN KUNJUNGAN (K1 – K8)
              </h3>
              <table className="print-milestones-table">
                <thead>
                  <tr>
                    <th style={{ width: "5%", textAlign: "center" }}>No</th>
                    <th style={{ width: "10%", textAlign: "center" }}>Kode</th>
                    <th style={{ width: "15%" }}>Trimester</th>
                    <th style={{ width: "22%" }}>Rekomendasi Faskes</th>
                    <th style={{ width: "22%" }}>Jadwal / Jatuh Tempo</th>
                    <th style={{ width: "16%" }}>Status Pemeriksaan</th>
                    <th style={{ width: "10%", textAlign: "center" }}>Paraf</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.milestones.map((m, idx) => {
                    const isConfirmed = m.visit_status === "CONFIRMED";
                    const isDue = m.visit_status === "DUE";
                    const isOverdue = m.visit_status === "OVERDUE";
                    const statusText = isConfirmed
                      ? "Terkonfirmasi (Hadir)"
                      : isDue
                        ? "Waktunya Periksa"
                        : isOverdue
                          ? "Terlewat (Perlu Tindak Lanjut)"
                          : visitStatusLabel(m.visit_status);

                    const facilityText = facilityPolicyLabel(m.required_facility_policy);

                    const targetDate = m.due_at
                      ? formatDate(m.due_at)
                      : m.target_date_start && m.target_date_end
                        ? formatDateRange(m.target_date_start, m.target_date_end)
                        : "Sesuai jadwal";

                    return (
                      <tr key={m.code} className={isConfirmed ? "row-confirmed" : ""}>
                        <td style={{ textAlign: "center" }}>{idx + 1}</td>
                        <td style={{ textAlign: "center" }}>
                          <strong>{m.code}</strong>
                        </td>
                        <td>{m.trimester_label}</td>
                        <td>{facilityText}</td>
                        <td>{targetDate}</td>
                        <td>
                          <span className={`print-tag print-tag-${m.visit_status.toLowerCase()}`}>
                            {statusText}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>{isConfirmed ? "✓" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Print-only Guidance & Emergency Signs ── */}
          <div className="print-guidance-block print-only">
            <h3 className="print-section-heading">
              III. PANDUAN PELAYANAN ANC &amp; TANDA BAHAYA KEHAMILAN
            </h3>
            <div className="print-guidance-content">
              <div className="print-guidance-col">
                <strong>Jadwal Pemeriksaan Kehamilan (Model ANC WHO 2016):</strong>
                <ol>
                  <li>
                    Pemeriksaan kehamilan dijadwalkan 8 kali (K1–K8): satu kali di trimester 1, dua
                    kali di trimester 2, dan lima kali di trimester 3.
                  </li>
                  {puskesmasCodes && <li>{puskesmasCodes} dilakukan di Puskesmas.</li>}
                  {ponedCodes && (
                    <li>{ponedCodes} dilakukan di fasilitas PONED atau rumah sakit.</li>
                  )}
                  {flexibleCodes && (
                    <li>
                      {flexibleCodes} dapat dilakukan di Posyandu, Praktik Mandiri Bidan, atau
                      Puskesmas.
                    </li>
                  )}
                </ol>
              </div>
              <div className="print-guidance-col">
                <strong>Waspadai Tanda Bahaya Kehamilan (Segera ke Puskesmas/UGD):</strong>
                <ul>
                  <li>Perdarahan jalan lahir atau keluar air ketuban sebelum waktunya.</li>
                  <li>
                    Bengkak pada kaki, tangan, atau wajah disertai sakit kepala hebat / pandangan
                    kabur.
                  </li>
                  <li>Demam tinggi, muntah terus-menerus hingga tidak dapat makan/minum.</li>
                  <li>Gerakan janin berkurang dibandingkan biasanya, atau tidak terasa.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ── Print-only Signature & Verification Block ── */}
          <div className="print-footer-block print-only">
            <div className="print-disclaimer">
              <p>Ringkasan pemantauan ini dicetak dari Sistem Pengingat ANC {healthCenterName}.</p>
              <p>Dokumen ini tidak menggantikan Buku KIA ibu.</p>
            </div>
            <div className="print-signature-box">
              <p className="print-sig-date">.................., {printDateStr}</p>
              <p className="print-sig-title">Petugas Pemeriksa / Bidan Desa</p>
              <div style={{ height: "35pt" }} />
              <p className="print-sig-name">
                ( ................................................................ )
              </p>
              <p className="print-sig-id">
                NIP / No. STR: ....................................................
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer (Screen-only) */}
        <div className="staff-modal-footer no-print">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handlePrint()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
            }}
            title="Cetak ringkasan profil pasien & riwayat K1–K8"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Cetak Rekam</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Tutup
          </button>
          {isPuskesmas && onOpenAccessCode && (
            <button
              type="button"
              className="btn-primary btn-access-code"
              onClick={() => {
                onClose();
                onOpenAccessCode(mother);
              }}
            >
              Terbitkan Kode Akses
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
