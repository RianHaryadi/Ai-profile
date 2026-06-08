"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const APP_URL = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001");

interface Product {
  name: string;
  description: string;
  price: string;
}

interface UserProfile {
  name: string | null;
  bio: string | null;
  photo_url: string | null;
  links: Record<string, string>;
  products: Product[];
}

interface UserData {
  id: string;
  email: string;
  slug: string;
  is_active: boolean;
  subscription_tier?: string;
  created_at: string | null;
  card_link: string;
  profile: UserProfile | null;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [appUrl, setAppUrl] = useState("https://aidonext.com");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin);
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Auth states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Modal states
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserData | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLinks, setEditLinks] = useState<{ platform: string; url: string }[]>([]);
  const [editProducts, setEditProducts] = useState<Product[]>([]);
  const [editSubscriptionTier, setEditSubscriptionTier] = useState("standard");
  const [saving, setSaving] = useState(false);

  // Add form state
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addBio, setAddBio] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // ─── Fetch Users ─────────────────────────────────
  const fetchUsers = useCallback(async () => {
    const token = localStorage.getItem("adminToken");
    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/dev/users`, {
        headers: {
          "X-Admin-Token": token,
        },
      });

      if (res.status === 401) {
        localStorage.removeItem("adminToken");
        setIsAuthenticated(false);
        throw new Error("Sesi berakhir");
      }

      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      showToast("Gagal memuat data user");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      setIsAuthenticated(true);
      fetchUsers();
    } else {
      setLoading(false);
    }
  }, [fetchUsers]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await fetch(`${API_URL}/api/dev/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Username atau password salah");
        }
        throw new Error("Gagal login ke server");
      }

      const data = await res.json();
      localStorage.setItem("adminToken", data.token);
      setIsAuthenticated(true);

      // Fetch users
      setLoading(true);
      await fetchUsers();
    } catch (err: any) {
      setLoginError(err.message || "Terjadi kesalahan koneksi.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    setIsAuthenticated(false);
    setUsers([]);
    setUsername("");
    setPassword("");
  };

  // ─── Toast ────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ─── Toggle Active ────────────────────────────────
  const handleToggleActive = async (user: UserData) => {
    const token = localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/dev/users/${user.id}/toggle-active`, {
        method: "PUT",
        headers: {
          "X-Admin-Token": token || "",
        },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: data.is_active } : u))
      );
      showToast(data.message);
    } catch {
      showToast("Gagal mengubah status");
    }
  };

  // ─── Login As User ────────────────────────────────
  const handleLoginAsUser = async (user: UserData) => {
    const token = localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/dev/users/${user.id}/login-link`, {
        method: "POST",
        headers: {
          "X-Admin-Token": token || "",
        },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      window.open(data.dashboard_link, "_blank");
    } catch {
      showToast("Gagal membuat link login");
    }
  };

  // ─── Open Edit Modal ──────────────────────────────
  const openEditModal = (user: UserData) => {
    setEditUser(user);
    setEditName(user.profile?.name || "");
    setEditBio(user.profile?.bio || "");
    setEditLinks(
      Object.entries(user.profile?.links || {}).map(([platform, url]) => ({
        platform,
        url: url as string,
      }))
    );
    setEditProducts(
      (user.profile?.products || []).map((p) => ({
        name: typeof p === "string" ? p : (p as Product).name || "",
        description: typeof p === "string" ? "" : (p as Product).description || "",
        price: typeof p === "string" ? "" : (p as Product).price || "",
      }))
    );
    setEditSubscriptionTier(user.subscription_tier || "standard");
  };

  // ─── Save Profile ─────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editUser) return;
    setSaving(true);

    const token = localStorage.getItem("adminToken");
    const linksObj: Record<string, string> = {};
    editLinks.forEach((l) => {
      if (l.platform.trim()) linksObj[l.platform.trim().toLowerCase()] = l.url.trim();
    });

    try {
      const res = await fetch(`${API_URL}/api/dev/users/${editUser.id}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": token || "",
        },
        body: JSON.stringify({
          name: editName,
          bio: editBio,
          links: linksObj,
          products: editProducts.filter((p) => p.name.trim()),
          subscription_tier: editSubscriptionTier,
        }),
      });
      if (!res.ok) throw new Error();
      showToast("Profil berhasil disimpan!");
      setEditUser(null);
      fetchUsers();
    } catch {
      showToast("Gagal menyimpan profil");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete User ──────────────────────────────────
  const handleDelete = async () => {
    if (!deleteUser) return;
    const token = localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/dev/users/${deleteUser.id}`, {
        method: "DELETE",
        headers: {
          "X-Admin-Token": token || "",
        },
      });
      if (!res.ok) throw new Error();
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
      showToast(`${deleteUser.email} berhasil dihapus`);
      setDeleteUser(null);
    } catch {
      showToast("Gagal menghapus user");
    }
  };

  // ─── Add User ─────────────────────────────────────
  const handleAddUser = async () => {
    if (!addEmail.trim()) return;
    setAddSaving(true);
    const token = localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/dev/seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": token || "",
        },
        body: JSON.stringify({
          email: addEmail.trim(),
          name: addName.trim() || "New User",
          bio: addBio.trim() || "Akun baru untuk testing.",
        }),
      });
      if (!res.ok) throw new Error();
      showToast("User baru berhasil dibuat!");
      setAddModalOpen(false);
      setAddEmail("");
      setAddName("");
      setAddBio("");
      fetchUsers();
    } catch {
      showToast("Gagal membuat user");
    } finally {
      setAddSaving(false);
    }
  };

  // ─── Links helpers ────────────────────────────────
  const updateLink = (idx: number, field: "platform" | "url", value: string) => {
    setEditLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };
  const removeLink = (idx: number) => {
    setEditLinks((prev) => prev.filter((_, i) => i !== idx));
  };
  const addLink = () => {
    setEditLinks((prev) => [...prev, { platform: "", url: "" }]);
  };

  // ─── Products helpers ─────────────────────────────
  const updateProduct = (idx: number, field: keyof Product, value: string) => {
    setEditProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };
  const removeProduct = (idx: number) => {
    setEditProducts((prev) => prev.filter((_, i) => i !== idx));
  };
  const addProduct = () => {
    setEditProducts((prev) => [...prev, { name: "", description: "", price: "" }]);
  };

  // ─── Filtered users ───────────────────────────────
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.slug.toLowerCase().includes(q) ||
      (u.profile?.name || "").toLowerCase().includes(q)
    );
  });

  const activeCount = users.filter((u) => u.is_active).length;

  // ─── Loading ──────────────────────────────────────
  if (loading) {
    return (
      <main className="relative z-10 min-h-screen px-5 py-10">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-accent-primary rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Memuat data admin...</p>
        </div>
      </main>
    );
  }

  // ─── Authentication View ──────────────────────────
  if (!isAuthenticated) {
    return (
      <main className="relative z-10 min-h-screen px-5 py-10 flex items-center justify-center bg-slate-50/20">
        <div className="w-full max-w-[420px] mx-auto flex flex-col gap-6" style={{ width: "100%" }}>
          <div className="bg-white border border-slate-200/80 shadow-lg rounded-2xl p-8 w-full transition-all duration-300 hover:shadow-xl relative overflow-hidden">
            {/* Elegant Top Gradient Accent */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-tertiary" />
            
            <div className="flex flex-col items-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary mb-4 shadow-sm shadow-accent-primary/5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1 className="font-primary text-2xl font-black text-slate-900 tracking-tight">Admin Login</h1>
              <p className="text-xs text-slate-400 mt-1">Sistem Otomatisasi Kartu Bisnis AI</p>
            </div>
            
            <form onSubmit={handleLogin} className="flex flex-col gap-5 text-left">
              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-xs flex items-center gap-2.5 animate-fade-in">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span>{loginError}</span>
                </div>
              )}
              
              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider">Username</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/50 border border-slate-200 focus:bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10 placeholder-slate-400"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    id="admin-username-input"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/50 border border-slate-200 focus:bg-white rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10 placeholder-slate-400"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    id="admin-password-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-3 py-3 font-primary font-bold text-sm bg-accent-primary text-white hover:bg-accent-secondary active:scale-[0.98] rounded-xl cursor-pointer transition-all shadow-md shadow-accent-primary/15 flex justify-center items-center gap-2"
                disabled={isLoggingIn}
                id="admin-login-submit"
              >
                {isLoggingIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Mencocokkan Kredensial...</span>
                  </>
                ) : (
                  <span>Masuk Ke Dashboard</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 min-h-screen px-4 sm:px-6 py-10 max-w-[1200px] mx-auto">
      {/* ─── Header ──────────────────────────────── */}
      <header className="flex justify-between items-center mb-8 flex-wrap gap-4 text-left bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-primary text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Admin Panel</h1>
            <span className="bg-amber-50 border border-amber-200 text-amber-600 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase">DEV MODE</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Masuk sebagai: <strong className="text-slate-700 font-semibold">{username || "Admin"}</strong>
          </p>
        </div>
        <div className="flex gap-2.5 max-sm:w-full">
          <button
            className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-bold text-xs uppercase tracking-wider bg-accent-primary text-white hover:bg-accent-secondary active:scale-[0.98] rounded-xl cursor-pointer transition-all shadow-md shadow-accent-primary/15 flex-1 sm:flex-initial"
            onClick={() => setAddModalOpen(true)}
            id="add-user-button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Tambah User</span>
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-bold text-xs uppercase tracking-wider bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl cursor-pointer transition-all active:scale-[0.98] flex-1 sm:flex-initial"
            onClick={handleLogout}
            id="logout-button"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ─── Stats ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
          <div className="flex flex-col text-left">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total User</span>
            <span className="text-3xl font-black text-slate-900 mt-1">{users.length}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary shadow-sm shadow-accent-primary/5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
          <div className="flex flex-col text-left">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Aktif</span>
            <span className="text-3xl font-black text-slate-900 mt-1">{activeCount}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm shadow-emerald-500/5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
          <div className="flex flex-col text-left">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Nonaktif</span>
            <span className="text-3xl font-black text-slate-900 mt-1">{users.length - activeCount}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </div>
          <div className="flex flex-col text-left">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nonaktif</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{users.length - activeCount}</div>
          </div>
        </div>
      </div>

      {/* ─── Table ───────────────────────────────── */}
      <div className="bg-white rounded-2xl p-0 overflow-hidden mb-8 border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 flex-wrap gap-4">
          <span className="font-primary text-lg font-bold text-slate-900">Daftar User</span>
          <div className="relative w-full max-w-[300px] max-md:max-w-full">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="w-full py-2.5 pl-10 pr-4 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10 placeholder-slate-400 focus:bg-white"
              placeholder="Cari nama, email, atau slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              id="search-users-input"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-xl mb-4">📭</div>
            <p className="text-slate-400">{search ? "Tidak ada user yang cocok" : "Belum ada user. Klik '+ Tambah User' untuk mulai."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="px-6 py-4 bg-slate-50/80 text-slate-400 font-semibold border-b border-slate-100 uppercase text-xs tracking-wider">User</th>
                  <th className="px-6 py-4 bg-slate-50/80 text-slate-400 font-semibold border-b border-slate-100 uppercase text-xs tracking-wider">Slug</th>
                  <th className="px-6 py-4 bg-slate-50/80 text-slate-400 font-semibold border-b border-slate-100 uppercase text-xs tracking-wider">Status</th>
                  <th className="px-6 py-4 bg-slate-50/80 text-slate-400 font-semibold border-b border-slate-100 uppercase text-xs tracking-wider">Paket</th>
                  <th className="px-6 py-4 bg-slate-50/80 text-slate-400 font-semibold border-b border-slate-100 uppercase text-xs tracking-wider">Produk</th>
                  <th className="px-6 py-4 bg-slate-50/80 text-slate-400 font-semibold border-b border-slate-100 uppercase text-xs tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/20 transition-colors">
                    <td className="px-6 py-4 text-slate-600 align-middle">
                      <div className="flex items-center gap-3">
                        {user.profile?.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.profile.photo_url.startsWith("http") ? user.profile.photo_url : `${API_URL}${user.profile.photo_url}`}
                            alt={user.profile?.name || "Avatar"}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200/80 shadow-sm"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-sm font-bold text-accent-primary uppercase shadow-sm">
                            {(user.profile?.name || user.slug)?.[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                        <div className="flex flex-col text-left">
                          <span className="font-semibold text-slate-800">
                            {user.profile?.name || "—"}
                          </span>
                          <span className="text-xs text-slate-400">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 align-middle">
                      <a
                        href={`${appUrl}/card/${user.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-accent-primary hover:text-accent-secondary font-bold transition-all inline-flex items-center gap-1 group whitespace-nowrap"
                        title="Buka Kartu Bisnis Klien"
                      >
                        <span>{user.slug}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-slate-400 group-hover:text-accent-primary transition-colors" strokeWidth="3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    </td>
                    <td className="px-6 py-4 text-slate-600 align-middle">
                      <button
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          user.is_active 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200/80 hover:bg-emerald-100/50" 
                            : "bg-slate-50 text-slate-400 border-slate-200/80 hover:bg-slate-100/50"
                        }`}
                        onClick={() => handleToggleActive(user)}
                        title="Klik untuk ubah status aktif"
                        id={`toggle-active-${user.id}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                        {user.is_active ? "Aktif" : "Nonaktif"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-slate-600 align-middle">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                        user.subscription_tier === "lifetime"
                          ? "bg-amber-50 text-amber-600 border-amber-200"
                          : user.subscription_tier === "pro"
                          ? "bg-accent-primary/10 text-accent-primary border-accent-primary/20"
                          : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}>
                        {user.subscription_tier || "standard"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 align-middle">
                      <span className="px-2.5 py-1 bg-slate-50 border border-slate-200/60 rounded-lg text-slate-600 text-xs font-semibold">
                        {user.profile?.products?.length || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 align-middle">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary border border-accent-primary/20 hover:bg-accent-primary hover:text-white transition-all cursor-pointer active:scale-95 shadow-sm shadow-accent-primary/5"
                          onClick={() => handleLoginAsUser(user)}
                          id={`login-user-${user.id}`}
                          title="Login ke Dashboard User"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        </button>
                        <a
                          href={`${appUrl}/card/${user.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800 transition-all active:scale-95 shadow-sm"
                          title="Buka Kartu Bisnis Klien"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </a>
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800 transition-all cursor-pointer active:scale-95 shadow-sm"
                          onClick={() => openEditModal(user)}
                          id={`edit-user-${user.id}`}
                          title="Edit User & Paket"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
                        </button>
                        <a
                          href={`${API_URL}/api/qr/${user.slug}?format=png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800 transition-all active:scale-95 shadow-sm"
                          title="Lihat QR Code"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        </a>
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 hover:text-red-700 transition-all cursor-pointer active:scale-95 shadow-sm"
                          onClick={() => setDeleteUser(user)}
                          id={`delete-user-${user.id}`}
                          title="Hapus User"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Edit Profile Modal ─── */}
      {editUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-5 animate-fade-in" onClick={() => setEditUser(null)}>
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-[620px] max-h-[85vh] overflow-y-auto shadow-xl animate-fade-in-up flex flex-col text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-7 py-5 border-b border-slate-100">
              <h2 className="font-primary text-lg font-bold text-slate-900">Edit Profil — {editUser.email}</h2>
              <button className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-md text-slate-400 text-lg cursor-pointer transition-all hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditUser(null)}>
                ×
              </button>
            </div>

            <div className="px-7 py-6 overflow-y-auto max-h-[60vh] flex flex-col gap-5">
              <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider">Informasi Dasar</div>

              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Nama</label>
                <input
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama lengkap"
                  id="edit-name-input"
                />
              </div>

              <div className="flex flex-col gap-2.5">
                <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider">Paket / Subscription Tier</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: "standard", label: "Standard", desc: "Fitur standar bisnis", activeColor: "border-slate-400 bg-slate-50 text-slate-800" },
                    { id: "pro", label: "Pro", desc: "Fitur AI premium lengkap", activeColor: "border-accent-primary bg-accent-primary/5 text-accent-primary ring-1 ring-accent-primary/20" },
                    { id: "lifetime", label: "Lifetime", desc: "Akses selamanya tanpa limit", activeColor: "border-amber-500 bg-amber-50/5 text-amber-700 ring-1 ring-amber-500/20" }
                  ].map((t) => (
                    <label
                      key={t.id}
                      className={`flex flex-col p-3 border rounded-xl cursor-pointer transition-all ${
                        editSubscriptionTier === t.id
                          ? `${t.activeColor} font-semibold`
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="edit-tier"
                        value={t.id}
                        checked={editSubscriptionTier === t.id}
                        onChange={() => setEditSubscriptionTier(t.id)}
                        className="hidden"
                      />
                      <span className="text-xs font-bold">{t.label}</span>
                      <span className="text-[9px] text-slate-400 font-medium mt-1 leading-normal">{t.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Bio</label>
                <textarea
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400 resize-vertical min-h-[80px]"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Deskripsi singkat tentang user..."
                  rows={3}
                  id="edit-bio-input"
                />
              </div>

              <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider mt-2">Social Links</div>

              <div className="flex flex-col gap-2.5">
                {editLinks.map((link, idx) => (
                  <div key={idx} className="flex gap-2.5 items-center">
                    <input
                      className="w-full max-w-[120px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                      value={link.platform}
                      onChange={(e) => updateLink(idx, "platform", e.target.value)}
                      placeholder="Platform"
                    />
                    <input
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                      value={link.url}
                      onChange={(e) => updateLink(idx, "url", e.target.value)}
                      placeholder="https://..."
                    />
                    <button
                      className="w-7 h-7 flex items-center justify-center text-lg text-red-500 hover:bg-red-50 rounded cursor-pointer transition-all"
                      onClick={() => removeLink(idx)}
                      title="Hapus link"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button className="self-start text-xs font-semibold text-accent-primary border border-slate-200 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all mt-2 cursor-pointer" onClick={addLink}>
                + Tambah Link
              </button>

              <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider mt-4">
                Produk / Layanan
              </div>

              {editProducts.map((product, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col gap-3 relative">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Produk #{idx + 1}</span>
                    <button
                      className="w-7 h-7 flex items-center justify-center text-lg text-red-500 hover:bg-red-50 rounded cursor-pointer transition-all"
                      onClick={() => removeProduct(idx)}
                      title="Hapus produk"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex gap-2.5">
                      <input
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                        value={product.name}
                        onChange={(e) => updateProduct(idx, "name", e.target.value)}
                        placeholder="Nama produk/layanan"
                      />
                      <input
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                        value={product.price}
                        onChange={(e) => updateProduct(idx, "price", e.target.value)}
                        placeholder="Harga"
                      />
                    </div>
                    <input
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                      value={product.description}
                      onChange={(e) => updateProduct(idx, "description", e.target.value)}
                      placeholder="Deskripsi singkat"
                    />
                  </div>
                </div>
              ))}
              <button className="self-start text-xs font-semibold text-accent-primary border border-slate-200 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all mt-2 cursor-pointer" onClick={addProduct}>
                + Tambah Produk
              </button>
            </div>

            <div className="flex justify-end gap-3 px-7 py-5 border-t border-slate-100">
              <button className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all" onClick={() => setEditUser(null)}>
                Batal
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                onClick={handleSaveProfile}
                disabled={saving}
                id="save-edit-button"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add User Modal ─── */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-5 animate-fade-in" onClick={() => setAddModalOpen(false)}>
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-[500px] max-h-[85vh] overflow-y-auto shadow-xl animate-fade-in-up flex flex-col text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-7 py-5 border-b border-slate-100">
              <h2 className="font-primary text-lg font-bold text-slate-900">Tambah User</h2>
              <button className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-md text-slate-400 text-lg cursor-pointer transition-all hover:bg-slate-100 hover:text-slate-700" onClick={() => setAddModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="px-7 py-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Email *</label>
                <input
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                  id="add-email-input"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Nama</label>
                <input
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Nama lengkap"
                  id="add-name-input"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Bio</label>
                <textarea
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/10 placeholder-slate-400 resize-vertical min-h-[80px]"
                  value={addBio}
                  onChange={(e) => setAddBio(e.target.value)}
                  placeholder="Deskripsi singkat..."
                  rows={3}
                  id="add-bio-input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-7 py-5 border-t border-slate-100">
              <button className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all" onClick={() => setAddModalOpen(false)}>
                Batal
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-accent-primary text-white hover:bg-accent-secondary rounded-lg cursor-pointer transition-all shadow-sm shadow-blue-500/10"
                onClick={handleAddUser}
                disabled={addSaving || !addEmail.trim()}
                id="confirm-add-button"
              >
                {addSaving ? "Membuat..." : "Buat User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {deleteUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-5 animate-fade-in" onClick={() => setDeleteUser(null)}>
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-[400px] max-h-[85vh] overflow-y-auto shadow-xl animate-fade-in-up flex flex-col text-center p-5" onClick={(e) => e.stopPropagation()}>
            <div className="py-6 flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-xl mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-red-500" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h2 className="font-primary text-xl font-bold text-slate-900 mb-2">Hapus User?</h2>
              <p className="text-sm text-slate-500 mb-4">
                Semua data user ini akan dihapus permanen:
              </p>
              <p className="font-bold text-slate-800 text-base mb-2">{deleteUser.email}</p>
              <p className="text-xs text-slate-400 mt-1">
                Slug: {deleteUser.slug}
              </p>
            </div>

            <div className="flex justify-center gap-3 py-3">
              <button className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg cursor-pointer transition-all" onClick={() => setDeleteUser(null)}>
                Batal
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 py-2.5 px-5 font-primary font-semibold text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg cursor-pointer transition-all"
                onClick={handleDelete}
                id="confirm-delete-button"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-white border border-slate-200 rounded-lg px-5 py-3 shadow-lg text-sm text-slate-800 animate-fade-in-up z-[2000]">
          {toast}
        </div>
      )}
    </main>
  );
}
