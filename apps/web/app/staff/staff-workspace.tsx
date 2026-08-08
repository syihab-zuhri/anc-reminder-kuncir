"use client";

import { staffMeResponseSchema, type StaffMeResponse } from "@anc/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";

type SessionState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly staff: StaffMeResponse }
  | { readonly kind: "unavailable" };

const roleCopy = {
  BIDAN: {
    label: "Bidan",
    description: "Kunjungan dan tindak lanjut dalam penugasan Anda.",
  },
  PUSKESMAS: {
    label: "Puskesmas",
    description: "Cakupan layanan, petugas, dan tindak lanjut satu wilayah kerja.",
  },
  SUPER_ADMIN: {
    label: "Super Admin",
    description: "Akses teknis terbatas tanpa pembacaan data kesehatan rutin.",
  },
} as const;

export function StaffWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadIdentity(controller.signal);
    return () => controller.abort();

    async function loadIdentity(signal: AbortSignal): Promise<void> {
      try {
        const response = await fetch("/api/staff-session/me", { cache: "no-store", signal });
        if (response.status === 401) {
          router.replace("/staff/login?reason=session-expired");
          return;
        }
        if (response.status === 403) {
          router.replace("/staff/forbidden");
          return;
        }
        if (!response.ok) {
          setSession({ kind: "unavailable" });
          return;
        }
        const staff = staffMeResponseSchema.safeParse(await response.json());
        setSession(staff.success ? { kind: "ready", staff: staff.data } : { kind: "unavailable" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSession({ kind: "unavailable" });
        }
      }
    }
  }, [router]);

  async function logout(): Promise<void> {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/staff-session/logout", { method: "POST" });
    } finally {
      router.replace("/staff/login?reason=logged-out");
      router.refresh();
    }
  }

  if (session.kind === "loading") return <StaffWorkspaceLoading />;
  if (session.kind === "unavailable") {
    return (
      <main className="staff-safe-state">
        <p className="staff-kicker">Koneksi terputus</p>
        <h1>Ruang kerja belum dapat dimuat.</h1>
        <p>
          Tidak ada data lokal yang digunakan sebagai pengganti. Coba hubungkan kembali ke server.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Coba lagi
        </button>
      </main>
    );
  }

  const { staff } = session;
  const currentRole = roleCopy[staff.role];
  return (
    <div className="staff-workspace">
      <aside className="staff-rail">
        <Link className="staff-rail-brand" href="/" aria-label="Pengingat ANC, beranda">
          <BrandMark />
        </Link>
        <nav aria-label="Navigasi ruang petugas">
          <a className="is-current" href="#ringkasan" aria-current="page">
            <span>01</span> Ringkasan
          </a>
          <a href="#modul">
            <span>02</span> Modul kerja
          </a>
          <a href="#sesi">
            <span>03</span> Sesi aman
          </a>
        </nav>
        <button className="staff-rail-logout" type="button" onClick={logout} disabled={loggingOut}>
          {loggingOut ? "Keluar…" : "Keluar"}
        </button>
      </aside>

      <main className="staff-workspace-main" id="ringkasan">
        <header className="staff-workspace-header">
          <div>
            <span className="staff-workspace-date">Ruang kerja / akses terverifikasi</span>
            <p>Pengingat ANC</p>
          </div>
          <div className="staff-identity-chip">
            <span>{staff.display_name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{staff.display_name}</strong>
              <small>{currentRole.label}</small>
            </div>
          </div>
        </header>

        <section className="staff-workspace-hero" aria-labelledby="workspace-title">
          <div>
            <p className="staff-kicker">Selamat datang kembali</p>
            <h1 id="workspace-title">Ruang kerja terhubung.</h1>
          </div>
          <p>{currentRole.description}</p>
        </section>

        <section className="staff-module-grid" id="modul" aria-labelledby="module-title">
          <div className="staff-section-heading">
            <p className="staff-kicker">Modul bertahap</p>
            <h2 id="module-title">Fondasi akses aktif. Data domain menyusul per tahap.</h2>
          </div>
          <article className="staff-module-card module-primary">
            <span className="staff-module-index">01</span>
            <div>
              <p className="staff-module-state">Akses siap</p>
              <h3>Identitas &amp; scope</h3>
              <p>Peran dan sesi Anda diverifikasi langsung oleh server.</p>
            </div>
          </article>
          <article className="staff-module-card">
            <span className="staff-module-index">02</span>
            <div>
              <p className="staff-module-state is-muted">Tahap berikut</p>
              <h3>Register ibu hamil</h3>
              <p>Akan tersedia setelah service registry dan persetujuan data selesai.</p>
            </div>
          </article>
          <article className="staff-module-card">
            <span className="staff-module-index">03</span>
            <div>
              <p className="staff-module-state is-muted">Tahap berikut</p>
              <h3>Kunjungan &amp; tindak lanjut</h3>
              <p>Status tetap dihitung server, bukan oleh halaman ini.</p>
            </div>
          </article>
        </section>

        <section className="staff-session-card" id="sesi" aria-labelledby="session-title">
          <div>
            <p className="staff-kicker">Sesi aman</p>
            <h2 id="session-title">Token tidak tersedia untuk JavaScript halaman.</h2>
          </div>
          <dl>
            <div>
              <dt>Peran aktif</dt>
              <dd>{currentRole.label}</dd>
            </div>
            <div>
              <dt>Status akun</dt>
              <dd>{staff.status === "ACTIVE" ? "Aktif" : staff.status}</dd>
            </div>
            <div>
              <dt>Pembaruan sesi</dt>
              <dd>Otomatis via server</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}

function StaffWorkspaceLoading() {
  return (
    <main className="staff-workspace-loading" aria-busy="true" aria-label="Memuat ruang petugas">
      <BrandMark />
      <span />
      <p>Memeriksa sesi aman…</p>
    </main>
  );
}
