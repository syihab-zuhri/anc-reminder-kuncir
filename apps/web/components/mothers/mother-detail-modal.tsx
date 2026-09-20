"use client";

import type { MotherSummary, PregnancyMilestoneListResponse } from "@anc/contracts";

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
  const phoneRaw = mother.phone_number || mother.phone_masked || "-";
  const phoneDisplay = phoneRaw.startsWith("62") ? "0" + phoneRaw.slice(2) : phoneRaw;

  const villageDisplay = mother.village_name
    ? mother.village_name.toLowerCase().startsWith("desa ")
      ? mother.village_name
      : `Desa ${mother.village_name}`
    : "Wilayah Puskesmas Kuncir";

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

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = `Rekam_ANC_${mother.full_name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    window.print();
    document.title = prevTitle;
  };

  return (
    <div
      className="staff-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="staff-modal-dialog modal-lg printable-patient-record">
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
                <p className="print-inst-sub">PEMERINTAH KABUPATEN NGANJUK · DINAS KESEHATAN</p>
                <h2 className="print-inst-name">PUSKESMAS KUNCIR</h2>
                <p className="print-inst-address">
                  Jl. Raya Kuncir No. 26, Kec. Loceret, Kab. Nganjuk, Jawa Timur 64471 · Kode
                  Faskes: PKM-KUNCIR
                </p>
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
              Standar Pelayanan Antenatal Care (ANC) Terpadu Kemenkes RI · Dicetak: {printDateStr},{" "}
              {printTimeStr} WIB
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
                <td>{mother.active_pregnancy?.dating_date ?? "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Modal Body (Screen & General View) */}
        <div className="staff-modal-body">
          {/* Screen Gestational Age Card */}
          <div className="no-print">
            {mother.active_pregnancy ? (
              <div
                className="mother-profile-card"
                style={{ padding: "1.15rem 1.25rem", margin: 0 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 800,
                        color: "var(--ink-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Usia Kehamilan Saat Ini
                    </span>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "var(--ink)",
                        marginTop: "0.15rem",
                      }}
                    >
                      {mother.active_pregnancy.completed_weeks} Minggu{" "}
                      {mother.active_pregnancy.completed_days} Hari
                    </div>
                    <small style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
                      Tanggal HPHT: <strong>{mother.active_pregnancy.dating_date}</strong>
                    </small>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      className="badge-status status-confirmed"
                      style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem", fontWeight: 800 }}
                    >
                      {mother.active_pregnancy.trimester_label}
                    </span>
                    <div
                      style={{
                        marginTop: "0.3rem",
                        fontSize: "0.75rem",
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

          {/* ── Screen Milestones K1-K8 Section (Card Grid) ── */}
          <div className="no-print" style={{ marginTop: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  color: "var(--ink)",
                }}
              >
                Linimasa Paket ANC (K1 – K8)
              </h4>
              {milestones?.next_milestone_code && (
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    color: "var(--ochre)",
                    background: "rgba(225, 180, 92, 0.12)",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "9999px",
                  }}
                >
                  Target: Milestone {milestones.next_milestone_code}
                </span>
              )}
            </div>

            {loading && (
              <div style={{ padding: "2rem", textAlign: "center" }}>
                <div className="loading-spinner" style={{ margin: "0 auto 0.5rem" }} />
                <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
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
              <div
                className="timeline-grid"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
                  gap: "0.65rem",
                }}
              >
                {milestones.milestones.map((m) => {
                  const isConfirmed = m.visit_status === "CONFIRMED";
                  const isDue = m.visit_status === "DUE";
                  const isOverdue = m.visit_status === "OVERDUE";

                  return (
                    <div
                      key={m.code}
                      className="timeline-card"
                      style={{
                        padding: "0.75rem",
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
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span className="timeline-code">{m.code}</span>
                        <span
                          className={`badge-status status-${m.visit_status.toLowerCase()}`}
                          style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}
                        >
                          {m.visit_status}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: "0.74rem",
                          color: "var(--ink-muted)",
                          fontWeight: 700,
                        }}
                      >
                        {m.trimester_label}
                      </div>

                      <div style={{ fontSize: "0.74rem", color: "var(--ink)" }}>
                        {m.due_at ? (
                          <span>
                            Jatuh Tempo: <strong>{m.due_at.slice(0, 10)}</strong>
                          </span>
                        ) : m.target_date_start && m.target_date_end ? (
                          <span>
                            {m.target_date_start} s/d {m.target_date_end}
                          </span>
                        ) : (
                          <span>Sesuai Rekomendasi</span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--ink-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          width="12"
                          height="12"
                          aria-hidden="true"
                        >
                          <path d="M10 2a5 5 0 0 0-5 5c0 3.75 5 9 5 9s5-5.25 5-9a5 5 0 0 0-5-5Z" />
                          <circle cx="10" cy="7" r="1.5" />
                        </svg>
                        <span>
                          {m.required_facility_policy === "PUSKESMAS_REQUIRED"
                            ? "Puskesmas"
                            : "TPMB / Praktik Mandiri Bidan"}
                        </span>
                      </div>

                      {m.visit_status === "CONFIRMED" && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            background: "rgba(52, 112, 95, 0.12)",
                            padding: "0.25rem 0.4rem",
                            borderRadius: "4px",
                            color: "var(--ink)",
                          }}
                        >
                          Pemeriksaan Terkonfirmasi
                        </div>
                      )}
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
                        ? "Jatuh Tempo (Waktunya Periksa)"
                        : isOverdue
                          ? "Terlewat (Perlu Tindak Lanjut)"
                          : "Akan Datang";

                    const facilityText =
                      m.required_facility_policy === "PUSKESMAS_REQUIRED"
                        ? "Puskesmas (Dokter + USG)"
                        : "TPMB / Praktik Mandiri Bidan";

                    const targetDate = m.due_at
                      ? m.due_at.slice(0, 10)
                      : m.target_date_start && m.target_date_end
                        ? `${m.target_date_start} s/d ${m.target_date_end}`
                        : "Sesuai Jadwal";

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
                <strong>Ketentuan Standar Pemeriksaan ANC Kemenkes RI:</strong>
                <ol>
                  <li>Pemeriksaan Antenatal Care minimal 6 (enam) kali selama masa kehamilan.</li>
                  <li>
                    Minimal 2 kali diperiksa oleh Dokter di Puskesmas: pada K1 (Trimester 1) dan K5
                    (Trimester 3) disertai skrining risiko dan pemeriksaan USG dasar.
                  </li>
                  <li>
                    Pemeriksaan K2, K3, K4, dan K6 dapat dilaksanakan di Posyandu / Praktik Mandiri
                    Bidan (TPMB) binaan Puskesmas Kuncir.
                  </li>
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
                  <li>Gerakan janin berkurang atau tidak terasa sama sekali dalam 12 jam.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ── Print-only Signature & Verification Block ── */}
          <div className="print-footer-block print-only">
            <div className="print-disclaimer">
              <p>
                Dokumen rekam pemantauan ini diterbitkan melalui Sistem Informasi Pengingat ANC
                Posyandu Kuncir.
              </p>
              <p>
                Sah digunakan sebagai bukti pemantauan status periksa ibu hamil lintas fasilitas
                pelayanan kesehatan binaan Puskesmas Kuncir.
              </p>
            </div>
            <div className="print-signature-box">
              <p className="print-sig-date">Kuncir, Nganjuk, {printDateStr}</p>
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
            onClick={handlePrint}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            title="Cetak ringkasan profil pasien & riwayat K1–K8"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Cetak Rekam Pasien</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Tutup
          </button>
          {isPuskesmas && onOpenAccessCode && (
            <button
              type="button"
              className="btn-primary"
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
