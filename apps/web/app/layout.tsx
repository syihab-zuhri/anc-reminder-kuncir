import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pengingat ANC",
    template: "%s · Pengingat ANC",
  },
  description: "Ruang pendampingan kunjungan ANC untuk Puskesmas, Bidan, dan ibu hamil.",
  applicationName: "Pengingat ANC",
  category: "health",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f0e7",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
