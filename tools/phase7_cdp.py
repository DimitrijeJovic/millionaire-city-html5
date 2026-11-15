"""Phase 7 manual-validation helper: drives the one Chrome started by phase7_browser.py over CDP.

Usage:
  python -I tools/phase7_cdp.py eval "<js>"              evaluate (awaits promises), print JSON
  python -I tools/phase7_cdp.py shot <out.png>            screenshot of the page
  python -I tools/phase7_cdp.py click <x> <y>             left click at page coordinates
  python -I tools/phase7_cdp.py move <x> <y>              move the mouse
  python -I tools/phase7_cdp.py window <w> <h>            set the window size (normal state)
  python -I tools/phase7_cdp.py nav <url>                 navigate and wait for the scene
  python -I tools/phase7_cdp.py errors                    console errors and exceptions seen since the last call
Every call is appended to <evidence>/cdp_log.jsonl when PHASE7_LOG is set."""
import base64
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402

PORT = 9351


def log(row):
    path = os.environ.get('PHASE7_LOG')
    if path:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(json.dumps({'t': time.strftime('%Y-%m-%d %H:%M:%S'), **row})[:4000] + '\n')


def main():
    cmd, args = sys.argv[1], sys.argv[2:]
    c = CDP(page_ws(PORT), timeout=60)
    c.send('Runtime.enable')
    # A minimized window renders no frames (no Phaser updates or input), so restore it before every command.
    try:
        wid = c.send('Browser.getWindowForTarget')['windowId']
        if c.send('Browser.getWindowBounds', {'windowId': wid})['bounds']['windowState'] == 'minimized':
            c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
            c.send('Page.bringToFront')
            time.sleep(1.2)
            log({'cmd': 'restore-window', 'args': [], 'result': 'was minimized'})
    except RuntimeError:
        pass
    out = None
    if cmd == 'eval':
        r = c.send('Runtime.evaluate', {'expression': args[0], 'awaitPromise': True, 'returnByValue': True})
        out = r.get('result', {}).get('value', r.get('exceptionDetails', r))
    elif cmd == 'shot':
        r = c.send('Page.captureScreenshot', {'format': 'png'})
        open(args[0], 'wb').write(base64.b64decode(r['data']))
        out = args[0]
    elif cmd in ('click', 'move'):
        x, y = float(args[0]), float(args[1])
        c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y})
        if cmd == 'click':
            for t in ('mousePressed', 'mouseReleased'):
                c.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})
        out = [x, y]
    elif cmd == 'window':
        wid = c.send('Browser.getWindowForTarget')['windowId']
        c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
        c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'left': 0, 'top': 0, 'width': int(args[0]), 'height': int(args[1])}})
        time.sleep(1.5)
        out = c.eval('({inner:[innerWidth,innerHeight], dpr:devicePixelRatio, screen:[screen.width,screen.height]})')
    elif cmd == 'nav':
        c.send('Page.navigate', {'url': args[0]})
        end = time.time() + 90
        while time.time() < end:
            try:
                if c.eval('!!(window.mcity && window.mcity.state)'):
                    break
            except RuntimeError:
                pass
            time.sleep(0.3)
        time.sleep(2)
        out = c.eval('location.href')
    elif cmd == 'errors':
        c.send('Log.enable')
        time.sleep(0.5)
        out = [e for e in c.events if e.get('method') in ('Runtime.exceptionThrown', 'Log.entryAdded')
               or (e.get('method') == 'Runtime.consoleAPICalled' and e['params'].get('type') in ('error', 'warning'))]
    log({'cmd': cmd, 'args': args, 'result': out})
    print(json.dumps(out, indent=1)[:20000])


if __name__ == '__main__':
    main()
