import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Akses dibatasi",
};

export default function ForbiddenPage() {
  return (
    <main className="staff-forbidden-page">
      <header>
        <Link href="/" aria-label="Pengingat ANC, beranda">
          <BrandMark />
        </Link>
        <span>Akses ditolak</span>
      </header>
      <section>
        <div>
          <p className="staff-kicker">Di luar kewenangan</p>
          <h1>Akses berhenti di sini.</h1>
          <p>
            Anda sudah masuk, tetapi tindakan atau wilayah ini tidak termasuk tugas akun Anda. Data
            di luar wilayah tugas Anda tidak ditampilkan. Hubungi Puskesmas bila Anda perlu akses.
          </p>
          <div className="staff-forbidden-actions">
            <Link href="/staff">Kembali ke ruang kerja</Link>
            <Link href="/staff/login">Gunakan akun lain</Link>
          </div>
        </div>
        <span className="staff-forbidden-code" aria-hidden="true">
          403
        </span>
      </section>
      <footer>Jika kewenangan seharusnya tersedia, hubungi penanggung jawab Puskesmas.</footer>
    </main>
  );
}
