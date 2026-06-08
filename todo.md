# Backlog & Daftar Tugas (Todo List) Fitur Baru

Dokumen ini berisi spesifikasi dan daftar tugas implementasi untuk fitur-fitur baru platform CardAI.

---

## 1. Fitur: Zero Login & Persistent Session Architecture

Fitur ini menghilangkan kebutuhan halaman login konvensional (username/password) bagi pengguna CardAI, menggantinya dengan mekanisme otentikasi berbasis Magic Link dan Secure Cookies jangka panjang.

### 📋 Daftar Tugas (Todo List)
- [ ] **Backend**: Implementasikan setting cookie pada endpoint verifikasi `/api/auth/verify/{token}` dengan `httponly=True`, `secure=True`, `samesite="lax"`, dan `max_age=2592000` (30 hari).
- [ ] **Backend**: Buat endpoint baru `POST /api/auth/request-refresh` menerima `uid` anonim dan mengirimkan email berisi magic link baru.
- [ ] **Backend**: Buat endpoint baru `POST /api/auth/logout` untuk menghapus cookie `session_token` (set `max_age=0`).
- [ ] **Backend**: Buat dependency baru `get_current_user_from_cookie` untuk memvalidasi token sesi dari cookie pada semua rute terproteksi.
- [ ] **Frontend**: Implementasikan silent authentication & URL cleanup di dashboard dan onboarding page (verifikasi token, set cookie, lalu hapus query parameters via `router.replace`).
- [ ] **Frontend**: Desain UI recovery frictionless (smart expired state) dengan tombol `[ Kirim Link Akses Baru ]`.
- [ ] **Frontend**: Implementasikan penyimpanan email tersamar dan `uid` pemulihan di `localStorage` saat berhasil onboarding.
- [ ] **Frontend**: Ubah tombol Sign Out menjadi "Clear Session" yang memicu request logout ke backend dan membersihkan data sesi lokal.

### 🔍 Detail Spesifikasi
* **Silent Authentication & URL Cleanup**: Saat pengguna masuk lewat link email `/dashboard?token=xyz...&uid=abc...`, token divalidasi senyap lalu address bar dibersihkan menggunakan `router.replace('/dashboard')` guna mencegah kebocoran link.
* **Cookie Keamanan Tinggi**: Token sesi disimpan dalam HttpOnly Cookie (`httponly=True`, `secure=True`, `samesite="lax"`) berdurasi 30 hari untuk melindungi dari serangan XSS dan CSRF.
* **Smart Expired State**: Jika sesi kedaluwarsa, tampilkan layar pemulihan sederhana dengan tombol kirim link akses baru instan menggunakan email tersamar dari `localStorage`.
* **Pro Option (Dual Cookies)**: Dukungan sistem dual cookie (`session_token` aktif 7 hari & `refresh_token` aktif 90 hari) untuk silent refresh jangka panjang tanpa interupsi pengguna.

---

## 2. Fitur: AI Router & Infrastruktur Hemat Token

Menggunakan trik multi-router API gratisan (seperti Groq, Gemini, dll.) dengan sistem fallback otomatis ke model berbayar murah. Infrastruktur diamankan dengan `slowapi` untuk rate-limiting per IP dan pembatasan ukuran PDF untuk menghemat token RAG.

### 📋 Daftar Tugas (Todo List)
- [ ] **Backend**: Pasang library `slowapi` pada FastAPI untuk menerapkan rate limit per IP pada endpoint publik `/api/chat/{slug}`.
- [ ] **Backend**: Implementasikan LLM Router yang mendukung rotasi API gratisan (seperti Groq Free, Gemini Free) dengan fallback otomatis ke model berbayar murah (seperti GPT-4o-mini).
- [ ] **Backend**: Tambahkan validasi ukuran berkas PDF pada upload endpoint untuk membatasi ukuran file (misal maks 5MB) dan jumlah halaman agar token tetap irit.
- [ ] **Backend**: Batasi jumlah embedding chunk maksimal per user untuk menjaga efisiensi database vector dan token.
- [ ] **Backend**: Buat logger monitoring kuota token/API serta mekanisme deteksi error untuk memicu rotasi kunci API otomatis (*failover*).

### 🔍 Detail Spesifikasi
* **Multi-API Router**: Mengintegrasikan router LLM yang mencoba memanggil API gratis terlebih dahulu (misal: Llama 3 via Groq Free API, Gemini Flash Free API) sebelum melakukan fallback ke API berbayar murah (misal: GPT-4o-mini).
* **Rate-Limiting (SlowAPI)**: Membatasi query chatbot publik per IP untuk mencegah abuse/scrappers yang menghabiskan kuota token RAG.
* **Pembatasan Ukuran PDF**: Validasi ukuran berkas PDF sebelum parsing/embedding guna meminimalkan biaya token dan overhead komputasi vector DB.

---

