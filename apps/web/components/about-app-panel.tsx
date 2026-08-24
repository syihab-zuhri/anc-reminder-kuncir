"use client";

import { useState } from "react";

export function AboutAppPanel() {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  return (
    <div className="staff-panel-card" style={{ display: "grid", gap: "2rem" }}>
      {/* Header Section */}
      <header className="staff-panel-header" style={{ marginBottom: 0 }}>
        <div>
          <span className="staff-kicker">Informasi Pengembang &amp; Hak Cipta</span>
          <h2>Tentang Aplikasi Pengingat ANC</h2>
          <p className="field-hint">
            Sistem informasi dan pengingat jadwal pemeriksaan kehamilan terintegrasi Posyandu dan Puskesmas Kuncir.
          </p>
        </div>
      </header>

      {/* Official Developer Plaque / Watermark Card */}
      <section
        aria-labelledby="developer-title"
        style={{
          background: "linear-gradient(135deg, #123832 0%, #0d2824 100%)",
          color: "#fbf8f1",
          borderRadius: "var(--radius-lg, 16px)",
          padding: "clamp(1.5rem, 3vw, 2.25rem)",
          border: "1px solid rgba(225, 180, 92, 0.35)",
          boxShadow: "0 16px 40px rgba(10, 25, 22, 0.25)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background Decorative Emblem Watermark */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: "-2rem",
            bottom: "-2rem",
            opacity: 0.06,
            pointerEvents: "none",
            fontSize: "14rem",
            fontFamily: "serif",
            fontWeight: 900,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          ITM
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "grid", gap: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.3rem 0.85rem",
                  background: "rgba(225, 180, 92, 0.18)",
                  border: "1px solid rgba(225, 180, 92, 0.4)",
                  borderRadius: "9999px",
                  color: "#e1b45c",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: "0.75rem",
                }}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path d="M10 2l6 3.5v5.5c0 4.5-3 7-6 8-3-1-6-3.5-6-8V5.5L10 2z" strokeLinejoin="round" />
                  <path d="M7.5 10l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Plakat Pengembang Resmi
              </span>

              <h3
                id="developer-title"
                style={{
                  fontSize: "clamp(1.4rem, 2.5vw, 1.85rem)",
                  fontWeight: 900,
                  color: "#ffffff",
                  margin: "0 0 0.35rem",
                  letterSpacing: "-0.01em",
                }}
              >
                KKN KUNCIR 2026
              </h3>

              <div
                style={{
                  fontSize: "clamp(1rem, 1.8vw, 1.25rem)",
                  fontWeight: 800,
                  color: "#e1b45c",
                  marginBottom: "0.5rem",
                }}
              >
                INSTITUT TEKNOLOGI MOJOSARI
              </div>
            </div>

            <div
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "flex-end",
                textAlign: "right",
              }}
            >
              <span
                style={{
                  padding: "0.35rem 0.75rem",
                  background: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "rgba(251, 248, 241, 0.9)",
                }}
              >
                Versi 1.0.0 (Produksi)
              </span>
              <span style={{ fontSize: "0.72rem", color: "rgba(251, 248, 241, 0.65)", marginTop: "0.35rem" }}>
                Rilis Tahun 2026
              </span>
            </div>
          </div>

          {/* Address Box */}
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "rgba(0, 0, 0, 0.25)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "10px",
              display: "grid",
              gap: "0.4rem",
            }}
          >
            <div
              style={{
                fontSize: "0.74rem",
                fontWeight: 800,
                color: "rgba(251, 248, 241, 0.7)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" width="14" height="14">
                <path d="M10 2a6 6 0 00-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 00-6-6z" />
                <circle cx="10" cy="8" r="2" />
              </svg>
              Alamat Kampus Resmi
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.92rem",
                lineHeight: 1.5,
                color: "#ffffff",
                fontWeight: 600,
              }}
            >
              INSTITUT TEKNOLOGI MOJOSARI, Mojosari, Ngepeh, Kec. Loceret, Kabupaten Nganjuk, Jawa Timur 64471
            </p>
          </div>
        </div>
      </section>

      {/* Developer Photo Showcase / Watermark Gallery */}
      <section
        aria-labelledby="gallery-title"
        style={{
          padding: "1.5rem",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md, 14px)",
          display: "grid",
          gap: "1.25rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 id="gallery-title" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--ink)" }}>
              Dokumentasi Tim KKN Kuncir 2026
            </h3>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.84rem", color: "var(--ink-muted)" }}>
              Dokumentasi resmi tim mahasiswa Kuliah Kerja Nyata (KKN) Institut Teknologi Mojosari Desa Kuncir.
            </p>
          </div>
          <span
            style={{
              fontSize: "0.74rem",
              fontWeight: 700,
              color: "var(--ink)",
              background: "var(--paper-raised)",
              border: "1px solid var(--line)",
              padding: "0.3rem 0.75rem",
              borderRadius: "9999px",
            }}
          >
            2 Foto Terverifikasi
          </span>
        </div>

        <div className="admin-form-grid-2col">
          {/* Photo Card 1 */}
          <div
            style={{
              background: "#0d2824",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid rgba(225, 180, 92, 0.25)",
              boxShadow: "0 8px 24px rgba(18, 56, 50, 0.12)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "relative",
                aspectRatio: "16 / 10",
                width: "100%",
                background: "#000000",
                cursor: "pointer",
              }}
              onClick={() => setSelectedPhoto("/images/foto-kkn.webp")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/foto-kkn.webp"
                alt="Dokumentasi 1 Tim KKN Kuncir 2026 Institut Teknologi Mojosari"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  transition: "transform 0.3s ease",
                }}
                loading="lazy"
              />

              {/* Watermark Badge Top Right */}
              <div
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  right: "0.75rem",
                  padding: "0.3rem 0.65rem",
                  background: "rgba(18, 56, 50, 0.85)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(225, 180, 92, 0.5)",
                  borderRadius: "6px",
                  color: "#e1b45c",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                }}
              >
                KKN KUNCIR 2026
              </div>

              {/* Expand Hint Bottom Right */}
              <div
                style={{
                  position: "absolute",
                  bottom: "0.75rem",
                  right: "0.75rem",
                  padding: "0.25rem 0.5rem",
                  background: "rgba(0, 0, 0, 0.7)",
                  borderRadius: "4px",
                  color: "#ffffff",
                  fontSize: "0.68rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" width="12" height="12">
                  <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Perbesar
              </div>
            </div>

            <div style={{ padding: "0.9rem 1.1rem", background: "var(--paper-raised, #ffffff)" }}>
              <strong style={{ fontSize: "0.88rem", color: "var(--ink)", display: "block", marginBottom: "0.2rem" }}>
                Pentas Seni &amp; Penyerahan Plakat KKN Kuncir
              </strong>
              <small style={{ fontSize: "0.78rem", color: "var(--ink-muted)", lineHeight: 1.4, display: "block" }}>
                Institut Teknologi Mojosari &middot; Kegiatan Pengabdian Masyarakat Desa Kuncir 2026.
              </small>
            </div>
          </div>

          {/* Photo Card 2 */}
          <div
            style={{
              background: "#0d2824",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid rgba(225, 180, 92, 0.25)",
              boxShadow: "0 8px 24px rgba(18, 56, 50, 0.12)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "relative",
                aspectRatio: "16 / 10",
                width: "100%",
                background: "#000000",
                cursor: "pointer",
              }}
              onClick={() => setSelectedPhoto("/images/foto-kkn2.webp")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/foto-kkn2.webp"
                alt="Dokumentasi 2 Tim KKN Kuncir 2026 Institut Teknologi Mojosari"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  transition: "transform 0.3s ease",
                }}
                loading="lazy"
              />

              {/* Watermark Badge Top Right */}
              <div
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  right: "0.75rem",
                  padding: "0.3rem 0.65rem",
                  background: "rgba(18, 56, 50, 0.85)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(225, 180, 92, 0.5)",
                  borderRadius: "6px",
                  color: "#e1b45c",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                }}
              >
                KKN KUNCIR 2026
              </div>

              {/* Expand Hint Bottom Right */}
              <div
                style={{
                  position: "absolute",
                  bottom: "0.75rem",
                  right: "0.75rem",
                  padding: "0.25rem 0.5rem",
                  background: "rgba(0, 0, 0, 0.7)",
                  borderRadius: "4px",
                  color: "#ffffff",
                  fontSize: "0.68rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" width="12" height="12">
                  <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Perbesar
              </div>
            </div>

            <div style={{ padding: "0.9rem 1.1rem", background: "var(--paper-raised, #ffffff)" }}>
              <strong style={{ fontSize: "0.88rem", color: "var(--ink)", display: "block", marginBottom: "0.2rem" }}>
                Kebersamaan Mahasiswa KKN &amp; Warga Kuncir
              </strong>
              <small style={{ fontSize: "0.78rem", color: "var(--ink-muted)", lineHeight: 1.4, display: "block" }}>
                Institut Teknologi Mojosari &middot; Dokumentasi Tim Pengembang Aplikasi ANC.
              </small>
            </div>
          </div>
        </div>
      </section>

      {/* Purpose and Mission Grid */}
      <div className="admin-form-grid-2col">
        {/* Card 1: Misi & Latar Belakang */}
        <div
          style={{
            padding: "1.5rem",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md, 14px)",
            display: "grid",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "2.25rem",
                height: "2.25rem",
                background: "rgba(18, 56, 50, 0.08)",
                color: "var(--ink)",
                borderRadius: "8px",
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" width="16" height="16">
                <path d="M3 10h4l2-6 4 12 2-6h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)" }}>
              Tujuan &amp; Latar Belakang
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.55, color: "var(--ink-muted)" }}>
            Aplikasi ini dikembangkan sebagai karya pengabdian masyarakat program Kuliah Kerja Nyata (KKN) Desa Kuncir tahun 2026 dari Institut Teknologi Mojosari untuk membantu Puskesmas dan Bidan Desa dalam memantau kepatuhan kunjungan pemeriksaan kehamilan (ANC) secara teratur.
          </p>
        </div>

        {/* Card 2: Ruang Lingkup Layanan */}
        <div
          style={{
            padding: "1.5rem",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md, 14px)",
            display: "grid",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "2.25rem",
                height: "2.25rem",
                background: "rgba(18, 56, 50, 0.08)",
                color: "var(--ink)",
                borderRadius: "8px",
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" width="16" height="16">
                <rect x="3" y="4" width="14" height="13" rx="2" />
                <line x1="7" y1="2" x2="7" y2="4" />
                <line x1="13" y1="2" x2="13" y2="4" />
                <line x1="3" y1="8" x2="17" y2="8" />
              </svg>
            </span>
            <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)" }}>
              Standar Klinis K1–K8
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.55, color: "var(--ink-muted)" }}>
            Sistem mengadopsi 8 tahapan kunjungan antenatal terpadu Kemenkes RI dengan jadwal otomatis berbasis tanggal HPHT (*server-driven dating*), verifikasi dokter di fasilitas Puskesmas, serta konfirmasi kehadiran posyandu oleh Bidan Desa.
          </p>
        </div>
      </div>

      {/* Feature & Security Profile */}
      <section
        style={{
          padding: "1.5rem",
          background: "var(--paper-raised, #ffffff)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md, 14px)",
          display: "grid",
          gap: "1.25rem",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)" }}>
          Spesifikasi Sistem &amp; Keamanan Data
        </h4>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
            gap: "1rem",
          }}
        >
          <div style={{ padding: "0.85rem 1rem", background: "var(--paper)", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <strong style={{ fontSize: "0.84rem", display: "block", color: "var(--ink)" }}>
              Enkripsi Kredensial Pasien
            </strong>
            <small style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
              Salted Scrypt Key Derivation &amp; 16-Char Crockford Base32
            </small>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--paper)", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <strong style={{ fontSize: "0.84rem", display: "block", color: "var(--ink)" }}>
              Privasi &amp; Redaksi NIK
            </strong>
            <small style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
              Reduksi NIK &amp; Telepon Otomatis untuk Kepatuhan Kerahasiaan Medis
            </small>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--paper)", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <strong style={{ fontSize: "0.84rem", display: "block", color: "var(--ink)" }}>
              Pangkalan Data Relasional
            </strong>
            <small style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
              PostgreSQL Supabase dengan Keamanan Berlapis Row-Level Security (RLS)
            </small>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--paper)", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <strong style={{ fontSize: "0.84rem", display: "block", color: "var(--ink)" }}>
              Tata Kelola Multi-Wilayah
            </strong>
            <small style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
              Penugasan Bidan Desa Terstruktur &amp; Registrasi Fasilitas Lengkap
            </small>
          </div>
        </div>
      </section>

      {/* Official Copyright & Watermark Footer */}
      <footer
        style={{
          padding: "1.25rem 1.5rem",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md, 14px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.84rem", fontWeight: 800, color: "var(--ink)" }}>
            Hak Cipta &copy; 2026 KKN KUNCIR &middot; INSTITUT TEKNOLOGI MOJOSARI (ITM)
          </span>
          <span style={{ fontSize: "0.76rem", color: "var(--ink-muted)" }}>
            Seluruh hak cipta dilindungi undang-undang. Dipersembahkan untuk masyarakat dan tenaga kesehatan Desa Kuncir.
          </span>
        </div>
      </footer>

      {/* Fullscreen Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="staff-modal-backdrop"
          onClick={() => setSelectedPhoto(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.88)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "1000px",
              width: "100%",
              borderRadius: "14px",
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
              border: "1px solid rgba(225, 180, 92, 0.4)",
              background: "#0f172a",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1.25rem",
                background: "#0b1320",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    padding: "0.2rem 0.5rem",
                    background: "rgba(225, 180, 92, 0.2)",
                    color: "#e1b45c",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    borderRadius: "4px",
                  }}
                >
                  KKN KUNCIR 2026
                </span>
                <span style={{ fontSize: "0.84rem", fontWeight: 700 }}>
                  Dokumentasi Resmi &middot; Institut Teknologi Mojosari
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: "6px",
                  padding: "0.35rem 0.65rem",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                }}
              >
                Tutup
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto}
              alt="Dokumentasi KKN Kuncir 2026"
              style={{
                width: "100%",
                maxHeight: "75vh",
                objectFit: "contain",
                display: "block",
                background: "#050911",
              }}
            />

            <div
              style={{
                padding: "0.75rem 1.25rem",
                background: "#0b1320",
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                fontSize: "0.8rem",
                color: "rgba(255, 255, 255, 0.75)",
                textAlign: "center",
              }}
            >
              INSTITUT TEKNOLOGI MOJOSARI &middot; Desa Kuncir, Kec. Loceret, Kab. Nganjuk
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

