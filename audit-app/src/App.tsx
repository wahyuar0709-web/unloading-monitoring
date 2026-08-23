import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  LogOut,
  RefreshCw,
  ScrollText,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  apiLogin,
  clearCreds,
  exportCsv,
  fetchAudit,
  fmtDateTime,
  last7Days,
  loadCreds,
  metaOf,
  saveCreds,
  TONE_CLASS,
  ymdJakarta,
  type AuditEntry,
  type Creds,
  type Me,
  type Tone,
} from "@/lib/audit";

const BAR_CLASS: Record<Tone, string> = {
  sky: "bg-sky-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-green-600",
  indigo: "bg-indigo-500",
  slate: "bg-slate-400",
  gray: "bg-slate-300",
};

const RENDER_CAP = 500;

/* ================= LOGIN ================= */

function LoginScreen({
  initialUrl,
  onSubmit,
}: {
  initialUrl: string;
  onSubmit: (url: string, user: string, pass: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!url.trim() || !user.trim() || !pass.trim()) {
      setErr("URL Web App, username, dan password wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(url, user, pass);
    } catch (e2) {
      setErr(String((e2 as Error).message || "Login gagal").replace("AUTH: ", ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(160deg,#0f172a 0%,#1e3a5f 100%)" }}
    >
      <form
        onSubmit={handle}
        autoComplete="off"
        className="w-full max-w-md bg-white rounded-lg shadow-2xl px-7 py-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <ScrollText className="h-7 w-7 text-blue-600" />
          <h1 className="text-xl font-bold tracking-tight">Audit Log</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Monitoring Unloading Warehouse &mdash; jejak aktivitas operator &amp;
          admin
        </p>

        <details open={!initialUrl} className="mb-4">
          <summary className="cursor-pointer text-sm font-semibold text-blue-600">
            URL Web App (.exec)
          </summary>
          <div className="mt-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/....../exec"
            />
          </div>
        </details>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="au">Username</Label>
            <Input
              id="au"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoCapitalize="none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap">Password</Label>
            <Input
              id="ap"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" disabled={busy} className="w-full mt-5">
          {busy ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" /> Masuk...
            </>
          ) : (
            "Masuk"
          )}
        </Button>

        {err && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
        <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
          Data audit hanya dapat diakses oleh role <b>ADMIN</b>. Kredensial
          disimpan di localStorage perangkat ini &mdash; gunakan hanya pada
          perangkat kerja terpercaya.
        </p>
      </form>
    </div>
  );
}

/* ================= STATS CARD ================= */

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "bad" | "ok";
}) {
  return (
    <Card className="py-3">
      <CardContent className="px-4">
        <div
          className={
            "text-2xl font-extrabold tabular-nums " +
            (tone === "bad"
              ? "text-red-600"
              : tone === "ok"
                ? "text-green-600"
                : "")
          }
        >
          {value}
        </div>
        <div className="text-xs font-semibold text-muted-foreground mt-0.5 uppercase tracking-wide">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================= APP ================= */

export default function App() {
  const [phase, setPhase] = useState<"login" | "ready">("login");
  const [creds, setCreds] = useState<Creds>(() => loadCreds());
  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [aksiSel, setAksiSel] = useState("all");
  const [userSel, setUserSel] = useState("all");
  const [limit, setLimit] = useState("300");
  const [autoRef, setAutoRef] = useState("0");

  const credsRef = useRef(creds);
  credsRef.current = creds;
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const load = useCallback(async (spin: boolean) => {
    const c = credsRef.current;
    if (!c.url || !c.user) return;
    if (spin) setLoading(true);
    try {
      const rows = await fetchAudit(c, Number(limitRef.current) || 300);
      setEntries(rows);
      setError("");
      setLastUpdate(new Date());
    } catch (e) {
      const msg = String((e as Error).message || "");
      if (msg.startsWith("AUTH:")) {
        clearCreds();
        setCreds({ url: "", user: "", pass: "" });
        setMe(null);
        setPhase("login");
        setError(msg.replace("AUTH: ", ""));
        return;
      }
      setError(msg || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = useCallback(
    async (url: string, user: string, pass: string) => {
      const next: Creds = { url, user, pass };
      const m = await apiLogin(url, user, pass);
      saveCreds(next);
      setCreds(next);
      setMe(m);
      setPhase("ready");
    },
    []
  );

  // first load when entering dashboard
  useEffect(() => {
    if (phase !== "ready") return;
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // reload when limit changes (only after ready)
  const firstLimit = useRef(true);
  useEffect(() => {
    if (firstLimit.current) {
      firstLimit.current = false;
      return;
    }
    if (phase === "ready") load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  // auto refresh
  useEffect(() => {
    const sec = Number(autoRef) || 0;
    if (!sec || phase !== "ready") return;
    const t = setInterval(() => {
      if (!document.hidden) load(false);
    }, sec * 1000);
    return () => clearInterval(t);
  }, [autoRef, phase, load]);

  /* ---------- derived data ---------- */

  const users = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.user)))
        .filter((u) => u && u !== "-")
        .sort(),
    [entries]
  );

  const actions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.aksi))).sort(),
    [entries]
  );

  const catsPresent = useMemo(
    () => Array.from(new Set(entries.map((e) => metaOf(e.aksi).cat))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      const m = metaOf(e.aksi);
      if (cat !== "all" && m.cat !== cat) return false;
      if (aksiSel !== "all" && e.aksi !== aksiSel) return false;
      if (userSel !== "all" && e.user !== userSel) return false;
      if (needle) {
        const hay =
          (e.user + " " + m.label + " " + e.aksi + " " + e.unload_id + " " + e.detail)
            .toLowerCase();
        if (hay.indexOf(needle) === -1) return false;
      }
      return true;
    });
  }, [entries, q, cat, aksiSel, userSel]);

  const todayKey = ymdJakarta(Date.now());

  const failedLogins = useMemo(
    () => entries.filter((e) => e.aksi === "LOGIN_GAGAL").length,
    [entries]
  );
  const uniqueUsers = useMemo(
    () => new Set(users).size,
    [users]
  );
  const todayCount = useMemo(
    () =>
      entries.filter(
        (e) => e.timestamp && ymdJakarta(Date.parse(e.timestamp)) === todayKey
      ).length,
    [entries, todayKey]
  );

  const days = useMemo(() => last7Days(), [todayKey]);
  const dayCounts = useMemo(() => {
    const map: Record<string, number> = {};
    days.forEach((d) => (map[d.key] = 0));
    entries.forEach((e) => {
      if (!e.timestamp) return;
      const t = Date.parse(e.timestamp);
      if (isNaN(t)) return;
      const k = ymdJakarta(t);
      if (k in map) map[k]++;
    });
    return days.map((d) => ({ ...d, count: map[d.key] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const topActions = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((e) => {
      const k = e.aksi || "-";
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([aksi, count]) => ({ aksi, count, meta: metaOf(aksi) }));
  }, [filtered]);

  const maxDay = Math.max(1, ...dayCounts.map((d) => d.count));
  const maxAct = Math.max(1, ...topActions.map((a) => a.count));

  const filtersActive = q !== "" || cat !== "all" || aksiSel !== "all" || userSel !== "all";

  function resetFilters() {
    setQ("");
    setCat("all");
    setAksiSel("all");
    setUserSel("all");
  }

  function logout() {
    clearCreds();
    setCreds({ url: "", user: "", pass: "" });
    setMe(null);
    setEntries([]);
    setError("");
    setLastUpdate(null);
    resetFilters();
    setPhase("login");
  }

  if (phase === "login") {
    return (
      <LoginScreen initialUrl={creds.url} onSubmit={handleLogin} />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
          <h1 className="font-bold text-[15px] flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-sky-400" />
            Audit Log &middot; Monitoring Unloading
          </h1>
          {me && (
            <Badge
              variant="outline"
              className={
                "border-slate-700 text-slate-300 font-semibold hidden sm:inline-flex " +
                (me.role !== "ADMIN" ? "border-amber-500/60 text-amber-300" : "")
              }
            >
              {me.nama} &middot; {me.role}
              {me.role !== "ADMIN" ? " (audit butuh ADMIN)" : ""}
            </Badge>
          )}
          <div className="flex-1" />
          <select
            value={autoRef}
            onChange={(e) => setAutoRef(e.target.value)}
            aria-label="Auto refresh"
            className="rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2 py-1.5"
          >
            <option value="0">Auto-refresh: mati</option>
            <option value="15">15 detik</option>
            <option value="30">30 detik</option>
            <option value="60">60 detik</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => load(true)}
            disabled={loading}
            className="gap-1.5 bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700"
          >
            <RefreshCw className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={logout}
            className="gap-1.5 bg-slate-800 text-slate-100 hover:bg-red-900/60 border border-slate-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 space-y-4 flex-1">
        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <Button size="sm" variant="outline" onClick={() => load(true)}>
              Coba Lagi
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Event Dimuat" value={entries.length} />
          <StatCard label="Login Gagal" value={failedLogins} tone={failedLogins > 0 ? "bad" : undefined} />
          <StatCard label="Pengguna Unik" value={uniqueUsers} />
          <StatCard label="Event Hari Ini" value={todayCount} />
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-5 gap-3">
          <Card className="md:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Aktivitas 7 Hari Terakhir
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {dayCounts.map((d) => (
                  <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                    <span className="text-[11px] font-bold tabular-nums text-slate-600">
                      {d.count}
                    </span>
                    <div
                      className="w-full rounded-t-sm bg-blue-600/85 hover:bg-blue-700 transition-colors"
                      style={{
                        height: `${Math.max(3, (d.count / maxDay) * 100)}%`,
                      }}
                      title={`${d.label}: ${d.count} event`}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Aksi Terbanyak (terfilter)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topActions.length === 0 && (
                <p className="text-xs text-muted-foreground">Belum ada data.</p>
              )}
              {topActions.map((a) => (
                <div key={a.aksi} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs font-medium" title={a.meta.label}>
                    {a.meta.label}
                  </span>
                  <div className="flex-1 h-4 rounded-sm bg-muted overflow-hidden">
                    <div
                      className={"h-full rounded-sm " + BAR_CLASS[a.meta.tone]}
                      style={{ width: `${Math.max(4, (a.count / maxAct) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-bold tabular-nums text-slate-600">
                    {a.count}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-2">
            <div className="relative grow min-w-[220px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari user, aksi, ID unload, detail..."
                className="pl-9"
              />
            </div>

            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {catsPresent.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={aksiSel} onValueChange={setAksiSel}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Aksi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Aksi</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {metaOf(a).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={userSel} onValueChange={setUserSel}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua User</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger className="w-[140px]" title="Jumlah baris terakhir yang diambil dari server">
                <SelectValue placeholder="Jumlah data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 terakhir</SelectItem>
                <SelectItem value="300">300 terakhir</SelectItem>
                <SelectItem value="500">500 terakhir</SelectItem>
                <SelectItem value="1000">1000 terakhir</SelectItem>
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={resetFilters}>
                Reset
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => exportCsv(filtered)}
              className="gap-1.5"
              disabled={filtered.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              CSV ({filtered.length})
            </Button>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="max-h-[540px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[150px]">Waktu</TableHead>
                  <TableHead className="w-[130px]">User</TableHead>
                  <TableHead className="w-[170px]">Aksi</TableHead>
                  <TableHead className="w-[150px]">ID Unload</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && entries.length === 0 &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={"sk" + i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-10"
                    >
                      {entries.length === 0
                        ? "Belum ada data audit."
                        : "Tidak ada event yang cocok dengan filter."}
                    </TableCell>
                  </TableRow>
                )}

                {filtered.slice(0, RENDER_CAP).map((e, i) => {
                  const m = metaOf(e.aksi);
                  return (
                    <TableRow key={e.timestamp + "-" + i} className="odd:bg-slate-50/60">
                      <TableCell className="tabular-nums whitespace-nowrap text-slate-600">
                        {fmtDateTime(e.timestamp)}
                      </TableCell>
                      <TableCell className="font-semibold">{e.user}</TableCell>
                      <TableCell>
                        <span
                          className={
                            "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold " +
                            TONE_CLASS[m.tone]
                          }
                        >
                          {m.label}
                        </span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground align-middle">
                          {m.cat}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.unload_id || "-"}</TableCell>
                      <TableCell
                        className="max-w-[380px] truncate text-slate-600"
                        title={e.detail}
                      >
                        {e.detail || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground pb-4">
          Menampilkan {Math.min(filtered.length, RENDER_CAP)} dari{" "}
          {filtered.length} event terfilter (total dimuat {entries.length}) &middot;
          sumber: sheet <b>AuditLog</b> &middot; zona waktu Asia/Jakarta
          {lastUpdate && (
            <>
              {" "}
              &middot; terakhir diperbarui {fmtDateTime(lastUpdate.toISOString())}
            </>
          )}
          {filtered.length > RENDER_CAP && (
            <> &middot; tabel dibatasi {RENDER_CAP} baris pertama (CSV memuat semua)</>
          )}
        </p>
      </main>
    </div>
  );
}
