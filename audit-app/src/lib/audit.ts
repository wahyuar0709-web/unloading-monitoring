export interface AuditEntry {
  timestamp: string;
  user: string;
  aksi: string;
  unload_id: string;
  detail: string;
}

export interface Me {
  username: string;
  nama: string;
  role: string;
}

export interface Creds {
  url: string;
  user: string;
  pass: string;
}

const LS = {
  url: "unl_audit_url",
  user: "unl_audit_user",
  pass: "unl_audit_pass",
};

export function loadCreds(): Creds {
  return {
    url: localStorage.getItem(LS.url) || "",
    user: localStorage.getItem(LS.user) || "",
    pass: localStorage.getItem(LS.pass) || "",
  };
}

export function saveCreds(c: Creds): void {
  localStorage.setItem(LS.url, c.url.trim());
  localStorage.setItem(LS.user, c.user);
  localStorage.setItem(LS.pass, c.pass);
}

export function clearCreds(): void {
  Object.values(LS).forEach((k) => localStorage.removeItem(k));
}

const ERROR_CATEGORIES = {
  NETWORK: "network",
  AUTH: "auth",
  SERVER: "server",
  VALIDATION: "validation",
  UNKNOWN: "unknown",
};

export function errorCategory(message: string): keyof typeof ERROR_CATEGORIES {
  const lower = (message || "").toLowerCase();
  if (/auth|login|credent/.test(lower)) return "AUTH";
  if (/network|connection|fetch|timeout/.test(lower)) return "NETWORK";
  if (/server|error|invalid/.test(lower)) return "SERVER";
  return "UNKNOWN";
}

function baseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export async function apiLogin(
  url: string,
  user: string,
  pass: string
): Promise<Me> {
  const res = await fetch(baseUrl(url), {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "login", username: user, password: pass }),
  });
  const j = await res.json();
  if (!j.ok) {
    throw new Error(
      `${errorCategory(j.error || "unknown")}: ${j.error || "Login gagal"}`
    );
  }
  return j.data as Me;
}

export async function fetchAudit(
  creds: Creds,
  limit: number
): Promise<AuditEntry[]> {
  const q =
    "?action=audit" +
    "&limit=" +
    encodeURIComponent(String(limit)) +
    "&username=" +
    encodeURIComponent(creds.user) +
    "&password=" +
    encodeURIComponent(creds.pass);
  let res: Response;
  try {
    res = await fetch(baseUrl(creds.url) + q, { redirect: "follow" });
  } catch {
    throw new Error(
      `${ERROR_CATEGORIES.NETWORK}: Gagal terhubung ke Web App. Periksa URL / koneksi.`
    );
  }
  const j = await res.json();
  if (!j.ok) throw new Error(`${errorCategory(j.error || "unknown")}: ${j.error || "Kesalahan server"}`);
  const rows = (j.data || []) as AuditEntry[];
  return rows.map((r) => ({
    timestamp: r.timestamp || "",
    user: r.user || "-",
    aksi: r.aksi || "",
    unload_id: r.unload_id || "",
    detail: r.detail || "",
  }));
}

/* ---------------- Action metadata ---------------- */

export type Category = "AUTH" | "TRUCK" | "ADMIN" | "SETTINGS" | "OTHER";
export type Tone =
  | "sky"
  | "red"
  | "amber"
  | "green"
  | "indigo"
  | "slate"
  | "gray";

interface ActionMeta {
  cat: Category;
  label: string;
  tone: Tone;
}

const META: Record<string, ActionMeta> = {
  LOGIN: { cat: "AUTH", label: "Login", tone: "sky" },
  LOGIN_GAGAL: { cat: "AUTH", label: "Login Gagal", tone: "red" },
  GANTI_PASSWORD: { cat: "AUTH", label: "Ganti Password", tone: "sky" },
  BUAT_JADWAL: { cat: "ADMIN", label: "Buat Jadwal", tone: "slate" },
  WALKIN: { cat: "TRUCK", label: "Walk-in", tone: "slate" },
  TIBA: { cat: "TRUCK", label: "Truk Tiba", tone: "sky" },
  MULAI_BONGKAR: { cat: "TRUCK", label: "Mulai Bongkar", tone: "amber" },
  JEDA_ISTIRAHAT: { cat: "TRUCK", label: "Jeda Istirahat", tone: "gray" },
  LANJUT_ISTIRAHAT: { cat: "TRUCK", label: "Lanjut Kerja", tone: "green" },
  SELESAI: { cat: "TRUCK", label: "Selesai Bongkar", tone: "green" },
  BATALKAN: { cat: "TRUCK", label: "Batalkan", tone: "red" },
  EDIT_DATA: { cat: "ADMIN", label: "Koreksi Data", tone: "amber" },
  USER_BUAT: { cat: "ADMIN", label: "Buat User", tone: "indigo" },
  USER_RESET_PASSWORD: { cat: "ADMIN", label: "Reset Password", tone: "indigo" },
  USER_AKTIFKAN: { cat: "ADMIN", label: "Aktifkan User", tone: "indigo" },
  USER_NONAKTIFKAN: { cat: "ADMIN", label: "Nonaktifkan User", tone: "indigo" },
  OPERATOR_TAMBAH: { cat: "ADMIN", label: "Tambah Operator", tone: "indigo" },
  OPERATOR_TOGGLE: { cat: "ADMIN", label: "Toggle Operator", tone: "indigo" },
  SETTING_UPDATE: { cat: "SETTINGS", label: "Ubah Setting", tone: "amber" },
};

export function metaOf(aksi: string): ActionMeta {
  return (
    META[aksi] || { cat: "OTHER" as Category, label: aksi || "-", tone: "gray" }
  );
}

export const TONE_CLASS: Record<Tone, string> = {
  sky: "bg-sky-100 text-sky-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  indigo: "bg-indigo-100 text-indigo-700",
  slate: "bg-slate-200 text-slate-700",
  gray: "bg-slate-100 text-slate-500",
};

/* ---------------- Formatting ---------------- */

const TZ = "Asia/Jakarta";

export function fmtDateTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  try {
    return d.toLocaleString("id-ID", {
      timeZone: TZ,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ymdJakarta(ms: number): string {
  const d = new Date(ms + 7 * 3600000);
  return d.toISOString().slice(0, 10);
}

const DAY_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function last7Days(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const ms = now - i * 86400000;
    const d = new Date(ms + 7 * 3600000);
    out.push({
      key: ymdJakarta(ms),
      label: DAY_ID[d.getUTCDay()] + " " + d.getUTCDate() + "/" + (d.getUTCMonth() + 1),
    });
  }
  return out;
}

/* ---------------- CSV export ---------------- */

export function exportCsv(rows: AuditEntry[]): void {
  const head = ["Waktu", "User", "Aksi", "Unload_ID", "Detail"];
  const body = rows.map((r) => [
    fmtDateTime(r.timestamp),
    r.user,
    metaOf(r.aksi).label,
    r.unload_id,
    r.detail,
  ]);
  const csv =
    "\uFEFF" +
    [head].concat(body)
      .map((row) =>
        row
          .map((c) => {
            const s = String(c == null ? "" : c);
            return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(";")
      )
      .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "audit-unloading.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
