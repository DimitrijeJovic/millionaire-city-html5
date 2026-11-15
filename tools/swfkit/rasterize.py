"""Rasterizes exported symbol pages with a local headless Edge/Chrome over CDP (127.0.0.1 only).

Usage: python -I rasterize.py <export_dir> <out_dir> <scale> <symbol.html> [...]
Writes <out_dir>/<symbol>_<frame>.png (transparent) for every frame of each page."""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdp  # noqa: E402

BROWSERS = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Google\Chrome\Application\chrome.exe']
PORT = 9341


class Browser:
    def __init__(self, port=PORT):
        # SWFKIT_BROWSER picks the executable; Edge 156 crashes after about 60 s on this machine, Chrome does not.
        exe = os.environ.get('SWFKIT_BROWSER') or next((b for b in BROWSERS if os.path.exists(b)), None)
        if exe is None:
            raise SystemExit('no Edge/Chrome found')
        self.profile = tempfile.mkdtemp(prefix='mcity_raster_')
        self.proc = subprocess.Popen([exe, '--headless=new', '--remote-debugging-address=127.0.0.1',
                                      '--remote-debugging-port=%d' % port, '--user-data-dir=' + self.profile,
                                      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
                                      '--disable-background-networking', '--disable-sync', '--allow-file-access-from-files',
                                      '--force-color-profile=srgb', '--hide-scrollbars', 'about:blank'],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.c = cdp.CDP(cdp.page_ws(port))
        self.c.send('Page.enable')
        self.c.send('Emulation.setDefaultBackgroundColorOverride', {'color': {'r': 0, 'g': 0, 'b': 0, 'a': 0}})

    def open(self, path, w, h):
        self.c.send('Emulation.setDeviceMetricsOverride', {'width': max(w, 16), 'height': max(h, 16), 'deviceScaleFactor': 1, 'mobile': False})
        self.c.send('Page.navigate', {'url': 'file:///' + os.path.abspath(path).replace('\\', '/')})
        end = time.time() + 30
        while time.time() < end:
            if self.c.eval('document.readyState') == 'complete' and self.c.eval(
                    'Array.from(document.images||[]).every(i=>i.complete) && typeof show==="function"'):
                break
            time.sleep(0.05)
        # SVG <image> elements decode asynchronously; wait until each frame's images have loaded.
        self.c.eval('Promise.all(Array.from(document.querySelectorAll("image")).map(i=>new Promise(r=>{const im=new Image();'
                    'im.onload=im.onerror=r;im.src=i.getAttribute("href");})))')

    def shot(self, frame, w, h, scale):
        self.c.eval('show(%d); new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))' % frame)
        r = self.c.send('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True,
                                                   'clip': {'x': 0, 'y': 0, 'width': w, 'height': h, 'scale': scale}})
        return base64.b64decode(r['data'])

    def close(self):
        try:
            self.c.send('Browser.close', timeout=5)
        except Exception:  # noqa: BLE001
            pass
        try:
            self.proc.wait(10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)


def rasterize(browser, export_dir, out_dir, scale, page):
    meta = json.load(open(os.path.join(export_dir, page[:-5] + '.json')))
    w, h = meta['canvas_px']
    os.makedirs(out_dir, exist_ok=True)
    files = []
    for start, count, html in meta.get('pages') or [[0, meta['frames'], page]]:
        browser.open(os.path.join(export_dir, html), w, h)
        for f in range(start, start + count):
            name = '%s_%03d.png' % (meta['symbol'], f)
            open(os.path.join(out_dir, name), 'wb').write(browser.shot(f, w, h, scale))
            files.append(name)
    return meta, files


if __name__ == '__main__':
    export_dir, out_dir, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
    b = Browser()
    try:
        for page in sys.argv[4:]:
            meta, files = rasterize(b, export_dir, out_dir, scale, page)
            print(page, len(files))
    finally:
        b.close()
