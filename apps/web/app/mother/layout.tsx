import type { Metadata } from "next";
import Link from "next/link";

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
        <Link className="mother-brand-link" href="/" aria-label="Kembali ke beranda Pengingat ANC">
          <BrandMark />
          <span className="mother-header-label">Portal Ibu Hamil</span>
        </Link>
      </header>
      <main className="mother-main">{children}</main>
      <footer className="mother-footer">
        <p>Sistem Pengingat ANC · Posyandu Kuncir</p>
      </footer>
    </div>
  );
}
