import type { Metadata } from "next";

import { StaffWorkspace } from "./staff-workspace";

export const metadata: Metadata = {
  title: "Ruang petugas",
  description: "Ruang kerja aman untuk Puskesmas dan Bidan.",
};

export default function StaffPage() {
  return <StaffWorkspace />;
}
