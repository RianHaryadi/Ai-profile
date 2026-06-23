"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function maskEmail(email: string) {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const uid = searchParams.get("uid") || "";

  const [mode, setMode] = useState<"choice" | "chat" | "upload">("choice");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Recovery States
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);
  const [cachedUid, setCachedUid] = useState<string | null>(null);
  const [cachedEmailMasked, setCachedEmailMasked] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cUid = localStorage.getItem("cardai_uid") || uid || null;
      const cEmail = localStorage.getItem("cardai_email_masked") || null;
      setCachedUid(cUid);
      setCachedEmailMasked(cEmail);
    }
  }, [uid]);

  useEffect(() => {
    if (!token || !uid) {
      setError("Link onboarding tidak valid atau tidak lengkap.");
      setVerifying(false);
      return;
    }
    verifyAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Scroll only the messages container, not the whole page.
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const verifyAccess = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/verify/${token}?uid=${uid}`);
      if (!res.ok) throw new Error("Link sudah expired atau tidak valid");
      const userData = await res.json();
      
      // Save info to localStorage for recovery
      if (typeof window !== "undefined" && userData.email && userData.user_id) {
        localStorage.setItem("cardai_uid", userData.user_id);
        localStorage.setItem("cardai_email_masked", maskEmail(userData.email));
        setCachedUid(userData.user_id);
        setCachedEmailMasked(maskEmail(userData.email));
      }

      setVerifying(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal verifikasi");
      setVerifying(false);
    }
  };

  const handleRequestRefresh = async (targetUid: string) => {
    setRecoveryLoading(true);
    setRecoveryMessage(null);
    setRecoveryError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/request-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: targetUid, source: "onboarding" })
      });
      if (!res.ok) throw new Error("Gagal mengirim link pemulihan.");
      const data = await res.json();
      setRecoveryMessage(data.message || "Link akses baru telah dikirim ke email terdaftar.");
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRequestManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail.trim()) return;
    setRecoveryLoading(true);
    setRecoveryMessage(null);
    setRecoveryError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: manualEmail.trim(), source: "onboarding" })
      });
      if (!res.ok) throw new Error("Gagal mengirim link.");
      const data = await res.json();
      setRecoveryMessage(data.message || "Jika email terdaftar, link akses akan dikirim.");
      setManualEmail("");
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const startChatOnboarding = async () => {
    setMode("chat");
    setIsLoading(true);

    try {
      const res = await fetch(
        `${API_URL}/api/onboarding/start?token=${token}&uid=${uid}`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages([{ role: "assistant", content: data.greeting }]);
      } else {
        setMessages([
          {
            role: "assistant",
            content:
              "Halo! Selamat datang! Saya akan bantu kamu setup kartu bisnis AI.\n\nBoleh ceritakan dulu, nama kamu siapa dan bergerak di bidang apa?",
          },
        ]);
      }
    } catch {
      setMessages([
        {
          role: "assistant",
          content:
            "Halo! Selamat datang! Saya akan bantu kamu setup kartu bisnis AI.\n\nBoleh ceritakan dulu, nama kamu siapa dan bergerak di bidang apa?",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(
        `${API_URL}/api/onboarding/chat?token=${token}&uid=${uid}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input.trim(),
            conversation_history: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to get response");

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);

      if (data.is_complete) {
        setIsComplete(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(
      `${API_URL}/api/documents/upload?token=${token}&uid=${uid}`,
      { method: "POST", body: formData }
    );

    if (!res.ok) {
      let errMsg = `Upload failed (Status ${res.status})`;
      try {
        const errData = await res.json();
        errMsg = errData.detail || errMsg;
      } catch {
        if (res.status === 502) {
          errMsg = "Server mengalami masalah (502 Bad Gateway). Silakan hubungi administrator atau coba lagi.";
        } else {
          errMsg = `Gagal mengupload file (Status ${res.status}).`;
        }
      }
      throw new Error(errMsg);
    }
  };

  const goToDashboard = () => {
    router.push(`/dashboard?token=${token}&uid=${uid}`);
  };

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-accent-primary rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Memverifikasi link onboarding...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-6 px-4 py-8 animate-fade-in max-w-[500px] mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-3xl shadow-sm text-amber-600">
          ⚠️
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-primary font-bold text-slate-900">Link Setup Tidak Valid</h2>
          <p className="text-sm text-slate-500 leading-relaxed">{error}</p>
        </div>

        {/* Status Alerts */}
        {recoveryMessage && (
          <div className="w-full bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl text-xs font-semibold text-left animate-fade-in">
            {recoveryMessage}
          </div>
        )}
        {recoveryError && (
          <div className="w-full bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl text-xs font-semibold text-left animate-fade-in">
            {recoveryError}
          </div>
        )}

        {/* recovery action container */}
        <div className="w-full bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left flex flex-col gap-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Minta Link Baru</h3>
          
          {cachedUid ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500 leading-relaxed m-0">
                {cachedEmailMasked ? (
                  <span>Kami mendeteksi email Anda terdaftar sebagai <strong className="text-slate-800 font-bold">{cachedEmailMasked}</strong>. Silakan klik tombol di bawah untuk mengirim link setup baru secara instan.</span>
                ) : (
                  <span>Kirim ulang link setup ke alamat email terdaftar Anda.</span>
                )}
              </p>
              <button
                onClick={() => handleRequestRefresh(cachedUid)}
                disabled={recoveryLoading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-bold text-sm bg-accent-primary hover:bg-accent-secondary text-white rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {recoveryLoading ? "Mengirim..." : "✉️ Kirim Link Setup Baru"}
              </button>
            </div>
          ) : null}

          {(!cachedUid || showManualForm) ? (
            <form onSubmit={handleRequestManual} className="flex flex-col gap-3 border-t border-slate-100 pt-3 mt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Masukkan Alamat Email Anda</label>
                <input
                  type="email"
                  required
                  placeholder="nama@email.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="w-full py-2.5 px-3.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                  disabled={recoveryLoading}
                />
              </div>
              <button
                type="submit"
                disabled={recoveryLoading || !manualEmail.trim()}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-bold text-sm bg-accent-primary hover:bg-accent-secondary text-white rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {recoveryLoading ? "Mengirim..." : "Minta Link via Email"}
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowManualForm(true)}
              className="text-xs text-accent-primary font-bold hover:underline bg-transparent border-none cursor-pointer self-start p-0 m-0"
            >
              Masukkan email secara manual
            </button>
          )}
        </div>

        <div className="flex gap-4 w-full mt-2">
          <a href="/" className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-6 font-primary font-semibold text-sm bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl cursor-pointer transition-all shadow-sm">
            Kembali ke Beranda
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[750px] mx-auto text-center relative z-10 min-h-screen px-4 py-10 flex flex-col justify-center animate-fade-in">
      <div className="mb-8 flex flex-col gap-2 text-center">
        <h1 className="font-primary text-3xl font-black text-slate-900 tracking-tight">
          Setup Kartu Bisnis AI
        </h1>
        <p className="text-xs text-slate-500 max-w-[480px] mx-auto leading-relaxed">
          Pilih cara paling praktis untuk melatih asisten AI Anda dan mengisi informasi dasar profil bisnis Anda.
        </p>
      </div>

      {/* Mode Choice */}
      {mode === "choice" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 max-w-[650px] mx-auto w-full">
          <button
            className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm transition-all duration-300 hover:border-accent-primary/30 hover:shadow-md flex flex-col items-center gap-5 cursor-pointer text-center group"
            onClick={startChatOnboarding}
            id="choice-chat"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-all duration-300">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div className="flex flex-col items-center">
              <h3 className="font-primary text-lg font-bold text-slate-900 group-hover:text-accent-primary transition-colors">
                Chat dengan AI
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed text-center">
                AI akan mengajukan beberapa pertanyaan secara ramah untuk menyusun profil dan portofolio Anda.
              </p>
            </div>
          </button>

          <button
            className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm transition-all duration-300 hover:border-accent-primary/30 hover:shadow-md flex flex-col items-center gap-5 cursor-pointer text-center group"
            onClick={() => setMode("upload")}
            id="choice-upload"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-all duration-300">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="12" y2="12"/>
                <line x1="15" y1="15" x2="12" y2="12"/>
              </svg>
            </div>
            <div className="flex flex-col items-center">
              <h3 className="font-primary text-lg font-bold text-slate-900 group-hover:text-accent-primary transition-colors">
                Upload PDF
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed text-center">
                Unggah dokumen brosur, company profile, atau portofolio bisnis. AI akan otomatis mempelajari isi dokumen.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Chat Mode */}
      {mode === "chat" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[520px] p-0 overflow-hidden text-left max-w-[650px] mx-auto w-full">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span>AI Onboarding Assistant</span>
            </div>
            <button
              onClick={() => setMode("choice")}
              className="text-slate-400 hover:text-slate-700 bg-transparent border-none cursor-pointer text-[0.75rem] transition-colors"
            >
              ← Kembali ke Pilihan
            </button>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-slate-50/30">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] items-start animate-fade-in ${
                  msg.role === "user" ? "self-end flex-row-reverse" : "self-start"
                }`}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center text-sm flex-shrink-0 border border-accent-primary/20">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
                  </div>
                )}
                <div
                  className={`p-3.5 text-sm leading-relaxed rounded-2xl whitespace-pre-line ${
                    msg.role === "user"
                      ? "bg-accent-primary text-white rounded-tr-none shadow-sm"
                      : "bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 max-w-[85%] items-start self-start">
                <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center text-sm flex-shrink-0 border border-accent-primary/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
                </div>
                <div className="p-3 text-sm leading-relaxed rounded-2xl bg-white border border-slate-200 text-slate-800 rounded-tl-none">
                  <div className="flex items-center gap-1.5 py-1 px-2">
                    <span className="w-1.5 h-1.5 bg-accent-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-accent-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-accent-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Chat Controls / Input */}
          {isComplete ? (
            <div className="flex justify-between items-center p-4 border-t border-slate-100 bg-white flex-wrap gap-3">
              <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Setup berhasil diselesaikan!
              </span>
              <button
                className="inline-flex items-center justify-center gap-2 py-2.5 px-6 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                onClick={goToDashboard}
                id="go-to-dashboard"
              >
                Lanjut ke Dashboard →
              </button>
            </div>
          ) : (
            <form
              className="flex p-4 border-t border-slate-100 bg-white gap-3 items-center"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ketik jawaban Anda..."
                className="flex-1 py-2.5 px-4 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                disabled={isLoading}
                id="onboarding-chat-input"
                autoFocus
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                disabled={isLoading || !input.trim()}
              >
                Kirim
              </button>
            </form>
          )}
        </div>
      )}

      {/* Upload Mode */}
      {mode === "upload" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm max-w-[500px] mx-auto flex flex-col gap-6 text-left w-full">
          <h3 className="font-primary text-base font-bold text-slate-900 mb-1">Unggah Portofolio / Katalog PDF</h3>
          <FileUpload onUpload={handleUpload} maxSizeMB={50} />
          <div className="flex justify-between mt-3 gap-3">
            <button
              className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all"
              onClick={() => setMode("choice")}
            >
              ← Kembali
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
              onClick={goToDashboard}
              id="upload-go-dashboard"
            >
              Lanjut ke Dashboard →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <main className="relative z-10 min-h-screen px-4 py-10 flex items-center justify-center">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-accent-primary rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Memuat halaman onboarding...</p>
          </div>
        }
      >
        <OnboardingContent />
      </Suspense>
    </main>
  );
}
