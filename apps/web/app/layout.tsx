import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { ToastProvider } from "../lib/toast-context";
import { NetworkStatusBanner } from "../components/network-status-banner";
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
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#163d37",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function RootLayout({ children }: RootLayoutProps) {
  // Render every page per request: the CSP nonce from proxy.ts only reaches dynamic pages.
  await connection();
  return (
    <html lang="id">
      <body>
        <ToastProvider>
          <NetworkStatusBanner />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
