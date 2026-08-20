"use client";

import type {
  Facility,
  MotherSummary,
  PregnancyMilestoneListResponse,
  PregnancyMilestoneResponse,
} from "@anc/contracts";
import { useEffect, useState } from "react";

interface BidanVisitConfirmationPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

interface ConfirmationSuccessData {
  readonly motherName: string;
  readonly milestoneCode: string;
  readonly trimesterLabel: string;
  readonly facilityName: string;
  readonly occurredOn: string;
  readonly confirmedAt: string;
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
  const [successData, setSuccessData] = useState<ConfirmationSuccessData | null>(null);

  useEffect(() => {
    if (userRole === "SUPER_ADMIN") return;

    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();

    async function loadData(signal: AbortSignal): Promise<void> {
      setLoadingInitial(true);
      try {
        const [mRes, fRes] = await Promise.all([
          fetch("/api/staff-proxy/mothers", { signal }),
          fetch("/api/staff-proxy/staff/organization/facilities", { signal }),
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
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          // Best-effort load
        }
      } finally {
        setLoadingInitial(false);
      }
    }
  }, [userRole, selectedFacilityId]);

  // When mother selection changes, load pregnancy milestones
  const handleSelectMother = async (motherId: string): Promise<void> => {
    setSelectedMotherId(motherId);
    setSelectedMilestoneId("");
    setMilestones([]);
    setFeedback(null);
    setSuccessData(null);

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
    setSuccessData(null);

    const activeMother = mothers.find((m) => m.id === selectedMotherId);
    const activeMilestone = milestones.find((m) => m.id === selectedMilestoneId);
    const activeFacility = facilities.find((f) => f.id === selectedFacilityId);

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

      const data = (await res.json().catch(() => null)) as {
        id?: string;
        confirmed_at?: string;
        error?: { message?: string };
      } | null;

      if (!res.ok || data?.error) {
        setFeedback({
          type: "error",
          message: data?.error?.message ?? "Gagal menyimpan konfirmasi pemeriksaan.",
        });
        return;
      }

      const confirmedTime = data?.confirmed_at ?? new Date().toISOString();

      setSuccessData({
        motherName: activeMother?.full_name ?? "Pasien",
        milestoneCode: activeMilestone?.code ?? "ANC",
        trimesterLabel: activeMilestone?.trimester_label ?? "",
        facilityName: activeFacility?.name ?? "Fasilitas Kesehatan",
        occurredOn,
        confirmedAt: confirmedTime,
      });

      setFeedback({
        type: "success",
        message: `Konfirmasi pemeriksaan ${activeMilestone?.code ?? "ANC"} berhasil disimpan ke database Supabase!`,
      });

      // Refresh milestones list
      if (selectedMotherId && activeMother?.active_pregnancy) {
        const refreshRes = await fetch(
          `/api/staff-proxy/pregnancies/${encodeURIComponent(activeMother.active_pregnancy.id)}/milestones`,
        );
        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as PregnancyMilestoneListResponse;
          setMilestones(refreshData.milestones ?? []);
          const nextUnconfirmed = refreshData.milestones?.find(
            (m) => m.visit_status !== "CONFIRMED",
          );
          setSelectedMilestoneId(nextUnconfirmed ? nextUnconfirmed.id : "");
        }
      }
    } catch {
      setFeedback({ type: "error", message: "Koneksi terputus saat menghubungi server." });
    } finally {
      setSubmitting(false);
    }
  }

  const handleReset = () => {
    setSuccessData(null);
    setFeedback(null);
    setSelectedMotherId("");
    setSelectedMilestoneId("");
    setMilestones([]);
  };

  return (
    <div className="staff-panel-card">
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Konfirmasi Pemeriksaan Lapangan</span>
          <h2>Konfirmasi Sudah Periksa (K1 – K8)</h2>
        </div>
      </header>

      {/* Prominent Success Notification Card */}
      {successData && (
        <div
          className="staff-success-box"
          style={{
            padding: "1.5rem",
            background: "#f0fdf4",
            borderRadius: "10px",
            border: "2px solid #22c55e",
            boxShadow: "0 4px 12px rgba(34, 197, 94, 0.15)",
            marginBottom: "1.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#22c55e",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            ></div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "0.2rem 0.6rem",
                  background: "#dcfce7",
                  color: "#15803d",
                  borderRadius: "9999px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  marginBottom: "0.35rem",
                }}
              >
                BERHASIL DIKONFIRMASI KE SUPABASE
              </div>
              <h3 style={{ margin: "0 0 0.5rem 0", color: "#166534", fontSize: "1.3rem" }}>
                Pemeriksaan ANC {successData.milestoneCode} Berhasil Dicatat!
              </h3>
              <p style={{ margin: "0 0 1rem 0", color: "#15803d", fontSize: "0.95rem" }}>
                Status kunjungan untuk <strong>{successData.motherName}</strong> telah resmi
                diperbarui menjadi{" "}
                <span className="badge-status status-completed" style={{ fontWeight: 700 }}>
                  CONFIRMED
                </span>
                .
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.75rem",
                  padding: "0.85rem",
                  background: "#ffffff",
                  borderRadius: "6px",
                  border: "1px solid #bbf7d0",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Nama Pasien</small>
                  <strong style={{ color: "#0f172a" }}>{successData.motherName}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Milestone ANC</small>
                  <strong style={{ color: "#0f172a" }}>
                    {successData.milestoneCode} ({successData.trimesterLabel})
                  </strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Tempat Periksa</small>
                  <strong style={{ color: "#0f172a" }}>{successData.facilityName}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Tanggal Periksa</small>
                  <strong style={{ color: "#0f172a" }}>{successData.occurredOn}</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={handleReset}
                  style={{ background: "#16a34a", borderColor: "#15803d" }}
                >
                  + Konfirmasi Pasien Lainnya
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setSuccessData(null)}
                >
                  Tutup Notifikasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback && !successData && (
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
            <option value="">
              -- {loadingInitial ? "Memuat pasien..." : "Pilih Ibu Hamil"} --
            </option>
            {mothers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.phone_masked}) -{" "}
                {m.active_pregnancy?.trimester_label ?? "Kehamilan Aktif"}
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
