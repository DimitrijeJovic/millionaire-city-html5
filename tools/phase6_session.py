"""Phase 6 validation in one headed Chrome (temporary profile) against one local server.

Measures render frame times per scenario (requestAnimationFrame), memory (JS heap, process working set and private
bytes), simulation and animation timing (also under CPU throttling), window sizes 1280x720 / 1920x1080 / 2560x1440,
the phase 4-5 features, save/load and sound output (tools/audio_meter.ps1). Never uses fresh=1: the profile is new.

Usage: python -I tools/phase6_session.py <out_dir>"""
import base64
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402
from manual_session import CHROME, NODE, peaks  # noqa: E402

PORT = 9349
HOST = 'http://127.0.0.1:8417/'
OUT = os.path.abspath(sys.argv[1])
os.makedirs(OUT, exist_ok=True)
R = {'conditions': {}, 'fps': {}, 'memory': [], 'animation': {}, 'resolutions': {}, 'features': {}, 'saveload': {}, 'sound': [], 'notes': []}
LOG = []

FRAME_RECORDER = """(()=>{ if (window.__fr) return 0; const fr = window.__fr = {last: performance.now(), d: [], on: false};
  const loop = (now) => { if (fr.on) fr.d.push(+(now - fr.last).toFixed(3)); fr.last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop); return 0; })()"""


def now_ms():
    return int(time.time() * 1000)


def note(what, **kw):
    row = {'t': now_ms(), 'what': what, **kw}
    LOG.append(row)
    print(json.dumps(row)[:500], flush=True)


def ps(cmd):
    return subprocess.run(['powershell', '-NoProfile', '-Command', cmd], capture_output=True, text=True).stdout.strip()


class S:
    c = None
    profile = None

    @classmethod
    def ev(cls, js):
        return cls.c.eval(js)

    @classmethod
    def shot(cls, name):
        r = cls.c.send('Page.captureScreenshot', {'format': 'png'})
        open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(r['data']))

    @classmethod
    def mouse(cls, x, y, kind=('mouseMoved', 'mousePressed', 'mouseReleased')):
        for t in kind:
            cls.c.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})

    @classmethod
    def click_el(cls, sel):
        p = cls.ev("(()=>{const e=document.querySelector(%s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()" % json.dumps(sel))
        if p:
            cls.mouse(p['x'], p['y'])
        return bool(p)

    @classmethod
    def click_sid(cls, sid):
        cls.ev('(()=>{const v=mcity.scene.views.find(v=>v.item.sid===%d); mcity.scene.cameras.main.centerOn(v.sprite.x, v.sprite.y-40); return 0})()' % sid)
        time.sleep(0.4)
        p = cls.ev('mcity.screenOf(%d)' % sid)
        cls.mouse(p['x'], p['y'])

    @classmethod
    def open(cls, query):
        cls.c.send('Page.navigate', {'url': HOST + query})
        end = time.time() + 90
        while time.time() < end:
            try:
                if cls.ev('!!(window.mcity && window.mcity.state)'):
                    break
            except RuntimeError:
                pass
            time.sleep(0.3)
        else:
            raise RuntimeError('scene did not start: ' + query)
        time.sleep(2.5)
        cls.ev(FRAME_RECORDER)


def frame_stats(d):
    if not d:
        return None
    total = sum(d)
    secs, acc, cnt, per_sec = [], 0.0, 0, []
    for x in d:
        acc += x
        cnt += 1
        if acc >= 1000:
            per_sec.append(cnt * 1000 / acc)
            acc, cnt = 0.0, 0
    worst = sorted(d, reverse=True)[:max(1, len(d) // 100)]
    q = sorted(d)
    return {'frames': len(d), 'seconds': round(total / 1000, 1), 'avg_fps': round(len(d) / (total / 1000), 1),
            'min_fps_1s': round(min(per_sec), 1) if per_sec else None, 'max_fps_1s': round(max(per_sec), 1) if per_sec else None,
            'low_1pct_fps': round(1000 / statistics.mean(worst), 1), 'frame_ms_avg': round(total / len(d), 2),
            'frame_ms_p50': q[len(q) // 2], 'frame_ms_p99': q[min(len(q) - 1, int(len(q) * 0.99))], 'frame_ms_max': q[-1],
            'over_33ms': sum(x > 33.3 for x in d), 'over_50ms': sum(x > 50 for x in d), 'over_100ms': sum(x > 100 for x in d)}


def measure(name, seconds, action=None):
    S.ev('(()=>{__fr.d=[]; __fr.last=performance.now(); __fr.on=true; return 0})()')
    l0 = S.ev('mcity.state().logicSteps')
    t0 = time.time()
    while time.time() - t0 < seconds:
        if action:
            action(time.time() - t0)
        else:
            time.sleep(0.5)
    d = S.ev('(()=>{__fr.on=false; return __fr.d})()')
    st = frame_stats(d)
    st['logic_steps_per_s'] = round((S.ev('mcity.state().logicSteps') - l0) / (time.time() - t0), 2)
    st['visibility'] = S.ev('document.visibilityState')
    R['fps'][name] = st
    json.dump(d, open(os.path.join(OUT, 'frametimes_%s.json' % name), 'w'))
    note('fps', scenario=name, **{k: st[k] for k in ('avg_fps', 'min_fps_1s', 'low_1pct_fps', 'frame_ms_p99', 'over_33ms', 'over_50ms', 'over_100ms', 'logic_steps_per_s')})
    return st


def memory(label):
    m = S.ev('(()=>{const m=performance.memory||{}; return {used:m.usedJSHeapSize, total:m.totalJSHeapSize}})()')
    h = S.c.send('Runtime.getHeapUsage')
    procs = ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*%s*' } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { $t = if ($_.CommandLine -match '--type=([a-z-]+)') { $matches[1] } else { 'browser' }; '{0} {1} {2}' -f $t, $p.WorkingSet64, $p.PrivateMemorySize64 } }" % os.path.basename(S.profile))
    by = {}
    for line in procs.splitlines():
        t, ws, pv = line.split()
        a = by.setdefault(t, [0, 0])
        a[0] += int(ws)
        a[1] += int(pv)
    objs = S.ev('(()=>{const s=mcity.scene; return {children:s.children.list.length, textures:s.textures.getTextureKeys().length, cars:s.carSprites.size, planeFlag:s.textures.exists("plane_flag")}})()')
    row = {'label': label, 'js_used_mb': round(m['used'] / 1048576, 1), 'js_total_mb': round(m['total'] / 1048576, 1),
           'cdp_heap_used_mb': round(h['usedSize'] / 1048576, 1), 'process_mb': {k: {'working_set': round(v[0] / 1048576), 'private': round(v[1] / 1048576)} for k, v in by.items()},
           'objects': objs}
    R['memory'].append(row)
    note('memory', **row)
    return row


def window(w, h, state='normal'):
    wid = S.c.send('Browser.getWindowForTarget')['windowId']
    if state == 'normal':
        S.c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
        S.c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'left': 0, 'top': 0, 'width': w, 'height': h}})
    else:
        S.c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': state}})
    time.sleep(1.5)
    return S.ev('({inner:[innerWidth,innerHeight], dpr:devicePixelRatio, canvas:[document.querySelector("canvas").width, document.querySelector("canvas").height], screen:[screen.width,screen.height]})')


def animation_check(label):
    # Frame shown vs the frame expected from simulated time, for every looping item on screen.
    res = S.ev("""(async()=>{const s=mcity.scene; const loops=s.views.filter(v=>v.visual.kind==='loop'); let ok=0, n=0;
      const t0=s.clock.simulatedMs, l0=s.logicSteps, w0=performance.now();
      for(let i=0;i<40;i++){ await new Promise(r=>requestAnimationFrame(()=>r()));
        const t=s.clock.simulatedMs; for(const v of loops){ const c=v.visual.clip; const exp=c.frames<=1||t<=0?0:Math.floor(t*c.fps/1000)%c.frames;
          n++; if(v.sprite.frame.name===`${v.item.sku}/${exp}`) ok++; } }
      return {loops:loops.length, samples:n, matching:ok, clips:[...new Set(loops.map(v=>v.item.sku+':'+v.visual.clip.fps+'fps/'+v.visual.clip.frames))],
              sim_ms_per_wall_ms:+((s.clock.simulatedMs-t0)/(performance.now()-w0)).toFixed(3), steps:s.logicSteps-l0};})()""")
    R['animation'][label] = res
    note('animation', label=label, **res)


def run():
    S.open('?city=empty&view=1090,690')
    R['conditions']['first_window'] = window(1920, 1080)
    S.mouse(900, 500)  # first gesture unlocks audio
    measure('1_empty_city', 20)
    S.shot('fps_1_empty_city')

    # Main 3-minute run on the test city: traffic, animations, memory at 0/1/2/3 min.
    S.open('?city=test&view=1090,690')
    S.mouse(900, 500)
    memory('0 min')
    d_all = []
    for minute in (1, 2, 3):
        st = measure('3min_part%d' % minute, 60)
        d_all += json.load(open(os.path.join(OUT, 'frametimes_3min_part%d.json' % minute)))
        memory('%d min' % minute)
    R['fps']['2_test_city_traffic_3min'] = frame_stats(d_all)
    S.shot('fps_2_test_city_traffic')
    animation_check('test_city_normal')

    # Fountain and building animations in view.
    S.ev("(()=>{const v=mcity.scene.views.find(v=>v.visual.kind==='loop'); if(v) mcity.scene.cameras.main.centerOn(v.sprite.x, v.sprite.y); return 0})()")
    measure('3_fountain_animation', 20)
    S.shot('fps_3_fountain')

    # Zoom and camera drag.
    def zoom_pan(t):
        k = int(t * 2)
        S.c.send('Input.dispatchMouseEvent', {'type': 'mouseWheel', 'x': 900, 'y': 500, 'deltaX': 0, 'deltaY': 120 if k % 8 < 4 else -120})
        S.c.send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 700, 'y': 500, 'button': 'left', 'clickCount': 1})
        for i in range(1, 6):
            S.c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 700 + (40 if k % 2 else -40) * i, 'y': 500 + 15 * i, 'button': 'left', 'buttons': 1})
            time.sleep(0.03)
        S.c.send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 700, 'y': 575, 'button': 'left', 'clickCount': 1})
        time.sleep(0.25)
    measure('4_zoom_and_drag', 20, zoom_pan)
    S.ev('mcity.scene.cameras.main.setZoom(1), 0')

    # Windows opened and closed repeatedly.
    def windows(t):
        S.ev('mcity.selectTool("build"), 0')
        time.sleep(0.4)
        S.click_el('#shop-panel [data-layer=mClose]')
        S.ev('mcity.selectTool("select"), 0')
        S.ev('(()=>{mcity.scene.missionPanel.showDescription(mcity.scene.missions.rule(10)); return 0})()')
        time.sleep(0.4)
        S.ev("document.getElementById('popup-host').replaceChildren(), document.getElementById('popup-host').hidden=true, 0")
    measure('5_windows_open_close', 20, windows)
    memory('after windows')

    # Throttled CPU: render rate drops, simulation and animation must keep their pace.
    S.c.send('Emulation.setCPUThrottlingRate', {'rate': 6})
    measure('6_cpu_throttled_x6', 20)
    animation_check('cpu_throttled_x6')
    S.c.send('Emulation.setCPUThrottlingRate', {'rate': 1})

    # Phase 4-5 features.
    features()

    # Large original city (Sheik's City, 496 objects): view only, its own save key in this temporary profile.
    S.open('?city=npc_boss&view=1090,690')
    st = S.ev('JSON.stringify({views: mcity.state().views, items: mcity.state().items, missing: mcity.state().missing, city: mcity.state().profile.cityName})')
    R['features']['npc_city_view'] = json.loads(st)
    note('npc city', **json.loads(st))
    S.shot('npc_boss_city')
    measure('7_large_city_496_objects', 30)
    animation_check('npc_boss_city')
    S.open('?city=npc_advisor&view=1090,690')
    R['features']['npc_advisor_view'] = json.loads(S.ev('JSON.stringify({views: mcity.state().views, missing: mcity.state().missing, city: mcity.state().profile.cityName})'))
    S.shot('npc_advisor_city')

    resolutions()
    sound_and_saveload()


def features():
    F = R['features']
    S.open('?city=test&view=1090,690')
    S.mouse(900, 500)
    # Shop: wonder info box.
    S.ev('mcity.selectTool("build"), 0')
    time.sleep(0.8)
    S.click_el('#shop-panel [data-layer=Wonders]')
    time.sleep(0.8)
    p = S.ev("(()=>{const b=document.querySelector('#shop-panel .shop-box [data-layer=unlock_FC]'); if(!b) return null; const q=b.getBoundingClientRect(); return {x:q.x+q.width/2, y:q.y-30}})()")
    if p:
        S.mouse(p['x'], p['y'], ('mouseMoved',))
        time.sleep(0.6)
    F['wonder_info'] = S.ev("[...document.querySelectorAll('#shop-panel .shop-info .swf-text')].map(t=>t.textContent).join(' | ')")
    F['wonder_info_rect'] = S.ev("(()=>{const e=document.querySelector('#shop-panel .shop-info'); if(!e) return null; const r=[...e.children].map(c=>c.getBoundingClientRect()); return [Math.min(...r.map(x=>x.left)),Math.min(...r.map(x=>x.top)),Math.max(...r.map(x=>x.right)),Math.max(...r.map(x=>x.bottom))].map(Math.round)})()")
    S.shot('f1_wonder_info')
    note('wonder info', text=F['wonder_info'], rect=F['wonder_info_rect'])
    S.click_el('#shop-panel [data-layer=mClose]')
    S.ev('mcity.selectTool("select"), 0')
    # Contract box and its info box, then not enough cash.
    waiting = S.ev('(mcity.state().modes.find(m=>m[2]===1 || m[2]===7)||[])[0]||null')
    if waiting:
        S.click_sid(waiting)
        time.sleep(0.8)
        S.shot('f2_contract_box')
        F['contract_box'] = S.ev("[...document.querySelectorAll('#contract-panel .contract-item')].length")
        pc = S.ev("(()=>{const r=document.querySelector('#contract-panel .contract-item.swf-button').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
        S.mouse(pc['x'], pc['y'], ('mouseMoved',))
        time.sleep(0.6)
        F['contract_info'] = S.ev("[...document.querySelectorAll('#contract-panel .contract-info .swf-text')].map(t=>t.textContent).join(' | ')")
        S.shot('f3_contract_info')
        coins = S.ev('mcity.state().profile.coins')
        S.ev('mcity.scene.state.data.profile.coins = 50, 0')
        S.mouse(pc['x'], pc['y'])
        time.sleep(0.6)
        F['no_cash_text'] = S.ev("[...document.querySelectorAll('#popup-host .swf-text')].map(t=>t.textContent).join(' | ')")
        F['no_cash_contract_mode'] = S.ev('(mcity.state().modes.find(m=>m[0]===%d)||[])[2]' % waiting)
        F['no_cash_coins_after'] = S.ev('mcity.state().profile.coins')
        S.shot('f4_not_enough_cash')
        note('not enough cash', text=F['no_cash_text'], mode=F['no_cash_contract_mode'], coins=F['no_cash_coins_after'])
        S.click_el('#popup-host [data-layer=button_close]')
        F['no_cash_closed'] = S.ev("document.getElementById('popup-host').hidden")
        S.ev('mcity.scene.state.data.profile.coins = %d, 0' % coins)
        S.click_el('#contract-panel [data-layer=mClose]')
    # Destroy confirmation on a decoration-free target: build a house then demolish it.
    S.ev('mcity.selectTool("terrain"), 0')
    free = S.ev('(()=>{for(let r=3;r<14;r++)for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++){let ok=true; for(const [a,b] of [[0,0],[1,0],[0,1],[1,1]]) if(mcity.why(x+a,y+b).terrain!==null) ok=false; if(ok) return [x,y]}return null})()')
    if free:
        x, y = free
        S.ev('(()=>{const s=mcity.scene; const p=mcity.tileScreen(%d,%d); s.cameras.main.scrollX += (p.x-900); s.cameras.main.scrollY += (p.y-500); return 0})()' % (x, y))
        time.sleep(0.4)
        for a, b in ((0, 0), (1, 0), (0, 1), (1, 1)):
            p = S.ev('mcity.tileScreen(%d,%d)' % (x + a, y + b))
            S.mouse(p['x'], p['y'])
            time.sleep(0.15)
        S.ev('mcity.selectTool("build"), mcity.buy("houses_001_001"), 0')
        time.sleep(1.2)
        p = S.ev('mcity.tileScreen(%d,%d)' % (x, y))
        S.mouse(p['x'], p['y'])
        time.sleep(0.6)
        S.ev('mcity.selectTool("demolish"), 0')
        p = S.ev('mcity.tileScreen(%d,%d)' % (x + 1, y + 1))
        S.mouse(p['x'], p['y'])
        time.sleep(0.6)
        F['destroy_popup'] = S.ev("[...document.querySelectorAll('#popup-host .swf-text')].map(t=>t.textContent).join(' | ')")
        S.shot('f5_destroy_popup')
        n = S.ev('mcity.state().items')
        S.click_el('#popup-host [data-layer=OkButton]')
        time.sleep(0.4)
        F['destroy_removed'] = S.ev('mcity.state().items') == n - 1
        S.ev('mcity.selectTool("select"), 0')
    # Mission with its own image.
    S.ev('(()=>{mcity.scene.missionPanel.showDescription(mcity.scene.missions.rule(10)); return 0})()')
    time.sleep(0.5)
    F['mission_image_layers'] = S.ev("document.querySelectorAll('#popup-host .mission-image .swf-layer').length")
    F['mission_image_rect'] = S.ev("(()=>{const e=document.querySelector('#popup-host .mission-image .swf-layer'); if(!e) return null; const r=e.getBoundingClientRect(); return [r.left,r.top,r.width,r.height].map(Math.round)})()")
    S.shot('f6_mission_image')
    S.ev("document.getElementById('popup-host').replaceChildren(), document.getElementById('popup-host').hidden=true, 0")
    # Two plane flights in a row; the flag texture must be gone after each flight.
    flights = []
    for k, name in enumerate(('Phase Six A', 'Phase Six B')):
        S.ev('mcity.scene.openNamePopup(), 0')
        time.sleep(0.4)
        S.ev("(()=>{const i=document.querySelector('#popup-host input'); i.value=%s; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); return 0})()" % json.dumps(name))
        t0 = time.time()
        during = S.ev('mcity.scene.textures.exists("plane_flag")')
        ys = []
        shot = False
        while time.time() - t0 < 40:
            st = json.loads(S.ev('JSON.stringify([mcity.state().plane, mcity.state().planeFlag])'))
            if st[0] is None:
                break
            ys.append(max(abs(v) for v in st[1]) if st[1] else None)
            if not shot and time.time() - t0 > 4:
                S.ev('(()=>{const s=mcity.scene; s.cameras.main.centerOn(s.plane.container.x+200, s.plane.container.y+40); return 0})()')
                time.sleep(0.2)
                S.shot('f7_plane_flight_%d' % (k + 1))
                shot = True
            time.sleep(0.5)
        flights.append({'name': name, 'seconds': round(time.time() - t0, 1), 'texture_during': during, 'flag_amplitude_max': max(y for y in ys if y is not None) if ys else None,
                        'texture_after': S.ev('mcity.scene.textures.exists("plane_flag")'), 'city': S.ev('mcity.state().profile.cityName')})
        note('plane flight', **flights[-1])
    F['plane_flights'] = flights
    memory('after two plane flights')


def resolutions():
    S.open('?city=test&view=1090,690')
    for label, w, h, state in (('1280x720', 1280, 720, 'normal'), ('1920x1080', 1920, 1080, 'normal'), ('2560x1440', 0, 0, 'fullscreen')):
        info = window(w, h, state)
        S.ev('mcity.scene.cameras.main.setZoom(1), 0')
        time.sleep(0.6)
        S.shot('res_%s_city' % label)
        S.ev('mcity.selectTool("build"), 0')
        time.sleep(0.8)
        S.shot('res_%s_shop' % label)
        shop = S.ev("(()=>{const r=[...document.querySelectorAll('#shop-panel .swf-layer')].map(e=>e.getBoundingClientRect()); return [Math.min(...r.map(x=>x.left)),Math.min(...r.map(x=>x.top)),Math.max(...r.map(x=>x.right)),Math.max(...r.map(x=>x.bottom))].map(Math.round)})()")
        S.click_el('#shop-panel [data-layer=mClose]')
        S.ev('mcity.selectTool("select"), 0')
        hud = S.ev("(()=>{const q=s=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom].map(Math.round)}; return {toolbar:q('.toolbar'), hud:q('#hud .swf-panel')||q('#hud')}})()")
        st = measure('res_%s' % label, 10)
        R['resolutions'][label] = {'window': info, 'shop_rect': shop, 'hud': hud, 'avg_fps': st['avg_fps'], 'low_1pct_fps': st['low_1pct_fps']}
        note('resolution', label=label, info=info, shop=shop)
    window(1920, 1080)


def sound_and_saveload():
    # Each sound with music off and 1.5 s of silence before it; the meter shows whether output reached the device.
    S.open('?city=test&view=1090,690')
    S.mouse(900, 500)
    time.sleep(3)
    t_music = [now_ms() - 2500, now_ms()]
    S.ev('mcity.scene.audio.setMusicEnabled(false), 0')
    R['sound'].append({'sound': 'music main.mp3', 'window': t_music})
    for name, sid in (('Build_Sound', 'build.mp3'), ('Destroy_Sound', 'bulldoze.mp3'), ('Contract_Sound', 'contract.mp3'), ('Income_Sound', 'money.mp3'), ('Level_Sound', 'levelup.mp3')):
        time.sleep(1.5)
        b = [now_ms() - 1400, now_ms()]
        S.ev('mcity.scene.audio.sfx(%s), 0' % json.dumps(name))
        t0 = now_ms()
        time.sleep(2.5)
        R['sound'].append({'sound': sid, 'baseline': b, 'window': [t0, now_ms()], 'trigger': 'AudioEvents.sfx (direct)'})
    S.ev('mcity.scene.audio.setMusicEnabled(true), 0')
    # Save/load: state before a reload of the page equals the state after; collecting again pays nothing.
    S.ev('mcity.fastForward(3*60*60*1000), 0')
    time.sleep(2.5)
    ready = S.ev("mcity.state().modes.filter(m=>m[2]===5 && m[1].startsWith('houses')).map(m=>m[0])")
    if ready:
        S.click_sid(ready[0])
        time.sleep(0.5)
    key = '{profile: mcity.state().profile, items: mcity.state().items, storage: mcity.state().storage, missions: mcity.state().missions, counts: mcity.state().counts, roads: mcity.state().roads, terrain: mcity.state().terrain}'
    before = json.loads(S.ev('JSON.stringify(%s)' % key))
    S.open('?city=test&view=1090,690')
    after = json.loads(S.ev('JSON.stringify(%s)' % key))
    paid_again = None
    if ready:
        coins = S.ev('mcity.state().profile.coins')
        S.click_sid(ready[0])
        time.sleep(0.5)
        paid_again = S.ev('mcity.state().profile.coins') != coins
    valid = S.ev('(()=>{try{const d=JSON.parse(localStorage.getItem("mcity.save.v1.test")); return d.version===3 && Array.isArray(d.paidCycles)}catch(e){return false}})()')
    R['saveload'] = {'equal_after_reload': before == after, 'diff': [k for k in before if before[k] != after[k]], 'collected_sid': ready[0] if ready else None,
                     'paid_again_after_reload': paid_again, 'save_valid': valid}
    note('save/load', **R['saveload'])


def main():
    S.profile = tempfile.mkdtemp(prefix='mcity_p6_chrome_')
    meter_csv = os.path.join(OUT, 'audio_peaks.csv')
    stop_file = S.profile + '_stop'
    server = subprocess.Popen([NODE, os.path.join(ROOT, 'tools', 'serve.mjs')], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen([CHROME, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=%d' % PORT, '--user-data-dir=' + S.profile,
                               '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
                               '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
                               '--window-position=0,0', '--window-size=1920,1080', '--app=about:blank'])
    meter = subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(ROOT, 'tools', 'audio_meter.ps1'),
                              '-Profile', os.path.basename(S.profile), '-StopFile', stop_file, '-Seconds', '3000', '-IntervalMs', '20', '-Out', meter_csv],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    R['conditions'].update({'browser': 'Chrome (app window, temporary profile)', 'display': '2560x1440 @ 180 Hz, AMD Radeon RX 6800 XT', 'server': '127.0.0.1:8417',
                            'started': time.strftime('%Y-%m-%d %H:%M:%S')})
    try:
        time.sleep(2)
        S.c = CDP(page_ws(PORT), timeout=180)
        S.c.send('Runtime.enable')
        R['conditions']['chrome'] = S.c.send('Browser.getVersion')['product']
        run()
    except Exception as e:
        R['notes'].append('stopped: %r' % (e,))
        note('error', error=repr(e)[:300])
    finally:
        errors = [e for e in (S.c.events if S.c else []) if e.get('method') == 'Runtime.exceptionThrown' or
                  (e.get('method') == 'Runtime.consoleAPICalled' and e['params'].get('type') in ('error', 'warning'))]
        R['console_errors'] = len(errors)
        json.dump(errors, open(os.path.join(OUT, 'console.json'), 'w'), indent=1)
        open(stop_file, 'w').close()
        try:
            meter.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            meter.kill()
        chrome.terminate()
        try:
            chrome.wait(15)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.terminate()
        server.wait(10)
        time.sleep(2)
        shutil.rmtree(S.profile, ignore_errors=True)
        if os.path.exists(stop_file):
            os.remove(stop_file)
        for s in R['sound']:
            if os.path.exists(meter_csv):
                s['peak'] = peaks(meter_csv, *s['window'])
                if s.get('baseline'):
                    s['baseline_peak'] = peaks(meter_csv, *s['baseline'])
        R['conditions']['finished'] = time.strftime('%Y-%m-%d %H:%M:%S')
        json.dump(R, open(os.path.join(OUT, 'phase6_results.json'), 'w'), indent=1)
        json.dump(LOG, open(os.path.join(OUT, 'session_log.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
