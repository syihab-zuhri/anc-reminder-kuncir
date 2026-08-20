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
  readonly allowedRoles: readonly StaffRole[];
}

const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: "summary", label: "Dashboard", allowedRoles: ["PUSKESMAS", "BIDAN", "SUPER_ADMIN"] },
  { id: "mothers", label: "Data Bumil", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "register", label: "Register Bumil", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "access", label: "Kode Akses", allowedRoles: ["PUSKESMAS"] },
  { id: "clinical", label: "Detail K1–K6", allowedRoles: ["PUSKESMAS"] },
  { id: "confirm", label: "Konfirmasi Periksa", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "bumil", label: "Portal Bumil", allowedRoles: ["PUSKESMAS", "BIDAN"] },
  { id: "admin", label: "Administrasi", allowedRoles: ["PUSKESMAS"] },
  { id: "content", label: "Konten Reminder", allowedRoles: ["PUSKESMAS"] },
];

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

  return (
    <div className="staff-workspace">
      <aside className="staff-rail">
        <Link className="staff-rail-brand" href="/" aria-label="Pengingat ANC, beranda">
          <BrandMark />
        </Link>
        <nav aria-label="Navigasi ruang petugas">
          {visibleTabs.map((tab, index) => {
            const tabNumber = String(index + 1).padStart(2, "0");
            const isCurrent = effectiveTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={isCurrent ? "is-current" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tabNumber}</span> {tab.label}
              </button>
            );
          })}
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
