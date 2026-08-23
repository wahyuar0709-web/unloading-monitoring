import threading, functools, http.server, socketserver, socket, time, urllib.request
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
print("URL:", url)

raw = urllib.request.urlopen(url, timeout=10).read()
print("urllib bytes:", len(raw), "| head:", raw[:80])

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_context(viewport={"width": 1280, "height": 860}).new_page()
    resp = pg.goto(url, wait_until="domcontentloaded", timeout=20000)
    print("playwright status:", resp.status if resp else None)
    html = pg.content()
    print("content len:", len(html), "| head:", html[:150].replace("\n", " "))
    time.sleep(0.5)
    print("title after settle:", repr(pg.title()))
    b.close()
srv.shutdown()
