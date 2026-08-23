import threading, functools, http.server, socketserver, socket, time
from playwright.sync_api import sync_playwright

ROOT = r"C:\projec\unloading"

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

H = functools.partial(H, directory=ROOT)
with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    PORT = s.getsockname()[1]
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.4)

url = f"http://127.0.0.1:{PORT}/index.html"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_context(viewport={"width": 1280, "height": 860}).new_page()
    msgs = []
    pg.on("pageerror", lambda e: msgs.append("PAGEERROR: " + str(e)[:300]))
    pg.on("console", lambda m: msgs.append(f"{m.type}: {m.text[:200]}") if m.type == "error" else None)
    pg.goto(url, wait_until="domcontentloaded")
    time.sleep(1.0)
    info = pg.evaluate("""() => {
      const el = document.getElementById('loginScreen');
      if (!el) return {missing:true};
      const cs = getComputedStyle(el);
      const chain = [];
      let n = el;
      while (n && n.tagName !== 'HTML') {
        const s = getComputedStyle(n);
        chain.push(n.tagName + '#' + (n.id||'') + '.' + (n.className||'') +
                   ' d=' + s.display + ' v=' + s.visibility + ' o=' + s.opacity +
                   ' h=' + n.getBoundingClientRect().height);
        n = n.parentElement;
      }
      return {
        cls: el.className,
        display: cs.display, vis: cs.visibility, op: cs.opacity,
        rect: el.getBoundingClientRect().toJSON(),
        chain,
        hides: [...document.querySelectorAll('.hide')].map(e => e.id || e.tagName),
        bodyMode: document.body.getAttribute('data-mode'),
        sheets: [...document.styleSheets].map(s => ({href:s.href, rules:(()=>{try{return s.cssRules.length}catch(e){return 'ERR:'+e.message}})()}))
      };
    }""")
    import json
    print(json.dumps(info, indent=1, ensure_ascii=False))
    pg.screenshot(path=r"C:\projec\unloading\_shots\probe3.png")
    print("--- errors ---")
    for m in msgs[:10]:
        print(m)
    b.close()
srv.shutdown()
