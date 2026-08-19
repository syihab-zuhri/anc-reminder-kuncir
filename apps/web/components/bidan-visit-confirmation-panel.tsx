"use client";

import type {
  Facility,
  MotherSummary,
  PregnancyMilestoneListResponse,
  PregnancyMilestoneResponse,
} from "@anc/contracts";
import { useCallback, useEffect, useState } from "react";

interface BidanVisitConfirmationPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

export function BidanVisitConfirmationPanel({ userRole }: BidanVisitConfirmationPanelProps) {
  // Loaded data states
  const [mothers, setMothers] = useState<readonly MotherSummary[]>([]);
  const [facilities, setFacilities] = useState<readonly Facility[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);

  // Selected state
  const [selectedMotherId, setSelectedMotherId] = useState("");
  const [milestones, setMilestones] = useState<readonly PregnancyMilestoneResponse[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);

  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  const fetchInitialData = useCallback(async (): Promise<void> => {
    setLoadingInitial(true);
    try {
      const [mRes, fRes] = await Promise.all([
        fetch("/api/staff-proxy/mothers"),
        fetch("/api/staff-proxy/staff/organization/facilities"),
      ]);

      if (mRes.ok) {
        const mData = (await mRes.json()) as { items: readonly MotherSummary[] };
        setMothers(mData.items ?? []);
      }
      if (fRes.ok) {
        const fData = (await fRes.json()) as readonly Facility[];
        setFacilities(fData);
        if (fData.length > 0 && !selectedFacilityId) {
          setSelectedFacilityId(fData[0].id);
        }
      }
    } catch {
      // Best-effort load
    } finally {
      setLoadingInitial(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    if (userRole !== "SUPER_ADMIN") {
      void fetchInitialData();
    }
  }, [userRole, fetchInitialData]);

  // When mother selection changes, load pregnancy milestones
  const handleSelectMother = async (motherId: string): Promise<void> => {
    setSelectedMotherId(motherId);
    setSelectedMilestoneId("");
    setMilestones([]);
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
        setMilestones(data.milestones ?? []);
        // Auto select first unconfirmed milestone
        const firstUnconfirmed = data.milestones?.find((m) => m.visit_status !== "CONFIRMED");
        if (firstUnconfirmed) {
          setSelectedMilestoneId(firstUnconfirmed.id);
        }
      }
    } catch {
      setFeedback({ type: "error", message: "Gagal memuat daftar milestone ANC pasien." });
    } finally {
      setLoadingMilestones(false);
    }
  };

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
    if (!selectedMilestoneId.trim() || !selectedFacilityId.trim() || !occurredOn.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/staff-proxy/milestones/${encodeURIComponent(selectedMilestoneId.trim())}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            occurred_on: occurredOn.trim(),
            facility_id: selectedFacilityId.trim(),
          }),
        },
      );

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menyimpan konfirmasi pemeriksaan.",
        });
        return;
      }

      const activeMilestone = milestones.find((m) => m.id === selectedMilestoneId);
      setFeedback({
        type: "success",
        message: `Konfirmasi pemeriksaan ${activeMilestone?.code ?? "ANC"} berhasil dicatat ke Supabase! Status milestone kini CONFIRMED.`,
      });

      // Refresh milestones list
      if (selectedMotherId) {
        await handleSelectMother(selectedMotherId);
      }
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
          <span className="staff-kicker">Konfirmasi Pemeriksaan Lapangan</span>
          <h2>Konfirmasi Sudah Periksa (K1 – K8)</h2>
        </div>
      </header>

      {feedback && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
          style={{ marginBottom: "1rem" }}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      <form onSubmit={(e) => void handleConfirmVisit(e)} className="staff-form-grid">
        <div className="form-group">
          <label htmlFor="confirm-mother">1. Pilih Ibu Hamil *</label>
          <select
            id="confirm-mother"
            className="staff-input"
            value={selectedMotherId}
            onChange={(e) => void handleSelectMother(e.target.value)}
            required
          >
            <option value="">-- {loadingInitial ? "Memuat pasien..." : "Pilih Ibu Hamil"} --</option>
            {mothers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.phone_masked}) - {m.active_pregnancy?.trimester_label ?? "Kehamilan Aktif"}
              </option>
            ))}
          </select>
        </div>

        {selectedMotherId && (
          <>
            <div className="form-group">
              <label htmlFor="confirm-milestone">2. Pilih Jadwal Milestone Kunjungan *</label>
              {loadingMilestones ? (
                <p className="field-hint">Memuat jadwal milestone...</p>
              ) : milestones.length === 0 ? (
                <p className="field-hint">Tidak ada data milestone kehamilan aktif.</p>
              ) : (
                <select
                  id="confirm-milestone"
                  className="staff-input"
                  value={selectedMilestoneId}
                  onChange={(e) => setSelectedMilestoneId(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Milestone --</option>
                  {milestones.map((ms) => (
                    <option key={ms.id} value={ms.id}>
                      {ms.code} ({ms.trimester_label}) - Status: {ms.visit_status}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirm-facility">3. Fasilitas Tempat Pemeriksaan *</label>
              <select
                id="confirm-facility"
                className="staff-input"
                value={selectedFacilityId}
                onChange={(e) => setSelectedFacilityId(e.target.value)}
                required
              >
                <option value="">-- Pilih Fasilitas Kesehatan --</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.facility_type})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="confirm-date">4. Tanggal Aktual Kunjungan *</label>
              <input
                id="confirm-date"
                className="staff-input"
                type="date"
                required
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>

            <button
              className="btn-primary"
              type="submit"
              disabled={submitting || !selectedMilestoneId || !selectedFacilityId}
            >
              {submitting ? "Menyimpan ke Supabase..." : "Simpan Konfirmasi Kunjungan"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
