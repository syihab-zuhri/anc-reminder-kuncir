import type { Metadata } from "next";

import { BrandMark } from "@/components/brand-mark";

import "./mother.css";

export const metadata: Metadata = {
  title: "Portal Ibu Hamil — Pengingat ANC",
  description: "Lihat jadwal pemeriksaan kehamilan dan status kunjungan ANC Anda.",
};

export default function MotherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mother-shell">
      <header className="mother-header">
        <BrandMark />
        <span className="mother-header-label">Portal Ibu Hamil</span>
      </header>
      <main className="mother-main">{children}</main>
      <footer className="mother-footer">
        <p>Sistem Pengingat ANC · Posyandu Kuncir</p>
      </footer>
    </div>
  );
}
