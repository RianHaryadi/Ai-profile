import type { Metadata } from "next";
import HomeClient from "./HomeClient";

// SEO Metadata for search engine optimization
export const metadata: Metadata = {
  title: "Kartu Bisnis AI — Buat Kartu Nama Digital Pintar Otomatis 24/7",
  description: "Ubah kartu nama pasif Anda menjadi asisten penjualan AI 24/7. Hubungkan prospek secara langsung dengan chatbot AI pintar yang memahami pricelist, portofolio, dan jasa bisnis Anda secara instan.",
  keywords: [
    "kartu bisnis ai",
    "kartu nama digital",
    "ai chatbot kartu nama",
    "kartu nama qr code",
    "business card ai",
    "personal branding digital",
    "katalog produk online",
    "kartu nama nfc",
    "kartu bisnis profesional"
  ],
  alternates: {
    canonical: "http://localhost:3001"
  },
  openGraph: {
    title: "Kartu Bisnis AI — Kartu Nama Digital Pintar Bertenaga AI 24/7",
    description: "Hubungkan prospek langsung dengan chatbot AI pintar yang dilatih menggunakan profil dan brosur PDF Anda.",
    url: "http://localhost:3001",
    siteName: "CardAI",
    locale: "id_ID",
    type: "website"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  }
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const initialEmail = typeof resolvedSearchParams.email === "string" ? resolvedSearchParams.email : "";

  // Structured Data JSON-LD
  const saSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "AI Business Card (CardAI)",
    "operatingSystem": "All",
    "applicationCategory": "BusinessApplication",
    "description": "Ubah kartu nama pasif Anda menjadi asisten penjualan AI 24/7. Scan QR code untuk membuka asisten AI pintar yang dilatih menggunakan profil, katalog, dan portofolio PDF Anda.",
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "IDR",
      "lowPrice": "35000",
      "highPrice": "89000",
      "offerCount": "2"
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Bagaimana cara kerja Kartu Bisnis AI ini?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Setelah mendaftar dan memilih paket, Anda dapat mengunggah dokumen profil bisnis / katalog PDF Anda atau melakukan chat langsung dengan asisten onboarding kami. AI akan mempelajari informasi tersebut, dan otomatis menjawab pertanyaan klien yang men-scan QR code kartu Anda 24/7 secara real-time."
        }
      },
      {
        "@type": "Question",
        "name": "Dokumen apa saja yang bisa saya upload untuk melatih AI?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Anda bisa mengunggah dokumen proposal proyek, company profile, CV profesional, dokumen harga jasa, FAQ bisnis, katalog produk, brosur, atau dokumen teks PDF apa saja. Untuk paket Standard maksimal 1 PDF (maks 2MB), sedangkan paket Pro mendukung hingga 5 PDF (maks 10MB per file)."
        }
      },
      {
        "@type": "Question",
        "name": "Apakah saya bisa menggunakan domain / URL slug kustom?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ya! Anda akan mendapatkan tautan unik berformat 'cardai.com/card/nama-slug-anda'. Anda bebas memilih nama unik sesuai brand pribadi atau nama perusahaan Anda selama slug tersebut masih tersedia saat proses pendaftaran."
        }
      },
      {
        "@type": "Question",
        "name": "Bagaimana sistem pembayarannya? Apakah aman?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sistem pembayaran kami diproses secara 100% aman dan terenkripsi menggunakan Midtrans, payment gateway terbesar di Indonesia. Kami mendukung pembayaran instan via e-wallet (GoPay, ShopeePay), QRIS, Transfer Virtual Account Bank, maupun kartu kredit."
        }
      }
    ]
  };

  return (
    <>
      {/* Inject Structured Data Schemas */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(saSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      
      {/* Render Client Component View */}
      <HomeClient initialEmail={initialEmail} />
    </>
  );
}
