"""Audit UI menyeluruh: a11y, kontras, overflow, tap-target, layout kanban."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ui_check as uic  # reuse server + mock + seed
from playwright.sync_api import sync_playwright

SHOTS = uic.SHOTS
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))


AUDIT_JS = """
() => {
  const out = {overflowX: document.documentElement.scrollWidth - window.innerWidth,
               btnNoName: [], smallTaps: [], contrast: []};
  // 1) tombol tanpa nama aksesibel
  document.querySelectorAll('button').forEach(b => {
    if (b.offsetParent === null) return;
    const txt = (b.textContent || '').trim();
    const lbl = b.getAttribute('aria-label');
    const title = b.getAttribute('title');
    if (!txt && !lbl && !title) out.btnNoName.push(b.id || b.className.slice(0, 30));
  });
  // 2) ukuran sentuh tombol aksi utama (mobile)
  document.querySelectorAll('.trk .acts button, nav.tabs button').forEach(b => {
    if (b.offsetParent === null) return;
    const r = b.getBoundingClientRect();
    if (r.height > 0 && r.height < 36) out.smallTaps.push({b: (b.textContent||b.className).trim().slice(0,20), h: Math.round(r.height)});
  });
  // 3) kontras WCAG pada sampel elemen
  const lum = (rgbStr) => {
    const m = rgbStr.match(/\\d+(\\.\\d+)?/g);
    if (!m) return null;
    const [r,g,b] = m.slice(0,3).map(Number).map(v => {
      v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !bg.includes('0, 0, 0, 0') && bg !== 'transparent') return bg;
      n = n.parentElement;
    }
    return 'rgb(255,255,255)';
  };
  const ratio = (f, bkw) => {
    const l1 = lum(f), l2 = lum(bkw);
    if (l1 == null || l2 == null) return null;
    const hi = Math.max(l1,l2), lo = Math.min(l1,l2);
    return Math.round(((hi+0.05)/(lo+0.05)) * 100) / 100;
  };
  const samples = [
    ['meta muted', '.trk .meta'],
    ['timer', '.trk .timer'],
    ['stat label', '.stat .l'],
    ['badge Tiba', '.badge.bg-tiba'],
  ];
  samples.forEach(([nm, sel]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const cs = getComputedStyle(el);
    out.contrast.push({el: nm, ratio: ratio(cs.color, bgOf(el))});
  });
  // 4) geometri kanban
  const k = document.querySelector('.kanban');
  if (k) {
    const cols = [...k.children].filter(c => c.classList.contains('kcol'));
    out.kanban = {n: cols.length,
                  xs: cols.map(c => Math.round(c.getBoundingClientRect().left)),
                  w: Math.round(k.getBoundingClientRect().width),
                  tmpl: getComputedStyle(k).gridTemplateColumns.split(' ').length};
  }
  return out;
}
"""


def run_scenario(browser, name, width, height, mode="", theme="", dsf=1):
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=dsf)
    ctx.add_init_script(uic.seed_script(uic.PORT, mode=mode, theme=theme))
    pg = ctx.new_page()
    uic.errors.clear()
    pg.on("pageerror", lambda e: uic.errors.append("pageerror: " + str(e)))
    pg.on("console", lambda m: uic.errors.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(f"http://127.0.0.1:{uic.PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector(".trk", timeout=10000)
    pg.wait_for_timeout(700)

    a = pg.evaluate(AUDIT_JS)
    tag = f"{name} ({width}px)"

    check(f"[{tag}] tanpa scroll-x", a["overflowX"] <= 0, f"lebih {a['overflowX']}px")
    check(f"[{tag}] semua tombol bernama", not a["btnNoName"], str(a["btnNoName"][:4]))
    if width <= 420:
        check(f"[{tag}] tap-target >=36px", not a["smallTaps"], str(a["smallTaps"][:4]))
    bad_c = [c for c in a["contrast"] if c["ratio"] is not None and c["ratio"] < 3.0]
    check(f"[{tag}] kontras sample >=3.0", not bad_c, str(bad_c))

    if ".kanban" in pg.evaluate("() => document.body.innerHTML.includes('kanban') ? 'y' : 'n'" or ""):
        pass
    if a.get("kanban"):
        kb = a["kanban"]
        if width >= 1024:
            uniq = len(set(kb["xs"]))
            check(f"[{tag}] kanban 4 kolom sejajar", kb["n"] == 4 and uniq == 4,
                  f"n={kb['n']} xs={kb['xs']}")
        else:
            check(f"[{tag}] kanban 1 kolom", kb["tmpl"] == 1, str(kb))
    shot = SHOTS / f"audit_{name}.png"
    pg.screenshot(path=str(shot), full_page=True)
    print(f"shot: {shot.name}")
    ctx.close()


def main():
    srv, port = uic.start_server()
    uic.PORT = port
    time.sleep(0.4)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # login terang desktop
        ctx = browser.new_context(viewport={"width": 1280, "height": 860})
        pg = ctx.new_page()
        pg.goto(f"http://127.0.0.1:{port}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#loginScreen")
        pg.screenshot(path=str(SHOTS / "audit_07_login_light.png"))
        print("shot: audit_07_login_light.png")
        ctx.close()

        run_scenario(browser, "01_queue_dark_mob", 360, 780, theme="dark", dsf=2)
        run_scenario(browser, "02_queue_light_mob", 360, 780, theme="light")
        run_scenario(browser, "03_dash_dark_desk", 1280, 900, mode="operasi", theme="dark")
        run_scenario(browser, "04_monitor_dark_desk", 1366, 900, theme="light")  # auto->monitor+dark
        browser.close()
    srv.shutdown()

    print("\n===== AUDIT =====")
    ok_all = True
    for name, ok, detail in results:
        line = ("PASS  " if ok else "FAIL  ") + name
        if detail and not ok:
            line += "  -> " + detail
        print(line)
        ok_all &= ok
    errs = [e for e in uic.errors if "favicon" not in e]
    print("\nJS errors:", len(errs))
    for e in errs[:10]:
        print("  ", e[:200])
    if errs:
        ok_all = False
    print("\nAUDIT KESELURUHAN:", "LOLOS" if ok_all else "PERLU PERBAIKAN")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
