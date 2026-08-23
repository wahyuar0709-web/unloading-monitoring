"""Verifikasi UI index.html dengan API mock (tanpa kredensial live)."""
import json
import threading
import functools
import http.server
import socketserver
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "_shots"
SHOTS.mkdir(exist_ok=True)

JKT = timezone(timedelta(hours=7))


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


NOW = datetime.now(JKT)


def day_at(days_back, hour):
    d = (NOW - timedelta(days=days_back)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return d


VISITS = [
    {
        "kode_kedatangan": "UNL-20260823-001", "vendor": "PT Sumber Makmur",
        "no_polisi": "B 9123 KLM", "no_surat_jalan": "SJ-88121", "nama_supir": "Agus",
        "jenis_transaksi": "Penerimaan", "sumber": "Terjadwal",
        "tanggal_kedatangan": iso(NOW - timedelta(minutes=200)),
        "plan_tiba": iso(NOW + timedelta(minutes=45)),
        "aktual_tiba": "", "mulai_bongkar": "", "selesai_bongkar": "",
        "break_start": "", "break_end": "", "operator_tiba": "", "operator_bongkar": "",
        "dock": None, "qty": None, "satuan": "", "temuan": "",
        "durasi_tunggu_menit": None, "durasi_bongkar_menit": None,
        "status": "Dijadwalkan", "status_lama": "", "catatan": "",
        "dibuat_pada": iso(NOW - timedelta(hours=5)), "_ts_iso": iso(NOW - timedelta(hours=5)),
    },
    {
        "kode_kedatangan": "UNL-20260823-002", "vendor": "CV Tani Jaya",
        "no_polisi": "B 3311 XYZ", "no_surat_jalan": "SJ-88130", "nama_supir": "Budi",
        "jenis_transaksi": "Penerimaan", "sumber": "Walk-in",
        "tanggal_kedatangan": iso(NOW - timedelta(minutes=95)),
        "plan_tiba": "", "aktual_tiba": iso(NOW - timedelta(minutes=95)),
        "mulai_bongkar": "", "selesai_bongkar": "", "break_start": "", "break_end": "",
        "operator_tiba": "Risman", "operator_bongkar": "",
        "dock": None, "qty": None, "satuan": "", "temuan": "",
        "durasi_tunggu_menit": None, "durasi_bongkar_menit": None,
        "status": "Tiba", "status_lama": "SUDAH DATANG", "catatan": "",
        "dibuat_pada": iso(NOW - timedelta(minutes=95)), "_ts_iso": iso(NOW - timedelta(minutes=95)),
    },
    {
        "kode_kedatangan": "UNL-20260823-003", "vendor": "PT Sinar Logam",
        "no_polisi": "D 5520 AB", "no_surat_jalan": "", "nama_supir": "",
        "jenis_transaksi": "Retur", "sumber": "Walk-in",
        "tanggal_kedatangan": iso(NOW - timedelta(minutes=20)),
        "plan_tiba": "", "aktual_tiba": iso(NOW - timedelta(minutes=20)),
        "mulai_bongkar": "", "selesai_bongkar": "", "break_start": "", "break_end": "",
        "operator_tiba": "Fauzi", "operator_bongkar": "",
        "dock": None, "qty": None, "satuan": "", "temuan": "",
        "durasi_tunggu_menit": None, "durasi_bongkar_menit": None,
        "status": "Tiba", "status_lama": "SUDAH DATANG", "catatan": "",
        "dibuat_pada": iso(NOW - timedelta(minutes=20)), "_ts_iso": iso(NOW - timedelta(minutes=20)),
    },
    {
        "kode_kedatangan": "UNL-20260823-004", "vendor": "PT Gula Pratama",
        "no_polisi": "B 8877 TR", "no_surat_jalan": "SJ-88140", "nama_supir": "Cahyo",
        "jenis_transaksi": "Penerimaan", "sumber": "Terjadwal",
        "tanggal_kedatangan": iso(NOW - timedelta(minutes=85)),
        "plan_tiba": iso(NOW - timedelta(minutes=90)),
        "aktual_tiba": iso(NOW - timedelta(minutes=85)),
        "mulai_bongkar": iso(NOW - timedelta(minutes=60)),
        "selesai_bongkar": "", "break_start": "", "break_end": "",
        "operator_tiba": "Fauzi", "operator_bongkar": "Fauzi",
        "dock": 2, "qty": None, "satuan": "", "temuan": "",
        "durasi_tunggu_menit": None, "durasi_bongkar_menit": None,
        "status": "Sedang Bongkar", "status_lama": "", "catatan": "",
        "dibuat_pada": iso(day_at(0, 7)), "_ts_iso": iso(day_at(0, 7)),
    },
    {
        "kode_kedatangan": "UNL-20260823-005", "vendor": "CV Mitra Kimia",
        "no_polisi": "L 4545 GH", "no_surat_jalan": "SJ-88144", "nama_supir": "Dedi",
        "jenis_transaksi": "Penerimaan", "sumber": "Walk-in",
        "tanggal_kedatangan": iso(NOW - timedelta(minutes=110)),
        "plan_tiba": "", "aktual_tiba": iso(NOW - timedelta(minutes=110)),
        "mulai_bongkar": iso(NOW - timedelta(minutes=80)),
        "selesai_bongkar": "",
        "break_start": iso(NOW - timedelta(minutes=12)), "break_end": "",
        "operator_tiba": "Risman", "operator_bongkar": "Risman",
        "dock": 1, "qty": None, "satuan": "", "temuan": "",
        "durasi_tunggu_menit": None, "durasi_bongkar_menit": None,
        "status": "Sedang Bongkar", "status_lama": "", "catatan": "",
        "dibuat_pada": iso(NOW - timedelta(minutes=110)), "_ts_iso": iso(NOW - timedelta(minutes=110)),
    },
    {
        "kode_kedatangan": "UNL-20260823-006", "vendor": "PT Tepung Nusantara",
        "no_polisi": "B 1210 MN", "no_surat_jalan": "SJ-88101", "nama_supir": "Eko",
        "jenis_transaksi": "Penerimaan", "sumber": "Terjadwal",
        "tanggal_kedatangan": iso(day_at(0, 6, )),
        "plan_tiba": iso(day_at(0, 6)),
        "aktual_tiba": iso(day_at(0, 6, ) + timedelta(minutes=25)),
        "mulai_bongkar": iso(day_at(0, 7) + timedelta(minutes=10)),
        "selesai_bongkar": iso(NOW - timedelta(minutes=30)),
        "break_start": iso(day_at(0, 8)), "break_end": iso(day_at(0, 8) + timedelta(minutes=15)),
        "operator_tiba": "Fauzi", "operator_bongkar": "Fauzi",
        "dock": 3, "qty": 34, "satuan": "Pallet", "temuan": "TIDAK ADA (NORMAL)",
        "durasi_tunggu_menit": 25, "durasi_bongkar_menit": 40,
        "status": "Selesai", "status_lama": "SELESAI", "catatan": "",
        "dibuat_pada": iso(day_at(0, 6)), "_ts_iso": iso(day_at(0, 6)),
    },
]

# riwayat 5 hari terakhir untuk grafik tren
for back in range(1, 6):
    for seq, hour in enumerate([8, 11]):
        d0 = day_at(back, hour)
        VISITS.append({
            "kode_kedatangan": f"UNL-H-{back}{seq}", "vendor": "PT Riwayat",
            "no_polisi": f"B {back}00{seq} AA", "no_surat_jalan": "", "nama_supir": "",
            "jenis_transaksi": "Penerimaan", "sumber": "Terjadwal",
            "tanggal_kedatangan": iso(d0), "plan_tiba": iso(d0),
            "aktual_tiba": iso(d0 + timedelta(minutes=20)),
            "mulai_bongkar": iso(d0 + timedelta(minutes=40)),
            "selesai_bongkar": iso(d0 + timedelta(minutes=100)),
            "break_start": "", "break_end": "",
            "operator_tiba": "Fauzi", "operator_bongkar": "Fauzi",
            "dock": 1, "qty": 20, "satuan": "Bags", "temuan": "TIDAK ADA (NORMAL)",
            "durasi_tunggu_menit": 20, "durasi_bongkar_menit": 60,
            "status": "Selesai", "status_lama": "SELESAI", "catatan": "",
            "dibuat_pada": iso(d0), "_ts_iso": iso(d0),
        })

ME = {"username": "admin", "nama": "Admin Gudang", "role": "ADMIN"}

BOOTSTRAP = {
    "visits": VISITS,
    "suppliers": ["PT Sumber Makmur", "CV Tani Jaya", "PT Sinar Logam", "PT Gula Pratama"],
    "operators": ["Fauzi", "Risman"],
    "settings": {"threshold_tepat_waktu_menit": 15, "threshold_telat_parah_menit": 60, "jumlah_dock": 3},
    "jumlah_dock": 3,
}


def respond(action, extra=None):
    now_iso = iso(datetime.now(timezone.utc))
    payload = {"ok": True, "data": {}, "me": ME, "server_time": now_iso}
    if action == "login":
        payload["data"] = {"username": ME["username"], "nama": ME["nama"], "role": ME["role"],
                           "temuan_options": ["TIDAK ADA (NORMAL)", "Barang rusak", "Lainnya"]}
    elif action == "bootstrap":
        payload["data"] = BOOTSTRAP
    elif action == "users":
        payload["data"] = [
            {"username": "admin", "nama": "Admin Gudang", "role": "ADMIN", "aktif": True},
            {"username": "fauzi", "nama": "Fauzi", "role": "OPERATOR", "aktif": True},
            {"username": "spb", "nama": "SPV Warehouse", "role": "SPB", "aktif": True},
        ]
    elif action == "audit":
        payload["data"] = [
            {"timestamp": iso(datetime.now(timezone.utc)), "user": "admin", "aksi": "LOGIN", "unload_id": "", "detail": ""},
            {"timestamp": iso(datetime.now(timezone.utc) - timedelta(minutes=9)), "user": "fauzi",
             "aksi": "MULAI_BONGKAR", "unload_id": "UNL-20260823-004", "detail": "Dock 2"},
        ]
    elif action == "operatorsAll":
        payload["data"] = [{"nama_operator": "Fauzi", "aktif": True}, {"nama_operator": "Risman", "aktif": True}]
    if extra:
        payload.update(extra)
    return payload


def make_handler():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            self._route({})

        def do_POST(self):
            body = {}
            try:
                ln = int(self.headers.get("Content-Length") or 0)
                if ln:
                    body = json.loads(self.rfile.read(ln).decode("utf-8"))
            except Exception:
                pass
            self._route(body)

        def _route(self, body):
            action = body.get("action") or ""
            if not action:
                from urllib.parse import urlparse, parse_qs
                q = parse_qs(urlparse(self.path).query)
                action = (q.get("action") or [""])[0]
            data = json.dumps(respond(action)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return functools.partial(H, directory=str(ROOT))


def start_server():
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", port), make_handler())
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, port


SEED = """
(url) => {
  localStorage.setItem('unl_url', 'http://127.0.0.1:%PORT%/exec');
  localStorage.setItem('unl_user', 'admin');
  localStorage.setItem('unl_pass', 'x');
  if (%MODE%) localStorage.setItem('unl_mode', %MODE%);
  if (%THEME%) localStorage.setItem('unl_theme', %THEME%);
}
"""


def seed_script(port, mode="", theme=""):
    s = SEED.replace("%PORT%", str(port))
    s = s.replace("%MODE%", json.dumps(mode) if mode else "")
    return s.replace("%THEME%", json.dumps(theme) if theme else "")


errors = []


def track_console(page, label):
    page.on("console", lambda m: errors.append(f"[{label}] {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"[{label}] pageerror: {e}"))


def main():
    srv, port = start_server()
    time.sleep(0.4)
    base = f"http://127.0.0.1:{port}/index.html"
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # --- 1. halaman login (tanpa kredensial tersimpan) ---
        ctx = browser.new_context(viewport={"width": 1280, "height": 860})
        pg = ctx.new_page()
        track_console(pg, "login")
        resp = pg.goto(base, wait_until="domcontentloaded", timeout=20000)
        pg.wait_for_selector("#loginScreen", timeout=15000)
        title = pg.title()
        head = pg.content()[:160].replace("\n", " ")
        assert "Monitoring" in title, (
            f"halaman salah: status={resp.status if resp else None} "
            f"url={pg.url} title={title!r} head={head!r}"
        )
        box = pg.locator("#loginScreen").bounding_box()
        cls = pg.get_attribute("#loginScreen", "class")
        print(f"[diag] loginScreen class={cls!r} box={box}")
        assert pg.locator("#loginScreen").is_visible(), f"login tidak tampil (class={cls!r}, box={box})"
        results.append(("login tampil", True))
        pg.screenshot(path=str(SHOTS / "01_login.png"))
        ctx.close()

        # --- 2. antrean mobile gelap 360 ---
        ctx = browser.new_context(viewport={"width": 360, "height": 780}, device_scale_factor=2)
        ctx.add_init_script(seed_script(port, theme="dark"))
        pg = ctx.new_page()
        track_console(pg, "queue360")
        pg.goto(base, wait_until="networkidle")
        pg.wait_for_selector(".trk", timeout=8000)
        pg.wait_for_timeout(600)
        n_truk = pg.locator(".trk").count()
        results.append((f"antrean mobile: {n_truk} kartu truk", n_truk >= 6))
        results.append(("kartu late ada", pg.locator(".trk.late").count() >= 1))
        results.append(("tema gelap aktif", pg.get_attribute("html", "data-theme") == "dark"))
        pg.screenshot(path=str(SHOTS / "02_queue_dark_360.png"), full_page=True)

        # toggle tema dari header
        pg.click("#btnTheme")
        pg.wait_for_timeout(350)
        results.append(("toggle tema -> light", pg.get_attribute("html", "data-theme") == "light"))
        pg.screenshot(path=str(SHOTS / "03_queue_light_360.png"), full_page=True)
        ctx.close()

        # --- 3. operasi desktop terang: dashboard + tren ---
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        ctx.add_init_script(seed_script(port, mode="operasi", theme="light"))
        pg = ctx.new_page()
        track_console(pg, "dash1280")
        pg.goto(base, wait_until="networkidle")
        pg.wait_for_selector(".trk", timeout=8000)
        pg.click('[data-tab="dash"]')
        pg.wait_for_timeout(500)
        n_bar = pg.locator("#trendChart .bar-w").count()
        results.append((f"grafik tren: {n_bar} batang", n_bar == 7))
        n_stat = pg.locator("#dashStats .stat").count()
        results.append((f"stat cards: {n_stat}", n_stat == 6))
        rows = pg.locator("#dashTbl tbody tr").count()
        results.append((f"tabel dash: {rows} baris", rows >= 5))
        pg.screenshot(path=str(SHOTS / "04_dash_light_1280.png"), full_page=True)

        # form tab
        pg.click('[data-tab="form"]')
        pg.wait_for_timeout(300)
        results.append(("ikon form save", pg.locator('#btnSubmitTruck use[href="#i-save"]').count() == 1))
        pg.click('[data-tab="queue"]')

        # --- 4. admin tab ---
        pg.click('[data-tab="admin"]')
        pg.wait_for_timeout(700)
        users_visible = pg.locator("#adminBody .list-row").count()
        results.append((f"admin users: {users_visible} baris", users_visible >= 3))
        pg.screenshot(path=str(SHOTS / "05_admin_light_1280.png"))
        ctx.close()

        # --- 5. monitor desktop gelap (auto di >=1024px) ---
        ctx = browser.new_context(viewport={"width": 1366, "height": 900})
        ctx.add_init_script(seed_script(port))
        pg = ctx.new_page()
        track_console(pg, "monitor1366")
        pg.goto(base, wait_until="networkidle")
        pg.wait_for_selector(".kcard", timeout=8000)
        pg.wait_for_timeout(600)
        results.append(("mode monitor otomatis", pg.get_attribute("body", "data-mode") == "monitor"))
        n_kcol = pg.locator(".kcol").count()
        results.append((f"kanban kolom: {n_kcol}", n_kcol == 4))
        clock = pg.locator("#bigClock").inner_text()
        results.append((f"jam besar berjalan: {clock}", "--" not in clock))
        results.append(("monitor dipaksa gelap", pg.get_attribute("html", "data-theme") == "dark"))
        pg.screenshot(path=str(SHOTS / "06_monitor_dark_1366.png"))
        ctx.close()

        browser.close()

    srv.shutdown()

    print("\n===== HASIL =====")
    ok_all = True
    for name, ok in results:
        print(("PASS  " if ok else "FAIL  ") + name)
        ok_all &= ok
    print("\n===== CONSOLE ERRORS =====")
    real_errors = [e for e in errors if "favicon" not in e and "net::ERR_FAILED" not in e]
    if real_errors:
        for e in real_errors[:20]:
            print(e)
        ok_all = False
    else:
        print("(bersih)")
    print("\nKESELURUHAN:", "LOLOS ✅" if ok_all else "ADA MASALAH ❌")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
