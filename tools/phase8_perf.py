"""Phase 8 performance runs in the Chrome started by phase7_browser.py: every scenario is measured for <seconds>
(default 180) with requestAnimationFrame frame times, the 25 fps logic steps, JS heap and the memory of this
Chrome's processes (temporary profile). Results: <out_dir>/perf_results.json and frametimes_<scenario>.json.

Usage: python -I tools/phase8_perf.py <out_dir> [seconds]"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402

PORT = 9351
HOST = 'http://127.0.0.1:8417/'
OUT = os.path.abspath(sys.argv[1])
SECONDS = float(sys.argv[2]) if len(sys.argv) > 2 else 180
os.makedirs(OUT, exist_ok=True)
c = CDP(page_ws(PORT), timeout=120)
c.send('Runtime.enable')
R = {'conditions': {}, 'scenarios': {}}

RECORDER = """(()=>{ if (window.__fr) return 0; const fr = window.__fr = {last: performance.now(), d: [], on: false};
  const loop = (now) => { if (fr.on) fr.d.push(+(now - fr.last).toFixed(3)); fr.last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop); return 0; })()"""


def ev(js):
    r = c.send('Runtime.evaluate', {'expression': js, 'awaitPromise': True, 'returnByValue': True})
    if 'exceptionDetails' in r:
        raise RuntimeError(json.dumps(r['exceptionDetails'])[:400])
    return r['result'].get('value')


def keep_visible():
    wid = c.send('Browser.getWindowForTarget')['windowId']
    b = c.send('Browser.getWindowBounds', {'windowId': wid})['bounds']
    if b['windowState'] == 'minimized':
        c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
        c.send('Page.bringToFront')
        time.sleep(1.5)
        return True
    return False


def open_city(query):
    keep_visible()
    c.send('Page.navigate', {'url': HOST + query})
    end = time.time() + 90
    while time.time() < end:
        try:
            if ev('!!(window.mcity && window.mcity.state)'):
                break
        except RuntimeError:
            pass
        time.sleep(0.3)
    time.sleep(3)
    ev(RECORDER)


def process_memory():
    ps = ("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -match 'mcity_p7_chrome_' } | "
          "ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { '{0} {1}' -f $p.WorkingSet64, $p.PrivateMemorySize64 } }")
    out = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True).stdout.split()
    vals = [int(x) for x in out]
    return {'processes': len(vals) // 2, 'working_set_mb': round(sum(vals[0::2]) / 1048576), 'private_mb': round(sum(vals[1::2]) / 1048576)}


def stats(d):
    if not d:
        return None
    total = sum(d)
    per_sec, acc, cnt = [], 0.0, 0
    for x in d:
        acc += x
        cnt += 1
        if acc >= 1000:
            per_sec.append(cnt * 1000 / acc)
            acc, cnt = 0.0, 0
    q = sorted(d)
    worst = q[-max(1, len(q) // 100):]
    return {'frames': len(d), 'seconds': round(total / 1000, 1), 'avg_fps': round(len(d) / (total / 1000), 1),
            'min_fps_1s': round(min(per_sec), 1) if per_sec else None, 'max_fps_1s': round(max(per_sec), 1) if per_sec else None,
            'low_1pct_fps': round(1000 / (sum(worst) / len(worst)), 1), 'frame_ms_avg': round(total / len(d), 2),
            'frame_ms_p50': q[len(q) // 2], 'frame_ms_p99': q[min(len(q) - 1, int(len(q) * 0.99))], 'frame_ms_max': q[-1],
            'over_33ms': sum(x > 33.3 for x in d), 'over_50ms': sum(x > 50 for x in d), 'over_100ms': sum(x > 100 for x in d)}


def measure(name, action=None):
    restored = 0
    ev('(()=>{__fr.d=[]; __fr.last=performance.now(); __fr.on=true; return 0})()')
    l0, s0, t0 = ev('mcity.state().logicSteps'), ev('mcity.state().simulatedMs'), time.time()
    heap, next_sample = [], t0
    while time.time() - t0 < SECONDS:
        if keep_visible():
            restored += 1
        if action:
            action(time.time() - t0)
        if time.time() >= next_sample:
            heap.append(round(ev('performance.memory.usedJSHeapSize') / 1048576, 1))
            next_sample += 60
        time.sleep(0.5)
    heap.append(round(ev('performance.memory.usedJSHeapSize') / 1048576, 1))
    d = ev('(()=>{__fr.on=false; return __fr.d})()')
    el = time.time() - t0
    st = stats(d)
    st['logic_steps_per_s'] = round((ev('mcity.state().logicSteps') - l0) / el, 2)
    st['simulated_ms_per_s'] = round((ev('mcity.state().simulatedMs') - s0) / el, 1)
    st['js_heap_mb_per_minute'] = heap
    st['memory_end'] = process_memory()
    st['window_restored'] = restored
    st['views'] = ev('mcity.state().views')
    st['zoom'] = ev('mcity.scene.zoom.current')
    R['scenarios'][name] = st
    json.dump(d, open(os.path.join(OUT, 'frametimes_%s.json' % name), 'w'))
    print(name, json.dumps({k: st[k] for k in ('avg_fps', 'min_fps_1s', 'low_1pct_fps', 'frame_ms_p99', 'over_33ms', 'over_50ms',
                                               'over_100ms', 'logic_steps_per_s', 'memory_end', 'window_restored')}), flush=True)


def pan(t):
    ev('(()=>{const cam=mcity.scene.cameras.main; cam.scrollX += Math.sin(%f)*40; cam.scrollY += Math.cos(%f)*25; return 0})()' % (t / 3, t / 4))


def windows(t):
    k = int(t / 5) % 4
    ev(['mcity.selectTool("build"),0', 'mcity.selectTool("select"),0',
        '(()=>{const s=mcity.scene; s.openCompanyValue(); return 0})()',
        '(()=>{const h=document.getElementById("popup-host"); h.hidden=true; h.replaceChildren(); return 0})()'][k])


def run():
    R['conditions'] = {'started': time.strftime('%Y-%m-%d %H:%M:%S'), 'seconds_per_scenario': SECONDS,
                       'browser': c.send('Browser.getVersion')['product']}
    open_city('?city=test&view=1090,690')
    R['conditions']['window'] = ev('({inner:[innerWidth,innerHeight], dpr:devicePixelRatio, screen:[screen.width,screen.height]})')
    measure('test_city_zoom1')
    open_city('?city=empty')
    measure('empty_city')
    open_city('?city=test&visit=npc_boss')
    measure('npc_sheik_city_496')
    open_city('?city=test&visit=npc_advisor')
    ev('(()=>{for(let i=0;i<6;i++) mcity.scene.zoom.zoomOut(); return 0})()')
    measure('npc_chocolate_fields_zoom025_pan', pan)
    open_city('?city=test&visit=npc_advisor')
    measure('npc_chocolate_fields_zoom1_pan', pan)
    open_city('?city=test&view=1090,690')
    measure('test_city_windows', windows)


if __name__ == '__main__':
    try:
        run()
    finally:
        R['conditions']['finished'] = time.strftime('%Y-%m-%d %H:%M:%S')
        json.dump(R, open(os.path.join(OUT, 'perf_results.json'), 'w'), indent=1)
