import threading, functools, http.server, socketserver, time
from playwright.sync_api import sync_playwright

ROOT = r"C:\projec\unloading"

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

H = functools.partial(H, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", 8188), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.4)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_context(viewport={"width": 1280, "height": 860}).new_page()
    msgs = []
    pg.on("console", lambda m: msgs.append(f"{m.type}: {m.text[:250]}"))
    pg.on("pageerror", lambda e: msgs.append("PAGEERROR: " + str(e)[:400]))
    pg.goto("http://127.0.0.1:8188/index.html", wait_until="networkidle")
    time.sleep(1)
    print("TITLE:", pg.title())
    print("loginScreen class:", repr(pg.get_attribute("#loginScreen", "class")))
    print("appScreen class:", repr(pg.get_attribute("#appScreen", "class")))
    print("html data-theme:", pg.get_attribute("html", "data-theme"))
    print("body children count:", pg.eval_on_selector_all("body > *", "els => els.length"))
    print("--- console ---")
    for x in msgs[:20]:
        print(x)
    b.close()
srv.shutdown()
