"use client";

import type { MilestoneCode } from "@anc/contracts";
import { useState } from "react";

interface BidanVisitConfirmationPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

export function BidanVisitConfirmationPanel({ userRole }: BidanVisitConfirmationPanelProps) {
  const [pregnancyId, setPregnancyId] = useState("");
  const [milestoneCode, setMilestoneCode] = useState<MilestoneCode>("K2");
  const [facilityId, setFacilityId] = useState("");
  const [facilityType, setFacilityType] = useState<
    "POSYANDU" | "PUSKESMAS" | "KLINIK_PRIVATE" | "RUMAH_SAKIT"
  >("POSYANDU");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  if (userRole === "SUPER_ADMIN") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Deny by Default</span>
        <h3>Konfirmasi Kunjungan Tidak Tersedia untuk Super Admin</h3>
        <p>
          Pencatatan konfirmasi kunjungan hanya dilakukan oleh petugas lapangan (Bidan / Puskesmas).
        </p>
      </div>
    );
  }

  async function handleConfirmVisit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!pregnancyId.trim() || !occurredOn.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/staff-proxy/visit-confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pregnancy_id: pregnancyId.trim(),
          milestone_code: milestoneCode,
          facility_id: facilityId.trim() || null,
          facility_type: facilityType,
          occurred_on: occurredOn.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menyimpan konfirmasi pemeriksaan.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Konfirmasi pemeriksaan ${milestoneCode} berhasil disimpan. Milestone diperbarui menjadi CONFIRMED.`,
      });
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghubungi server." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">TASK-P3-009 / Konfirmasi Satu-Tindakan (Bidan)</span>
          <h2>Konfirmasi Sudah Periksa (K2 / K3 / K6 / K7)</h2>
        </div>
      </header>

      {feedback && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      <form className="staff-form-grid" onSubmit={handleConfirmVisit}>
        <div className="form-group">
          <label htmlFor="confirm-preg-id">ID Kehamilan (Pregnancy ID) *</label>
          <input
            id="confirm-preg-id"
            type="text"
            required
            placeholder="UUID Kehamilan Aktif Pasien"
            value={pregnancyId}
            onChange={(e) => setPregnancyId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirm-milestone">Milestone Yang Dikonfirmasi *</label>
          <select
            id="confirm-milestone"
            value={milestoneCode}
            onChange={(e) => setMilestoneCode(e.target.value as MilestoneCode)}
          >
            <option value="K2">K2 - Pemeriksaan Kunjungan Kedua (Bidan/Posyandu)</option>
            <option value="K3">K3 - Pemeriksaan Kunjungan Ketiga (Bidan/Posyandu)</option>
            <option value="K6">K6 - Pemeriksaan Kunjungan Keenam (Bidan/Posyandu)</option>
            <option value="K7">K7 - Pemeriksaan Kunjungan Ketujuh (Bidan/Posyandu)</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="confirm-facility-type">Tipe Fasilitas Tempat Periksa *</label>
          <select
            id="confirm-facility-type"
            value={facilityType}
            onChange={(e) =>
              setFacilityType(
                e.target.value as "POSYANDU" | "PUSKESMAS" | "KLINIK_PRIVATE" | "RUMAH_SAKIT",
              )
            }
          >
            <option value="POSYANDU">Posyandu / Bidan Mandiri</option>
            <option value="PUSKESMAS">Puskesmas Pembantu / Induk</option>
            <option value="KLINIK_PRIVATE">Klinik Swasta</option>
            <option value="RUMAH_SAKIT">Rumah Sakit</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="confirm-facility-id">ID Fasilitas (Opsional)</label>
          <input
            id="confirm-facility-id"
            type="text"
            placeholder="UUID Fasilitas Kesehatan"
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirm-occurred">Tanggal Pemeriksaan Dilakukan *</label>
          <input
            id="confirm-occurred"
            type="date"
            required
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </div>

        <div className="security-notice">
          <strong>Perhatian Satu-Tindakan (DOC-PERMISSION):</strong> Menu konfirmasi ini khusus
          mencatat fakta kehadiran/pemeriksaan tanpa input detail medis klinis.
        </div>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Konfirmasi Server…" : `Simpan Konfirmasi Periksa (${milestoneCode})`}
        </button>
      </form>
    </div>
  );
}
