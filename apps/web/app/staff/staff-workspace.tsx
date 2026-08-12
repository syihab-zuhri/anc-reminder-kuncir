"use client";

import { staffMeResponseSchema, type StaffMeResponse } from "@anc/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { MotherAccessPanel } from "@/components/mother-access-panel";
import { MotherRegistrationPanel } from "@/components/mother-registration-panel";
import { OrganizationAdminPanel } from "@/components/organization-admin-panel";

type SessionState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly staff: StaffMeResponse }
  | { readonly kind: "unavailable" };

type ModuleTab = "summary" | "admin" | "register" | "access";

const roleCopy = {
  BIDAN: {
    label: "Bidan Lapangan",
    description: "Kunjungan, konfirmasi periksa, dan tindak lanjut dalam penugasan wilayah Anda.",
  },
  PUSKESMAS: {
    label: "Operator Puskesmas",
    description: "Cakupan fasilitas, desa binaan, pendaftaran ibu hamil, dan penugasan wilayah.",
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
  const [activeTab, setActiveTab] = useState<ModuleTab>("summary");

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
          <button
            type="button"
            className={activeTab === "summary" ? "is-current" : ""}
            onClick={() => setActiveTab("summary")}
          >
            <span>01</span> Ringkasan
          </button>
          <button
            type="button"
            className={activeTab === "admin" ? "is-current" : ""}
            onClick={() => setActiveTab("admin")}
          >
            <span>02</span> Administrasi
          </button>
          <button
            type="button"
            className={activeTab === "register" ? "is-current" : ""}
            onClick={() => setActiveTab("register")}
          >
            <span>03</span> Register Bumil
          </button>
          <button
            type="button"
            className={activeTab === "access" ? "is-current" : ""}
            onClick={() => setActiveTab("access")}
          >
            <span>04</span> Kode Akses
          </button>
        </nav>
        <button className="staff-rail-logout" type="button" onClick={logout} disabled={loggingOut}>
          {loggingOut ? "Keluar…" : "Keluar"}
        </button>
      </aside>

      <main className="staff-workspace-main">
        <header className="staff-workspace-header">
          <div>
            <span className="staff-workspace-date">Ruang kerja / akses terverifikasi</span>
            <p>Sistem Pengingat ANC Kuncir</p>
          </div>
          <div className="staff-identity-chip">
            <span>{staff.display_name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{staff.display_name}</strong>
              <small>{currentRole.label}</small>
            </div>
          </div>
        </header>

        {activeTab === "summary" && (
          <>
            <section className="staff-workspace-hero" aria-labelledby="workspace-title">
              <div>
                <p className="staff-kicker">Selamat datang kembali</p>
                <h1 id="workspace-title">Ruang Kerja Petugas ANC.</h1>
              </div>
              <p>{currentRole.description}</p>
            </section>

            <section className="staff-module-grid" aria-labelledby="module-title">
              <div className="staff-section-heading">
                <p className="staff-kicker">Modul Utama Sistem</p>
                <h2 id="module-title">Pilih modul di bilah samping atau kartu di bawah ini.</h2>
              </div>
              <article
                className="staff-module-card module-primary"
                onClick={() => setActiveTab("admin")}
                style={{ cursor: "pointer" }}
              >
                <span className="staff-module-index">01</span>
                <div>
                  <p className="staff-module-state">TASK-P3-001</p>
                  <h3>Administrasi Organisasi</h3>
                  <p>Kelola fasilitas, desa binaan, akun petugas, dan penugasan wilayah.</p>
                </div>
              </article>
              <article
                className="staff-module-card module-primary"
                onClick={() => setActiveTab("register")}
                style={{ cursor: "pointer" }}
              >
                <span className="staff-module-index">02</span>
                <div>
                  <p className="staff-module-state">TASK-P3-002</p>
                  <h3>Pendaftaran Ibu Hamil &amp; Consent</h3>
                  <p>Register pasien 5-field wajib dengan enkripsi NIK &amp; form persetujuan.</p>
                </div>
              </article>
              <article
                className="staff-module-card module-primary"
                onClick={() => setActiveTab("access")}
                style={{ cursor: "pointer" }}
              >
                <span className="staff-module-index">03</span>
                <div>
                  <p className="staff-module-state">TASK-P3-003</p>
                  <h3>Penyerahan Kode Akses (Handoff)</h3>
                  <p>
                    Terbitkan &amp; serahkan kode akses 16 karakter secara langsung kepada pasien.
                  </p>
                </div>
              </article>
            </section>

            <section className="staff-session-card" aria-labelledby="session-title">
              <div>
                <p className="staff-kicker">Keamanan Sesi</p>
                <h2 id="session-title">
                  Token akses dikelola server secara HTTP-only (BFF Pattern).
                </h2>
              </div>
              <dl>
                <div>
                  <dt>Peran Aktif</dt>
                  <dd>{currentRole.label}</dd>
                </div>
                <div>
                  <dt>ID Petugas</dt>
                  <dd>
                    <code>{staff.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Fasilitas Utama</dt>
                  <dd>{staff.health_center_id ?? "Seluruh Wilayah (Puskesmas)"}</dd>
                </div>
                <div>
                  <dt>Status Akun</dt>
                  <dd>{staff.status === "ACTIVE" ? "Aktif Terverifikasi" : staff.status}</dd>
                </div>
              </dl>
            </section>
          </>
        )}

        {activeTab === "admin" && (
          <OrganizationAdminPanel userRole={staff.role} healthCenterId={staff.health_center_id} />
        )}

        {activeTab === "register" && (
          <MotherRegistrationPanel userRole={staff.role} healthCenterId={staff.health_center_id} />
        )}

        {activeTab === "access" && <MotherAccessPanel userRole={staff.role} />}
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
