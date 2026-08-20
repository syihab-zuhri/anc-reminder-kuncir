import type { Metadata } from "next";

import { StaffWorkspace } from "../staff-workspace";

export const metadata: Metadata = {
  title: "Daftar Ibu Hamil Terdaftar — Ruang Petugas",
  description:
    "Daftar data ibu hamil terdaftar, pemantauan linimasa ANC, dan pengelolaan kode akses di Posyandu/Puskesmas.",
};

export default function StaffMothersPage() {
  return <StaffWorkspace initialTab="mothers" />;
}
