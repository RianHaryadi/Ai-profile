"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import FileUpload from "@/components/FileUpload";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const APP_URL = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001");

interface UserInfo {
  user_id: string;
  slug: string;
  email: string;
  subscription_tier?: string;
}

interface Document {
  id: string;
  filename: string;
  status: string;
  created_at: string;
}

interface Product {
  name: string;
  description: string;
  price: string;
}

interface ProfileData {
  name: string;
  bio: string;
  links: Record<string, string>;
  products: Product[];
  custom_theme?: Record<string, string>;
  qr_style?: Record<string, string>;
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

function maskEmail(email: string) {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const uid = searchParams.get("uid") || "";

  const [user, setUser] = useState<UserInfo | null>(null);
  const [appUrl, setAppUrl] = useState("https://aidonext.com");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin);
    }
  }, []);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    bio: "",
    links: {},
    products: [],
    custom_theme: {},
    qr_style: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "documents" | "branding" | "qr">("profile");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductDesc, setNewProductDesc] = useState("");
  const [newLinkPlatform, setNewLinkPlatform] = useState("");
  const [customPlatform, setCustomPlatform] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

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
      setError("Link akses tidak valid. Silakan minta link baru via email.");
      setLoading(false);
      return;
    }
    verifyAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, uid]);

  const handleRequestRefresh = async (targetUid: string) => {
    setRecoveryLoading(true);
    setRecoveryMessage(null);
    setRecoveryError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/request-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: targetUid, source: "dashboard" })
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
        body: JSON.stringify({ email: manualEmail.trim(), source: "dashboard" })
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

  const verifyAndLoad = async () => {
    try {
      // Verify token
      const verifyRes = await fetch(
        `${API_URL}/api/auth/verify/${token}?uid=${uid}`
      );
      if (!verifyRes.ok) throw new Error("Token tidak valid atau sudah expired");
      const userData = await verifyRes.json();
      setUser(userData);

      // Save info to localStorage for recovery
      if (typeof window !== "undefined" && userData.email && userData.user_id) {
        localStorage.setItem("cardai_uid", userData.user_id);
        localStorage.setItem("cardai_email_masked", maskEmail(userData.email));
        setCachedUid(userData.user_id);
        setCachedEmailMasked(maskEmail(userData.email));
      }

      // Load profile and documents
      const [profileRes, docsRes] = await Promise.all([
        fetch(`${API_URL}/api/profile/${userData.slug}`),
        fetch(`${API_URL}/api/documents/?token=${token}&uid=${uid}`),
      ]);

      if (profileRes.ok) {
        const p = await profileRes.json();
        // Sanitize products to make sure they are objects
        const sanitizedProducts = (p.products || []).map((prod: any) => {
          if (typeof prod === "string") {
            return { name: prod, description: "", price: "" };
          }
          return {
            name: prod.name || "",
            description: prod.description || "",
            price: prod.price || "",
          };
        });

        setProfile({
          name: p.name || "",
          bio: p.bio || "",
          links: p.links || {},
          products: sanitizedProducts,
          custom_theme: p.custom_theme || {},
          qr_style: p.qr_style || {},
        });
        setPhotoUrl(p.photo_url || null);
      }

      if (docsRes.ok) {
        setDocuments(await docsRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(
        `${API_URL}/api/profile/?token=${token}&uid=${uid}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        }
      );
      if (!res.ok) throw new Error("Gagal menyimpan");
      setSaveMessage("Profil berhasil disimpan!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage("Gagal menyimpan profil");
    } finally {
      setSaving(false);
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

    // Refresh documents list
    const docsRes = await fetch(
      `${API_URL}/api/documents/?token=${token}&uid=${uid}`
    );
    if (docsRes.ok) setDocuments(await docsRes.json());
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await fetch(
        `${API_URL}/api/documents/${docId}?token=${token}&uid=${uid}`,
        { method: "DELETE" }
      );
      setDocuments(documents.filter((d) => d.id !== docId));
    } catch {
      alert("Gagal menghapus dokumen");
    }
  };

  const addProduct = () => {
    if (newProductName.trim()) {
      setProfile({
        ...profile,
        products: [
          ...(profile.products || []),
          {
            name: newProductName.trim(),
            description: newProductDesc.trim(),
            price: newProductPrice.trim(),
          },
        ],
      });
      setNewProductName("");
      setNewProductPrice("");
      setNewProductDesc("");
    }
  };

  const removeProduct = (idx: number) => {
    setProfile({
      ...profile,
      products: profile.products.filter((_, i) => i !== idx),
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      alert("Format file tidak didukung. Gunakan JPG, PNG, atau WebP.");
      return;
    }

    // Validate size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran file maksimal 5MB");
      return;
    }

    setIsUploadingPhoto(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        `${API_URL}/api/profile/photo?token=${token}&uid=${uid}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Gagal mengunggah foto");
      }

      // Fetch public profile to get the presigned URL
      const profileRes = await fetch(`${API_URL}/api/profile/${user?.slug || ""}`);
      if (profileRes.ok) {
        const p = await profileRes.json();
        setPhotoUrl(p.photo_url || null);
      }

      setSaveMessage("Foto profil berhasil diupload!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || "Gagal mengunggah foto");
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const addLink = () => {
    const platform = newLinkPlatform === "custom" ? customPlatform : newLinkPlatform;
    if (platform.trim() && newLinkUrl.trim()) {
      setProfile({
        ...profile,
        links: {
          ...profile.links,
          [platform.trim().toLowerCase()]: newLinkUrl.trim(),
        },
      });
      setNewLinkPlatform("");
      setCustomPlatform("");
      setNewLinkUrl("");
    }
  };

  const removeLink = (platform: string) => {
    const newLinks = { ...profile.links };
    delete newLinks[platform];
    setProfile({ ...profile, links: newLinks });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-accent-primary rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Memverifikasi akses...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-6 px-4 py-8 animate-fade-in max-w-[500px] mx-auto animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-3xl shadow-sm text-amber-600">
          ⚠️
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-primary font-bold text-slate-900">Akses Ditolak</h2>
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
                  <span>Kami mendeteksi email Anda terdaftar sebagai <strong className="text-slate-800 font-bold">{cachedEmailMasked}</strong>. Silakan klik tombol di bawah untuk mengirim link akses baru secara instan.</span>
                ) : (
                  <span>Kirim ulang link akses baru ke alamat email terdaftar Anda.</span>
                )}
              </p>
              <button
                onClick={() => handleRequestRefresh(cachedUid)}
                disabled={recoveryLoading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-bold text-sm bg-accent-primary hover:bg-accent-secondary text-white rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer border-none"
              >
                {recoveryLoading ? "Mengirim..." : "✉️ Kirim Link Akses Baru"}
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
                  className="w-full py-2.5 px-3.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400 font-primary"
                  disabled={recoveryLoading}
                />
              </div>
              <button
                type="submit"
                disabled={recoveryLoading || !manualEmail.trim()}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-bold text-sm bg-accent-primary hover:bg-accent-secondary text-white rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer border-none"
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

  const userTier = (user?.subscription_tier || "standard").toLowerCase();
  const isPro = userTier === "pro" || userTier === "lifetime";

  const tabs = [
    { id: "profile", label: "Profil" },
    { id: "documents", label: "Dokumen AI" },
    { id: "branding", label: "Kustomisasi" },
    { id: "qr", label: "QR Code" },
  ];

  return (
    <div className="relative z-10 min-h-screen px-4 sm:px-6 py-10 max-w-[850px] mx-auto animate-fade-in">
      {/* ─── Header ──────────────────────────────── */}
      <header className="flex justify-between items-center mb-8 flex-wrap gap-4 text-left bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-primary text-3xl font-black text-slate-900">
              Dashboard
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-[0.7rem] font-bold tracking-wider text-white uppercase ${
                userTier === "lifetime"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-600 border border-amber-400/40"
                  : userTier === "pro"
                  ? "bg-accent-primary border border-accent-primary/40"
                  : "bg-slate-200 border border-slate-300 text-slate-600"
              }`}
            >
              {userTier === "lifetime" ? "Lifetime Pro" : `${userTier} plan`}
            </span>
          </div>
          <div className="flex flex-col gap-2 mt-4 text-xs text-slate-500">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 w-fit max-w-full overflow-hidden">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-slate-400 flex-shrink-0" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span className="truncate text-slate-500 max-w-full">
                Akun: <strong className="text-slate-800 break-all select-all">{user?.email}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 w-fit max-w-full overflow-hidden">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-slate-400 flex-shrink-0" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span className="truncate text-slate-500 max-w-full">
                Link Kartu:{" "}
                <a
                  href={`${appUrl}/card/${user?.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline font-bold transition-all break-all select-all"
                >
                  {appUrl}/card/{user?.slug}
                </a>
              </span>
            </div>
          </div>
        </div>
        <a
          href={`${appUrl}/card/${user?.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 py-2 px-4 font-primary font-semibold text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all max-sm:w-full"
          id="view-card-button"
        >
          Lihat Kartu Anda
        </a>
      </header>

      {/* ─── Tabs ────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-50 border border-slate-200 p-1.5 rounded-2xl mb-8 overflow-x-auto whitespace-nowrap scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`flex-1 sm:flex-none py-3 px-4 text-center text-sm font-semibold rounded-xl transition-all duration-300 cursor-pointer border-none font-primary flex items-center justify-center gap-2 shrink-0 ${
              activeTab === tab.id
                ? "bg-white border border-slate-200 text-accent-primary shadow-sm"
                : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
            }`}
            onClick={() => setActiveTab(tab.id as any)}
            id={`tab-${tab.id}`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─────────────────────────── */}
      <div className="w-full">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-8 text-left">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Profil Bisnis</h2>
              <p className="text-xs text-slate-400 mt-1">Sesuaikan info diri, kontak, dan layanan yang ditampilkan pada kartu bisnis Anda.</p>
            </div>

            {/* Foto Profil */}
            <div className="flex flex-col items-center sm:flex-row gap-5 bg-slate-50 border border-slate-100 p-6 rounded-2xl">
              <div className="relative w-24 h-24 flex-shrink-0">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl.startsWith("http") ? photoUrl : `${API_URL}${photoUrl}`}
                    alt="Foto Profil"
                    className="w-24 h-24 rounded-full object-cover border-2 border-slate-200 shadow-md"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-accent-primary flex items-center justify-center text-3xl font-black text-white shadow-md shadow-blue-500/20">
                    {profile.name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                {isUploadingPhoto && (
                  <div className="absolute inset-0 bg-white/80 rounded-full flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-accent-primary rounded-full animate-spin" />
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-center sm:items-start gap-2">
                <span className="text-sm font-semibold text-slate-800">Foto Profil Anda</span>
                <span className="text-xs text-slate-400 text-center sm:text-left">Format: JPG, PNG, atau WebP. Maksimal 5MB.</span>
                <label className="inline-flex items-center justify-center gap-1.5 py-2 px-4 font-primary font-semibold text-xs bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all mt-1 shadow-sm">
                  {isUploadingPhoto ? "Mengunggah..." : "Ganti Foto"}
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={isUploadingPhoto}
                  />
                </label>
              </div>
            </div>

            {/* Data Dasar */}
            <div className="flex flex-col gap-5 bg-slate-50 border border-slate-100 p-6 rounded-2xl">
              <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider">Info Dasar</div>
              
              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-500 font-semibold uppercase tracking-wider">Nama Lengkap / Bisnis</label>
                <input
                  className="w-full py-2.5 px-4 text-base sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                  placeholder="Nama lengkap Anda atau bisnis Anda"
                  id="profile-name-input"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-500 font-semibold uppercase tracking-wider">Bio Singkat</label>
                <textarea
                  className="w-full py-2.5 px-4 text-base sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400 resize-vertical min-h-[100px]"
                  value={profile.bio}
                  onChange={(e) =>
                    setProfile({ ...profile, bio: e.target.value })
                  }
                  placeholder="Tulis bio singkat tentang Anda, keahlian, atau deskripsi bisnis..."
                  rows={4}
                  id="profile-bio-input"
                />
              </div>
            </div>

            {/* Products & Services */}
            <div className="flex flex-col gap-5 bg-slate-50 border border-slate-100 p-6 rounded-2xl">
              <div className="flex justify-between items-center">
                <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider">Produk & Layanan</div>
                <span className="text-xs text-slate-400 px-2 py-0.5 bg-white rounded border border-slate-200 font-mono">
                  {profile.products?.length || 0} / {userTier === "standard" ? 3 : "Unlimited"}
                </span>
              </div>
              
              {/* Product cards list */}
              {profile.products && profile.products.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {profile.products.map((p, idx) => (
                    <div key={idx} className="relative group bg-white border border-slate-200 rounded-xl p-4 transition-all duration-300 hover:border-slate-300 hover:shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-baseline gap-2 mb-1.5">
                          <span className="font-primary font-bold text-slate-800 group-hover:text-accent-primary transition-colors">{p.name}</span>
                          {p.price && (
                            <span className="text-accent-primary font-semibold text-xs px-2 py-0.5 bg-accent-primary/10 border border-accent-primary/20 rounded-md whitespace-nowrap">
                              {p.price}
                            </span>
                          )}
                        </div>
                        {p.description && <p className="m-0 text-xs text-slate-500 leading-relaxed mb-6">{p.description}</p>}
                      </div>
                      <button
                        onClick={() => removeProduct(idx)}
                        className="self-end px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-500 cursor-pointer text-xs transition-colors flex items-center gap-1"
                        title="Hapus produk"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-white border border-dashed border-slate-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-slate-400" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <p className="text-xs text-slate-400">Belum ada produk atau layanan ditambahkan</p>
                </div>
              )}

              {/* Product inputs */}
              {userTier === "standard" && (profile.products?.length || 0) >= 3 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-4 text-xs flex items-center gap-2">
                  <span>Kuota paket Standard terbatas pada 3 produk. Upgrade ke Pro untuk tambah sepuasnya!</span>
                </div>
              ) : (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                  <span className="text-xs font-semibold text-slate-500">Tambah Produk / Layanan Baru</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">Nama Produk *</label>
                      <input
                        className="w-full py-2.5 px-4 text-base sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder="misal: Konsultasi Website"
                        id="add-product-name-input"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">Harga</label>
                      <input
                        className="w-full py-2.5 px-4 text-base sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                        value={newProductPrice}
                        onChange={(e) => setNewProductPrice(e.target.value)}
                        placeholder="misal: Rp 1,5 jt"
                        id="add-product-price-input"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">Deskripsi Layanan</label>
                    <input
                      className="w-full py-2.5 px-4 text-base sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                      value={newProductDesc}
                      onChange={(e) => setNewProductDesc(e.target.value)}
                      placeholder="Jelaskan secara singkat penawaran layanan Anda..."
                      id="add-product-desc-input"
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-4 font-primary font-semibold text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all self-end"
                    onClick={addProduct}
                    disabled={!newProductName.trim()}
                    id="add-product-button"
                  >
                    + Tambah Produk
                  </button>
                </div>
              )}
            </div>

            {/* Social Links */}
            <div className="flex flex-col gap-5 bg-slate-50 border border-slate-100 p-6 rounded-2xl">
              <div className="flex justify-between items-center">
                <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider">Link Sosial Media</div>
                <span className="text-xs text-slate-400 px-2 py-0.5 bg-white rounded border border-slate-200 font-mono">
                  {Object.keys(profile.links || {}).length} / {userTier === "standard" ? 3 : "Unlimited"}
                </span>
              </div>
              
              {/* Links list */}
              {Object.keys(profile.links || {}).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(profile.links || {}).map(([platform, url]) => (
                    <div key={platform} className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl text-sm transition-all hover:border-slate-300">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg">{linkIcons[platform] || "🔗"}</span>
                        <div className="flex flex-col min-w-0 text-left">
                          <span className="font-semibold text-slate-800 capitalize text-xs">{platform}</span>
                          <span className="text-[0.75rem] text-slate-400 truncate">{url as string}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeLink(platform)}
                        className="w-7 h-7 flex items-center justify-center bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-500 hover:text-red-600 transition-colors cursor-pointer text-sm"
                        title="Hapus link"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-white border border-dashed border-slate-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-slate-400" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                  <p className="text-xs text-slate-400">Belum ada link sosial media</p>
                </div>
              )}

              {/* Add Link Input */}
              {userTier === "standard" && Object.keys(profile.links || {}).length >= 3 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-4 text-xs flex items-center gap-2">
                  <span>Kuota paket Standard terbatas pada 3 link sosial media. Upgrade ke Pro untuk tambah sepuasnya!</span>
                </div>
              ) : (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                  <span className="text-xs font-semibold text-slate-500">Tambah Link Sosial Media</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">Pilih Platform</label>
                      <select
                        className="w-full py-2.5 px-4 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10"
                        value={newLinkPlatform}
                        onChange={(e) => setNewLinkPlatform(e.target.value)}
                        id="add-link-platform-select"
                      >
                        <option value="">-- Pilih Platform --</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="instagram">Instagram</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="tiktok">TikTok</option>
                        <option value="twitter">Twitter / X</option>
                        <option value="youtube">YouTube</option>
                        <option value="github">GitHub</option>
                        <option value="website">Website Mandiri</option>
                        <option value="email">Email</option>
                        <option value="custom">Kustom (Ketik Sendiri)</option>
                      </select>
                    </div>

                    {newLinkPlatform === "custom" && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">Nama Platform Kustom</label>
                        <input
                          className="w-full py-2.5 px-4 text-base sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                          value={customPlatform}
                          onChange={(e) => setCustomPlatform(e.target.value)}
                          placeholder="misal: Telegram, Pinterest, dll"
                          id="add-link-custom-platform"
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-1">
                      <label className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">Link URL / Nomor</label>
                      <input
                        className="w-full py-2.5 px-4 text-base sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                        value={newLinkUrl}
                        onChange={(e) => setNewLinkUrl(e.target.value)}
                        placeholder={
                          newLinkPlatform === "whatsapp" 
                            ? "Contoh: https://wa.me/62812xxx" 
                            : newLinkPlatform === "email" 
                            ? "Contoh: admin@bisnis.com" 
                            : "https://..."
                        }
                        id="add-link-url-input"
                      />
                    </div>
                  </div>
                  <button 
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-4 font-primary font-semibold text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all self-end" 
                    onClick={addLink}
                    disabled={!newLinkUrl.trim() || (!newLinkPlatform.trim() && newLinkPlatform !== "custom") || (newLinkPlatform === "custom" && !customPlatform.trim())}
                  >
                    + Tambah Link
                  </button>
                </div>
              )}
            </div>

            {/* Save Section */}
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 p-5 rounded-2xl">
              <button
                className="inline-flex items-center justify-center gap-2 py-2.5 px-6 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                onClick={handleSaveProfile}
                disabled={saving}
                id="save-profile-button"
              >
                {saving ? "Menyimpan..." : "Simpan Perubahan Profil"}
              </button>
              {saveMessage && (
                <span className="text-sm text-emerald-600 font-semibold animate-fade-in">{saveMessage}</span>
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-6 text-left">
            <div className="flex justify-between items-baseline flex-wrap gap-2 mb-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Dokumen AI (Knowledge Base)</h2>
                <p className="text-xs text-slate-400 mt-1">Upload file katalog atau profil bisnis Anda. AI akan dilatih menggunakan data ini.</p>
              </div>
              <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-50 rounded border border-slate-200 font-mono font-bold">
                Kuota: {documents.length} / {userTier === "standard" ? "1" : userTier === "lifetime" ? "Unlimited" : "5"} PDF
              </span>
            </div>

            <FileUpload onUpload={handleUpload} maxSizeMB={userTier === "lifetime" ? 50 : isPro ? 20 : 2} />

            {documents.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-6 text-left">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Daftar Dokumen Aktif</h3>
                <div className="flex flex-col gap-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl transition-all hover:border-slate-200">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-accent-primary/10 flex items-center justify-center flex-shrink-0">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-primary" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold text-slate-800 truncate">{doc.filename}</span>
                          <span className="text-[0.7rem] text-slate-400 mt-0.5">Diupload pada: {new Date(doc.created_at).toLocaleDateString("id-ID")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 py-1 px-3 bg-accent-primary/10 text-accent-primary border border-accent-primary/20 rounded-full text-[0.75rem] font-semibold uppercase tracking-wider">
                          {doc.status === "processed" ? "Selesai" : doc.status}
                        </span>
                        <button
                          className="w-8 h-8 flex items-center justify-center bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-500 cursor-pointer transition-colors"
                          onClick={() => handleDeleteDoc(doc.id)}
                          title="Hapus Dokumen"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Branding Tab */}
        {activeTab === "branding" && (
          !isPro ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center py-16 px-6 sm:px-10 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl">🔒</div>
              <h2 className="text-2xl font-primary font-bold text-slate-900">Kustomisasi Premium (Pro)</h2>
              <p className="max-w-[460px] mx-auto text-slate-500 text-sm leading-relaxed">
                Buka kebebasan penuh dalam personalisasi warna landing page, kombinasi warna gradient premium, custom style QR Code, serta hilangkan branding watermark &quot;Powered by CardAI&quot;.
              </p>
              <a href="/#pricing" className="inline-flex items-center justify-center gap-2 py-2.5 px-6 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10 mt-4" id="upgrade-pro-button">
                Upgrade ke Pro Sekarang
              </a>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-8 text-left">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Kustomisasi Tema & Visual</h2>
                <p className="text-xs text-slate-400 mt-1">Gunakan kode warna (Hex) untuk membuat kartu nama Anda selaras dengan brand identity Anda.</p>
              </div>
              
              {/* Card Color Pickers */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl flex flex-col gap-6">
                <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider">Warna Latar Belakang (Gradient)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden cursor-pointer" style={{ backgroundColor: profile.custom_theme?.bg_start || "#111827" }}>
                      <input
                        type="color"
                        value={profile.custom_theme?.bg_start || "#111827"}
                        onChange={(e) => setProfile({
                          ...profile,
                          custom_theme: { ...(profile.custom_theme || {}), bg_start: e.target.value }
                        })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-600">Gradient Awal (Start)</span>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 uppercase">{profile.custom_theme?.bg_start || "#111827"}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden cursor-pointer" style={{ backgroundColor: profile.custom_theme?.bg_end || "#1f2937" }}>
                      <input
                        type="color"
                        value={profile.custom_theme?.bg_end || "#1f2937"}
                        onChange={(e) => setProfile({
                          ...profile,
                          custom_theme: { ...(profile.custom_theme || {}), bg_end: e.target.value }
                        })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-600">Gradient Akhir (End)</span>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 uppercase">{profile.custom_theme?.bg_end || "#1f2937"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text and Accent Color Pickers */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl flex flex-col gap-6">
                <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider">Warna Aksen & Teks</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden cursor-pointer" style={{ backgroundColor: profile.custom_theme?.text_color || "#ffffff" }}>
                      <input
                        type="color"
                        value={profile.custom_theme?.text_color || "#ffffff"}
                        onChange={(e) => setProfile({
                          ...profile,
                          custom_theme: { ...(profile.custom_theme || {}), text_color: e.target.value }
                        })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-600">Warna Teks Utama</span>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 uppercase">{profile.custom_theme?.text_color || "#ffffff"}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden cursor-pointer" style={{ backgroundColor: profile.custom_theme?.accent_color || "#0077b6" }}>
                      <input
                        type="color"
                        value={profile.custom_theme?.accent_color || "#0077b6"}
                        onChange={(e) => setProfile({
                          ...profile,
                          custom_theme: { ...(profile.custom_theme || {}), accent_color: e.target.value }
                        })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-600">Warna Aksen Tombol</span>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 uppercase">{profile.custom_theme?.accent_color || "#0077b6"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* QR Styles */}
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl flex flex-col gap-6">
                <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider">Visual Kode QR</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden cursor-pointer" style={{ backgroundColor: profile.qr_style?.fg_color || "#000000" }}>
                      <input
                        type="color"
                        value={profile.qr_style?.fg_color || "#000000"}
                        onChange={(e) => setProfile({
                          ...profile,
                          qr_style: { ...(profile.qr_style || {}), fg_color: e.target.value }
                        })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-600">Warna Kode QR</span>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 uppercase">{profile.qr_style?.fg_color || "#000000"}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden cursor-pointer" style={{ backgroundColor: profile.qr_style?.bg_color || "#ffffff" }}>
                      <input
                        type="color"
                        value={profile.qr_style?.bg_color || "#ffffff"}
                        onChange={(e) => setProfile({
                          ...profile,
                          qr_style: { ...(profile.qr_style || {}), bg_color: e.target.value }
                        })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-600">Warna Latar Belakang QR</span>
                      <span className="text-xs text-slate-400 font-mono mt-0.5 uppercase">{profile.qr_style?.bg_color || "#ffffff"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                <button
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-6 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                  onClick={handleSaveProfile}
                  disabled={saving}
                  id="save-branding-button"
                >
                  {saving ? "Menyimpan..." : "Simpan Kustomisasi Tema"}
                </button>
                {saveMessage && (
                  <span className="text-sm text-emerald-600 font-semibold animate-fade-in">{saveMessage}</span>
                )}
              </div>
            </div>
          )
        )}

        {/* QR Code Tab */}
        {activeTab === "qr" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-6 animate-fade-in text-left">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Kode QR Kartu Bisnis</h2>
              <p className="text-xs text-slate-400 mt-1">Download QR Code ini untuk dicetak pada kartu nama fisik, kemasan, atau dibagikan langsung.</p>
            </div>

            <div className="flex items-center gap-8 flex-wrap justify-center bg-slate-50 border border-slate-100 p-8 rounded-2xl">
              <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-200 max-w-[240px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_URL}/api/qr/${user?.slug}?format=png`}
                  alt="QR Code"
                  className="w-[200px] h-[200px] block rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-5 text-center sm:text-left flex-1 min-w-[240px]">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Tautan Kode QR:</div>
                <div className="font-mono text-xs text-accent-primary px-4 py-2.5 bg-white rounded-xl border border-slate-200 truncate select-all">
                  {APP_URL}/card/{user?.slug}
                </div>
                <div className="flex gap-2 flex-wrap justify-center sm:justify-start">
                  <a
                    href={`${API_URL}/api/qr/${user?.slug}/download?format=png`}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-4 font-primary font-semibold text-xs bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                    download
                    id="download-qr-png"
                  >
                    Download PNG
                  </a>
                  <a
                    href={`${API_URL}/api/qr/${user?.slug}/download?format=svg`}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-4 font-primary font-semibold text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all"
                    download
                    id="download-qr-svg"
                  >
                    Download SVG
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="relative z-10 min-h-screen px-4 py-10 overflow-x-hidden w-full">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-accent-primary rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Memuat dashboard...</p>
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </main>
  );
}
