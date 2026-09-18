import type { Metadata } from "next";

import { StaffWorkspace } from "../staff-workspace";

export const metadata: Metadata = {
  title: "Pengumuman Siaran — Ruang Petugas",
  description: "Kirim pengumuman sebagai notifikasi push ke semua ibu hamil terdaftar.",
};

export default function StaffAnnouncementsPage() {
  return <StaffWorkspace initialTab="announcements" />;
}
