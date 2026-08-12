"use client";

import type { MilestoneCode } from "@anc/contracts";
import { useState } from "react";

interface PuskesmasClinicalRecordPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

export function PuskesmasClinicalRecordPanel({ userRole }: PuskesmasClinicalRecordPanelProps) {
  const [pregnancyId, setPregnancyId] = useState("");
  const [milestoneCode, setMilestoneCode] = useState<MilestoneCode>("K1");
  const [hemoglobinGdl, setHemoglobinGdl] = useState<string>("12.0");
  const [systolicMmHg, setSystolicMmHg] = useState<string>("120");
  const [diastolicMmHg, setDiastolicMmHg] = useState<string>("80");
  const [weightKg, setWeightKg] = useState<string>("55.0");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Hak Akses Dibatasi (CR-2026-08-08)</span>
        <h3>Pengelolaan Detail Klinis K1–K6 Khusus Puskesmas</h3>
        <p>
          Sesuai keputusan desain klinis, input dan validasi detail rekam medis K1–K6 hanya
          diperkenankan untuk petugas Puskesmas. Petugas Bidan menggunakan menu Konfirmasi Sudah
          Periksa.
        </p>
      </div>
    );
  }

  async function handleSaveDetail(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!pregnancyId.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/clinical-records/pregnancies/${encodeURIComponent(pregnancyId.trim())}/milestones/${milestoneCode}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expected_revision: 0,
            detail: {
              hemoglobin_g_dl: parseFloat(hemoglobinGdl) || 12.0,
              blood_pressure: {
                systolic_mm_hg: parseInt(systolicMmHg, 10) || 120,
                diastolic_mm_hg: parseInt(diastolicMmHg, 10) || 80,
              },
              weight_kg: parseFloat(weightKg) || 55.0,
              notes: notes.trim() || undefined,
            },
          }),
        },
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menyimpan rekam klinis.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Detail rekam klinis ${milestoneCode} berhasil disimpan.`,
      });
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menyimpan rekam klinis." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleValidateRecord(): Promise<void> {
    if (!pregnancyId.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/clinical-records/pregnancies/${encodeURIComponent(pregnancyId.trim())}/milestones/${milestoneCode}/validate`,
        { method: "POST" },
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal memvalidasi rekam klinis.",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Rekam klinis ${milestoneCode} berhasil divalidasi (Status: VALIDATED).`,
      });
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat memvalidasi rekam klinis." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">TASK-P3-008 / Rekam Klinis Puskesmas</span>
          <h2>Pengelolaan &amp; Validasi Detail Pemeriksaan K1–K6</h2>
        </div>
      </header>

      {feedback && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      <form className="staff-form-grid" onSubmit={handleSaveDetail}>
        <div className="form-group">
          <label htmlFor="clin-preg-id">ID Kehamilan (Pregnancy ID) *</label>
          <input
            id="clin-preg-id"
            type="text"
            required
            placeholder="UUID Kehamilan Aktif (e.g. 70000000-0000-4000-...)"
            value={pregnancyId}
            onChange={(e) => setPregnancyId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="clin-milestone">Milestone Pemeriksaan *</label>
          <select
            id="clin-milestone"
            value={milestoneCode}
            onChange={(e) => setMilestoneCode(e.target.value as MilestoneCode)}
          >
            <option value="K1">K1 (Trimester 1)</option>
            <option value="K2">K2 (Trimester 2)</option>
            <option value="K3">K3 (Trimester 2)</option>
            <option value="K4">K4 (Trimester 3)</option>
            <option value="K5">K5 (Trimester 3)</option>
            <option value="K6">K6 (Trimester 3)</option>
          </select>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label htmlFor="clin-hb">Kadar Hemoglobin (g/dL)</label>
            <input
              id="clin-hb"
              type="number"
              step="0.1"
              value={hemoglobinGdl}
              onChange={(e) => setHemoglobinGdl(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="clin-weight">Berat Badan (kg)</label>
            <input
              id="clin-weight"
              type="number"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label htmlFor="clin-sys">Tekanan Darah Sistolik (mmHg)</label>
            <input
              id="clin-sys"
              type="number"
              value={systolicMmHg}
              onChange={(e) => setSystolicMmHg(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="clin-dia">Tekanan Darah Diastolik (mmHg)</label>
            <input
              id="clin-dia"
              type="number"
              value={diastolicMmHg}
              onChange={(e) => setDiastolicMmHg(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="clin-notes">Catatan Klinis Tambahan</label>
          <input
            id="clin-notes"
            type="text"
            placeholder="Catatan hasil lab atau temuan pemeriksaan"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="button-row">
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Menyimpan…" : `Simpan Detail ${milestoneCode}`}
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={handleValidateRecord}
            disabled={submitting}
          >
            Validasi Record ({milestoneCode})
          </button>
        </div>
      </form>
    </div>
  );
}
