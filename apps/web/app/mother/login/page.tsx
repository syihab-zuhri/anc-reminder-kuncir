import Link from "next/link";
import { MotherLoginForm } from "./login-form";

export default async function MotherLoginPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const reason = typeof searchParams.reason === "string" ? searchParams.reason : undefined;

  return (
    <section className="mother-login-section">
      <div className="mother-login-card">
        <h1>Masuk ke Portal Ibu Hamil</h1>
        <p className="mother-login-lead">
          Gunakan nama lengkap dan kode akses yang diberikan oleh bidan atau petugas Puskesmas saat
          pendaftaran.
        </p>
        {reason === "session-expired" && (
          <div className="mother-alert alert-warning">
            <p>Sesi Anda telah berakhir. Silakan masuk kembali.</p>
          </div>
        )}
        {reason === "logged-out" && (
          <div className="mother-alert alert-info">
            <p>Anda telah berhasil keluar.</p>
          </div>
        )}
        <MotherLoginForm />
        <div className="mother-login-links">
          <Link href="/">← Kembali ke Beranda</Link>
          <Link href="/staff/login">Masuk sebagai Petugas →</Link>
        </div>
      </div>
    </section>
  );
}
