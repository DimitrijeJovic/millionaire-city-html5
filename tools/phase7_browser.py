"""Phase 7: one local server and one headed Chrome with a new temporary profile (never the user's profile or save).

Records console errors and exceptions to <out_dir>/console.jsonl until <out_dir>/STOP exists, then closes Chrome and
the server and deletes the temporary profile. Drive the page with tools/phase7_cdp.py.

Usage: python -I tools/phase7_browser.py <out_dir> [width height]"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402

CHROME = os.environ.get('SWFKIT_BROWSER', r'C:\Program Files\Google\Chrome\Application\chrome.exe')
NODE = os.path.join(ROOT, 'tools', 'runtime', 'node.exe') if os.path.isfile(os.path.join(ROOT, 'tools', 'runtime', 'node.exe')) else 'node'
PORT = 9351


def main():
    out = os.path.abspath(sys.argv[1])
    w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1920, 1080)
    os.makedirs(out, exist_ok=True)
    stop = os.path.join(out, 'STOP')
    if os.path.exists(stop):
        os.remove(stop)
    profile = tempfile.mkdtemp(prefix='mcity_p7_chrome_')
    server = subprocess.Popen([NODE, os.path.join(ROOT, 'tools', 'serve.mjs')], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen([CHROME, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=%d' % PORT, '--user-data-dir=' + profile,
                               '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
                               '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
                               '--disable-background-timer-throttling', '--window-position=0,0', '--window-size=%d,%d' % (w, h),
                               '--app=about:blank'])
    print(json.dumps({'server_pid': server.pid, 'chrome_pid': chrome.pid, 'profile': profile}), flush=True)
    try:
        time.sleep(2)
        c = CDP(page_ws(PORT), timeout=60)
        c.send('Runtime.enable')
        c.send('Log.enable')
        seen = 0
        with open(os.path.join(out, 'console.jsonl'), 'a', encoding='utf-8') as f:
            while not os.path.exists(stop) and chrome.poll() is None:
                try:
                    c.send('Runtime.evaluate', {'expression': '0'})
                except Exception:  # noqa: BLE001 - the page may be navigating
                    pass
                for e in c.events[seen:]:
                    m = e.get('method')
                    if m == 'Runtime.exceptionThrown' or m == 'Log.entryAdded' and e['params']['entry']['level'] in ('error', 'warning') \
                            or m == 'Runtime.consoleAPICalled' and e['params'].get('type') in ('error', 'warning'):
                        f.write(json.dumps({'t': time.strftime('%H:%M:%S'), **e})[:3000] + '\n')
                        f.flush()
                seen = len(c.events)
                time.sleep(1)
    finally:
        chrome.terminate()
        try:
            chrome.wait(15)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.terminate()
        server.wait(10)
        time.sleep(2)
        shutil.rmtree(profile, ignore_errors=True)
        print('stopped', flush=True)


if __name__ == '__main__':
    main()
