"use client";

import {
  announcementCreateRequestSchema,
  announcementCreateResponseSchema,
  announcementListResponseSchema,
  type AnnouncementCreateResponse,
  type AnnouncementRow,
} from "@anc/contracts";
import { useCallback, useEffect, useState } from "react";

interface AnnouncementPanelProps {
  readonly userRole: "PUSKESMAS" | "BIDAN" | "SUPER_ADMIN";
}

type Feedback = { readonly type: "success" | "error"; readonly message: string };

export function AnnouncementPanel({ userRole }: AnnouncementPanelProps) {
  if (userRole !== "PUSKESMAS") {
    return (
      <div className="staff-panel-card staff-panel-restricted">
        <span className="staff-panel-badge badge-warning">Akses Terbatas</span>
        <h2>Pengumuman push hanya tersedia untuk Puskesmas.</h2>
        <p>Bidan dan Super Admin tidak dapat menyusun atau mengirim pengumuman siaran.</p>
      </div>
    );
  }

  return <AnnouncementWorkspace />;
}

function AnnouncementWorkspace() {
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [title, setTitle] = useState("Pengumuman");
  const [body, setBody] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const data = await requestJson(
        "/api/staff-proxy/announcements",
        announcementListResponseSchema,
        { cache: "no-store", ...(signal !== undefined ? { signal } : {}) },
      );
      setItems(data.announcements);
    } catch (error) {
      if (isAbortError(error)) return;
      setFeedback({ type: "error", message: messageOf(error, "Gagal memuat riwayat.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const validation = announcementCreateRequestSchema.safeParse({ title, body });
  const canSubmit = validation.success && !sending;

  async function handleSend(): Promise<void> {
    setShowConfirm(false);
    setSending(true);
    setFeedback(null);
    try {
      const sent = await requestJson<AnnouncementCreateResponse>(
        "/api/staff-proxy/announcements",
        announcementCreateResponseSchema,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, body }),
        },
      );
      setFeedback({
        type: "success",
        message: `Terkirim ke ${sent.success_count.toString()} perangkat${sent.failed_count > 0 ? `, ${sent.failed_count.toString()} gagal` : ""}.`,
      });
      setTitle("Pengumuman");
      setBody("");
      await refresh();
    } catch (error) {
      setFeedback({ type: "error", message: messageOf(error, "Pengumuman gagal dikirim.") });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="staff-panel-card">
      {/* Header */}
      <header className="staff-panel-header">
        <div>
          <span className="staff-kicker">Notifikasi Push</span>
          <h2>Pengumuman Siaran</h2>
          <p className="field-hint">
            Kirim pesan langsung sebagai notifikasi ke seluruh perangkat ibu hamil yang
            terdaftar.
          </p>
        </div>
      </header>

      {/* Feedback */}
      {feedback !== null && (
        <div
          className={`staff-alert ${feedback.type === "success" ? "alert-success" : "alert-error"}`}
          role={feedback.type === "error" ? "alert" : "status"}
          style={{ marginBottom: "0.5rem" }}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      {/* Form kirim */}
      <div className="admin-form-card">
        <h3 className="admin-form-card-title">Tulis Pengumuman</h3>
        <p className="admin-form-card-desc">
          Isi judul dan isi pengumuman, lalu klik <strong>Kirim via Notifikasi</strong>. Pesan
          akan dikirim ke semua perangkat ibu hamil yang aktif.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) setShowConfirm(true);
          }}
        >
          <div className="admin-form-grid-2col" style={{ gridTemplateColumns: "1fr" }}>
            <div className="form-group form-group-full">
              <label htmlFor="ann-title">Judul</label>
              <input
                id="ann-title"
                type="text"
                className="staff-input"
                value={title}
                maxLength={120}
                placeholder="Pengumuman"
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <small className="field-hint" style={{ marginTop: "0.25rem" }}>
                {title.length}/120 karakter
              </small>
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="ann-body">Isi Pengumuman</label>
              <textarea
                id="ann-body"
                className="staff-input"
                style={{ minHeight: "8rem", resize: "vertical" }}
                value={body}
                maxLength={2000}
                placeholder="Tuliskan pesan pengumuman untuk para ibu hamil…"
                onChange={(e) => setBody(e.target.value)}
                required
              />
              <small className="field-hint" style={{ marginTop: "0.25rem" }}>
                {body.length}/2000 karakter
              </small>
            </div>
          </div>

          <div
            style={{
              marginTop: "1.25rem",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="submit"
              className="btn-primary"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
            >
              {sending ? (
                <>Mengirim…</>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: "1em", height: "1em", marginRight: "0.4em" }}
                    aria-hidden="true"
                  >
                    <path d="m3 11 18-5v12L3 14v-3z" />
                    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                  </svg>
                  Kirim via Notifikasi
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Riwayat */}
      <div className="admin-form-card">
        <h3 className="admin-form-card-title">Riwayat Pengumuman</h3>

        {loading ? (
          <p className="field-hint">Memuat riwayat…</p>
        ) : items.length === 0 ? (
          <p className="field-hint">Belum ada pengumuman yang dikirim.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Judul</th>
                  <th>Pengirim</th>
                  <th style={{ textAlign: "center" }}>Terkirim</th>
                  <th style={{ textAlign: "center" }}>Gagal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                      {new Date(item.created_at).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={{ maxWidth: "16rem" }}>
                      <span style={{ fontWeight: 600 }}>{item.title}</span>
                      <br />
                      <small
                        className="field-hint"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.body}
                      </small>
                    </td>
                    <td style={{ fontSize: "0.82rem" }}>{item.staff_username ?? "-"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="badge-status status-completed"
                        style={{ fontWeight: 700 }}
                      >
                        {item.success_count}/{item.total_devices}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {item.failed_count > 0 ? (
                        <span
                          className="badge-status"
                          style={{
                            background: "rgba(192,57,43,0.1)",
                            color: "#900c3f",
                            fontWeight: 700,
                          }}
                        >
                          {item.failed_count}
                        </span>
                      ) : (
                        <span className="field-hint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal konfirmasi */}
      {showConfirm && (
        <div
          className="staff-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirm(false);
          }}
        >
          <div className="staff-modal-dialog modal-sm" role="dialog" aria-modal="true" aria-labelledby="ann-confirm-title">
            <div className="staff-modal-header">
              <div className="staff-modal-header-content">
                <span className="staff-modal-kicker">Konfirmasi Tindakan</span>
                <h3 className="staff-modal-title" id="ann-confirm-title">
                  Kirim Pengumuman?
                </h3>
                <p className="staff-modal-subtitle">
                  Notifikasi akan dikirim ke semua perangkat ibu hamil aktif. Tindakan ini tidak
                  dapat dibatalkan.
                </p>
              </div>
              <button
                type="button"
                className="staff-modal-close-btn"
                aria-label="Tutup"
                onClick={() => setShowConfirm(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ width: "1rem", height: "1rem" }}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="staff-modal-body">
              <div className="staff-alert" style={{ background: "var(--paper,#fdfbf7)", border: "1px solid var(--line)" }}>
                <p style={{ fontWeight: 700, marginBottom: "0.35rem" }}>{title}</p>
                <p style={{ fontSize: "0.88rem", color: "var(--ink-muted)", margin: 0 }}>
                  {body.length > 220 ? body.slice(0, 220) + "…" : body}
                </p>
              </div>
            </div>

            <div className="staff-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowConfirm(false)}
                disabled={sending}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => { void handleSend(); }}
                disabled={sending}
              >
                {sending ? "Mengirim…" : "Ya, Kirim Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function requestJson<T>(
  path: string,
  schema: {
    readonly safeParse: (
      value: unknown,
    ) => { readonly success: true; readonly data: T } | { readonly success: false };
  },
  init: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  const bodyJson: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const upstream = readUpstreamMessage(bodyJson);
    throw new Error(upstream ?? "Permintaan ditolak oleh server.");
  }
  const parsed = schema.safeParse(bodyJson);
  if (!parsed.success) throw new Error("Server mengembalikan kontrak yang tidak valid.");
  return parsed.data;
}

function readUpstreamMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { readonly error?: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = (error as { readonly message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return fallback;
}
