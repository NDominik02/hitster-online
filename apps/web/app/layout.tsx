import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/system/ServiceWorkerRegister";
import "./globals.css";

// Design redesign (Claude Design pass, 2026-07) — Bricolage Grotesque a
// fejlécekhez, Instrument Sans a törzsszöveghez, Space Mono a
// mono/label/kód-jellegű elemekhez (szobakód, évszám, timer, eyebrow-feliratok).
const heading = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
});

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = Space_Mono({
  variable: "--font-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hitster Online",
  description: "Böngészős, telepítés nélküli online Hitster-klón",
  // S43 (PWA) — iOS Safari a "Kezdőképernyőre" ikonhoz nem a manifest.json
  // icons mezőjét olvassa megbízhatóan, hanem explicit <link rel="apple-touch-icon">-t vár.
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F5B62E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hu"
      className={`${heading.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
