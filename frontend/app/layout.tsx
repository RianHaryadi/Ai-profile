import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "AI Business Card — Kartu Bisnis Pintar Berbasis AI",
  description:
    "Buat kartu bisnis digital dengan AI chatbot. Pelanggan scan QR code, AI jawab pertanyaan tentang bisnis Anda secara otomatis.",
  keywords: ["kartu bisnis digital", "AI chatbot", "QR code", "business card", "digital card"],
  openGraph: {
    title: "AI Business Card — Kartu Bisnis Pintar Berbasis AI",
    description:
      "Buat kartu bisnis digital dengan AI chatbot. Pelanggan scan QR code, AI jawab pertanyaan tentang bisnis Anda.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
