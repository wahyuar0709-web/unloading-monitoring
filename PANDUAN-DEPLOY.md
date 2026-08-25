# 📦 PANDUAN DEPLOY — Monitoring Unloading Warehouse v2

Aplikasi monitoring bongkar muat untuk **Operator Forklift, Admin Warehouse, dan SPV (SPB)**.
Backend: Google Apps Script + Google Sheets (melanjutkan spreadsheet `Data Unloading` yang sudah ada).
Frontend: 1 file `index.html` dengan 2 mode — **Operasi (HP)** dan **Monitor (desktop SPV)**.

---

## ⚠️ LANGKAH 0 — BACKUP (WAJIB)

Sebelum menyentuh apa pun:

1. Buka spreadsheet Google Sheets Anda
2. Menu **File > Make a copy** / **Buat salinan**
3. Simpan salinan itu sebagai arsip. Jika ada masalah, tinggal kembali ke sini.

---

## 1️⃣ PASANG KODE BACKEND

1. Buka spreadsheet > **Extensions > Apps Script** (Ekstensi > Skrip Apps)
2. **Hapus file .gs lama yang terpisah** (misal `Code.gs` lama, `Api.gs`) agar tidak bentuk nama fungsi ganda
3. Buat file baru bernama `Code.gs` → paste seluruh isi `Code.gs` dari folder ini
4. Tekan **Ctrl+S** untuk simpan

> Kolom baru (`Dock`, dst.) akan ditambahkan otomatis di ujung kanan sheet `Data Unloading`
> saat setup berjalan. Kolom lama A–S **tidak disentuh**.

---

## 2️⃣ JALANKAN SETUP SEKALI

1. Di editor Apps Script, pilih fungsi **`setupAll`** di dropdown atas → klik **Run** ▶
2. Saat diminta izin → **Review permissions** → pilih akun → **Advanced > Go to ... (unsafe)** → **Allow**
   *(peringatan ini normal karena script milik Anda sendiri)*
3. Cek **View > Logs** (Ctrl+Enter). Harus muncul: `Setup/migrasi selesai...`

Yang dibuat/diperbaiki otomatis:
| Item | Hasil |
|---|---|
| Sheet `Data Unloading` | Tambah kolom `Dock` (jika belum ada) + backfill baris lama |
| Sheet `Users` | Akun default: `admin/admin123` (ADMIN), `fauzi/fauzi123`, `risman/risman123` (OPERATOR), `spb/spb123` (SPB) |
| Sheet `AuditLog` | Jejak semua aksi user |
| Sheet `Settings/Operators/Master Supplier` | Dibuat jika belum ada (yang sudah ada tidak disentuh) |

4. Pastikan zona waktu benar: di Spreadsheet **File > Settings > Time zone = GMT+07:00 Jakarta**, dan di Apps Script **Project Settings > Time zone = Asia/Jakarta**

---

## 3️⃣ DEPLOY WEB APP

1. Klik **Deploy > New deployment** (Deplo > Deployment baru)
2. Ikon ⚙️ pilih **Web app**
3. Isi:
   - **Execute as**: **Me** (akun Anda)
   - **Who has access**: **Anyone** *(siapa pun yang punya link; tanpa login tetap tidak bisa apa-apa karena ada layer auth)*
4. Klik **Deploy** → copy **Web App URL** (berakhiran `/exec`)

> 🔄 Setiap kali kode `.gs` diubah lagi nanti:
> **Deploy > Manage deployments > ✏️ Edit > Version: New version > Deploy**
> (URL tetap sama, tidak perlu ganti di HP)

---

## 4️⃣ PASANG FRONTEND (index.html)

Simpan `index.html` ini di tempat yang mudah diakses operator & SPV. Pilih salah satu:

| Opsi | Cara | Cocok Untuk |
|---|---|---|
| **A. File lokal (paling cepat)** | Copy `index.html` ke tiap PC/HP (atau share via WA), buka dengan browser (Chrome) | Mulai cepat hari ini |
| **B. GitHub Pages** | Upload ke repo GitHub > Settings > Pages | Akses via link rapi |
| **C. Netlify Drop** | Buka app.netlify.com/drop, drag-drop file `index.html` | Link instan gratis |

**Cara pakai pertama kali (semua opsi):**
1. Buka `index.html` di browser
2. Klik **"URL Web App"** → paste URL `/exec` dari langkah 3 → tutup
3. Login dengan akun default
4. **SEGERA GANTI PASSWORD**: klik ikon 🔑 di header

---

## 5️⃣ BUAT AKUN TIM

Login sebagai `admin` → tab **🛠 Admin > 👤 Users & Login**:

| Nama | Role | Hak |
|---|---|---|
| Fauzi, Risman | **OPERATOR** | Klik status truk, jeda istirahat, selesaikan bongkar |
| Admin warehouse | **ADMIN** | Semua: input jadwal/walk-in, batalkan, koreksi data, kelola user & settings |
| SPV/SPB | **SPB** | Pantau saja (read-only) — mode Monitor desktop |

Kebiasaan penting: **nama user ADMIN yang membuat OPERATOR harus sama** dengan nama di kolom `Operators`/`PIC` (contoh: nama login "Fauzi" = seed operator "Fauzi"), karena sistem mencocokkan siapa yang memegang truk.

---

## 6️⃣ ALUR PENGGUNAAN HARIAN

```
ADMIN: input jadwal (atau OPERATOR catat walk-in saat truk datang langsung)
   ↓ kolom [📅 Dijadwalkan]
OPERATOR: klik "🚚 Truk Tiba"
   ↓ kolom [🚚 Tiba] — jam kedatangan otomatis
OPERATOR: klik "▶️ Mulai Bongkar" → pilih Dock 1/2/3
   ↓ kolom [⚙️ Sedang Bongkar] — jam mulai otomatis
(opsional) klik "☕ Jeda Istirahat" lalu "▶️ Lanjut Kerja"
   ↓ kolom R/S istirahat terisi otomatis
OPERATOR: klik "🏁 Selesaikan" → WAJIB isi QTY + Satuan + Temuan Abnormal
   ↓ kolom [✅ Selesai] — durasi tunggu & bongkar dihitung otomatis
SPB: buka link yang sama di PC → otomatis Mode Monitor (papan kanban)
```

**Mode Monitor (desktop SPV):** layar ≥1024px otomatis masuk mode monitor.
Tombol 🖱 di header untuk pindah bolak-balik; ⛶ untuk fullscreen TV ruangan;
alarm bunyi + kartu kedip merah jika truk menunggu melewati batas telat parah (default 60 menit).

---

## 7️⃣ CHECKLIST UJI (lakukan sebelum go-live)

| # | Skenario | Hasil Diharapkan |
|---|---|---|
| 1 | Login password salah 5x | Terkunci beberapa menit (anti brute-force) |
| 2 | Admin buat Jadwal | Truk muncul di kolom Dijadwalkan, ID `UNL-yyyyMMdd-nnn` |
| 3 | Operator klik Truk Tiba | Jam Kedatangan (F) + PIC terisi, Status (K) = `SUDAH DATANG` |
| 4 | Mulai Bongkar, pilih dock yg sudah dipakai truk lain | DITOLAK, pesan dock terpakai |
| 5 | Jeda istirahat → Lanjut kerja | Kolom R dan S terisi berurutan |
| 6 | Selesaikan TANPA qty | DITOLAK. Dengan lengkap → kolom I/J/K/L/M/N terisi, durasi bongkar dikurangi waktu istirahat |
| 7 | Input nopol yang masih aktif di antrean | DITOLAK (anti duplikat) |
| 8 | Login sebagai spb | Tidak ada tombol aksi sama sekali, hanya pantau |
| 9 | Admin koreksi nopol | Berubah + muncul di AuditLog |
| 10 | Matikan WiFi lalu refresh | Muncul toast merah + tombol Coba Lagi (data lama tetap tampil) |

---

## 🔧 TROUBLESHOOTING

| Masalah | Solusi |
|---|---|
| Dropdown supplier kosong | Jalankan `debugSuppliers_()` di editor, cek Logs. Pastikan kolom Status di Master Supplier berisi `active` |
| ID/jam tidak cocok dgn jam Indonesia | Set timezone spreadsheet & project = `Asia/Jakarta` (langkah 2 poin 4) |
| "Terlalu banyak percobaan gagal" saat login | Tunggu ±5 menit, atau minta admin Reset Password |
| Data lama tidak punya Dock/Status Kerja | Jalankan lagi `setupAll()` — aman, hanya mengisi yang kosong |
| Tombol aksi tidak muncul padahal sudah login | Role Anda SPB? Hanya ADMIN+OPERATOR yang bisa mengubah status |
| Gagal fetch / CORS | Pastikan URL berakhiran `/exec` (bukan `/dev`). Jika dibuka sebagai file lokal & diblokir browser, gunakan Opsi hosting B/C |
| Lupa password admin | Di sheet `Users`, hapus baris `admin` lalu jalankan `setupUsersSheet_()` manual dari editor (sheet kosong akan di-seed ulang). Atau admin lain reset lewat menu |

## 🔐 CATATAN KEAMANAN

- Password disimpan sebagai hash SHA-256 (tidak ada plain text)
- Kredensial dikirim pada setiap request via HTTPS Apps Script (stateless, simpel)
- Di sisi browser, kredensial disimpan di localStorage (plaintext) agar bisa auto-login — gunakan hanya di device kerja terpercaya, jangan login di komputer publik. Logout (⏻) menghapusnya
- Siapa pun yang login gagal 5x diblokir sementara per username
- Semua aksi penting tercatat di sheet `AuditLog`
- Minimal 1 ADMIN aktif harus selalu ada; admin tidak bisa menonaktifkan dirinya sendiri
- URL Web App bersifat rahasia internal — jangan disebar ke luar perusahaan

## 9️⃣ INTEGRASI TELEGRAM (Opsional)

Setelah backend terdeploy, Anda dapat menambahkan integrasi Telegram untuk notifikasi dan input via chat.

### Langkah A — Buat Bot dan Dapatkan Token
1. Chat dengan @BotFather di Telegram
2. Kirim perintah `/newbot`
3. Berikan nama: `Unloading Warehouse Bot` (atau nama lain)
4. Berikan username: `UnloadingWarehouseBot` (harus unik)
5. BotFather akan mengembalikan **TOKEN** — simpan dengan aman
6. Mulai bot dengan `/start` dan gunakan @userinfobot untuk mendapatkan own Chat ID Anda

### Langkah B — Konfigurasi di Google Apps Script
1. Buka spreadsheet > **Extensions > Apps Script**
2. Setel BOT_TOKEN dengan salah satu cara:
   - **Cara 1 (Direkomendasikan)**: Di editor Apps Script, klik **File > Project properties > Settings** tab → tambahkan property baru:
     - Kunci: `TELEGRAM_BOT_TOKEN`
     - Nilai: `8253539792:AAHbA_Rfi-N0bfQsV3DFoNlOPJpvlwR5bpo` *(ganti dengan token Anda)*
   - **Cara 2**: Tambahkan baris ke sheet **Settings**:
     - Baris 2, Kolom A: `telegram_bot_token`
     - Baris 2, Kolom B: token Anda
     - Baris 3, Kolom A: `telegram_admins`
     - Baris 3, Kolom B: daftar chat ID admin, dipisah koma (contoh: `123456789,987654321`)

3. Jalankan fungsi `setupAll()` sekali untuk menginisialisasi konfigurasi

### Langkah C — Dapatkan Chat ID Admin
1. Kirim perintah `/start` ke bot dari setiap akun admin
2. Gunakan @userinfobot atau kirim pesan apa saja ke bot, lihat response yang berisi chat ID
3. Masukkan chat ID tersebut ke sheet Settings baris 3 kolom B, atau simpan ke PropertiesService

### Langkah D — Perintah yang Tersedia

| Perintah | Deskripsi |
|---|---|
| `/status` | Menampilkan status antrean saat ini |
| `/input UNL-xxx dock=N` | Memulai bongkar di Dock N (sebagai admin/operator) |
| `/selesai UNL-xxx qty=X satuan=Y temuan=Z` | Menyelesaikan bongkar dengan detail |
| `/alert` | Kirim manual alert ke semua admin |

### Langkah E — Alert Otomatis (Delay Trigger)
1. Di Apps Script, buat trigger **time-driven**:
   - Function: `checkDelayAlerts_`
   - Deployment: Minutes timer → Every 5 minutes
2. Trigger ini akan secara otomatis mengirim alert ke admin jika truk menunggu lebih dari 60 menit di dock

### Contoh Notifikasi yang Dikirim

*⚠️ ALERT TRUK TELAT*
Truk: *B 1234 XYZ*
ID: UNL-20240115-001
Menunggu: *65 menit*
Operator: Fauzi
Waktu mulai: 09:20. Sudah melewati batas **60 menit**.

---

## 🗺️ ROADMAP FASE 2 (belum termasuk versi ini)

- Alert WhatsApp/email saat truk menunggu > batas
- Analitik tren mingguan per supplier
- QR check-in driver di gate
- Integrasi sheet Target Harian (plan vs realisasi)
- Auto-backup harian via trigger
