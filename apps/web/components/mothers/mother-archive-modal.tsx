"use client";

import type { MotherSummary } from "@anc/contracts";

interface MotherArchiveModalProps {
  readonly mother: MotherSummary;
  readonly reason: string;
  readonly archiving: boolean;
  readonly error: string | null;
  readonly onReasonChange: (val: string) => void;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly onClose: () => void;
}

export function MotherArchiveModal({
  mother,
  reason,
  archiving,
  error,
  onReasonChange,
  onSubmit,
  onClose,
}: MotherArchiveModalProps) {
  const phoneRaw = mother.phone_number || mother.phone_masked || "-";
  const phoneDisplay = phoneRaw.startsWith("62") ? "0" + phoneRaw.slice(2) : phoneRaw;

  return (
    <div
      className="staff-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-modal-title"
    >
      <div className="staff-modal-dialog">
        <header className="staff-modal-header">
          <div className="staff-modal-header-content">
            <span className="staff-modal-kicker">Konfirmasi Tindakan Sensitif</span>
            <h3 id="archive-modal-title" className="staff-modal-title">
              Arsipkan Rekam Ibu {mother.full_name}?
            </h3>
            <p className="staff-modal-subtitle">
              Kontak: {phoneDisplay} · Alamat: {mother.address}
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

        <form
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}
        >
          <div className="staff-modal-body">
            <div className="staff-alert alert-error" style={{ margin: 0 }}>
              <p>
                Data tidak dimusnahkan. Rekam dan jejak audit dipertahankan, sedangkan akses portal
                dan perangkat pasien dicabut.
              </p>
            </div>
            {mother.active_pregnancy && (
              <div className="staff-alert alert-info" style={{ margin: 0 }}>
                <p>
                  Kehamilan aktif akan ditutup terlebih dahulu. Pengingat yang belum selesai akan
                  dibatalkan secara tercatat.
                </p>
              </div>
            )}
            {error && (
              <div className="staff-alert alert-error" style={{ margin: 0 }}>
                <p>{error}</p>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="archive-mother-reason">Alasan Pengarsipan Data *</label>
              <textarea
                id="archive-mother-reason"
                className="staff-input"
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                minLength={3}
                placeholder="Contoh: Pasien pindah domisili luar wilayah"
                rows={2}
                required
              />
            </div>
          </div>

          <div className="staff-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={archiving}>
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ background: "#b91c1c", borderColor: "#991b1b" }}
              disabled={archiving}
            >
              {archiving ? "Mengarsipkan..." : "Arsipkan Data Pasien"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
