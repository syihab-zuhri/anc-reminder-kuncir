"use client";

import { staffMeResponseSchema, type StaffMeResponse } from "@anc/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BidanVisitConfirmationPanel } from "@/components/bidan-visit-confirmation-panel";
import { BrandMark } from "@/components/brand-mark";
import { BumilPatientPortal } from "@/components/bumil-patient-portal";
import { ContentManagementPanel } from "@/components/content-management-panel";
import { MotherAccessPanel } from "@/components/mother-access-panel";
import { MotherRegistrationPanel } from "@/components/mother-registration-panel";
import { OrganizationAdminPanel } from "@/components/organization-admin-panel";
import { PuskesmasClinicalRecordPanel } from "@/components/puskesmas-clinical-record-panel";
import { RegisteredMothersPanel } from "@/components/registered-mothers-panel";
import { RoleDashboardShell } from "@/components/role-dashboard-shell";

type SessionState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly staff: StaffMeResponse }
  | { readonly kind: "unavailable" };

import type { StaffRole } from "@anc/contracts";

export type ModuleTab =
  | "summary"
  | "mothers"
  | "register"
  | "access"
  | "clinical"
  | "confirm"
  | "bumil"
  | "admin"
  | "content";

interface TabDefinition {
  readonly id: ModuleTab;
  readonly label: string;
  readonly shortLabel: string;
  readonly allowedRoles: readonly StaffRole[];
  readonly description: string;
}

const TAB_DEFINITIONS: readonly TabDefinition[] = [
  {
    id: "summary",
    label: "Dashboard",
    shortLabel: "Beranda",
    allowedRoles: ["PUSKESMAS", "BIDAN", "SUPER_ADMIN"],
    description: "Ringkasan metrik dan antrean prioritas operasional.",
  },
  {
    id: "mothers",
    label: "Data Bumil",
    shortLabel: "Data Bumil",
    allowedRoles: ["PUSKESMAS", "BIDAN"],
    description: "Daftar seluruh ibu hamil terdaftar dan status kehamilan.",
  },
  {
    id: "register",
    label: "Register Bumil",
    shortLabel: "Register",
    allowedRoles: ["PUSKESMAS", "BIDAN"],
    description: "Form pendaftaran pasien ibu hamil baru ke sistem.",
  },
  {
    id: "clinical",
    label: "Detail K1–K6",
    shortLabel: "K1–K6",
    allowedRoles: ["PUSKESMAS"],
    description: "Pencatatan dan validasi rekam medis pemeriksaan K1–K6.",
  },
  {
    id: "confirm",
    label: "Konfirmasi Periksa",
    shortLabel: "Konfirmasi",
    allowedRoles: ["PUSKESMAS", "BIDAN"],
    description: "Konfirmasi kehadiran dan kunjungan ANC oleh Bidan.",
  },
  {
    id: "access",
    label: "Kode Akses",
    shortLabel: "Akses",
    allowedRoles: ["PUSKESMAS"],
    description: "Kelola kode akses mandiri pasien ibu hamil.",
  },
  {
    id: "bumil",
    label: "Portal Bumil",
    shortLabel: "Portal",
    allowedRoles: ["PUSKESMAS", "BIDAN"],
    description: "Simulasi tampilan linimasa mandiri dari sudut pandang pasien.",
  },
  {
    id: "admin",
    label: "Administrasi",
    shortLabel: "Admin",
    allowedRoles: ["PUSKESMAS"],
    description: "Manajemen fasilitas Puskesmas dan akun staf penugasan.",
  },
  {
    id: "content",
    label: "Konten Reminder",
    shortLabel: "Konten",
    allowedRoles: ["PUSKESMAS"],
    description: "Pengaturan template pesan pengingat WhatsApp & notifikasi.",
  },
];

function TabIcon({ id, className = "staff-tab-icon" }: { id: ModuleTab | "more"; className?: string }) {
  if (id === "summary") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    );
  }
  if (id === "mothers") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (id === "register") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" y1="8" x2="20" y2="14" />
        <line x1="23" y1="11" x2="17" y2="11" />
      </svg>
    );
  }
  if (id === "confirm") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  if (id === "clinical") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }
  if (id === "access") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  if (id === "bumil") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    );
  }
  if (id === "admin") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    );
  }
  if (id === "content") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="7" height="7" x="3" y="3" rx="1.5" />
      <rect width="7" height="7" x="14" y="3" rx="1.5" />
      <rect width="7" height="7" x="14" y="14" rx="1.5" />
      <rect width="7" height="7" x="3" y="14" rx="1.5" />
    </svg>
  );
}

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

interface StaffWorkspaceProps {
  readonly initialTab?: ModuleTab;
}

export function StaffWorkspace({ initialTab = "summary" }: StaffWorkspaceProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<ModuleTab>(initialTab);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

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

  // Filter tabs strictly by user's permitted capabilities/roles
  const visibleTabs = TAB_DEFINITIONS.filter((tab) => tab.allowedRoles.includes(staff.role));
  const isTabAllowed = visibleTabs.some((t) => t.id === activeTab);
  const effectiveTab = isTabAllowed ? activeTab : (visibleTabs[0]?.id ?? "summary");

  // Mobile Bottom Navigation splitting: Top 4 primary tabs + 1 "Lainnya" button
  const primaryMobileTabs = visibleTabs.slice(0, 4);
  const secondaryMobileTabs = visibleTabs.slice(4);
  const hasMoreTabs = secondaryMobileTabs.length > 0;
  const isSecondaryTabActive = secondaryMobileTabs.some((t) => t.id === effectiveTab);

  function handleSelectTab(tabId: ModuleTab) {
    setActiveTab(tabId);
    setIsMoreMenuOpen(false);
  }

  return (
    <div className="staff-workspace">
      {/* Desktop Sidebar Rail */}
      <aside className="staff-rail">
        <div className="staff-rail-topbar">
          <Link className="staff-rail-brand" href="/" aria-label="Pengingat ANC, beranda">
            <BrandMark />
          </Link>
          <div className="staff-rail-user-chip">
            <strong>{staff.display_name}</strong>
            <small>{currentRole.label}</small>
          </div>
          <button className="staff-rail-logout staff-rail-logout-mobile" type="button" onClick={logout} disabled={loggingOut}>
            {loggingOut ? "Keluar…" : "Keluar"}
          </button>
        </div>
        <nav aria-label="Navigasi ruang petugas desktop">
          {visibleTabs.map((tab, index) => {
            const tabNumber = String(index + 1).padStart(2, "0");
            const isCurrent = effectiveTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={isCurrent ? "is-current" : ""}
                onClick={() => handleSelectTab(tab.id)}
              >
                <span>{tabNumber}</span> {tab.label}
              </button>
            );
          })}
        </nav>
        <button className="staff-rail-logout staff-rail-logout-desktop" type="button" onClick={logout} disabled={loggingOut}>
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

        {effectiveTab === "summary" && (
          <>
            <RoleDashboardShell
              userRole={staff.role}
              healthCenterId={staff.health_center_id}
              onNavigateTab={setActiveTab}
            />

            <section className="staff-session-card" aria-labelledby="session-title">
              <div className="staff-session-header">
                <div>
                  <h3 id="session-title">Informasi Sesi Petugas</h3>
                  <p
                    style={{ fontSize: "0.82rem", color: "var(--ink-muted)", margin: "0.2rem 0 0" }}
                  >
                    Sesi terhubung aman dan terverifikasi oleh server.
                  </p>
                </div>
                <span
                  className="badge-status status-confirmed"
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                >
                  ● Sesi Aktif
                </span>
              </div>
              <dl>
                <div>
                  <dt>Peran</dt>
                  <dd>{currentRole.label}</dd>
                </div>
                <div>
                  <dt>Nama Petugas</dt>
                  <dd>
                    <strong>{staff.display_name}</strong>
                  </dd>
                </div>
                <div>
                  <dt>Wilayah Fasilitas</dt>
                  <dd>
                    {staff.health_center_id
                      ? "Puskesmas Kuncir"
                      : "Seluruh Wilayah (Puskesmas Induk)"}
                  </dd>
                </div>
                <div>
                  <dt>Status Akun</dt>
                  <dd>{staff.status === "ACTIVE" ? "Aktif Terverifikasi" : staff.status}</dd>
                </div>
              </dl>
            </section>
          </>
        )}

        {effectiveTab === "mothers" && (
          <RegisteredMothersPanel
            userRole={staff.role}
            healthCenterId={staff.health_center_id}
            onNavigateTab={setActiveTab}
          />
        )}

        {effectiveTab === "register" && staff.role !== "SUPER_ADMIN" && (
          <MotherRegistrationPanel
            userRole={staff.role}
            healthCenterId={staff.health_center_id}
            onNavigateTab={setActiveTab}
          />
        )}

        {effectiveTab === "access" && staff.role === "PUSKESMAS" && (
          <MotherAccessPanel userRole={staff.role} />
        )}

        {effectiveTab === "clinical" && staff.role === "PUSKESMAS" && (
          <PuskesmasClinicalRecordPanel userRole={staff.role} />
        )}

        {effectiveTab === "confirm" && <BidanVisitConfirmationPanel userRole={staff.role} />}

        {effectiveTab === "bumil" && <BumilPatientPortal />}

        {effectiveTab === "admin" && staff.role === "PUSKESMAS" && (
          <OrganizationAdminPanel userRole={staff.role} healthCenterId={staff.health_center_id} />
        )}

        {effectiveTab === "content" && staff.role === "PUSKESMAS" && (
          <ContentManagementPanel userRole={staff.role} />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Fixed 4-5 items) */}
      <nav className="staff-mobile-bottom-bar" aria-label="Navigasi cepat mobile">
        {primaryMobileTabs.map((tab) => {
          const isCurrent = effectiveTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`staff-bottom-tab-btn ${isCurrent ? "is-active" : ""}`}
              onClick={() => handleSelectTab(tab.id)}
              aria-current={isCurrent ? "page" : undefined}
            >
              <span className="staff-tab-icon-wrap">
                <TabIcon id={tab.id} />
              </span>
              <span className="staff-tab-text">{tab.shortLabel}</span>
            </button>
          );
        })}

        {hasMoreTabs && (
          <button
            type="button"
            className={`staff-bottom-tab-btn ${isSecondaryTabActive || isMoreMenuOpen ? "is-active is-more-active" : ""}`}
            onClick={() => setIsMoreMenuOpen((prev) => !prev)}
            aria-expanded={isMoreMenuOpen}
            aria-label="Tampilkan menu dan fitur lainnya"
          >
            <span className="staff-tab-icon-wrap">
              <TabIcon id="more" />
            </span>
            <span className="staff-tab-text">
              {isSecondaryTabActive
                ? visibleTabs.find((t) => t.id === effectiveTab)?.shortLabel ?? "Lainnya"
                : "Lainnya"}
            </span>
          </button>
        )}
      </nav>

      {/* Mobile Bottom Sheet Drawer for "Lainnya" */}
      {hasMoreTabs && isMoreMenuOpen && (
        <div className="staff-bottom-sheet-backdrop" onClick={() => setIsMoreMenuOpen(false)}>
          <div
            className="staff-bottom-sheet-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menu dan Fitur Lainnya"
          >
            <div className="staff-bottom-sheet-handle" aria-hidden="true" />
            <div className="staff-bottom-sheet-header">
              <div>
                <h3>Fitur &amp; Menu Lainnya</h3>
                <p>Pilih modul kerja yang ingin dibuka</p>
              </div>
              <button
                type="button"
                className="staff-bottom-sheet-close"
                onClick={() => setIsMoreMenuOpen(false)}
                aria-label="Tutup menu"
              >
                ✕
              </button>
            </div>

            <div className="staff-bottom-sheet-grid">
              {secondaryMobileTabs.map((tab) => {
                const isCurrent = effectiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`staff-sheet-item ${isCurrent ? "is-current" : ""}`}
                    onClick={() => handleSelectTab(tab.id)}
                  >
                    <div className="staff-sheet-item-icon">
                      <TabIcon id={tab.id} />
                    </div>
                    <div className="staff-sheet-item-info">
                      <strong>{tab.label}</strong>
                      <small>{tab.description}</small>
                    </div>
                    {isCurrent && <span className="staff-sheet-active-pill">Aktif</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
