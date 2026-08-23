# Monitoring Unloading Warehouse

Frontend statis untuk aplikasi monitoring bongkar muat (backend: Google Apps Script + Google Sheets).

| File | Fungsi |
|---|---|
| `index.html` | Aplikasi utama (mode Operasi HP & Monitor desktop) — **dilayani GitHub Pages** |
| `audit.html` | Dasbor Audit Log terpisah (butuh login role ADMIN) |
| `Code.gs` | Kode backend untuk di-paste ke Apps Script editor |
| `PANDUAN-DEPLOY.md` | Panduan lengkap deploy backend + penggunaan |
| `audit-app/` | Source code dasbor audit (React + Vite + Parcel) |

## URL setelah Pages aktif

- Aplikasi utama : `https://<username>.github.io/<repo>/`
- Dasbor audit   : `https://<username>.github.io/<repo>/audit.html`

Frontend tidak menyimpan URL backend — setiap user memasukkan URL Web App `.exec`
sendiri saat pertama kali login, jadi repo ini aman dipublikasikan.

## Rebuild dasbor audit

```powershell
cd audit-app
npm install
npm run bundle
Copy-Item bundle.html ..\audit.html -Force
```

> Catatan build Windows: skrip `npm run bundle` sudah termasuk langkah inline
> via `scripts/inline-bundle.mjs`. Jika `node_modules` di-reset, jalankan
> `npm approve-scripts --allow-scripts-pending` lalu `npm rebuild` agar biner
> native esbuild/swc/parcel aktif.
