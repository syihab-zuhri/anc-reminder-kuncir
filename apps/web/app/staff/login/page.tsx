import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk petugas",
  description: "Akses aman untuk Puskesmas dan Bidan.",
};

interface LoginPageProps {
  readonly searchParams: Promise<{ readonly reason?: string }>;
}

export default async function StaffLoginPage({ searchParams }: LoginPageProps) {
  const { reason } = await searchParams;
  const notice = reason === "logged-out" || reason === "session-expired" ? reason : undefined;

  return (
    <main className="staff-auth-page">
      <section className="staff-auth-context" aria-labelledby="staff-context-title">
        <Link className="staff-auth-brand" href="/" aria-label="Kembali ke beranda Pengingat ANC">
          <BrandMark />
          <span>
            <strong>Pengingat ANC</strong>
            <small>Ruang petugas</small>
          </span>
        </Link>

        <div className="staff-auth-statement">
          <p className="staff-kicker">Meja jaga / 01</p>
          <h1 id="staff-context-title">Mulai dari konteks. Bukan dari banyaknya data.</h1>
          <p>
            Ruang kerja menampilkan informasi secukupnya berdasarkan peran dan wilayah Puskesmas
            yang ditetapkan server.
          </p>
        </div>

        <ol className="staff-context-ledger" aria-label="Prinsip akses petugas">
          <li>
            <span>01</span>
            <p>Scope diperiksa ulang pada setiap permintaan.</p>
          </li>
          <li>
            <span>02</span>
            <p>Super Admin tidak membaca data kesehatan rutin.</p>
          </li>
          <li>
            <span>03</span>
            <p>Tindakan penting meninggalkan jejak audit.</p>
          </li>
        </ol>
      </section>

      <section className="staff-auth-panel" aria-labelledby="staff-login-title">
        <div className="staff-panel-topline">
          <Link href="/">← Beranda</Link>
          <span>Asia/Jakarta</span>
        </div>

        <div className="staff-form-wrap">
          <p className="staff-kicker">Akses terverifikasi</p>
          <h2 id="staff-login-title">Masuk untuk melanjutkan giliran kerja.</h2>
          <p className="staff-form-intro">
            Gunakan identitas yang diberikan Puskesmas. Pesan gagal tidak akan mengungkap status
            akun.
          </p>
          <LoginForm notice={notice} />
        </div>

        <p className="staff-panel-footnote">
          Butuh pemulihan akses? Hubungi penanggung jawab Puskesmas.
        </p>
      </section>
    </main>
  );
}
