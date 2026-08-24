"use client";

import type {
  ClinicalRecordResponse,
  MotherSummary,
  PregnancyMilestoneListResponse,
  PregnancyMilestoneResponse,
} from "@anc/contracts";
import { useEffect, useState } from "react";

interface PuskesmasClinicalRecordPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

export function PuskesmasClinicalRecordPanel({ userRole }: PuskesmasClinicalRecordPanelProps) {
  // Loaded state
  const [mothers, setMothers] = useState<readonly MotherSummary[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);

  // Selection
  const [selectedMotherId, setSelectedMotherId] = useState("");
  const [milestones, setMilestones] = useState<readonly PregnancyMilestoneResponse[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [loadingMilestones, setLoadingMilestones] = useState(false);

  // Existing record state
  const [existingRecord, setExistingRecord] = useState<ClinicalRecordResponse | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  // Form Fields
  const [hemoglobinGdl, setHemoglobinGdl] = useState<string>("12.0");
  const [systolicMmHg, setSystolicMmHg] = useState<string>("120");
  const [diastolicMmHg, setDiastolicMmHg] = useState<string>("80");
  const [weightKg, setWeightKg] = useState<string>("55.0");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (userRole !== "PUSKESMAS") return;

    const controller = new AbortController();
    void loadMothers(controller.signal);
    return () => controller.abort();

    async function loadMothers(signal: AbortSignal): Promise<void> {
      setLoadingInitial(true);
      try {
        const res = await fetch("/api/staff-proxy/mothers", { signal });
        if (res.ok) {
          const data = (await res.json()) as { items: readonly MotherSummary[] };
          setMothers(data.items ?? []);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          // Best-effort load
        }
      } finally {
        setLoadingInitial(false);
      }
    }
  }, [userRole]);

  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Akses Terbatas</span>
        <h3>Pencatatan Rekam Medis Klinis Hanya Tersedia untuk Petugas Puskesmas</h3>
        <p>
          Entri data klinis dokter (Hb, tekanan darah, berat badan) dilakukan di fasilitas
          Puskesmas.
        </p>
      </div>
    );
  }

  const handleSelectMother = async (motherId: string): Promise<void> => {
    setSelectedMotherId(motherId);
    setSelectedMilestoneId("");
    setMilestones([]);
    setExistingRecord(null);
    setFeedback(null);

    const mother = mothers.find((m) => m.id === motherId);
    if (!mother || !mother.active_pregnancy) return;

    setLoadingMilestones(true);
    try {
      const res = await fetch(
        `/api/staff-proxy/pregnancies/${encodeURIComponent(mother.active_pregnancy.id)}/milestones`,
      );
      if (res.ok) {
        const data = (await res.json()) as PregnancyMilestoneListResponse;
        // Clinical records apply to K1-K6
        const k1k6 = (data.milestones ?? []).filter((m) =>
          ["K1", "K2", "K3", "K4", "K5", "K6"].includes(m.code),
        );
        setMilestones(k1k6);
        if (k1k6.length > 0) {
          void handleSelectMilestone(k1k6[0].id);
        }
      }
    } catch {
      setFeedback({ type: "error", message: "Gagal memuat jadwal milestone pasien." });
    } finally {
      setLoadingMilestones(false);
    }
  };

  const handleSelectMilestone = async (milestoneId: string): Promise<void> => {
    setSelectedMilestoneId(milestoneId);
    setExistingRecord(null);
    setFeedback(null);
    if (!milestoneId) return;

    setLoadingRecord(true);
    try {
      const res = await fetch(
        `/api/staff-proxy/milestones/${encodeURIComponent(milestoneId)}/record`,
      );
      if (res.ok) {
        const data = (await res.json()) as ClinicalRecordResponse;
        setExistingRecord(data);
        const payload = data.record_payload as Record<string, unknown> | null;
        if (payload) {
          if (typeof payload.hemoglobin_g_dl === "number") {
            setHemoglobinGdl(String(payload.hemoglobin_g_dl));
          }
          if (typeof payload.weight_kg === "number") {
            setWeightKg(String(payload.weight_kg));
          }
          const bp = payload.blood_pressure as {
            systolic_mm_hg?: number;
            diastolic_mm_hg?: number;
          } | null;
          if (bp) {
            if (typeof bp.systolic_mm_hg === "number") setSystolicMmHg(String(bp.systolic_mm_hg));
            if (typeof bp.diastolic_mm_hg === "number")
              setDiastolicMmHg(String(bp.diastolic_mm_hg));
          }
          if (typeof payload.notes === "string") setNotes(payload.notes);
        }
      }
    } catch {
      // Record may not exist yet
    } finally {
      setLoadingRecord(false);
    }
  };

  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Hak Akses Dibatasi</span>
        <h3>Pengelolaan Detail Klinis K1–K6 Khusus Puskesmas</h3>
        <p>
          Sesuai standar operasional, input dan validasi detail rekam medis fisik &amp; lab K1–K6
          dilakukan oleh tenaga medis terotorisasi di Puskesmas.
        </p>
      </div>
    );
  }

  async function handleSaveDetail(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!selectedMilestoneId.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/milestones/${encodeURIComponent(selectedMilestoneId.trim())}/record`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            expected_revision_id: existingRecord?.revision_id ?? null,
            schema_version: "anc.clinical.v1",
            record_payload: {
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

      const data = (await res.json().catch(() => null)) as
        ClinicalRecordResponse | { error?: { message?: string } } | null;

      if (!res.ok || !data || "error" in data) {
        setFeedback({
          type: "error",
          message:
            (data as { error?: { message?: string } })?.error?.message ??
            "Gagal menyimpan rekam medis klinis.",
        });
        return;
      }

      setExistingRecord(data as ClinicalRecordResponse);
      setFeedback({
        type: "success",
        message: "Detail rekam medis klinis berhasil disimpan!",
      });
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menyimpan rekam klinis." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleValidateRecord(): Promise<void> {
    if (!selectedMilestoneId.trim() || !existingRecord) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/milestones/${encodeURIComponent(selectedMilestoneId.trim())}/record/validate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            expected_revision_id: existingRecord.revision_id,
            attestation: "DETAIL_REVIEWED_COMPLETE",
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as
        ClinicalRecordResponse | { error?: { message?: string } } | null;

      if (!res.ok || !data || "error" in data) {
        setFeedback({
          type: "error",
          message:
            (data as { error?: { message?: string } })?.error?.message ??
            "Gagal memvalidasi rekam klinis.",
        });
        return;
      }

      setExistingRecord(data as ClinicalRecordResponse);
      setFeedback({
        type: "success",
        message: "Rekam medis klinis berhasil divalidasi resmi (VALIDATED).",
      });
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat memvalidasi rekam klinis." });
    } finally {
      setSubmitting(false);
    }
  }

  const currentMilestone = milestones.find((m) => m.id === selectedMilestoneId);
  const activeMothersCount = mothers.filter((m) => m.active_pregnancy !== null).length;

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Rekam Medis Terpadu</span>
          <h2>Detail Klinis K1–K6</h2>
          <p className="field-hint">
            Pencatatan dan validasi rekam medis fisik &amp; laboratorium Puskesmas.
          </p>
        </div>
      </header>

      {/* Summary Metrics Row (Fixed layout matching Beranda) */}
      <div className="metrics-row" style={{ marginBottom: "1.25rem" }}>
        <div className="metric-card">
          <span className="metric-label">Bumil Terdaftar</span>
          <strong className="metric-value">{mothers.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Kehamilan Aktif</span>
          <strong className="metric-value" style={{ color: "#059669" }}>
            {activeMothersCount}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Milestone Terpilih</span>
          <strong className="metric-value" style={{ color: "var(--ink)" }}>
            {currentMilestone ? currentMilestone.code : "—"}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Status Validasi</span>
          <strong
            className="metric-value"
            style={{
              fontSize: "1.1rem",
              alignSelf: "center",
              margin: "auto 0",
              color:
                existingRecord?.record_validation_status === "VALIDATED"
                  ? "#059669"
                  : existingRecord
                    ? "#d97706"
                    : "var(--ink-muted)",
            }}
          >
            {existingRecord?.record_validation_status === "VALIDATED"
              ? "VALIDATED"
              : existingRecord
                ? "DRAFT"
                : "BELUM TERCATAT"}
          </strong>
        </div>
      </div>

      {feedback && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
          style={{ marginBottom: "1rem" }}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      {/* Patient & Milestone Control Section (Fixed Structured Grid) */}
      <div
        style={{
          display: "grid",
          gap: "1rem",
          padding: "1rem",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: "12px",
          marginBottom: "1.25rem",
        }}
      >
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="clinical-mother" style={{ fontWeight: 700, fontSize: "0.88rem" }}>
            1. Pilih Ibu Hamil *
          </label>
          <select
            id="clinical-mother"
            className="staff-input"
            value={selectedMotherId}
            onChange={(e) => void handleSelectMother(e.target.value)}
            required
            style={{ width: "100%", height: "46px" }}
          >
            <option value="">
              -- {loadingInitial ? "Memuat data pasien..." : "Pilih Pasien Ibu Hamil"} --
            </option>
            {mothers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.phone_masked}) -{" "}
                {m.active_pregnancy?.trimester_label ?? "Kehamilan Aktif"}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="clinical-milestone" style={{ fontWeight: 700, fontSize: "0.88rem" }}>
            2. Pilih Kunjungan Milestone (K1–K6) *
          </label>
          {loadingMilestones ? (
            <p className="field-hint" style={{ margin: "0.4rem 0" }}>
              Memuat data milestone pasien...
            </p>
          ) : (
            <select
              id="clinical-milestone"
              className="staff-input"
              value={selectedMilestoneId}
              onChange={(e) => void handleSelectMilestone(e.target.value)}
              disabled={!selectedMotherId || milestones.length === 0}
              style={{ width: "100%", height: "46px" }}
            >
              {!selectedMotherId ? (
                <option value="">-- Pilih Pasien Ibu Hamil Terlebih Dahulu --</option>
              ) : milestones.length === 0 ? (
                <option value="">-- Tidak ada milestone K1-K6 aktif --</option>
              ) : (
                milestones.map((ms) => (
                  <option key={ms.id} value={ms.id}>
                    {ms.code} ({ms.trimester_label}) - Status Kunjungan: {ms.visit_status}
                  </option>
                ))
              )}
            </select>
          )}
        </div>
      </div>

      {/* Main Content Area: Form or Structured Initial Guidance */}
      {selectedMilestoneId ? (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {loadingRecord ? (
            <p className="field-hint">Memeriksa rekam klinis yang tersimpan...</p>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                background: "rgba(22, 61, 55, 0.04)",
                borderRadius: "10px",
                border: "1px solid var(--line)",
              }}
            >
              <div>
                <strong style={{ fontSize: "0.95rem" }}>Milestone: {currentMilestone?.code}</strong>
                <span
                  style={{
                    marginLeft: "0.6rem",
                    display: "inline-block",
                    padding: "0.2rem 0.6rem",
                    borderRadius: "9999px",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    background:
                      existingRecord?.record_validation_status === "VALIDATED"
                        ? "#eaf3f0"
                        : "#fef3c7",
                    color:
                      existingRecord?.record_validation_status === "VALIDATED"
                        ? "#1e4620"
                        : "#92400e",
                  }}
                >
                  ● {existingRecord?.record_validation_status ?? "BELUM TERCATAT"}
                </span>
              </div>
              {existingRecord?.record_validation_status !== "VALIDATED" && existingRecord && (
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void handleValidateRecord()}
                  disabled={submitting}
                  style={{ minHeight: "38px", padding: "0 1rem", fontSize: "0.82rem" }}
                >
                  Validasi Resmi Rekam Medis
                </button>
              )}
            </div>
          )}

          <form onSubmit={(e) => void handleSaveDetail(e)} style={{ display: "grid", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: "0.25rem 0 0" }}>
              Pencatatan Fisik &amp; Laboratorium
            </h3>

            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="hemoglobin" style={{ fontWeight: 650, fontSize: "0.85rem" }}>
                Kadar Hemoglobin (Hb - g/dL) *
              </label>
              <input
                id="hemoglobin"
                className="staff-input"
                type="number"
                step="0.1"
                min="3.0"
                max="25.0"
                required
                value={hemoglobinGdl}
                onChange={(e) => setHemoglobinGdl(e.target.value)}
              />
              <small className="field-help">
                Standar anemia: &lt; 11.0 g/dL (Trimester 1 &amp; 3); &lt; 10.5 g/dL (Trimester 2).
              </small>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="systolic" style={{ fontWeight: 650, fontSize: "0.85rem" }}>
                  Sistolik (mmHg) *
                </label>
                <input
                  id="systolic"
                  className="staff-input"
                  type="number"
                  min="50"
                  max="250"
                  required
                  value={systolicMmHg}
                  onChange={(e) => setSystolicMmHg(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="diastolic" style={{ fontWeight: 650, fontSize: "0.85rem" }}>
                  Diastolik (mmHg) *
                </label>
                <input
                  id="diastolic"
                  className="staff-input"
                  type="number"
                  min="30"
                  max="150"
                  required
                  value={diastolicMmHg}
                  onChange={(e) => setDiastolicMmHg(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="weight" style={{ fontWeight: 650, fontSize: "0.85rem" }}>
                Berat Badan Ibu (kg) *
              </label>
              <input
                id="weight"
                className="staff-input"
                type="number"
                step="0.1"
                min="25.0"
                max="200.0"
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="notes" style={{ fontWeight: 650, fontSize: "0.85rem" }}>
                Catatan Klinis / Terapi
              </label>
              <textarea
                id="notes"
                className="staff-input"
                rows={3}
                placeholder="Catatan hasil USG dokter, pemberian TTD, PMT, atau resep terapi..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="button-row" style={{ marginTop: "0.5rem" }}>
              <button
                className="btn-primary"
                type="submit"
                disabled={submitting}
                style={{ width: "100%" }}
              >
                {submitting ? "Menyimpan ke Database..." : "Simpan Detail Rekam Klinis"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div
          style={{
            padding: "2rem 1.25rem",
            background: "var(--paper)",
            border: "1px dashed var(--line-strong)",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 0.75rem",
              borderRadius: "50%",
              background: "rgba(22, 61, 55, 0.08)",
              display: "grid",
              placeItems: "center",
              color: "var(--ink)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="24"
              height="24"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 0.35rem" }}>
            Pilih Pasien Ibu Hamil
          </h3>
          <p
            className="field-hint"
            style={{ maxWidth: "26rem", margin: "0 auto 1.25rem", lineHeight: 1.5 }}
          >
            Silakan pilih nama ibu hamil di menu atas untuk mulai menginput atau memvalidasi rekam
            medis fisik &amp; laboratorium kunjungan K1–K6.
          </p>

          {mothers.filter((m) => m.active_pregnancy !== null).length > 0 && (
            <div
              style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}
            >
              {mothers
                .filter((m) => m.active_pregnancy !== null)
                .slice(0, 3)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="btn-secondary"
                    onClick={() => void handleSelectMother(m.id)}
                    style={{ minHeight: "36px", padding: "0 0.85rem", fontSize: "0.78rem" }}
                  >
                    👤 {m.full_name}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
