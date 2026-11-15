"""Opens the client in a local headless Edge, waits for the city scene and runs probe steps.

Usage: python -I tools/client_probe.py <out_dir> [steps.json]
Default steps: screenshot + state. A steps file is a list of {"eval": js} | {"shot": name} | {"wait": ms}
| {"click": [x, y]} | {"clickSid": sid} | {"drag": [x0, y0, x1, y1]} | {"wheel": [x, y, deltaY]} | {"key": name}.
Console errors and exceptions are written to <out_dir>/console.json."""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'swfkit'))
import rasterize  # noqa: E402

URL = os.environ.get('MCITY_URL', 'http://127.0.0.1:8417/')
W, H = int(os.environ.get('PROBE_W', 1280)), int(os.environ.get('PROBE_H', 800))
DPR = float(os.environ.get('PROBE_DPR', 1))


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    steps = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else [{'shot': 'city'}, {'eval': 'mcity.state()'}]
    b = rasterize.Browser(port=9342)
    c = b.c
    results = []
    try:
        c.send('Runtime.enable')
        c.send('Log.enable')
        c.send('Emulation.setDefaultBackgroundColorOverride', {})
        c.send('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': DPR, 'mobile': False})
        c.send('Page.navigate', {'url': URL})
        end = time.time() + 60
        while time.time() < end:
            try:
                if c.eval('!!(window.mcity && window.mcity.state)'):
                    break
            except RuntimeError:
                pass
            time.sleep(0.2)
        else:
            raise SystemExit('city scene did not start')
        time.sleep(1.0)
        for st in steps:
            if 'eval' in st:
                results.append({'eval': st['eval'], 'value': c.eval(st['eval'])})
            elif 'shot' in st:
                r = c.send('Page.captureScreenshot', {'format': 'png'})
                open(os.path.join(out, st['shot'] + '.png'), 'wb').write(base64.b64decode(r['data']))
                results.append({'shot': st['shot']})
            elif 'wait' in st:
                time.sleep(st['wait'] / 1000)
            elif 'moveExpr' in st:
                pos = c.eval(st['moveExpr'])
                c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': pos['x'], 'y': pos['y']})
            elif 'click' in st or 'clickSid' in st or 'clickExpr' in st:
                if 'clickExpr' in st:
                    pos = c.eval(st['clickExpr'])
                    c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': pos['x'], 'y': pos['y']})
                    x, y = pos['x'], pos['y']
                elif 'clickSid' in st:
                    pos = c.eval('mcity.screenOf(%d)' % st['clickSid'])
                    x, y = pos['x'], pos['y']
                elif 'click' in st:
                    x, y = st['click']
                for t in ('mousePressed', 'mouseReleased'):
                    c.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})
                results.append({'click': [x, y]})
            elif 'move' in st:
                x, y = st['move']
                c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y})
            elif 'drag' in st:
                x0, y0, x1, y1 = st['drag']
                c.send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x0, 'y': y0, 'button': 'left', 'clickCount': 1})
                for k in range(1, 11):
                    c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x0 + (x1 - x0) * k / 10,
                                                        'y': y0 + (y1 - y0) * k / 10, 'button': 'left', 'buttons': 1})
                    time.sleep(0.02)
                c.send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': x1, 'y': y1, 'button': 'left', 'clickCount': 1})
                results.append({'drag': st['drag']})
            elif 'wheel' in st:
                x, y, dy = st['wheel']
                c.send('Input.dispatchMouseEvent', {'type': 'mouseWheel', 'x': x, 'y': y, 'deltaX': 0, 'deltaY': dy})
                results.append({'wheel': st['wheel']})
    finally:
        errors = [e for e in c.events if e.get('method') in ('Runtime.exceptionThrown',) or
                  (e.get('method') == 'Runtime.consoleAPICalled' and e['params'].get('type') in ('error', 'warning')) or
                  (e.get('method') == 'Log.entryAdded' and e['params']['entry'].get('level') in ('error', 'warning'))]
        json.dump(errors, open(os.path.join(out, 'console.json'), 'w'), indent=1)
        json.dump(results, open(os.path.join(out, 'results.json'), 'w'), indent=1)
        b.close()
    print(json.dumps(results, indent=1)[:3000])
    print('console errors/warnings:', len(errors))


if __name__ == '__main__':
    main()
