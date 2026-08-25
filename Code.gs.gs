/**
 * ============================================================
 * TRUCK / UNLOADING MONITORING - BACKEND v2 (SATU FILE)
 * ============================================================
 * Basis: Code.gs yang sudah berjalan (setup/migrasi/status flow/ID generator
 *        TIDAK diubah perilakunya).
 * Tambahan v2:
 *   1. Login multi-user stateless (sheet "Users", hash SHA-256, role ADMIN/OPERATOR/SPB)
 *   2. Anti brute-force login (5x salah -> jeda 5 menit via CacheService)
 *   3. Manajemen user: createUser / resetPassword / setUserAktif / changePassword
 *   4. Kolom "Dock" (ditambah otomatis oleh migrasi) + validasi dock saat mulai bongkar
 *   5. Jeda/Lanjut Istirahat -> mengisi kolom "jam mulai istirahat" & "jam selesai istirahat"
 *   6. markSelesaiBongkar WAJIB qty + satuan + temuan; kolom QTY/Satuan/Temuan Abnormal/
 *      Durasi Tunggu/Durasi Bongkar terisi otomatis (durasi bongkar memotong waktu istirahat)
 *   7. Anti-duplikat antrean (nopol sama yang masih aktif ditolak)
 *   8. editVisit: koreksi data oleh ADMIN sebelum Selesai
 *   9. Sheet AuditLog: jejak siapa melakukan apa
 *
 * CATATAN PENTING:
 *   - Jalankan setupAll() SEKALI setelah paste. Aman dijalankan berulang.
 *   - Akun awal: admin/admin123 (ADMIN), fau zi/fauzi123, risman/risman123 (OPERATOR),
 *     spb/spb123 (SPB). SEGERA GANTI password lewat aplikasi setelah deploy!
 */

// ===================== KONFIGURASI =====================

var SHEET_NAMES = {
  VISITS: 'Data Unloading',
  SETTINGS: 'Settings',
  OPERATORS: 'Operators',
  SUPPLIERS: 'Master Supplier',
  TARGET: 'Target Harian',
  USERS: 'Users',
  AUDIT: 'AuditLog'
};

// ===================== TELEGRAM CONFIG =====================
var BOT_TOKEN = ''; // Isi via PropertiesService atau sheet Settings
var ADMIN_CHAT_IDS = []; // Daftar chat ID admin, dipisah koma di sheet Settings

function initTelegramConfig_() {
  var props = PropertiesService.getScriptProperties();
  var storedToken = props.getProperty('TELEGRAM_BOT_TOKEN');
  if (storedToken) {
    BOT_TOKEN = storedToken;
  } else {
    // Fallback: baca dari sheet Settings
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
    if (sheet) {
      var val = sheet.getRange('B2').getValue(); // key: telegram_bot_token
      if (val) {
        BOT_TOKEN = val;
        props.setProperty('TELEGRAM_BOT_TOKEN', val);
      }
    }
  }

  // Baca chat ID admin dari sheet Settings
  var adminsVal = '';
  if (sheet) {
    adminsVal = sheet.getRange('B3').getValue(); // key: telegram_admins
  }
  if (adminsVal) {
    ADMIN_CHAT_IDS = adminsVal.split(',').map(s => s.trim()).filter(s => s);
  }
}

// Kolom tambahan aplikasi. Ditambahkan di ujung kanan jika belum ada -
// kolom lama (A-S) tidak disentuh sama sekali.
var VISITS_NEW_HEADERS = [
  'Unload_ID', 'No. Polisi', 'Nama Supir', 'Sumber', 'Plan Tiba',
  'Operator Tiba', 'Operator Bongkar', 'Status Kerja', 'Dock'
];

var STATUS = {
  DIJADWALKAN: 'Dijadwalkan',
  TIBA: 'Tiba',
  SEDANG_BONGKAR: 'Sedang Bongkar',
  SELESAI: 'Selesai',
  DIBATALKAN: 'Dibatalkan'
};

var STATUS_AKTIF_ANTREAN = [STATUS.DIJADWALKAN, STATUS.TIBA, STATUS.SEDANG_BONGKAR];

var SUMBER = {
  TERJADWAL: 'Terjadwal',
  WALKIN: 'Walk-in'
};

var ROLES = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  SPB: 'SPB'
};

// ===================== PHASE 1B — IDEMPOTENCY =====================
// Aksi yang mengubah state (mutating). Dipakai doPost() untuk dedupe
// request berdasarkan requestId opsional dari klien: kalau requestId
// yang sama datang lagi dalam jendela TTL (mis. retry setelah timeout
// jaringan, atau duplikasi platform-level Apps Script), hasil yang
// SUDAH TEREKSEKUSI dikembalikan lagi dari cache tanpa dieksekusi ulang
// - bukan menjalankan aksi dua kali (mis. dua kali "Selesai Bongkar").
var MUTATING_ACTIONS = [
  'createWalkin', 'markTiba', 'markMulaiBongkar', 'pauseBreak', 'resumeBreak',
  'markSelesaiBongkar', 'createSchedule', 'cancel', 'editVisit', 'addOperator',
  'setOperatorAktif', 'updateSetting', 'createUser', 'resetPassword',
  'setUserAktif', 'changePassword'
];
var IDEMPOTENCY_TTL_SECONDS = 600; // 10 menit - cukup untuk jendela retry wajar

// Nama header persis seperti di sheet "Data Unloading" Anda.
// Catatan: header R/S di file asli memakai spasi di depan (" jam mulai istirahat").
// getHeaderMap_() melakukan trim, jadi cukup tulis tanpa spasi di sini.
var COL = {
  ID: 'Unload_ID',
  TIMESTAMP: 'Timestamp',
  SUPPLIER: 'Supplier',
  NO_SJ: 'No. Surat\nJalan', // header asli mengandung line-break
  TGL_DATANG: 'Tanggal Kedatangan',
  JENIS: 'Jenis Transaksi',
  JAM_DATANG: 'Jam Kedatangan',
  JAM_MULAI: 'Jam Mulai Bongkar',
  JAM_SELESAI: 'Jam selesai bongkar',
  QTY: 'QTY',
  SATUAN: 'Satuan',
  STATUS_LAMA: 'Status',
  DURASI_TUNGGU: 'Durasi Tunggu (Menit)',
  DURASI_BONGKAR: 'Durasi Bongkar (Menit)',
  TEMUAN: 'Temuan Abnormal',
  KETERANGAN: 'Keterangan',
  PIC: 'PIC',
  BREAK_START: 'jam mulai istirahat',
  BREAK_END: 'jam selesai istirahat',
  NO_POLISI: 'No. Polisi',
  NAMA_SPIR: 'Nama Supir',
  SUMBER_: 'Sumber',
  PLAN_TIBA: 'Plan Tiba',
  OP_TIBA: 'Operator Tiba',
  OP_BONGKAR: 'Operator Bongkar',
  STATUS_KERJA: 'Status Kerja',
  DOCK: 'Dock'
};

/** @typedef {{ID:string,TIMESTAMP:Date,SUPPLIER:string,NO_SJ:string,TGL_DATANG:Date,JENIS:string,JAM_DATANG:Date,JAM_MULAI:Date,JAM_SELESAI:Date,QTY:number,SATUAN:string,STATUS_LAMA:string,DURASI_TUNGGU:number,DURASI_BONGKAR:number,TEMUAN:string,KETERANGAN:string,PIC:string,BREAK_START:Date,BREAK_END:Date,NO_POLISI:string,NAMA_SPIR:string,SUMBER_:string,PLAN_TIBA:Date,OP_TIBA:string,OP_BONGKAR:string,STATUS_KERJA:string,DOCK:number}} VisitRecord */
/** @typedef {{action:string,username?:string,password?:string,vendor?:string,no_polisi?:string,nama_supir?:string,no_po?:string,jenis_transaksi?:string,catatan?:string,plan_tiba?:string,dock?:number}} ApiPayload */
/** @typedef {{key:string,value:string|number}} SettingUpdate */
/** @typedef {{username:string,password_hash:string,nama:string,role:string,aktif:boolean}} UserRecord */

var SETTINGS_DEFAULTS = [
  ['key', 'value'],
  ['threshold_tepat_waktu_menit', 15],
  ['threshold_telat_parah_menit', 60],
  ['jumlah_dock', 3]
];

var OPERATORS_HEADERS = ['nama_operator', 'aktif'];

var OPERATORS_SEED = [
  ['Fauzi', true],
  ['Risman', true]
];

var USERS_HEADERS = ['Username', 'Password_Hash', 'Nama', 'Role', 'Aktif'];

var AUDIT_HEADERS = ['Timestamp', 'User', 'Aksi', 'Unload_ID', 'Detail'];

// Opsi temuan abnormal (dipakai dropdown di aplikasi; bebas diedit di sini)
var TEMUAN_OPTIONS = [
  'TIDAK ADA (NORMAL)',
  'Actual tidak sama dengan surat jalan',
  'Barang rusak',
  'Kemasan rusak / bocor',
  'Dokumen tidak lengkap',
  'Lainnya'
];

// ===================== AUTH CORE =====================

function hashPassword_(password) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(password), Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = (bytes[i] + 256) % 256;
    hex += (v < 16 ? '0' : '') + v.toString(16);
  }
  return hex;
}

/** Baca semua akun dari sheet Users. */
function readUsers_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, USERS_HEADERS.length).getValues();
  var out = [];
  values.forEach(function (r) {
    var uname = String(r[0] || '').toLowerCase().trim();
    if (!uname) return;
    out.push({
      username: uname,
      hash: String(r[1] || ''),
      nama: String(r[2] || ''),
      role: String(r[3] || '').toUpperCase().trim(),
      aktif: r[4] === true || String(r[4]).toLowerCase() === 'true'
    });
  });
  return out;
}

// ---------- Anti brute-force (CacheService, TTL 5 menit) ----------
var FAIL_LIMIT_ = 5;

function failKey_(u) { return 'unl_fail_' + u; }

function getFailCount_(u) {
  var c = CacheService.getScriptCache().get(failKey_(u));
  return c ? parseInt(c, 10) : 0;
}

function registerFailedAttempt_(u) {
  var cache = CacheService.getScriptCache();
  cache.put(failKey_(u), String(getFailCount_(u) + 1), 300);
}

function clearFailedAttempts_(u) {
  CacheService.getScriptCache().remove(failKey_(u));
}

/**
 * Validasi username+password. Melempar error berprefix "AUTH:" agar front-end
 * tahu harus kembali ke halaman login. Return { username, nama, role }.
 * @param {string} username
 * @param {string} password
 * @returns {{username:string,nama:string,role:string}}
 */
function authenticate_(username, password) {
  if (!username || !password) {
    throw new Error('AUTH: Username dan password wajib diisi.');
  }
  var uname = String(username).toLowerCase().trim();
  if (getFailCount_(uname) >= FAIL_LIMIT_) {
    throw new Error('AUTH: Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.');
  }
  var users = readUsers_();
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].username === uname) { user = users[i]; break; }
  }
  // Type check: user must have required fields
  if (!user || typeof user.aktif !== 'boolean' || typeof user.hash !== 'string') {
    throw new Error('AUTH: Data user tidak lengkap atau tidak valid.');
  }
  var ok = !!user && user.aktif && user.hash === hashPassword_(password);
  if (!ok) {
    registerFailedAttempt_(uname);
    logAudit_(null, 'LOGIN_GAGAL', '', uname);
    var alasan = user && !user.aktif ? 'Akun dinonaktifkan.' : 'Username atau password salah.';
    throw new Error('AUTH: ' + alasan);
  }
  clearFailedAttempts_(uname);
  return { username: user.username, nama: user.nama, role: user.role };
}

// ---------- Session/token (CacheService, TTL) ----------
// Token bersifat opaque, tidak mengandung password, punya masa berlaku
// (dijaga oleh CacheService TTL + klaim exp di payload), tervalidasi di
// backend pada setiap request, dan bisa dicabut lewat action "logout".
var SESSION_TTL_SECONDS = 4 * 60 * 60; // 4 jam

function sessionCacheKey_(token) { return 'sess_' + token; }

/** Buat token sesi baru untuk user yang sudah lolos authenticate_(). */
function createSession_(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var payload = {
    username: user.username,
    nama: user.nama,
    role: user.role,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000
  };
  CacheService.getScriptCache().put(sessionCacheKey_(token), JSON.stringify(payload), SESSION_TTL_SECONDS);
  return { token: token, expires_in: SESSION_TTL_SECONDS };
}

/** Validasi token sesi. Melempar error berprefix "AUTH:" jika tidak valid/kedaluwarsa. */
function validateSession_(token) {
  if (!token) {
    throw new Error('AUTH: Sesi tidak ditemukan. Silakan login kembali.');
  }
  var raw = CacheService.getScriptCache().get(sessionCacheKey_(token));
  if (!raw) {
    throw new Error('AUTH: Sesi telah berakhir. Silakan login kembali.');
  }
  var sess;
  try {
    sess = JSON.parse(raw);
  } catch (e) {
    CacheService.getScriptCache().remove(sessionCacheKey_(token));
    throw new Error('AUTH: Sesi tidak valid. Silakan login kembali.');
  }
  if (!sess || !sess.username || !sess.exp || sess.exp < Date.now()) {
    CacheService.getScriptCache().remove(sessionCacheKey_(token));
    throw new Error('AUTH: Sesi telah berakhir. Silakan login kembali.');
  }
  return { username: sess.username, nama: sess.nama, role: sess.role };
}

/** Cabut token sesi (logout). Aman dipanggil meski token sudah tidak ada. */
function destroySession_(token) {
  if (token) CacheService.getScriptCache().remove(sessionCacheKey_(token));
}

/** Wajib login: baca token sesi dari payload request (bukan password). */
function requireAuth_(data) {
  if (!data || !data.token) {
    throw new Error('AUTH: Autentikasi diperlukan (token tidak ada).');
  }
  return validateSession_(data.token);
}

/** Wajib punya salah satu role. */
function requireRole_(user, roles) {
  if (!user || roles.indexOf(user.role) === -1) {
    throw new Error('AKSES: Role "' + (user ? user.role : '?') + '" tidak berhak melakukan aksi ini.');
  }
}

/** Key cache idempotency. Di-namespace per action supaya requestId klien
 *  tidak perlu unik lintas-action, cukup unik per action. */
function idemCacheKey_(action, requestId) {
  return 'idem_' + action + '_' + requestId;
}

/** Kalau requestId sudah pernah sukses dieksekusi dalam TTL, kembalikan
 *  hasil yang tersimpan. requestId opsional - kalau kosong, tidak ada
 *  dedupe (perilaku lama, tetap kompatibel dengan klien lama). */
function getIdempotentResult_(action, requestId) {
  if (!requestId) return undefined;
  var raw = CacheService.getScriptCache().get(idemCacheKey_(action, requestId));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return undefined;
  }
}

/** Simpan hasil sukses supaya request duplikat (retry) tidak menjalankan
 *  aksi lagi. Best-effort: kalau hasil terlalu besar untuk CacheService
 *  (>100KB) atau gagal serialisasi, gagal secara diam-diam - request
 *  tetap dianggap sukses, hanya proteksi dedupe-nya yang tidak aktif. */
function saveIdempotentResult_(action, requestId, result) {
  if (!requestId) return;
  try {
    CacheService.getScriptCache().put(idemCacheKey_(action, requestId), JSON.stringify(result), IDEMPOTENCY_TTL_SECONDS);
  } catch (e) {
    // diam-diam - lihat komentar di atas
  }
}

// ===================== SETUP / MIGRASI (jalankan sekali) =====================

function setupAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  initTelegramConfig_();

  migrateDataUnloadingSheet_(ss);
  setupSettingsSheet_(ss);
  setupOperatorsSheet_(ss);
  setupSuppliersSheet_(ss);
  setupUsersSheet_(ss);
  setupAuditSheet_(ss);

  SpreadsheetApp.flush();
  Logger.log('Setup/migrasi selesai. Sheet tersedia: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
}

/**
 * Menambahkan kolom baru (jika belum ada) di ujung kanan sheet "Data Unloading",
 * lalu backfill baris lama. Aman dijalankan berkali-kali.
 */
function migrateDataUnloadingSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.VISITS);
  if (!sheet) {
    throw new Error('Sheet "' + SHEET_NAMES.VISITS + '" tidak ditemukan. Pastikan nama sheet persis sama.');
  }

  var lastCol = sheet.getLastColumn();
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });

  var missing = VISITS_NEW_HEADERS.filter(function (h) { return headerRow.indexOf(h) === -1; });
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, lastCol + 1, 1, missing.length).setFontWeight('bold');
  }

  SpreadsheetApp.flush();
  backfillExistingRows_(sheet);
}

function backfillExistingRows_(sheet) {
  var map = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var idCol = map['Unload_ID'];
  var tglCol = map['Tanggal Kedatangan'];
  var statusLamaCol = map['Status'];
  var statusKerjaCol = map['Status Kerja'];
  var sumberCol = map['Sumber'];
  var picCol = map['PIC'];
  var opTibaCol = map['Operator Tiba'];
  var opBongkarCol = map['Operator Bongkar'];

  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var tz = Session.getScriptTimeZone();
  var seqPerDate = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowIndex = i + 2;

    if (idCol && !row[idCol - 1]) {
      var tglRaw = row[tglCol - 1];
      var dateForId = (tglRaw instanceof Date) ? tglRaw : new Date(tglRaw || Date.now());
      var dateStr = isNaN(dateForId.getTime()) ?
        Utilities.formatDate(new Date(), tz, 'yyyyMMdd') :
        Utilities.formatDate(dateForId, tz, 'yyyyMMdd');
      seqPerDate[dateStr] = (seqPerDate[dateStr] || 0) + 1;
      var seqStr = ('000' + seqPerDate[dateStr]).slice(-3);
      sheet.getRange(rowIndex, idCol).setValue('UNL-' + dateStr + '-' + seqStr);
    }

    if (sumberCol && !row[sumberCol - 1]) {
      sheet.getRange(rowIndex, sumberCol).setValue(SUMBER.WALKIN);
    }

    if (statusKerjaCol && !row[statusKerjaCol - 1]) {
      var legacy = String(row[(statusLamaCol || 1) - 1] || '').toUpperCase().trim();
      var mapped;
      if (legacy === 'SUDAH DATANG') mapped = STATUS.TIBA;
      else mapped = STATUS.SELESAI; // mayoritas data lama adalah SELESAI
      sheet.getRange(rowIndex, statusKerjaCol).setValue(mapped);
    }

    if (opTibaCol && !row[opTibaCol - 1] && picCol && row[picCol - 1]) {
      sheet.getRange(rowIndex, opTibaCol).setValue(row[picCol - 1]);
    }
    if (opBongkarCol && !row[opBongkarCol - 1] && picCol && row[picCol - 1]) {
      sheet.getRange(rowIndex, opBongkarCol).setValue(row[picCol - 1]);
    }
  }
}

/** Peta nama header (sudah trim) -> nomor kolom (1-based). */
function getHeaderMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { map[String(h).trim()] = i + 1; });
  return map;
}

// ===================== GENERATOR ID =====================

function generateUnloadId(dateObj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tz = Session.getScriptTimeZone();
    var dateStr = Utilities.formatDate(dateObj || new Date(), tz, 'yyyyMMdd');
    var prefix = 'UNL-' + dateStr + '-';

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VISITS);
    var map = getHeaderMap_(sheet);
    var idCol = map['Unload_ID'];
    var lastRow = sheet.getLastRow();

    var maxSeq = 0;
    if (lastRow > 1) {
      var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
      ids.forEach(function (r) {
        var id = r[0];
        if (typeof id === 'string' && id.indexOf(prefix) === 0) {
          var seq = parseInt(id.substring(prefix.length), 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      });
    }
    return prefix + ('000' + (maxSeq + 1)).slice(-3);
  } finally {
    lock.releaseLock();
  }
}

// ===================== SETUP SHEET PENDUKUNG =====================

function setupSettingsSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, SETTINGS_DEFAULTS.length, 2).setValues(SETTINGS_DEFAULTS);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  }
}

function setupOperatorsSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.OPERATORS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.OPERATORS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, OPERATORS_HEADERS.length).setValues([OPERATORS_HEADERS]);
    sheet.getRange(1, 1, 1, OPERATORS_HEADERS.length).setFontWeight('bold');
    if (OPERATORS_SEED.length > 0) {
      sheet.getRange(2, 1, OPERATORS_SEED.length, 2).setValues(OPERATORS_SEED);
    }
  }
}

var SUPPLIERS_HEADERS = ['Supplier', 'Status'];

function setupSuppliersSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SUPPLIERS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.SUPPLIERS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SUPPLIERS_HEADERS.length).setValues([SUPPLIERS_HEADERS]);
    sheet.getRange(1, 1, 1, SUPPLIERS_HEADERS.length).setFontWeight('bold');
    Logger.log('Sheet "Master Supplier" dibuat baru. Set Status="active" untuk vendor yang muncul di dropdown.');
  }
}

/** Buat sheet Users + akun default HANYA jika sheet masih kosong. */
function setupUsersSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.USERS);
  if (sheet.getLastRow() === 0) {
    var seed = [
      ['admin', hashPassword_('admin123'), 'Administrator', ROLES.ADMIN, true],
      ['fauzi', hashPassword_('fauzi123'), 'Fauzi', ROLES.OPERATOR, true],
      ['risman', hashPassword_('risman123'), 'Risman', ROLES.OPERATOR, true],
      ['spb', hashPassword_('spb123'), 'SPV Warehouse', ROLES.SPB, true]
    ];
    sheet.getRange(1, 1, 1, USERS_HEADERS.length).setValues([USERS_HEADERS]);
    sheet.getRange(1, 1, 1, USERS_HEADERS.length).setFontWeight('bold');
    sheet.getRange(2, 1, seed.length, seed[0].length).setValues(seed);
    Logger.log('Sheet Users dibuat. AKUN DEFAULT: admin/admin123, fauzi/fauzi123, risman/risman123, spb/spb123. SEGERA GANTI PASSWORD!');
  }
}

function setupAuditSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.AUDIT);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.AUDIT);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).setValues([AUDIT_HEADERS]);
    sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

/** Tulis baris audit. Tidak pernah melempar error (logging tidak boleh memutus alur utama). */
function logAudit_(user, aksi, unloadId, detail) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.AUDIT) || setupAuditSheet_(ss);
    sheet.appendRow([
      new Date(),
      user ? (user.nama || user.username || '-') : (aksi === 'LOGIN_GAGAL' ? (detail || '-') : '-'),
      aksi || '',
      unloadId || '',
      detail || ''
    ]);
  } catch (e) { /* abaikan */ }
}

// ===================== HELPER BACA DATA =====================

function readSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var settings = {};
  values.forEach(function (row) {
    if (row[0] !== '') settings[row[0]] = row[1];
  });
  return settings;
}

function readActiveOperators_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OPERATORS);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  return values.filter(function (row) { return row[1] === true; }).map(function (row) { return row[0]; });
}

function readAllOperators_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OPERATORS);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  return values.map(function (row) { return ({ nama_operator: row[0], aktif: row[1] === true }); });
}

/** Daftar supplier aktif dari "Master Supplier". */
function readActiveSuppliers_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SUPPLIERS);
  if (!sheet) { Logger.log('readActiveSuppliers_: sheet tidak ditemukan'); return []; }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { return []; }
  var map = getHeaderMap_(sheet);
  var supCol = map['Supplier'], statusCol = map['Status'];
  if (!supCol) { Logger.log('readActiveSuppliers_: kolom "Supplier" tidak ketemu.'); return []; }
  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var ACTIVE_TEXTS = ['active', 'aktif', 'true', 'yes', 'ya'];
  return values
    .filter(function (r) {
      if (!statusCol) return true;
      var v = r[statusCol - 1];
      if (v === true) return true;
      return ACTIVE_TEXTS.indexOf(String(v).toLowerCase().trim()) !== -1;
    })
    .map(function (r) { return r[supCol - 1]; })
    .filter(String);
}

/** Diagnosa dropdown vendor kosong - jalankan manual, lihat View > Logs. */
function debugSuppliers_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.SUPPLIERS);
  if (!sheet) {
    Logger.log('X Sheet "' + SHEET_NAMES.SUPPLIERS + '" TIDAK ADA.');
    Logger.log('Sheet yang ada: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
    return;
  }
  Logger.log('OK Sheet ditemukan. Baris: ' + sheet.getLastRow() + ', kolom: ' + sheet.getLastColumn());
  var map = getHeaderMap_(sheet);
  Logger.log('Header terbaca: ' + JSON.stringify(map));
  var result = readActiveSuppliers_();
  Logger.log('Hasil readActiveSuppliers_(): ' + JSON.stringify(result));
}

function readTargetHarian_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TARGET);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var map = getHeaderMap_(sheet);
  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values
    .filter(function (row) { return row.some(function (c) { return c !== ''; }); })
    .map(function (row) {
      var obj = {};
      Object.keys(map).forEach(function (h) { obj[h] = row[map[h] - 1]; });
      return obj;
    });
}

function readRecentAudit_(limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.AUDIT);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var n = Math.min(lastRow - 1, limit || 100);
  var start = lastRow - n + 1;
  var values = sheet.getRange(start, 1, n, AUDIT_HEADERS.length).getValues();
  var toIso = function (v) {
    if (!v) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  };
  return values.reverse().map(function (r) {
    return { timestamp: toIso(r[0]), user: r[1], aksi: r[2], unload_id: r[3], detail: r[4] };
  });
}

// ===================== ENTRY POINTS =====================

function doGet(e) {
  try {
    var action = e.parameter.action;
    // Semua endpoint GET wajib autentikasi via token sesi (bukan password).
    // Token tidak mengandung password, punya masa berlaku, dan bisa dicabut
    // lewat logout - lihat validateSession_().
    var user = validateSession_(e.parameter.token);

    var result;
    switch (action) {
      case 'bootstrap':
        result = bootstrapData_(e.parameter.date);
        break;
      case 'list':
        result = listVisits_(e.parameter.date, e.parameter.vendor, e.parameter.status);
        break;
      case 'settings':
        result = readSettings_();
        break;
      case 'operators':
        result = readActiveOperators_();
        break;
      case 'operatorsAll':
        result = readAllOperators_();
        break;
      case 'suppliers':
        result = readActiveSuppliers_();
        break;
      case 'targetHarian':
        result = readTargetHarian_();
        break;
      case 'users':
        requireRole_(user, [ROLES.ADMIN]);
        result = readUserListPublic_();
        break;
      case 'audit':
        requireRole_(user, [ROLES.ADMIN]);
        result = readRecentAudit_(parseInt(e.parameter.limit, 10) || 100);
        break;
      default:
        return respondError_('Action tidak dikenal: ' + action);
    }

    return respondJson_({ ok: true, data: result, me: user });
  } catch (err) {
    return respondError_(err.message);
  }
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return respondError_('Body request kosong.');
    }
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    var PUBLIC_ACTIONS = ['login', 'logout'];
    var user = PUBLIC_ACTIONS.indexOf(action) === -1 ? requireAuth_(data) : null;

    // PHASE 1B — replay hasil kalau requestId ini sudah pernah sukses
    // dieksekusi (dalam jendela IDEMPOTENCY_TTL_SECONDS). Cuma berlaku
    // untuk MUTATING_ACTIONS; login/logout dan aksi baca tidak didedupe.
    var isMutating = MUTATING_ACTIONS.indexOf(action) !== -1;
    var requestId = data.requestId;
    if (isMutating) {
      var replay = getIdempotentResult_(action, requestId);
      if (replay !== undefined) {
        return respondJson_({ ok: true, data: replay, me: user, idempotentReplay: true });
      }
    }

    var result;
    switch (action) {
      // ---- publik ----
      case 'login':
        result = loginAction_(data);
        break;
      case 'logout':
        result = logoutAction_(data);
        break;

      // ---- BACA (klien selalu kirim POST, bukan GET - lihat apiGet() di
      //      frontend. Tanpa case ini, action ini hanya ada di doGet() yang
      //      tidak pernah dipanggil, sehingga jatuh ke default "Action tidak
      //      dikenal" setiap kali refreshData() jalan). ----
      case 'bootstrap':
        result = bootstrapData_(data.date);
        break;
      case 'list':
        result = listVisits_(data.date, data.vendor, data.status);
        break;
      case 'settings':
        result = readSettings_();
        break;
      case 'operators':
        result = readActiveOperators_();
        break;
      case 'operatorsAll':
        result = readAllOperators_();
        break;
      case 'suppliers':
        result = readActiveSuppliers_();
        break;
      case 'targetHarian':
        result = readTargetHarian_();
        break;
      case 'users':
        requireRole_(user, [ROLES.ADMIN]);
        result = readUserListPublic_();
        break;
      case 'audit':
        requireRole_(user, [ROLES.ADMIN]);
        result = readRecentAudit_(parseInt(data.limit, 10) || 100);
        break;

      // ---- OPERATOR + ADMIN ----
      case 'createWalkin':
        requireRole_(user, [ROLES.OPERATOR, ROLES.ADMIN]);
        result = createWalkin_(data, user);
        break;
      case 'markTiba':
        requireRole_(user, [ROLES.OPERATOR, ROLES.ADMIN]);
        result = markTiba_(data, user);
        break;
      case 'markMulaiBongkar':
        requireRole_(user, [ROLES.OPERATOR, ROLES.ADMIN]);
        result = markMulaiBongkar_(data, user);
        break;
      case 'pauseBreak':
        requireRole_(user, [ROLES.OPERATOR, ROLES.ADMIN]);
        result = pauseBreak_(data, user);
        break;
      case 'resumeBreak':
        requireRole_(user, [ROLES.OPERATOR, ROLES.ADMIN]);
        result = resumeBreak_(data, user);
        break;
      case 'markSelesaiBongkar':
        requireRole_(user, [ROLES.OPERATOR, ROLES.ADMIN]);
        result = markSelesaiBongkar_(data, user);
        break;

      // ---- ADMIN saja ----
      case 'createSchedule':
        requireRole_(user, [ROLES.ADMIN]);
        result = createSchedule_(data, user);
        break;
      case 'cancel':
        requireRole_(user, [ROLES.ADMIN]);
        result = cancelVisit_(data, user);
        break;
      case 'editVisit':
        requireRole_(user, [ROLES.ADMIN]);
        result = editVisit_(data, user);
        break;
      case 'addOperator':
        requireRole_(user, [ROLES.ADMIN]);
        result = addOperator_(data, user);
        break;
      case 'setOperatorAktif':
        requireRole_(user, [ROLES.ADMIN]);
        result = setOperatorAktif_(data, user);
        break;
      case 'updateSetting':
        requireRole_(user, [ROLES.ADMIN]);
        result = updateSetting_(data, user);
        break;
      case 'createUser':
        requireRole_(user, [ROLES.ADMIN]);
        result = createUser_(data, user);
        break;
      case 'resetPassword':
        requireRole_(user, [ROLES.ADMIN]);
        result = resetPassword_(data, user);
        break;
      case 'setUserAktif':
        requireRole_(user, [ROLES.ADMIN]);
        result = setUserAktif_(data, user);
        break;

      // ---- semua role yang login ----
      case 'changePassword':
        result = changePassword_(data, user);
        break;
      case 'telegram':
        requireRole_(user, [ROLES.ADMIN]);
        result = telegramInput_(data, user);
        break;

      default:
        return respondError_('Action tidak dikenal: ' + action);
    }

    if (isMutating) saveIdempotentResult_(action, requestId, result);

    return respondJson_({ ok: true, data: result, me: user });
  } catch (err) {
    return respondError_(err.message);
  }
}

// ===================== ACTIONS: LOGIN & PASSWORD =====================

function loginAction_(data) {
  var me = authenticate_(data.username, data.password);
  logAudit_(me, 'LOGIN', '', me.role);
  var session = createSession_(me);
  return {
    nama: me.nama, role: me.role, username: me.username,
    temuan_options: TEMUAN_OPTIONS,
    token: session.token, expires_in: session.expires_in
  };
}

/** Cabut token sesi saat ini. Tidak melempar error walau token sudah invalid,
 *  supaya logout selalu terasa berhasil di frontend. */
function logoutAction_(data) {
  destroySession_(data && data.token);
  return { ok: true };
}

function changePassword_(data, me) {
  requireFields_(data, ['old_password', 'new_password']);
  if (String(data.new_password).length < 6) {
    throw new Error('Password baru minimal 6 karakter.');
  }
  var uname = me.username.toLowerCase();
  var users = readUsers_();
  var found = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].username === uname) { found = users[i]; found._row = i + 2; break; }
  }
  if (!found) throw new Error('AUTH: Akun tidak ditemukan.');
  if (found.hash !== hashPassword_(data.old_password)) {
    throw new Error('Password lama salah.');
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  sheet.getRange(found._row, 2).setValue(hashPassword_(data.new_password));
  logAudit_(me, 'GANTI_PASSWORD', '', uname);
  return { ok: true };
}

// ===================== ACTIONS: MANAJEMEN USER (ADMIN) =====================

function readUserListPublic_() {
  return readUsers_().map(function (u) {
    return { username: u.username, nama: u.nama, role: u.role, aktif: u.aktif };
  });
}

function findUserRowIndex_(uname) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).toLowerCase().trim() === uname) return i + 2;
  }
  return -1;
}

function createUser_(data, byUser) {
  requireFields_(data, ['username', 'password', 'nama', 'role']);
  var uname = String(data.username).toLowerCase().trim();
  if (!/^[a-z0-9._-]{3,20}$/.test(uname)) {
    throw new Error('Username 3-20 karakter, hanya huruf kecil/angka/titik/garis.');
  }
  var roleUp = String(data.role).toUpperCase();
  var validRoles = Object.keys(ROLES).map(function (k) { return ROLES[k]; });
  if (validRoles.indexOf(roleUp) === -1) {
    throw new Error('Role harus salah satu dari: ADMIN, OPERATOR, SPB.');
  }
  if (String(data.password).length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }
  if (findUserRowIndex_(uname) !== -1) {
    throw new Error('Username "' + uname + '" sudah dipakai.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
    sheet.appendRow([uname, hashPassword_(data.password), String(data.nama).trim(),
                     roleUp, true]);
    logAudit_(byUser, 'USER_BUAT', '', uname + ' (' + roleUp + ')');
    return { username: uname, nama: String(data.nama).trim(), role: roleUp, aktif: true };
  } finally {
    lock.releaseLock();
  }
}

function resetPassword_(data, byUser) {
  requireFields_(data, ['username', 'new_password']);
  if (String(data.new_password).length < 6) {
    throw new Error('Password baru minimal 6 karakter.');
  }
  var uname = String(data.username).toLowerCase().trim();
  var rowIndex = findUserRowIndex_(uname);
  if (rowIndex === -1) throw new Error('User "' + uname + '" tidak ditemukan.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
    sheet.getRange(rowIndex, 2).setValue(hashPassword_(data.new_password));
    clearFailedAttempts_(uname);
    logAudit_(byUser, 'USER_RESET_PASSWORD', '', uname);
    return { username: uname, ok: true };
  } finally {
    lock.releaseLock();
  }
}

function setUserAktif_(data, byUser) {
  requireFields_(data, ['username']);
  if (data.aktif === undefined) throw new Error('Field wajib belum diisi: aktif');
  var uname = String(data.username).toLowerCase().trim();
  if (uname === byUser.username) {
    throw new Error('Tidak bisa menonaktifkan akun sendiri.');
  }
  var target = readUsers_().filter(function (u) { return u.username === uname; })[0];
  if (!target) throw new Error('User "' + uname + '" tidak ditemukan.');

  var jadiAktif = (data.aktif === true || data.aktif === 'true');
  if (!jadiAktif && target.role === ROLES.ADMIN) {
    var adminAktif = readUsers_().filter(function (u) {
      return u.role === ROLES.ADMIN && u.aktif;
    }).length;
    if (adminAktif <= 1) throw new Error('Minimal harus ada 1 ADMIN aktif.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var rowIndex = findUserRowIndex_(uname);
    if (rowIndex === -1) throw new Error('User "' + uname + '" tidak ditemukan.');
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
    sheet.getRange(rowIndex, 5).setValue(jadiAktif);
    logAudit_(byUser, jadiAktif ? 'USER_AKTIFKAN' : 'USER_NONAKTIFKAN', '', uname);
    return { username: uname, aktif: jadiAktif };
  } finally {
    lock.releaseLock();
  }
}

// ===================== HELPERS I/O DINAMIS =====================

function getVisitsSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VISITS);
}

/** Bangun 1 baris array sepanjang sheet, isi hanya kolom yang namanya cocok. */
function buildRow_(sheet, fields) {
  var map = getHeaderMap_(sheet);
  var lastCol = sheet.getLastColumn();
  var row = new Array(lastCol);
  for (var i = 0; i < lastCol; i++) row[i] = '';
  Object.keys(fields).forEach(function (h) {
    if (map[h]) row[map[h] - 1] = fields[h];
  });
  return row;
}

function rowToObj_(headerMap, rowArray) {
  var obj = {};
  Object.keys(headerMap).forEach(function (h) { obj[h] = rowArray[headerMap[h] - 1]; });
  return obj;
}

function findRowIndexById_(sheet, id) {
  var map = getHeaderMap_(sheet);
  var idCol = map['Unload_ID'];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === id) return i + 2;
  }
  return -1;
}

// ===================== VALIDASI TAMBAHAN =====================

function normalizePlate_(p) {
  return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Tolak jika nopol sama masih ada di antrean aktif. excludeId untuk edit. */
function assertNotDuplicateActiveTruck_(noPolisi, excludeId) {
  var norm = normalizePlate_(noPolisi);
  if (!norm) return;
  var sheet = getVisitsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var map = getHeaderMap_(sheet);
  var plateCol = map['No. Polisi'], stCol = map['Status Kerja'], idCol = map['Unload_ID'];
  if (!plateCol || !stCol) return;
  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var st = String(row[stCol - 1] || '');
    if (STATUS_AKTIF_ANTREAN.indexOf(st) === -1) continue;
    if (excludeId && row[idCol - 1] === excludeId) continue;
    if (normalizePlate_(row[plateCol - 1]) === norm) {
      throw new Error('DUPLIKAT: Truk ' + noPolisi + ' masih ada di antrean (' +
        row[idCol - 1] + ', status: ' + st + '). Selesaikan/batalkan dulu.');
    }
  }
}

function getJumlahDock_() {
  var v = Number(readSettings_()['jumlah_dock']);
  return (v > 0) ? v : 3;
}

/** Validasi nomor dock (rentang) dan pastikan tidak dipakai truk lain yg sedang bongkar. */
function validateDockFree_(dockNumber, excludeId) {
  var dock = parseInt(dockNumber, 10);
  var max = getJumlahDock_();
  if (isNaN(dock) || dock < 1 || dock > max) {
    throw new Error('Dock harus angka 1 sampai ' + max + '.');
  }
  var sheet = getVisitsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var map = getHeaderMap_(sheet);
    var dCol = map['Dock'], stCol = map['Status Kerja'], idCol = map['Unload_ID'];
    if (dCol && stCol) {
      var lastCol = sheet.getLastColumn();
      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        if (String(row[stCol - 1]) === STATUS.SEDANG_BONGKAR &&
            Number(row[dCol - 1]) === dock &&
            row[idCol - 1] !== excludeId) {
          throw new Error('Dock ' + dock + ' sedang dipakai truk ' + row[idCol - 1] + '. Pilih dock lain.');
        }
      }
    }
  }
  return dock;
}

// ===================== ACTIONS: CREATE =====================

/** ADMIN membuat jadwal. Wajib: vendor, no_polisi, plan_tiba (ISO string). */
function createSchedule_(data, byUser) {
  requireFields_(data, ['vendor', 'no_polisi', 'plan_tiba']);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // PHASE 1D — cek duplikat DI DALAM lock (bukan sebelum lock diambil).
    // Cek di luar lock membuka race: dua request paralel (mis. dua tab,
    // atau retry) bisa lolos cek yang sama sebelum salah satunya sempat
    // menulis baris, sehingga truk yang sama bisa terdaftar dua kali.
    assertNotDuplicateActiveTruck_(data.no_polisi, null);

    var sheet = getVisitsSheet_();
    var now = new Date();
    var id = generateUnloadId(now);
    var planDate = new Date(data.plan_tiba);

    var fields = {};
    fields[COL.ID] = id;
    fields[COL.TIMESTAMP] = now;
    fields[COL.SUPPLIER] = data.vendor;
    fields[COL.NO_SJ] = data.no_po || '';
    fields[COL.NO_POLISI] = data.no_polisi;
    fields[COL.NAMA_SPIR] = data.nama_supir || '';
    fields[COL.JENIS] = data.jenis_transaksi || 'Penerimaan';
    fields[COL.SUMBER_] = SUMBER.TERJADWAL;
    fields[COL.TGL_DATANG] = planDate;
    fields[COL.PLAN_TIBA] = planDate;
    fields[COL.STATUS_KERJA] = STATUS.DIJADWALKAN;
    fields[COL.KETERANGAN] = data.catatan || '';

    sheet.appendRow(buildRow_(sheet, fields));
    logAudit_(byUser, 'BUAT_JADWAL', id, data.vendor + ' / ' + data.no_polisi);
    return { kode_kedatangan: id, status: STATUS.DIJADWALKAN };
  } finally {
    lock.releaseLock();
  }
}

/** Operator catat walk-in. Langsung status Tiba. Wajib: vendor, no_polisi. */
function createWalkin_(data, byUser) {
  requireFields_(data, ['vendor', 'no_polisi']);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // PHASE 1D — lihat komentar di createSchedule_: cek duplikat harus di
    // dalam lock supaya tidak ada race antar-request paralel.
    assertNotDuplicateActiveTruck_(data.no_polisi, null);

    var sheet = getVisitsSheet_();
    var now = new Date();
    var id = generateUnloadId(now);

    var fields = {};
    fields[COL.ID] = id;
    fields[COL.TIMESTAMP] = now;
    fields[COL.SUPPLIER] = data.vendor;
    fields[COL.NO_SJ] = data.no_po || '';
    fields[COL.NO_POLISI] = data.no_polisi;
    fields[COL.NAMA_SPIR] = data.nama_supir || '';
    fields[COL.JENIS] = data.jenis_transaksi || 'Penerimaan';
    fields[COL.SUMBER_] = SUMBER.WALKIN;
    fields[COL.TGL_DATANG] = now;
    fields[COL.JAM_DATANG] = now;
    fields[COL.OP_TIBA] = byUser.nama;
    fields[COL.PIC] = byUser.nama;
    fields[COL.STATUS_KERJA] = STATUS.TIBA;
    fields[COL.STATUS_LAMA] = 'SUDAH DATANG';
    fields[COL.KETERANGAN] = data.catatan || '';

    sheet.appendRow(buildRow_(sheet, fields));
    logAudit_(byUser, 'WALKIN', id, data.vendor + ' / ' + data.no_polisi);
    return { kode_kedatangan: id, status: STATUS.TIBA };
  } finally {
    lock.releaseLock();
  }
}

// ===================== ACTIONS: ALUR STATUS =====================

function markTiba_(data, byUser) {
  requireFields_(data, ['kode_kedatangan']);

  return updateVisit_(data.kode_kedatangan, STATUS.DIJADWALKAN, STATUS.TIBA, function (obj) {
    var now = new Date();
    obj[COL.JAM_DATANG] = now;
    obj[COL.OP_TIBA] = byUser.nama;
    obj[COL.PIC] = byUser.nama;
    obj[COL.STATUS_KERJA] = STATUS.TIBA;
    obj[COL.STATUS_LAMA] = 'SUDAH DATANG';
    obj._meta_audit = { by: byUser, aksi: 'TIBA' };
  });
}

function markMulaiBongkar_(data, byUser) {
  requireFields_(data, ['kode_kedatangan', 'dock']);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getVisitsSheet_();
    var rowIndex = findRowIndexById_(sheet, data.kode_kedatangan);
    if (rowIndex === -1) throw new Error('Unload_ID tidak ditemukan: ' + data.kode_kedatangan);

    var lastCol = sheet.getLastColumn();
    var rowRange = sheet.getRange(rowIndex, 1, 1, lastCol);
    var rowArray = rowRange.getValues()[0];
    var map = getHeaderMap_(sheet);
    var obj = rowToObj_(map, rowArray);

    if (obj[COL.STATUS_KERJA] !== STATUS.TIBA) {
      throw new Error('Transisi tidak valid. Status saat ini: "' + obj[COL.STATUS_KERJA] +
        '", harus "' + STATUS.TIBA + '" untuk mulai bongkar.');
    }

    var dock = validateDockFree_(data.dock, data.kode_kedatangan);

    var now = new Date();
    obj[COL.JAM_MULAI] = now;
    obj[COL.OP_BONGKAR] = byUser.nama;
    obj[COL.STATUS_KERJA] = STATUS.SEDANG_BONGKAR;
    obj[COL.DOCK] = dock;

    writeObjBack_(sheet, rowRange, map, obj);
    logAudit_(byUser, 'MULAI_BONGKAR', data.kode_kedatangan, 'Dock ' + dock);
    return { kode_kedatangan: data.kode_kedatangan, status: STATUS.SEDANG_BONGKAR, dock: dock, operator_bongkar: byUser.nama };
  } finally {
    lock.releaseLock();
  }
}

/** Jeda istirahat saat Sedang Bongkar -> isi kolom R. */
function pauseBreak_(data, byUser) {
  requireFields_(data, ['kode_kedatangan']);

  return updateVisit_(data.kode_kedatangan, STATUS.SEDANG_BONGKAR, STATUS.SEDANG_BONGKAR, function (obj) {
    if (obj[COL.OP_BONGKAR] !== byUser.nama) {
      throw new Error('Truk ini dipegang oleh "' + (obj[COL.OP_BONGKAR] || '-') + '", bukan ' + byUser.nama + '.');
    }
    if (obj[COL.BREAK_START]) {
      throw new Error('Istirahat sudah dimulai dan belum diselesaikan.');
    }
    obj[COL.BREAK_START] = new Date();
    obj._meta_audit = { by: byUser, aksi: 'JEDA_ISTIRAHAT' };
  });
}

/** Lanjut kerja setelah istirahat -> isi kolom S. */
function resumeBreak_(data, byUser) {
  requireFields_(data, ['kode_kedatangan']);

  return updateVisit_(data.kode_kedatangan, STATUS.SEDANG_BONGKAR, STATUS.SEDANG_BONGKAR, function (obj) {
    if (obj[COL.OP_BONGKAR] !== byUser.nama) {
      throw new Error('Truk ini dipegang oleh "' + (obj[COL.OP_BONGKAR] || '-') + '", bukan ' + byUser.nama + '.');
    }
    if (!obj[COL.BREAK_START]) throw new Error('Belum ada jeda istirahat yang berjalan.');
    if (obj[COL.BREAK_END]) throw new Error('Istirahat sudah selesai sebelumnya (hanya 1x jeda per truk).');
    obj[COL.BREAK_END] = new Date();
    obj._meta_audit = { by: byUser, aksi: 'LANJUT_ISTIRAHAT' };
  });
}

/**
 * Selesaikan bongkar. WAJIB: qty (>0), satuan, temuan.
 * Mengisi kolom lama: QTY (I), Satuan (J), Status (K)=SELESAI,
 * Durasi Tunggu (L), Durasi Bongkar (M), Temuan Abnormal (N).
 */
function markSelesaiBongkar_(data, byUser) {
  requireFields_(data, ['kode_kedatangan', 'qty', 'satuan', 'temuan']);
  var qty = Number(data.qty);
  if (isNaN(qty) || qty <= 0) throw new Error('QTY harus angka lebih besar dari 0.');

  return updateVisit_(data.kode_kedatangan, STATUS.SEDANG_BONGKAR, STATUS.SELESAI, function (obj) {
    if (obj[COL.OP_BONGKAR] !== byUser.nama) {
      throw new Error('Truk ini dipegang oleh "' + (obj[COL.OP_BONGKAR] || '-') + '", bukan ' + byUser.nama + '.');
    }
    var now = new Date();
    obj[COL.JAM_SELESAI] = now;
    obj[COL.QTY] = qty;
    obj[COL.SATUAN] = data.satuan;
    obj[COL.TEMUAN] = data.temuan;
    obj[COL.STATUS_KERJA] = STATUS.SELESAI;
    obj[COL.STATUS_LAMA] = 'SELESAI';
    if (data.keterangan) {
      obj[COL.KETERANGAN] = String(obj[COL.KETERANGAN] || '') + ' | Catatan operator: ' + data.keterangan;
    }

    // Hitung durasi (menit, dibulatkan) dari kolom jam yang tersimpan.
    var tDatang = toDateSafe_(obj[COL.JAM_DATANG]);
    var tMulai = toDateSafe_(obj[COL.JAM_MULAI]);
    var tSelesai = now;
    var brkStart = toDateSafe_(obj[COL.BREAK_START]);
    var brkEnd = toDateSafe_(obj[COL.BREAK_END]);

    if (tDatang && tMulai) {
      obj[COL.DURASI_TUNGGU] = Math.round((tMulai - tDatang) / 60000);
    }
    if (tMulai && tSelesai) {
      var dur = (tSelesai - tMulai) / 60000;
      if (brkStart && brkEnd && brkEnd > brkStart) {
        dur -= (brkEnd - brkStart) / 60000; // potong waktu istirahat
      }
      obj[COL.DURASI_BONGKAR] = Math.max(0, Math.round(dur));
    }
    obj._meta_audit = { by: byUser, aksi: 'SELESAI', detail: qty + ' ' + data.satuan + ' | ' + data.temuan };
  });
}

function cancelVisit_(data, byUser) {
  requireFields_(data, ['kode_kedatangan']);

  return updateVisit_(data.kode_kedatangan, STATUS.DIJADWALKAN, STATUS.DIBATALKAN, function (obj) {
    obj[COL.STATUS_KERJA] = STATUS.DIBATALKAN;
    obj[COL.KETERANGAN] = data.catatan
      ? (String(obj[COL.KETERANGAN] || '') + ' | Dibatalkan oleh ' + byUser.nama + ': ' + data.catatan)
      : obj[COL.KETERANGAN];
    obj._meta_audit = { by: byUser, aksi: 'BATALKAN' };
  });
}

/**
 * Koreksi data oleh ADMIN, hanya sebelum status Selesai/Dibatalkan.
 * Field opsional: supplier, no_polisi, nama_supir, no_surat_jalan, catatan.
 */
function editVisit_(data, byUser) {
  requireFields_(data, ['kode_kedatangan']);
  var allowed = ['supplier', 'no_polisi', 'nama_supir', 'no_surat_jalan', 'catatan'];
  var adaPerubahan = allowed.some(function (f) { return data[f] !== undefined && data[f] !== null && data[f] !== ''; });
  if (!adaPerubahan) throw new Error('Tidak ada field yang diubah.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getVisitsSheet_();
    var rowIndex = findRowIndexById_(sheet, data.kode_kedatangan);
    if (rowIndex === -1) throw new Error('Unload_ID tidak ditemukan: ' + data.kode_kedatangan);

    var lastCol = sheet.getLastColumn();
    var rowRange = sheet.getRange(rowIndex, 1, 1, lastCol);
    var rowArray = rowRange.getValues()[0];
    var map = getHeaderMap_(sheet);
    var obj = rowToObj_(map, rowArray);

    var st = String(obj[COL.STATUS_KERJA] || '');
    if (st === STATUS.SELESAI || st === STATUS.DIBATALKAN) {
      throw new Error('Truk berstatus ' + st + ' tidak bisa diedit lagi.');
    }

    var changes = [];
    if (data.supplier !== undefined && data.supplier !== '' && data.supplier !== obj[COL.SUPPLIER]) {
      changes.push('Supplier: ' + obj[COL.SUPPLIER] + ' -> ' + data.supplier);
      obj[COL.SUPPLIER] = data.supplier;
    }
    if (data.no_polisi !== undefined && data.no_polisi !== '' && normalizePlate_(data.no_polisi) !== normalizePlate_(obj[COL.NO_POLISI])) {
      assertNotDuplicateActiveTruck_(data.no_polisi, data.kode_kedatangan);
      changes.push('Nopol: ' + obj[COL.NO_POLISI] + ' -> ' + data.no_polisi);
      obj[COL.NO_POLISI] = data.no_polisi;
    }
    if (data.nama_supir !== undefined && data.nama_supir !== '' && data.nama_supir !== obj[COL.NAMA_SPIR]) {
      changes.push('Supir: ' + obj[COL.NAMA_SPIR] + ' -> ' + data.nama_supir);
      obj[COL.NAMA_SPIR] = data.nama_supir;
    }
    if (data.no_surat_jalan !== undefined && data.no_surat_jalan !== '' && data.no_surat_jalan !== obj[COL.NO_SJ]) {
      changes.push('No SJ: ' + obj[COL.NO_SJ] + ' -> ' + data.no_surat_jalan);
      obj[COL.NO_SJ] = data.no_surat_jalan;
    }
    if (data.catatan !== undefined && data.catatan !== '') {
      changes.push('Catatan ditambahkan');
      obj[COL.KETERANGAN] = String(obj[COL.KETERANGAN] || '') + ' | Edit admin: ' + data.catatan;
    }

    if (changes.length === 0) throw new Error('Nilai baru sama dengan nilai lama.');
    writeObjBack_(sheet, rowRange, map, obj);
    logAudit_(byUser, 'EDIT_DATA', data.kode_kedatangan, changes.join('; '));

    return { kode_kedatangan: data.kode_kedatangan, changed: changes };
  } finally {
    lock.releaseLock();
  }
}

// ===================== READ: LIST VISITS =====================

function toIsoSafe_(v) {
  if (!v) return '';
  var d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Versi murah dari toIsoSafe_: hanya mengembalikan epoch ms (atau 0),
 *  tanpa membuat string ISO. Dipakai untuk pre-filter cepat SEBELUM
 *  baris "dimahalkan" jadi objek penuh lewat mapVisitRow_ - lihat
 *  bootstrapData_. */
function toMsSafe_(v) {
  if (!v) return 0;
  var d = (v instanceof Date) ? v : new Date(v);
  var t = d.getTime();
  return isNaN(t) ? 0 : t;
}

/** Ubah satu baris mentah (array nilai sheet) jadi objek visit yang
 *  dipakai front-end. Diekstrak dari listVisits_ supaya bisa dipanggil
 *  per-baris setelah pre-filter murah di bootstrapData_ (PHASE 1E —
 *  hindari membangun objek penuh untuk baris yang toh akan dibuang). */
function mapVisitRow_(headerMap, r) {
  var o = rowToObj_(headerMap, r);
  return {
    kode_kedatangan: o[COL.ID],
    vendor: o[COL.SUPPLIER],
    no_polisi: o[COL.NO_POLISI],
    no_surat_jalan: o[COL.NO_SJ],
    nama_supir: o[COL.NAMA_SPIR],
    jenis_transaksi: o[COL.JENIS],
    sumber: o[COL.SUMBER_],
    tanggal_kedatangan: toIsoSafe_(o[COL.TGL_DATANG]),
    plan_tiba: toIsoSafe_(o[COL.PLAN_TIBA]),
    aktual_tiba: toIsoSafe_(o[COL.JAM_DATANG]),
    mulai_bongkar: toIsoSafe_(o[COL.JAM_MULAI]),
    selesai_bongkar: toIsoSafe_(o[COL.JAM_SELESAI]),
    break_start: toIsoSafe_(o[COL.BREAK_START]),
    break_end: toIsoSafe_(o[COL.BREAK_END]),
    operator_tiba: o[COL.OP_TIBA],
    operator_bongkar: o[COL.OP_BONGKAR],
    dock: (o[COL.DOCK] === '' || o[COL.DOCK] === undefined) ? null : Number(o[COL.DOCK]),
    qty: (o[COL.QTY] === '' || o[COL.QTY] === undefined) ? null : Number(o[COL.QTY]),
    satuan: o[COL.SATUAN],
    temuan: o[COL.TEMUAN],
    durasi_tunggu_menit: (o[COL.DURASI_TUNGGU] === '' || o[COL.DURASI_TUNGGU] === undefined) ? null : Number(o[COL.DURASI_TUNGGU]),
    durasi_bongkar_menit: (o[COL.DURASI_BONGKAR] === '' || o[COL.DURASI_BONGKAR] === undefined) ? null : Number(o[COL.DURASI_BONGKAR]),
    status: o[COL.STATUS_KERJA],
    status_lama: o[COL.STATUS_LAMA],
    catatan: o[COL.KETERANGAN],
    dibuat_pada: o[COL.TIMESTAMP],
    _ts_iso: toIsoSafe_(o[COL.TIMESTAMP])
  };
}

/**
 * Daftar dari "Data Unloading" dalam bentuk yang dipakai front-end.
 * Filter opsional: date (yyyy-MM-dd vs Timestamp), vendor (substring), status (exact).
 */
function listVisits_(date, vendor, status) {
  var sheet = getVisitsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var headerMap = getHeaderMap_(sheet);
  var tz = Session.getScriptTimeZone();

  var rows = values.map(function (r) {
    return mapVisitRow_(headerMap, r);
  }).filter(function (r) { return !!r.kode_kedatangan; });

  if (date) {
    rows = rows.filter(function (r) {
      var created = (r.dibuat_pada instanceof Date) ? r.dibuat_pada :
        ((r.tanggal_kedatangan ? new Date(r.tanggal_kedatangan) : null));
      if (!created || isNaN(created.getTime())) return false;
      return Utilities.formatDate(created, tz, 'yyyy-MM-dd') === date;
    });
  }
  if (vendor) {
    var needle = String(vendor).toLowerCase();
    rows = rows.filter(function (r) { return String(r.vendor || '').toLowerCase().indexOf(needle) !== -1; });
  }
  if (status) {
    rows = rows.filter(function (r) { return r.status === status; });
  }
  return rows;
}

/** Payload gabungan untuk refresh cepat front-end.
 *  Tanpa param date: hanya kirim truk dengan antrean aktif + riwayat 30 hari terakhir
 *  agar payload tetap ringan seiring bertambahnya data.
 *
 *  PHASE 1E — OPTIMISASI: dibanding sebelumnya (listVisits_ lalu filter
 *  hasil jadi), di sini kita cek dulu status/tanggal dari BARIS MENTAH
 *  (pakai toMsSafe_, murah) SEBELUM memanggil mapVisitRow_ (mahal - ada
 *  banyak toIsoSafe_/Number per baris). Baris di luar jendela 30 hari
 *  jadi tidak pernah "dimahalkan" jadi objek penuh. Ini penting karena
 *  sheet ini terus bertambah dan tidak diarsipkan - tanpa ini, biaya
 *  bootstrap tumbuh linear terhadap SELURUH riwayat, bukan cuma
 *  terhadap data yang benar-benar dikirim ke klien. */
function bootstrapData_(date) {
  var sheet = getVisitsSheet_();
  var lastRow = sheet.getLastRow();
  var visits = [];

  if (lastRow >= 2) {
    var lastCol = sheet.getLastColumn();
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var headerMap = getHeaderMap_(sheet);
    var tz = Session.getScriptTimeZone();
    var idIdx = headerMap[COL.ID] - 1;
    var statusIdx = headerMap[COL.STATUS_KERJA] - 1;
    var tsIdx = headerMap[COL.TIMESTAMP] - 1;
    var tglIdx = headerMap[COL.TGL_DATANG] - 1;
    var planIdx = headerMap[COL.PLAN_TIBA] - 1;
    var cutoff = date ? 0 : (Date.now() - 30 * 86400000);

    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (!r[idIdx]) continue; // baris kosong - lewati tanpa membangun objek

      if (date) {
        // Perlu cocok tanggal spesifik - cek murah dulu dari Timestamp mentah.
        var createdMs = toMsSafe_(r[tsIdx]) || toMsSafe_(r[tglIdx]);
        if (!createdMs) continue;
        if (Utilities.formatDate(new Date(createdMs), tz, 'yyyy-MM-dd') !== date) continue;
      } else if (STATUS_AKTIF_ANTREAN.indexOf(r[statusIdx]) === -1) {
        // Bukan antrean aktif -> hanya ikut kalau masih dalam jendela 30 hari.
        var ref = Math.max(toMsSafe_(r[tsIdx]), toMsSafe_(r[tglIdx]), toMsSafe_(r[planIdx]));
        if (ref !== 0 && ref < cutoff) continue;
      }

      visits.push(mapVisitRow_(headerMap, r));
    }
  }

  return {
    visits: visits,
    suppliers: readActiveSuppliers_(),
    operators: readActiveOperators_(),
    settings: readSettings_(),
    jumlah_dock: getJumlahDock_()
  };
}

// ===================== UPDATE ENGINE =====================

function writeObjBack_(sheet, rowRange, map, obj) {
  var auditMeta = obj._meta_audit || null;
  delete obj._meta_audit;
  var newRow = rowRange.getValues()[0].slice();
  Object.keys(obj).forEach(function (h) {
    if (map[h]) newRow[map[h] - 1] = obj[h];
  });
  rowRange.setValues([newRow]);
  if (auditMeta) {
    logAudit_(auditMeta.by, auditMeta.aksi, obj[COL.ID] || '', auditMeta.detail || '');
  }
}

/**
 * Update 1 baris dengan validasi transisi status + locking.
 * mutateFn menerima object (keyed by header name) dan boleh mengubah in-place.
 * Kolom lain tidak disentuh.
 * @param {string} id - Unload_ID of the row to update
 * @param {string} expectedStatus - Status yang harus ada saat ini
 * @param {string} nextStatus - Status yang akan dihasilkan
 * @param {function} mutateFn - Function that modifies the row object
 * @returns {{kode_kedatangan:string, status:string, operator_bongkar:string}}
 */
function updateVisit_(id, expectedStatus, nextStatus, mutateFn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getVisitsSheet_();
    var rowIndex = findRowIndexById_(sheet, id);
    if (rowIndex === -1) {
      throw new Error('Unload_ID tidak ditemukan: ' + id);
    }

    var lastCol = sheet.getLastColumn();
    var rowRange = sheet.getRange(rowIndex, 1, 1, lastCol);
    var rowArray = rowRange.getValues()[0];
    var map = getHeaderMap_(sheet);
    var obj = rowToObj_(map, rowArray);

    // Type check: status field must exist
    if (typeof obj[COL.STATUS_KERJA] !== 'string') {
      throw new Error('Field Status Kerja tidak valid atau tidak ditemukan.');
    }

    if (obj[COL.STATUS_KERJA] !== expectedStatus) {
      throw new Error(
        'Transisi status tidak valid. Status saat ini: "' + obj[COL.STATUS_KERJA] +
        '", diharapkan: "' + expectedStatus + '" untuk menuju "' + nextStatus + '".');
    }

    mutateFn(obj);

    writeObjBack_(sheet, rowRange, map, obj);

    return {
      kode_kedatangan: obj[COL.ID],
      status: obj[COL.STATUS_KERJA],
      operator_bongkar: obj[COL.OP_BONGKAR]
    };
  } finally {
    lock.releaseLock();
  }
}

function toDateSafe_(v) {
  if (!v) return null;
  var d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ===================== ACTIONS: ADMIN OPERATORS & SETTINGS =====================

function addOperator_(data, byUser) {
  requireFields_(data, ['nama_operator']);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OPERATORS);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return r[0]; });
      if (existing.indexOf(data.nama_operator) !== -1) {
        throw new Error('Nama operator "' + data.nama_operator + '" sudah ada.');
      }
    }
    sheet.appendRow([data.nama_operator, true]);
    logAudit_(byUser, 'OPERATOR_TAMBAH', '', data.nama_operator);
    return { nama_operator: data.nama_operator, aktif: true };
  } finally {
    lock.releaseLock();
  }
}

function setOperatorAktif_(data, byUser) {
  requireFields_(data, ['nama_operator']);
  if (data.aktif === undefined) throw new Error('Field wajib belum diisi: aktif');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OPERATORS);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('Belum ada data operator.');
    var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (names[i][0] === data.nama_operator) {
        sheet.getRange(i + 2, 2).setValue(data.aktif === true || data.aktif === 'true');
        logAudit_(byUser, 'OPERATOR_TOGGLE', '', data.nama_operator + ' -> ' + (data.aktif ? 'aktif' : 'nonaktif'));
        return { nama_operator: data.nama_operator, aktif: data.aktif };
      }
    }
    throw new Error('Operator "' + data.nama_operator + '" tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}

function updateSetting_(data, byUser) {
  requireFields_(data, ['key']);
  if (data.value === undefined) throw new Error('Field wajib belum diisi: value');

  // Validasi nilai numerik untuk key bawaan agar sheet tidak rusak (mis. NaN/null).
  var NUMERIC_KEYS = ['threshold_tepat_waktu_menit', 'threshold_telat_parah_menit', 'jumlah_dock'];
  if (NUMERIC_KEYS.indexOf(data.key) !== -1) {
    var n = Number(data.value);
    if (isNaN(n)) throw new Error('Nilai untuk "' + data.key + '" harus angka.');
    if (data.key === 'jumlah_dock') {
      if (n < 1 || Math.floor(n) !== n) throw new Error('Jumlah dock harus bilangan bulat minimal 1.');
    } else if (n < 0) {
      throw new Error('Nilai threshold tidak boleh negatif.');
    }
    data.value = n;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('Sheet Settings kosong. Jalankan setupAll() dulu.');
    var keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (keys[i][0] === data.key) {
        sheet.getRange(i + 2, 2).setValue(data.value);
        logAudit_(byUser, 'SETTING_UPDATE', '', data.key + ' -> ' + data.value);
        return { key: data.key, value: data.value };
      }
    }
    throw new Error('Setting key "' + data.key + '" tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}

// ===================== CEK DELAY TELEGRAM =====================

/**
 * Cek setiap 5 menit untuk truk yang menunggu melewati batas telat parah.
 * Dijalankan via trigger time-driven di Apps Script.
 */
function checkDelayAlerts_() {
  var sheet = getVisitsSheet_();
  var map = getHeaderMap_(sheet);
  var idCol = map['Unload_ID'];
  var dockCol = map['Dock'];
  var statusCol = map['Status Kerja'];
  var tMulaiCol = map['Jam Mulai Bongkar'];
  var tDatangCol = map['Jam Kedatangan'];
  var operatorCol = map['Operator Bongkar'];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var BATAS_TELAT_PARAH = 60; // menit

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rowIndex = i + 2;

    if (!row[idCol - 1] || String(row[statusCol - 1]) !== STATUS.SEDANG_BONGKAR) continue;

    var tMulai = toDateSafe_(row[tMulaiCol - 1]);
    var tDatang = toDateSafe_(row[tDatangCol - 1]);

    if (!tMulai || !tDatang) continue;

    // Hitung durasi menunggu dari tDatang sampai now
    var durMenit = Math.round((now - tDatang) / 60000);

    // Jika sudah melewati batas parah
    if (durMenit >= BATAS_TELAT_PARAH) {
      var noPolisi = row[map['No. Polisi'] - 1] || '-';
      var operator = row[operatorCol - 1] || '-';
      var unloadId = row[idCol - 1] || '-';

      // Kirim alert ke semua admin
      var alertText = '⚠️ *ALERT TRUK TELAT*\\n' +
        'Truk: *' + noPolisi + '*\\n' +
        'ID: ' + unloadId + '\\n' +
        'Menunggu: *' + durMenit + '* menit\\n' +
        'Operator: ' + operator + '\\n' +
        'Waktu mulai: ' + Utilities.formatDate(tMulai, tz, 'HH:mm') +
        '. Sudah melewati batas *60 menit*';

      sendToAllAdmins_(alertText, 'Markdown');

      // Log alert
      logAudit_(null, 'TELEGRAM_DELAY_ALERT', unloadId, 'Truk ' + noPolisi + ' menunggu ' + durMenit + ' menit');
    }
  }
}

/**
 * Konversi nilai ke Date safely.
 */
function toDateSafe_(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(val);
}

// ===================== HELPERS VALIDASI =====================

function requireFields_(data, fields) {
  var missing = fields.filter(function (f) {
    return data[f] === undefined || data[f] === null || data[f] === '';
  });
  if (missing.length > 0) {
    throw new Error('Field wajib belum diisi: ' + missing.join(', '));
  }
}

function validateOperatorAktif_(nama) {
  var aktif = readActiveOperators_();
  if (aktif.indexOf(nama) === -1) {
    throw new Error('Operator "' + nama + '" tidak ditemukan atau tidak aktif.');
  }
}

// ===================== RESPONSE =====================

function respondJson_(obj) {
  obj.server_time = new Date().toISOString();
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function respondError_(message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================== TELEGRAM FUNCTIONS =====================

function initTelegramConfig_() {
  var props = PropertiesService.getScriptProperties();
  var storedToken = props.getProperty('TELEGRAM_BOT_TOKEN');
  if (storedToken) {
    BOT_TOKEN = storedToken;
  } else {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
    if (sheet) {
      var val = sheet.getRange('B2').getValue();
      if (val) {
        BOT_TOKEN = val;
        props.setProperty('TELEGRAM_BOT_TOKEN', val);
      }
    }
  }

  var adminsVal = '';
  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (sheet) {
    adminsVal = sheet.getRange('B3').getValue();
  }
  if (adminsVal) {
    ADMIN_CHAT_IDS = adminsVal.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
  }
}

function sendTelegramMessage_(chatId, text, parseMode) {
  var url = 'https://api.telegram.org/bot' + BOT_TOKEN;
  var options = {
    method: 'post',
    payload: {
      chat_id: chatId,
      text: text,
      parse_mode: parseMode || 'Markdown'
    }
  };
  try {
    UrlFetchApp.fetch(url + '/sendMessage', options);
    return { ok: true };
  } catch (e) {
    logAudit_(null, 'TELEGRAM_ERROR', '', 'chatId: ' + chatId + ' | error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function sendToAllAdmins_(text, parseMode) {
  var admins = ADMIN_CHAT_IDS || [];
  var results = [];
  admins.forEach(function(chatId) {
    var r = sendTelegramMessage_(chatId, text, parseMode);
    results.push({ chatId: chatId, result: r });
  });
  return results;
}

function sendDelayAlert_(unloadId, noPolisi, duratiMenit) {
  var alertText = '⚠️ *ALERT TRUK TELAT*\\n' +
    'Truk: *' + noPolisi + '*\\n' +
    'ID: ' + unloadId + '\\n' +
    'Menunggu: *' + duratiMenit + '* menit\\n' +
    'Batas parah: 60 menit';
  return sendToAllAdmins_(alertText, 'Markdown');
}

function telegramInput_(data, byUser) {
  requireFields_(data, ['kode_kedatangan', 'command']);
  var kode = data.kode_kedatangan;
  var cmd = data.command;

  // Parse command
  if (cmd === 'mulai') {
    requireFields_(data, ['dock']);
    return markMulaiBongkar_({kode_kedatangan: kode, dock: data.dock}, byUser);
  } else if (cmd === 'selesai') {
    requireFields_(data, ['qty', 'satuan', 'temuan']);
    return markSelesaiBongkar_({kode_kedatangan: kode, qty: data.qty, satuan: data.satuan, temuan: data.temuan, keterangan: data.keterangan}, byUser);
  } else if (cmd === 'status') {
    // Kembalikan status current
    var sheet = getVisitsSheet_();
    var map = getHeaderMap_(sheet);
    var idCol = map['Unload_ID'];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, data: [] };
    var values = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    var result = values.filter(function(r) { return r[0] === kode; });
    return { ok: true, data: result ? [result[0]] : [] };
  } else {
    throw new Error('Command Telegram tidak dikenal: ' + cmd);
  }
}

function doPost(e) {
  // ... existing code ...
  // ADD case telegram inside the switch
  case 'telegram':
    requireRole_(user, [ROLES.ADMIN]);
    result = telegramInput_(data, user);
    break;
  // ... existing code continues
}
