"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HomeClientProps {
  initialEmail?: string;
}

export default function HomeClient({ initialEmail = "" }: HomeClientProps) {
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [tier, setTier] = useState<"standard" | "pro">("standard");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "creating_transaction" | "waiting_payment" | "verifying_payment" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    // Load Midtrans Snap script dynamically
    const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "SB-Mid-client-qcGQy3nA6W1Ltmlo";
    const snapUrl = "https://app.sandbox.midtrans.com/snap/snap.js";
    
    let script = document.querySelector(`script[src="${snapUrl}"]`);
    if (!script) {
      script = document.createElement("script");
      (script as any).src = snapUrl;
      script.setAttribute("data-client-key", clientKey);
      document.head.appendChild(script);
    }
  }, []);

  const handleGetStarted = () => {
    setIsModalOpen(true);
  };

  const handleRegisterAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) {
      setError("Email dan Nama harus diisi.");
      return;
    }
    
    setPaymentStatus("creating_transaction");
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/payment/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          bio: bio.trim() || "Halo! Saya menggunakan AI Personal Business Card.",
          tier: tier
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Gagal mendaftar");
      }
      
      const data = await res.json();
      setOrderId(data.order_id);
      setPaymentStatus("waiting_payment");
      
      if ((window as any).snap) {
        (window as any).snap.pay(data.snap_token, {
          onSuccess: function(result: any) {
            console.log("payment success", result);
            setPaymentStatus("verifying_payment");
            startPollingStatus(data.order_id);
          },
          onPending: function(result: any) {
            console.log("payment pending", result);
            setPaymentStatus("verifying_payment");
            startPollingStatus(data.order_id);
          },
          onError: function(result: any) {
            console.error("payment error", result);
            setError("Pembayaran gagal. Silakan coba lagi.");
            setPaymentStatus("error");
          },
          onClose: function() {
            console.log("payment closed");
            setPaymentStatus("idle");
          }
        });
      } else {
        window.location.href = data.redirect_url;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Terjadi kesalahan koneksi.");
      setPaymentStatus("error");
    }
  };

  const startPollingStatus = (orderId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(interval);
        setError("Verifikasi pembayaran timeout. Silakan hubungi admin jika pembayaran sudah berhasil.");
        setPaymentStatus("error");
        return;
      }
      
      try {
        const res = await fetch(`${API_URL}/api/payment/status?order_id=${orderId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "active") {
            clearInterval(interval);
            setPaymentStatus("success");
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  };

  const faqs = [
    {
      q: "Bagaimana cara kerja Kartu Bisnis AI ini?",
      a: "Setelah mendaftar dan memilih paket, Anda dapat mengunggah dokumen profil bisnis / katalog PDF Anda atau melakukan chat langsung dengan asisten onboarding kami. AI akan mempelajari informasi tersebut, dan otomatis menjawab pertanyaan klien yang men-scan QR code kartu Anda 24/7 secara real-time."
    },
    {
      q: "Dokumen apa saja yang bisa saya upload untuk melatih AI?",
      a: "Anda bisa mengunggah dokumen proposal proyek, company profile, CV profesional, dokumen harga jasa, FAQ bisnis, katalog produk, brosur, atau dokumen teks PDF apa saja. Untuk paket Standard maksimal 1 PDF (maks 2MB), sedangkan paket Pro mendukung hingga 5 PDF (maks 10MB per file)."
    },
    {
      q: "Apakah saya bisa menggunakan domain / URL slug kustom?",
      a: "Ya! Anda akan mendapatkan tautan unik berformat 'cardai.com/card/nama-slug-anda'. Anda bebas memilih nama unik sesuai brand pribadi atau nama perusahaan Anda selama slug tersebut masih tersedia saat proses pendaftaran."
    },
    {
      q: "Bagaimana sistem pembayarannya? Apakah aman?",
      a: "Sistem pembayaran kami diproses secara 100% aman dan terenkripsi menggunakan Midtrans, payment gateway terbesar di Indonesia. Kami mendukung pembayaran instan via e-wallet (GoPay, ShopeePay), QRIS, Transfer Virtual Account Bank, maupun kartu kredit."
    }
  ];

  return (
    <main className="relative z-10 overflow-x-hidden w-full">
      {/* ─── Hero Section ─────────────────────────────── */}
      <section className="min-h-screen flex items-center justify-between gap-16 px-4 sm:px-8 max-w-[1200px] mx-auto pt-28 pb-20 relative overflow-visible max-lg:flex-col max-lg:text-center max-lg:pt-24 max-lg:px-4">
        <div className="absolute w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(0,119,182,0.04),transparent_70%)] top-[-150px] left-1/2 -translate-x-1/2 pointer-events-none" />
        
        <div className="flex-1 max-w-[600px] animate-fade-in-up max-lg:max-w-full text-left max-lg:text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-accent-primary/5 border border-accent-primary/10 rounded-full text-[10px] font-semibold uppercase tracking-[0.15em] text-accent-primary mb-6 shadow-sm">
            <span className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-pulse" />
            Intelligent Business Card
          </div>
          
          <h1 className="font-primary text-4xl sm:text-[3.25rem] font-bold leading-[1.12] mb-6 text-slate-900 tracking-tight">
            Ubah kartu nama Anda menjadi
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-accent-primary via-accent-tertiary to-accent-secondary mt-1">asisten penjualan AI 24/7.</span>
          </h1>
          
          <p className="text-[15px] sm:text-base text-slate-600 leading-relaxed mb-8 max-w-[500px] max-lg:mx-auto">
            Hubungkan prospek langsung dengan chatbot AI pintar yang dilatih dari profil dan portofolio Anda. Menjawab pertanyaan otomatis secara instan.
          </p>

          <div className="flex flex-col gap-3 max-w-[460px] max-lg:mx-auto">
            <div className="flex gap-2 max-sm:flex-col bg-white p-1.5 border border-slate-200 rounded-lg shadow-md shadow-slate-100/50 focus-within:border-accent-primary focus-within:ring-2 focus-within:ring-accent-primary/10 transition-all">
              <input
                type="email"
                placeholder="Alamat email Anda..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-base sm:text-sm bg-transparent border-none py-2 px-3 text-slate-900 outline-none placeholder-slate-400 flex-1 focus:ring-0 focus:outline-none"
                id="hero-email-input"
              />
              <button
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 font-primary text-xs font-semibold uppercase tracking-wider bg-accent-primary text-white hover:bg-accent-secondary active:scale-[0.98] transition-all rounded-md cursor-pointer whitespace-nowrap shadow-sm shadow-blue-500/10"
                onClick={handleGetStarted}
                id="hero-cta-button"
              >
                Mulai Sekarang
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-left max-lg:text-center">Gratis 7 Hari Pertama • Batalkan Kapan Saja</p>
          </div>
        </div>

        {/* Smartphone Preview Visual */}
        <div className="flex-1 max-w-[400px] animate-fade-in opacity-100 max-lg:max-w-[340px] max-lg:w-full relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-accent-primary/5 to-accent-secondary/10 rounded-[48px] blur-2xl -z-10" />
          
          {/* Outer Phone Frame */}
          <div className="bg-slate-900 rounded-[48px] p-3.5 border-[6px] border-slate-800 shadow-xl relative animate-float">
            {/* Notch / Dynamic Island */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-950 rounded-full z-20 flex items-center justify-between px-3">
              <span className="w-1 h-1 bg-gray-800 rounded-full" />
              <span className="w-8 h-0.5 bg-gray-900 rounded-full" />
              <span className="w-1 h-1 bg-accent-secondary/50 rounded-full" />
            </div>
            
            {/* Phone Screen */}
            <div className="bg-slate-50 rounded-[36px] border border-slate-200/80 p-4 pt-8 relative overflow-hidden flex flex-col justify-between min-h-[460px]">
              
              {/* Chat Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-accent-primary flex-shrink-0 border border-white/10 flex items-center justify-center text-white text-xs font-bold font-primary">
                      AB
                    </div>
                    <span className="absolute bottom-0 right-0 w-2 h-2 bg-success rounded-full border border-slate-50" />
                  </div>
                  <div className="text-left">
                    <div className="font-primary font-bold text-xs text-slate-900">Ahmad Budi</div>
                    <div className="text-[10px] text-accent-primary font-medium flex items-center gap-1">
                      <span className="w-1 h-1 bg-success rounded-full inline-block animate-pulse" />
                      Asisten AI Aktif
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-1 text-slate-400">
                  <span className="w-1 h-1 bg-current rounded-full" />
                  <span className="w-1 h-1 bg-current rounded-full" />
                  <span className="w-1 h-1 bg-current rounded-full" />
                </div>
              </div>
              
              {/* Chat Messages */}
              <div className="flex flex-col gap-3.5 mb-4 text-left flex-1 justify-end min-h-[250px]">
                {/* Bubble 1: AI */}
                <div className="flex gap-2 items-start max-w-[88%]">
                  <div className="w-5 h-5 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px] flex-shrink-0 text-slate-500">
                    A
                  </div>
                  <div className="bg-white border border-slate-200/80 rounded-[2px_16px_16px_16px] p-3 text-[13px] text-slate-800 leading-relaxed shadow-sm">
                    Halo. Saya asisten AI Ahmad Budi. Mau tanya tentang jasa konsultasi marketing saya?
                  </div>
                </div>
                
                {/* Bubble 2: User */}
                <div className="bg-accent-primary rounded-[16px_16px_2px_16px] p-3 text-[13px] text-white max-w-[78%] leading-relaxed self-end shadow-sm">
                  Berapa biaya konsultasinya?
                </div>
                
                {/* Bubble 3: AI */}
                <div className="flex gap-2 items-start max-w-[88%]">
                  <div className="w-5 h-5 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px] flex-shrink-0 text-slate-500">
                    A
                  </div>
                  <div className="bg-white border border-slate-200/80 rounded-[2px_16px_16px_16px] p-3 text-[13px] text-slate-800 leading-relaxed shadow-sm">
                    Sesi awal gratis 30 menit. Setelah itu tarifnya mulai dari Rp 500rb/sesi. Mau dijadwalkan?
                  </div>
                </div>
              </div>
              
              {/* Quick Replies / Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2 scrollbar-none">
                <button className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-full text-[11px] text-slate-700 font-medium whitespace-nowrap transition-colors shadow-sm">
                  Layanan
                </button>
                <button className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-full text-[11px] text-slate-700 font-medium whitespace-nowrap transition-colors shadow-sm">
                  Portofolio
                </button>
                <button className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-full text-[11px] text-slate-700 font-medium whitespace-nowrap transition-colors shadow-sm">
                  Hubungi
                </button>
              </div>

              {/* Chat Input Field */}
              <div className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="text-xs text-slate-400 px-2 flex-1 select-none">Tulis pertanyaan...</div>
                <div className="w-7 h-7 rounded-lg bg-accent-primary flex items-center justify-center text-white text-xs shadow-sm">
                  ➔
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social Proof / Testimony Section ─────────── */}
      <section className="px-4 sm:px-8 py-16 text-center max-w-[1200px] mx-auto border-t border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] mb-10">Dipercaya oleh 1.200+ Profesional</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1020px] mx-auto">
          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm shadow-slate-100/40 hover:shadow-md rounded-xl p-6 text-left transition-all duration-300">
            <p className="text-[13px] text-slate-600 leading-relaxed mb-4">"Kartu ini sangat membantu memfilter prospek yang masuk. AI saya bisa menjelaskan pricelist jasa konsultasi saya bahkan ketika saya sedang tidur."</p>
            <div className="font-primary text-xs font-semibold text-slate-900">Randi Christian</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Software Agency Owner</div>
          </div>
          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm shadow-slate-100/40 hover:shadow-md rounded-xl p-6 text-left transition-all duration-300">
            <p className="text-[13px] text-slate-600 leading-relaxed mb-4">"Klien saya sangat terkesan saat melihat AI asisten saya langsung merespon pertanyaan portofolio desain saya. Konversi closing jasa naik drastis."</p>
            <div className="font-primary text-xs font-semibold text-slate-900">Clara Amanda</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Freelance UI/UX Designer</div>
          </div>
          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm shadow-slate-100/40 hover:shadow-md rounded-xl p-6 text-left transition-all duration-300">
            <p className="text-[13px] text-slate-600 leading-relaxed mb-4">"Dokumen pricing jasa yang rumit bisa dijawab AI dengan sangat presisi. Setup-nya sangat gampang, tinggal upload PDF company profile saja."</p>
            <div className="font-primary text-xs font-semibold text-slate-900">Budi Santoso</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Tax Consultant</div>
          </div>
        </div>
      </section>

      {/* ─── Features Section ─────────────────────────── */}
      <section className="px-4 sm:px-8 py-20 text-center max-w-[1200px] mx-auto" id="features">
        <h2 className="font-primary text-2xl sm:text-3xl font-bold mb-3 text-slate-900 tracking-tight">Fitur Utama</h2>
        <p className="text-sm text-slate-600 max-w-[480px] mx-auto mb-16 leading-relaxed">
          Segala yang Anda butuhkan untuk mengotomatiskan interaksi prospek dan membangun brand modern.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1020px] mx-auto text-left">
          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md rounded-xl p-6 transition-all duration-300">
            <div className="text-[10px] font-bold text-accent-primary uppercase tracking-widest mb-3">01 / INSTANT ANSWER</div>
            <h3 className="font-primary font-semibold text-sm text-slate-900 mb-2">AI Chatbot 24/7</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              AI terlatih menjawab pertanyaan tentang pricelist, jam kerja, atau layanan Anda secara instan.
            </p>
          </div>

          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md rounded-xl p-6 transition-all duration-300">
            <div className="text-[10px] font-bold text-accent-primary uppercase tracking-widest mb-3">02 / QR SCAN</div>
            <h3 className="font-primary font-semibold text-sm text-slate-900 mb-2">QR Code Instan</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Dapatkan berkas QR Code siap cetak beresolusi tinggi untuk dipasang di kartu nama fisik.
            </p>
          </div>

          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md rounded-xl p-6 transition-all duration-300">
            <div className="text-[10px] font-bold text-accent-primary uppercase tracking-widest mb-3">03 / NO CODE</div>
            <h3 className="font-primary font-semibold text-sm text-slate-900 mb-2">Setup 5 Menit</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Cukup unggah portofolio atau katalog PDF Anda, AI akan langsung mempelajari datanya.
            </p>
          </div>

          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md rounded-xl p-6 transition-all duration-300">
            <div className="text-[10px] font-bold text-accent-primary uppercase tracking-widest mb-3">04 / SECURE LINK</div>
            <h3 className="font-primary font-semibold text-sm text-slate-900 mb-2">Zero-Login Experience</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Akses kontrol instan tanpa sandi. Update kapan saja melalui link masuk aman via email.
            </p>
          </div>

          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md rounded-xl p-6 transition-all duration-300">
            <div className="text-[10px] font-bold text-accent-primary uppercase tracking-widest mb-3">05 / AUTO UPDATE</div>
            <h3 className="font-primary font-semibold text-sm text-slate-900 mb-2">Selalu Terkini</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Ada perubahan profil atau revisi portofolio? Upload file baru, AI terupdate otomatis.
            </p>
          </div>

          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md rounded-xl p-6 transition-all duration-300">
            <div className="text-[10px] font-bold text-accent-primary uppercase tracking-widest mb-3">06 / MODERN DESIGN</div>
            <h3 className="font-primary font-semibold text-sm text-slate-900 mb-2">Tampilan Minimalis</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Halaman publik berdesain premium, cerah, dan responsif di semua perangkat mobile.
            </p>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─────────────────────────────── */}
      <section className="px-4 sm:px-8 py-20 text-center max-w-[1200px] mx-auto border-y border-slate-100 bg-slate-50/50" id="how-it-works">
        <h2 className="font-primary text-2xl sm:text-3xl font-bold mb-3 text-slate-900 tracking-tight">Cara Kerja</h2>
        <p className="text-sm text-slate-600 max-w-[400px] mx-auto mb-16 leading-relaxed">Luncurkan asisten AI bisnis Anda dalam 3 langkah mudah.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-[960px] mx-auto">
          <div className="p-6 text-center">
            <div className="text-xs font-bold text-accent-primary mb-3 uppercase tracking-wider">01 / CHECKOUT</div>
            <h3 className="font-primary font-semibold text-base text-slate-900 mb-2">Daftar & Pilih Paket</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">Masukkan email Anda dan lakukan verifikasi pembayaran Midtrans secara instan.</p>
          </div>
          <div className="p-6 text-center">
            <div className="text-xs font-bold text-accent-primary mb-3 uppercase tracking-wider">02 / SETUP AI</div>
            <h3 className="font-primary font-semibold text-base text-slate-900 mb-2">Unggah Profil / PDF</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">Unggah file katalog PDF atau company profile Anda untuk dipelajari AI.</p>
          </div>
          <div className="p-6 text-center">
            <div className="text-xs font-bold text-accent-primary mb-3 uppercase tracking-wider">03 / SHARE QR</div>
            <h3 className="font-primary font-semibold text-base text-slate-900 mb-2">Bagikan QR Code</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed">Gunakan link unik Anda atau cetak QR code siap pakai untuk disebarkan.</p>
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ──────────────────────────── */}
      <section className="px-4 sm:px-8 py-20 text-center max-w-[1200px] mx-auto" id="pricing">
        <h2 className="font-primary text-2xl sm:text-3xl font-bold mb-3 text-slate-900 tracking-tight">Paket Langganan</h2>
        <p className="text-sm text-slate-600 max-w-[400px] mx-auto mb-16 leading-relaxed">Investasi terjangkau untuk asisten penjualan otomatis 24/7.</p>
        
        <div className="flex justify-center gap-8 max-w-[840px] mx-auto flex-wrap items-stretch">
          {/* Standard Plan */}
          <div className="bg-white border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md rounded-xl p-8 flex flex-col items-start text-left flex-1 min-w-0 w-full sm:min-w-[280px] max-w-[360px] transition-all duration-300">
            <h3 className="font-primary text-lg font-bold text-slate-900 mb-2">Standard</h3>
            <div className="mb-6 flex items-baseline">
              <span className="text-xs text-slate-500">Rp</span>
              <span className="text-3xl font-bold text-slate-900 mx-1">35.000</span>
              <span className="text-[10px] text-slate-400">/bulan</span>
            </div>
            <p className="text-[11px] text-slate-500 mb-8">Cocok untuk portofolio pribadi & pengenalan bisnis awal.</p>
            
            <ul className="list-none p-0 m-0 mb-9 flex flex-col gap-3 w-full text-[13px] text-slate-600">
              <li className="flex items-center gap-2"><span>•</span> 1 Dokumen PDF (Maks 2MB, 5 hal)</li>
              <li className="flex items-center gap-2"><span>•</span> AI Chatbot 24/7</li>
              <li className="flex items-center gap-2"><span>•</span> Maksimal 3 Produk / Jasa</li>
              <li className="flex items-center gap-2"><span>•</span> Maksimal 3 Tautan Sosial</li>
              <li className="flex items-center gap-2"><span>•</span> QR Code Standar</li>
              <li className="flex items-center gap-2"><span>•</span> Limit Chat (10 pesan/jam)</li>
            </ul>
            
            <button 
              className="w-full mt-auto py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all rounded-md cursor-pointer text-center"
              onClick={() => {
                setTier("standard");
                setIsModalOpen(true);
              }}
            >
              Pilih Standard
            </button>
          </div>

          {/* Pro Plan */}
          <div className="bg-white border-2 border-accent-primary shadow-lg shadow-blue-500/5 hover:shadow-xl rounded-xl p-8 flex flex-col items-start text-left flex-1 min-w-0 w-full sm:min-w-[280px] max-w-[360px] relative transition-all duration-300">
            <div className="absolute top-[-11px] left-6 bg-accent-primary text-white px-3 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase shadow-sm">Terpopuler</div>
            
            <h3 className="font-primary text-lg font-bold text-slate-900 mb-2">Pro</h3>
            
            <div className="mb-6 flex items-baseline">
              <span className="text-xs text-slate-500">Rp</span>
              <span className="text-3xl font-bold text-slate-900 mx-1">89.000</span>
              <span className="text-[10px] text-slate-400">/bulan</span>
            </div>
            
            <p className="text-[11px] text-slate-500 mb-8">Untuk profesional & bisnis aktif dengan branding kustom.</p>
            
            <ul className="list-none p-0 m-0 mb-9 flex flex-col gap-3 w-full text-[13px] text-slate-600">
              <li className="flex items-center gap-2"><span>•</span> 5 Dokumen PDF (Maks 10MB/file)</li>
              <li className="flex items-center gap-2"><span>•</span> AI Chatbot Premium (GPT-4o-mini)</li>
              <li className="flex items-center gap-2"><span>•</span> Produk & Jasa Tanpa Batas</li>
              <li className="flex items-center gap-2"><span>•</span> Tautan Sosial Tanpa Batas</li>
              <li className="flex items-center gap-2"><span>•</span> Kustomisasi Warna QR & Tema</li>
              <li className="flex items-center gap-2"><span>•</span> Desain Premium (Tanpa Watermark)</li>
              <li className="flex items-center gap-2"><span>•</span> Limit Chat (50 pesan/jam)</li>
            </ul>
            
            <button 
              className="w-full mt-auto py-2.5 text-xs font-semibold uppercase tracking-wider text-white bg-accent-primary hover:bg-accent-secondary shadow-md shadow-blue-500/10 transition-all rounded-md cursor-pointer text-center"
              onClick={() => {
                setTier("pro");
                setIsModalOpen(true);
              }}
            >
              Pilih Pro
            </button>
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ──────────────────────────────── */}
      <section className="px-4 sm:px-8 py-20 text-center max-w-[800px] mx-auto border-t border-slate-100" id="faq">
        <h2 className="font-primary text-2xl sm:text-3xl font-bold mb-3 text-slate-900 tracking-tight">FAQ</h2>
        <p className="text-sm text-slate-600 max-w-[400px] mx-auto mb-16 leading-relaxed">Informasi seputar layanan Kartu Bisnis AI.</p>
        
        <div className="flex flex-col text-left border-t border-slate-200">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className="border-b border-slate-200"
            >
              <button 
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full py-5 flex justify-between items-center bg-transparent border-none text-slate-800 hover:text-accent-primary text-sm sm:text-base font-medium font-primary cursor-pointer text-left focus:outline-none"
              >
                <span>{faq.q}</span>
                <span className="text-slate-400 text-xs transition-transform duration-300" style={{ transform: openFaq === index ? "rotate(45deg)" : "rotate(0deg)" }}>
                  ＋
                </span>
              </button>
              
              <div 
                className="transition-all duration-300 overflow-hidden" 
                style={{ maxHeight: openFaq === index ? "200px" : "0px" }}
              >
                <p className="pb-5 text-[13px] sm:text-sm text-slate-600 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA Section ──────────────────────────────── */}
      <section className="px-4 sm:px-8 py-10 pb-28">
        <div className="bg-slate-50 border border-slate-100 rounded-xl text-center px-8 py-14 max-w-[680px] mx-auto relative overflow-hidden">
          <h2 className="font-primary text-2xl sm:text-3xl font-bold mb-3 text-slate-900 tracking-tight">Mulai Otomatisasi Bisnis Anda</h2>
          <p className="text-[13px] text-slate-600 max-w-[420px] mx-auto mb-8 leading-relaxed">
            Daftar sekarang untuk melayani klien via barcode pintar bertenaga AI.
          </p>
          <button
            className="inline-flex items-center justify-center gap-2 py-3 px-8 font-primary text-xs font-semibold uppercase tracking-wider bg-accent-primary text-white hover:bg-accent-secondary active:scale-[0.98] transition-all rounded-md cursor-pointer shadow-md shadow-blue-500/10"
            onClick={handleGetStarted}
            id="cta-bottom-button"
          >
            Mulai Uji Coba 7 Hari
          </button>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-12 px-4 sm:px-8 bg-slate-50/50 backdrop-blur-md">
        <div className="flex justify-between items-start max-w-[1000px] mx-auto mb-8 flex-wrap gap-8 text-left">
          <div>
            <h3 className="font-primary text-sm font-bold text-slate-900 mb-1">AI Business Card</h3>
            <p className="text-xs text-slate-500">Kartu nama digital pintar bertenaga AI chatbot.</p>
          </div>
          <div className="flex gap-8">
            <a href="#features" className="text-xs text-slate-500 hover:text-accent-primary transition-colors">Fitur</a>
            <a href="#how-it-works" className="text-xs text-slate-500 hover:text-accent-primary transition-colors">Cara Kerja</a>
            <a href="mailto:support@yourdomain.com" className="text-xs text-slate-500 hover:text-accent-primary transition-colors">Kontak</a>
          </div>
        </div>
        <div className="text-center pt-6 border-t border-slate-100 max-w-[1000px] mx-auto">
          <p className="text-xs text-slate-400">© 2026 AI Business Card. Hak Cipta Dilindungi.</p>
        </div>
      </footer>

      {/* ─── Registration Modal ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-5 animate-fade-in" onClick={() => { if (paymentStatus === "idle" || paymentStatus === "error") setIsModalOpen(false); }}>
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-[440px] max-h-[85vh] overflow-y-auto shadow-2xl animate-fade-in-up flex flex-col text-left" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4.5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-primary text-base font-bold text-slate-900">Buat Kartu Bisnis AI</h2>
              <button 
                className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-md text-slate-500 text-lg cursor-pointer transition-all hover:bg-slate-100 hover:text-slate-800" 
                onClick={() => setIsModalOpen(false)}
                disabled={paymentStatus === "creating_transaction" || paymentStatus === "verifying_payment"}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {paymentStatus === "success" ? (
                <div className="flex flex-col items-center justify-center py-6 px-2 text-center animate-fade-in">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 mb-5 shadow-sm shadow-emerald-500/5">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3 className="font-primary font-bold text-base text-slate-900 mb-2">Pembayaran Berhasil! 🎉</h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-5">
                    QR Code dan link setup asisten AI Anda telah dikirimkan ke email:<br />
                    <strong className="text-slate-800 mt-1 inline-block">{email}</strong>
                  </p>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 w-full text-left flex flex-col gap-2.5 mb-5 text-[11px] text-slate-500">
                    <p className="font-semibold text-slate-700 m-0">Langkah Setup Selanjutnya:</p>
                    <ol className="list-decimal pl-4 m-0 flex flex-col gap-1.5 text-slate-600 leading-relaxed">
                      <li>Buka inbox email Anda (cek folder Spam/Promosi jika tidak ada).</li>
                      <li>Buka email selamat datang dari <strong>AI Business Card</strong>.</li>
                      <li>Klik link <strong>Setup Kartu Bisnis</strong> di dalam email untuk mulai mengisi info & upload dokumen PDF.</li>
                      <li>Gunakan QR Code terlampir untuk dibagikan ke calon klien.</li>
                    </ol>
                  </div>
                  <button 
                    type="button"
                    className="w-full py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all rounded-md cursor-pointer text-center"
                    onClick={() => {
                      setIsModalOpen(false);
                      setPaymentStatus("idle");
                    }}
                  >
                    Selesai & Tutup
                  </button>
                </div>
              ) : paymentStatus === "verifying_payment" ? (
                <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
                  <div className="w-10 h-10 border-2 border-accent-primary border-l-transparent rounded-full animate-spin mb-6" />
                  <h3 className="font-primary font-bold text-base text-slate-900 mb-2">Memproses Pembayaran...</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Mohon tunggu sebentar, kami sedang memverifikasi transaksi Anda.</p>
                </div>
              ) : paymentStatus === "creating_transaction" ? (
                <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
                  <div className="w-10 h-10 border-2 border-accent-primary border-l-transparent rounded-full animate-spin mb-6" />
                  <h3 className="font-primary font-bold text-base text-slate-900 mb-2">Menghubungi Midtrans...</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Menyiapkan pembayaran aman via Midtrans...</p>
                </div>
              ) : (
                <form onSubmit={handleRegisterAndPay}>
                  {error && (
                    <div className="bg-error/10 border border-error/20 text-error px-4 py-2.5 rounded-lg text-xs mb-5">
                      {error}
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Email *</label>
                    <input
                      className="w-full py-2.5 px-3.5 text-base sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all duration-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/5"
                      type="email"
                      required
                      placeholder="email@contoh.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      id="register-email-input"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Nama Lengkap *</label>
                    <input
                      className="w-full py-2.5 px-3.5 text-base sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all duration-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/5"
                      type="text"
                      required
                      placeholder="Nama Anda yang tertera di kartu"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      id="register-name-input"
                    />
                  </div>

                  <div className="mb-4.5">
                    <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Bio / Deskripsi Singkat</label>
                    <textarea
                      className="w-full py-2.5 px-3.5 text-base sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all duration-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/5 min-h-[80px]"
                      placeholder="Contoh: Freelance Web Developer spesialis React..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      id="register-bio-input"
                    />
                  </div>

                  <div className="mb-5">
                    <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2.5">Pilihan Paket Langganan</label>
                    <div className="flex gap-3">
                      <label style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "8px",
                        border: `1px solid ${tier === "standard" ? "var(--color-accent-primary)" : "rgba(15, 23, 42, 0.08)"}`,
                        background: tier === "standard" ? "rgba(0, 119, 182, 0.04)" : "transparent",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        transition: "all 150ms ease"
                      }}>
                        <input
                          type="radio"
                          name="tier"
                          value="standard"
                          checked={tier === "standard"}
                          onChange={() => setTier("standard")}
                          className="hidden"
                        />
                        <span className="font-bold text-xs text-slate-900">Standard</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Rp 35.000 / bln</span>
                      </label>
                      
                      <label style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "8px",
                        border: `1px solid ${tier === "pro" ? "var(--color-accent-primary)" : "rgba(15, 23, 42, 0.08)"}`,
                        background: tier === "pro" ? "rgba(0, 119, 182, 0.04)" : "transparent",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        transition: "all 150ms ease"
                      }}>
                        <input
                          type="radio"
                          name="tier"
                          value="pro"
                          checked={tier === "pro"}
                          onChange={() => setTier("pro")}
                          className="hidden"
                        />
                        <span className="font-bold text-xs text-slate-900">Pro</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Rp 89.000 / bln</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 mt-5">
                    <button 
                      type="button" 
                      className="inline-flex items-center justify-center py-2 px-5 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer transition-all" 
                      onClick={() => setIsModalOpen(false)}
                      disabled={paymentStatus === "waiting_payment"}
                    >
                      Batal
                    </button>
                    <button 
                      type="submit" 
                      className="inline-flex items-center justify-center py-2 px-5 text-xs font-semibold uppercase tracking-wider bg-accent-primary text-white hover:bg-accent-secondary rounded-md cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                      disabled={paymentStatus === "waiting_payment"}
                      id="register-submit-button"
                    >
                      Bayar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
