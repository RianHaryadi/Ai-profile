"use client";

import { useState, useEffect, use } from "react";
import ChatBot from "@/components/ChatBot";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Product {
  name: string;
  description?: string;
  price?: string;
}

interface Profile {
  name: string | null;
  bio: string | null;
  photo_url: string | null;
  links: Record<string, string> | null;
  products: (string | Product)[] | null;
  is_active: boolean;
  subscription_tier?: string;
  custom_theme?: Record<string, string> | null;
  qr_style?: Record<string, string> | null;
}

const linkIcons: Record<string, string> = {
  website: "🌐",
  instagram: "📸",
  linkedin: "💼",
  whatsapp: "💬",
  tiktok: "🎵",
  youtube: "🎬",
  github: "💻",
  email: "📧",
};

export default function CardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [presetQuestions, setPresetQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "profile">("profile");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch profile and preset questions in parallel
        const [profileRes, presetsRes] = await Promise.all([
          fetch(`${API_URL}/api/profile/${slug}`),
          fetch(`${API_URL}/api/chat/${slug}/preset-questions`),
        ]);

        if (!profileRes.ok) {
          throw new Error("Kartu tidak ditemukan");
        }

        const profileData = await profileRes.json();
        setProfile(profileData);

        if (presetsRes.ok) {
          const presetsData = await presetsRes.json();
          setPresetQuestions(presetsData.questions || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <main className="relative z-10 min-h-screen px-5 py-10 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-accent-primary rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Memuat kartu bisnis...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="relative z-10 min-h-screen px-5 py-10 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl">😕</div>
          <h2 className="text-xl font-bold text-slate-900">Kartu Tidak Ditemukan</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </main>
    );
  }

  const isPro = profile?.subscription_tier === "pro" || profile?.subscription_tier === "lifetime";
  const customTheme = profile?.custom_theme || {};
  
  const mainStyle: React.CSSProperties = isPro && customTheme.bg_start && customTheme.bg_end ? {
    background: `linear-gradient(135deg, ${customTheme.bg_start}, ${customTheme.bg_end})`,
    color: customTheme.text_color || undefined,
  } : {};

  return (
    <main className="relative z-10 min-h-screen px-4 sm:px-6 py-10 flex flex-col justify-center overflow-x-hidden w-full" style={mainStyle}>
      {/* Subtle background gradient */}
      <div className="absolute w-[800px] h-[800px] rounded-full top-[-200px] left-1/2 -translate-x-1/2 pointer-events-none z-[-1] bg-[radial-gradient(circle,rgba(0,119,182,0.04),transparent_70%)]" />

      <div className="max-w-[950px] mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-start mt-4">
        {/* Mobile Tab Switcher (Visible only on small devices) */}
        <div className="flex md:hidden gap-1 bg-slate-50 border border-slate-200 p-1 rounded-xl w-full col-span-1">
          <button
            className={`flex-1 py-2.5 px-3 text-center bg-transparent border-none text-slate-400 text-sm font-semibold rounded-lg transition-all cursor-pointer font-primary ${
              activeTab === "profile" ? "!bg-accent-primary/10 !text-accent-primary" : ""
            }`}
            onClick={() => setActiveTab("profile")}
          >
            Info Profil
          </button>
          <button
            className={`flex-1 py-2.5 px-3 text-center bg-transparent border-none text-slate-400 text-sm font-semibold rounded-lg transition-all cursor-pointer font-primary ${
              activeTab === "chat" ? "!bg-accent-primary/10 !text-accent-primary" : ""
            }`}
            onClick={() => setActiveTab("chat")}
          >
            Tanya AI
          </button>
        </div>

        {/* ─── Profile Header / Info Column ───────────────── */}
        <section className={`col-span-1 md:block ${activeTab === "profile" ? "" : "max-md:hidden"}`}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-6 text-center items-center">
            <div className="relative w-28 h-28">
              {profile?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photo_url.startsWith("http") ? profile.photo_url : `${API_URL}${profile.photo_url}`}
                  alt={profile.name || "Profile"}
                  className="w-28 h-28 rounded-full object-cover border-2 border-slate-200 shadow-md"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-accent-primary flex items-center justify-center text-4xl font-extrabold text-white shadow-md shadow-blue-500/20">
                  {(profile?.name || slug)?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              {profile?.is_active && (
                <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-3 border-white rounded-full shadow-sm" />
              )}
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              <h1 className="font-primary text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {profile?.name || slug}
              </h1>
              <span className="text-[0.7rem] uppercase font-bold tracking-widest text-slate-400">Digital Card Profile</span>
            </div>

            {profile?.bio && (
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 w-full text-center">
                {profile.bio}
              </p>
            )}

            {/* Social Links */}
            {profile?.links && Object.keys(profile.links).length > 0 && (
              <div className="flex gap-2 flex-wrap justify-center w-full mt-2">
                {Object.entries(profile.links).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-full text-xs font-semibold text-slate-600 hover:text-accent-primary hover:border-accent-primary/20 hover:bg-accent-primary/5 transition-all"
                    title={platform}
                    id={`social-link-${platform}`}
                  >
                    <span className="text-base">{linkIcons[platform] || "🔗"}</span>
                    <span className="capitalize">{platform}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Products & Services */}
            {profile?.products && profile.products.length > 0 && (
              <div className="w-full text-left mt-4 border-t border-slate-100 pt-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Produk & Layanan</h3>
                <div className="flex flex-col gap-3">
                  {profile.products.map((prod, idx) => {
                    const isObj = typeof prod === "object" && prod !== null;
                    const name = isObj ? (prod as Product).name : (prod as string);
                    const price = isObj ? (prod as Product).price : "";
                    const desc = isObj ? (prod as Product).description : "";

                    return (
                      <div key={idx} className="bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl p-4 transition-all duration-300 hover:shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-baseline gap-2 mb-1">
                          <span className="font-semibold text-slate-800 text-sm sm:text-base">{name}</span>
                          {price && (
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-accent-primary/10 border border-accent-primary/20 rounded-md whitespace-nowrap text-accent-primary">
                              {price}
                            </span>
                          )}
                        </div>
                        {desc && <p className="m-0 text-xs text-slate-500 leading-relaxed mt-1.5">{desc}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── AI Chatbot Column ──────────────────────────── */}
        <section className={`col-span-1 md:block flex flex-col gap-4 ${activeTab === "chat" ? "" : "max-md:hidden"}`}>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 self-start font-semibold mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Tanyakan apa saja tentang profil ini</span>
          </div>
          <ChatBot
            slug={slug}
            profileName={profile?.name || slug}
            presetQuestions={presetQuestions}
            isActive={profile?.is_active ?? false}
          />
        </section>
      </div>

      {/* Powered by badge (Visible only for non-pro users) */}
      {!isPro && (
        <footer className="text-center text-[0.7rem] text-slate-400 mt-10 hover:text-slate-500 transition-colors">
          <span>Powered by AI Business Card — </span>
          <a href="/" className="underline text-accent-primary font-semibold">Buat Kartu AI Anda Sendiri</a>
        </footer>
      )}
    </main>
  );
}
