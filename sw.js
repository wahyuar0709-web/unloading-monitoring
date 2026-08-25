/* ============================================================
   sw.js — Monitoring Unloading RDI
   PHASE 1E — PWA / Service Worker + Stale Cache Handling

   NAIKKAN CACHE_VERSION di SETIAP deploy yang mengubah index.html,
   manifest.json, atau ikon. Ini satu-satunya cara cache lama benar-
   benar dibuang (lihat activate handler) - lupa menaikkan versi ini
   adalah penyebab #1 pengguna "stuck" di versi lama (stale cache).
   Selaraskan angka ini dengan APP_VERSION di index.html biar mudah
   dilacak, walau keduanya independen secara teknis.
   ============================================================ */
var CACHE_VERSION = 'v2.1.8';
var CACHE_NAME = 'unload-shell-' + CACHE_VERSION;

// Hanya APP SHELL (asset statis) yang di-cache. JANGAN PERNAH masukkan
// endpoint Apps Script (data truk, login, dst.) ke sini - itu harus
// selalu fresh dari jaringan, lihat fetch handler di bawah.
var SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // addAll gagal semua kalau satu asset 404 - pakai add satu-satu
      // supaya ikon yang belum ada belum mem-blok instalasi.
      return Promise.all(
        SHELL_ASSETS.map(function (url) {
          return cache.add(url).catch(function () { /* asset opsional, lewati kalau gagal */ });
        })
      );
    })
  );
  // JANGAN self.skipWaiting() otomatis di sini - biarkan index.html yang
  // memutuskan (lewat tombol "Muat ulang") supaya operator yang sedang
  // input data di tengah shift tidak tiba-tiba direload paksa.
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (n) { return n.indexOf('unload-shell-') === 0 && n !== CACHE_NAME; })
          .map(function (n) { return caches.delete(n); }) // buang SEMUA cache versi lama - inti fix stale-cache
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  // ATURAN PALING PENTING: apapun yang BUKAN GET, atau BUKAN same-origin
  // (mis. request ke script.google.com / script.googleusercontent.com
  // tempat backend Apps Script live) TIDAK PERNAH ditangani oleh SW ini.
  // Itu harus selalu hit jaringan langsung, tanpa campur tangan cache -
  // data truk/sesi/login TIDAK BOLEH pernah basi atau ke-cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return; // biarkan browser handle seperti biasa (network passthrough)
  }

  // App shell: cache-first supaya cepat & bisa buka saat offline, tapi
  // selalu coba revalidate ke jaringan di background (stale-while-
  // revalidate) supaya begitu ada versi baru ter-deploy, cache terisi
  // ulang untuk kunjungan berikutnya tanpa menunggu event 'activate'.
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var networkFetch = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return cached; }); // offline & tidak ada cache -> gagal, itu wajar
        return cached || networkFetch;
      });
    })
  );
});
