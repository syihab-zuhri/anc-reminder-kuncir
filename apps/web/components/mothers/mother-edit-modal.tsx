"use client";

import type { MotherSummary } from "@anc/contracts";

interface MotherEditModalProps {
  readonly mother: MotherSummary;
  readonly fullName: string;
  readonly address: string;
  readonly phone: string;
  readonly reason: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onFullNameChange: (val: string) => void;
  readonly onAddressChange: (val: string) => void;
  readonly onPhoneChange: (val: string) => void;
  readonly onReasonChange: (val: string) => void;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly onClose: () => void;
}

export function MotherEditModal({
  mother,
  fullName,
  address,
  phone,
  reason,
  saving,
  error,
  onFullNameChange,
  onAddressChange,
  onPhoneChange,
  onReasonChange,
  onSubmit,
  onClose,
}: MotherEditModalProps) {
  const phoneRaw = mother.phone_number || mother.phone_masked || "-";
  const phoneDisplay = phoneRaw.startsWith("62") ? "0" + phoneRaw.slice(2) : phoneRaw;

  return (
    <div className="staff-modal-backdrop" role="presentation">
      <div className="staff-modal-dialog modal-md" role="dialog" aria-modal="true">
        <header className="staff-modal-header">
          <div className="staff-modal-header-content">
            <span className="staff-modal-kicker">Koreksi Data Administrasi</span>
            <h3 className="staff-modal-title">Edit Data Pasien</h3>
            <p className="staff-modal-subtitle">
              {mother.full_name} ({phoneDisplay})
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
            <p className="field-hint" style={{ margin: 0 }}>
              NIK tidak ditampilkan atau diubah di formulir ini. Kosongkan nomor telepon bila tidak
              berubah.
            </p>
            {error && (
              <div className="staff-alert alert-error" style={{ margin: 0 }}>
                <p>{error}</p>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="edit-mother-name">Nama Lengkap Pasien *</label>
              <input
                id="edit-mother-name"
                className="staff-input"
                value={fullName}
                onChange={(e) => onFullNameChange(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-mother-address">Alamat Domisili Lengkap *</label>
              <textarea
                id="edit-mother-address"
                className="staff-input"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                rows={2}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-mother-phone">Nomor Telepon Baru (Opsional)</label>
              <input
                id="edit-mother-phone"
                className="staff-input"
                inputMode="tel"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="Contoh: 0812 3456 7890"
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-mother-reason">Alasan Perubahan Data *</label>
              <input
                id="edit-mother-reason"
                className="staff-input"
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                minLength={3}
                placeholder="Contoh: Koreksi ejaan nama sesuai KTP"
                required
              />
            </div>
          </div>

          <div className="staff-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
