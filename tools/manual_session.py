"""Phase 3 validation session: one local server, one headed Chrome with a temporary profile, the isolated test city.

Measures real audio output per sound with tools/audio_meter.ps1 (Windows Core Audio peak level of this Chrome's
audio sessions), then level-up, the plane after renaming, at least 3 minutes of traffic with FPS and JS heap samples,
and a reload without fresh=1. Everything is written to <out_dir>.

Usage: python -I tools/manual_session.py <out_dir> [traffic_seconds] [--headless]
Headless runs have no audio output, so their sound results are not evidence."""
import base64
import csv
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
PORT = 9345
BASE = 'http://127.0.0.1:8417/?city=test&view=1090,690'
SAVE_KEY = 'mcity.save.v1.test'


def now_ms():
    return int(time.time() * 1000)


class Session:
    def __init__(self, out):
        self.out = out
        self.log = []
        self.c = None

    def note(self, what, **kw):
        row = {'t': now_ms(), 'what': what, **kw}
        self.log.append(row)
        print(json.dumps(row)[:400], flush=True)
        return row

    def ev(self, js):
        return self.c.eval(js)

    def shot(self, name):
        r = self.c.send('Page.captureScreenshot', {'format': 'png'})
        open(os.path.join(self.out, name + '.png'), 'wb').write(base64.b64decode(r['data']))

    def mouse(self, x, y):
        self.c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y})
        for t in ('mousePressed', 'mouseReleased'):
            self.c.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})

    def click_expr(self, js):
        p = self.ev(js)
        if not p:
            return False
        self.mouse(p['x'], p['y'])
        return True

    def click_sid(self, sid):
        # Centre the camera on the item first: screenOf is outside the canvas for items out of view.
        self.ev('(()=>{const v=mcity.scene.views.find(v=>v.item.sid===%d); mcity.scene.cameras.main.centerOn(v.sprite.x, v.sprite.y-40); return 0})()' % sid)
        time.sleep(0.4)
        return self.click_expr('mcity.screenOf(%d)' % sid)

    def click_el(self, selector):
        return self.click_expr('(()=>{const e=document.querySelector(%s); if(!e) return null; const r=e.getBoundingClientRect();'
                               ' return {x:r.x+r.width/2, y:r.y+r.height/2}})()' % json.dumps(selector))

    def wait_scene(self):
        end = time.time() + 60
        while time.time() < end:
            try:
                if self.ev('!!(window.mcity && window.mcity.state)'):
                    return
            except RuntimeError:
                pass
            time.sleep(0.3)
        raise SystemExit('city scene did not start')

    def state(self, expr='mcity.state()'):
        return json.loads(self.ev('JSON.stringify(%s)' % expr))


def peaks(csv_path, t0, t1):
    vals = []
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            t = int(row['epoch_ms'])
            if t0 <= t <= t1:
                vals.append(float(row['peak']))
    return {'samples': len(vals), 'max_peak': round(max(vals), 4) if vals else None,
            'above_0.01': sum(v > 0.01 for v in vals)}


def run(s, traffic_s):
    sound_windows = []

    def sound(name, action, settle=2.5):
        base0 = now_ms()
        time.sleep(1.5)
        base1 = now_ms()
        ok = action()
        t0 = now_ms()
        time.sleep(settle)
        sound_windows.append({'sound': name, 'action_ok': ok, 'baseline': [base0, base1], 'window': [t0, now_ms()]})
        s.note('sound', name=name, action_ok=ok)

    # The temporary Chrome profile has empty localStorage, so the first load imports city_test.json without fresh=1.
    s.c.send('Page.navigate', {'url': BASE})
    s.wait_scene()
    time.sleep(2)
    key = s.ev('mcity.scene.store ? mcity.scene.store.key : null')
    s.note('save key', key=key)
    if key != SAVE_KEY:
        raise SystemExit('active save is not the isolated test copy: %r' % key)
    st = s.state()
    s.note('start', coins=st['profile']['coins'], exp=st['profile']['exp'], level=st['level'], items=st['items'],
           city=st['profile']['cityName'], heap=s.c.send('Runtime.getHeapUsage'))
    s.shot('00_start')

    # First gesture unlocks WebAudio; music starts (DollarsGame.getCurrentMusic).
    t0 = now_ms()
    s.mouse(640, 300)
    time.sleep(4)
    sound_windows.append({'sound': 'music main.mp3', 'action_ok': True, 'baseline': None, 'window': [t0 + 500, now_ms()]})
    s.note('music', locked=s.ev('mcity.scene.sound.locked'),
           playing=s.ev('mcity.scene.sound.getAllPlaying().map(x=>x.key)'))
    s.ev('mcity.scene.audio.setMusicEnabled(false), 0')
    time.sleep(1)
    s.note('music muted', playing=s.ev('mcity.scene.sound.getAllPlaying().map(x=>x.key)'))

    # Build: 4 terrain tiles, then a house on them.
    s.ev('mcity.selectTool("terrain"), 0')
    for x, y in ((6, 6), (7, 6), (6, 7), (7, 7)):
        s.click_expr('mcity.tileScreen(%d,%d)' % (x, y))
        time.sleep(0.15)
    time.sleep(1.5)
    s.ev('mcity.selectTool("build"), 0')
    time.sleep(1.0)
    p0 = s.ev("(()=>{const b=document.querySelector('#shop-panel .shop-box [data-layer=unlock_FC]'); if(!b) return null; const r=b.closest('.shop-box').getBoundingClientRect(); const q=b.getBoundingClientRect(); return {x:q.x+q.width/2, y:q.y-30}})()")
    if p0:
        s.c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': p0['x'], 'y': p0['y']})
        time.sleep(0.6)
        s.shot('01a_shop_info')
        s.note('shop info', text=s.ev("[...document.querySelectorAll('#shop-panel .shop-info .swf-text')].map(t=>t.textContent).join(' | ')"))
        s.c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 5, 'y': 5})
    s.ev('mcity.selectTool("build"), mcity.buy("houses_001_001"), 0')
    time.sleep(1.5)
    p = s.ev('mcity.tileScreen(6,6)')
    s.c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': p['x'], 'y': p['y']})
    time.sleep(0.3)
    before = s.state('mcity.state().construction.length')
    sound('build.mp3', lambda: (s.mouse(p['x'], p['y']), time.sleep(0.2),
                                s.state('mcity.state().construction.length') > before)[-1])
    s.shot('01_built_site')

    # Contract on a house waiting for one.
    s.ev('mcity.selectTool("select"), 0')
    sid = s.ev('(mcity.state().modes.find(m=>m[2]===1 && !mcity.state().construction.some(c=>c[0]===m[0]))||[])[0]||null')
    s.note('contract house', sid=sid)
    if sid:
        s.click_sid(sid)
        time.sleep(0.8)
        s.shot('02_contract_panel')
        s.note('contract box', items=s.ev("[...document.querySelectorAll('#contract-panel .contract-item')].map(e=>[e.dataset.sku, e.classList.contains('locked'), [...e.querySelectorAll('.swf-text')].map(t=>t.textContent).filter(Boolean).join(' | ')])"),
               right_disabled=s.ev("!!document.querySelector('#contract-panel [data-layer=mArrowRight].swf-disabled')"))
        p0 = s.ev("(()=>{const r=document.querySelector('#contract-panel .contract-item.swf-button').getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}})()")
        s.c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': p0['x'], 'y': p0['y']})
        time.sleep(0.6)
        s.shot('02b_contract_info')
        s.note('contract info', text=s.ev("[...document.querySelectorAll('#contract-panel .contract-info .swf-text')].map(t=>t.textContent).join(' | ')"))
        sel = '#contract-panel .contract-item.swf-button'
        sound('contract.mp3', lambda: (s.click_el(sel), time.sleep(0.2),
                                       s.ev('(mcity.state().modes.find(m=>m[0]===%d)||[])[2]' % sid) == 2)[-1])
    else:
        sound_windows.append({'sound': 'contract.mp3', 'action_ok': False, 'baseline': None, 'window': None})

    # Income: three hours later, collect one house.
    s.ev('mcity.fastForward(3*60*60*1000), 0')
    time.sleep(2.5)
    ready = s.ev("mcity.state().modes.filter(m=>m[2]===5 && m[1].startsWith('houses')).map(m=>m[0])")
    s.note('rent ready', sids=ready, modes=s.state('mcity.state().modes'), icons=s.state('mcity.state().icons'),
           hit=[s.ev('(()=>{const p=mcity.screenOf(%d); return [p, mcity.itemAt(p.x,p.y)]})()' % r) for r in ready])
    s.shot('03_rent_ready')
    if ready:
        coins = s.state('mcity.state().profile.coins')
        sound('money.mp3', lambda: (s.click_sid(ready[0]), time.sleep(0.3),
                                    s.state('mcity.state().profile.coins') > coins)[-1])
        s.note('after collect', coins_before=coins, coins=s.state('mcity.state().profile.coins'),
               exp=s.state('mcity.state().profile.exp'), mode=s.ev('(mcity.state().modes.find(m=>m[0]===%d)||[])[2]' % ready[0]))
    else:
        sound_windows.append({'sound': 'money.mp3', 'action_ok': False, 'baseline': None, 'window': None})

    # Level up: experience just below the next level, then the next collection crosses it.
    lvl = s.state('mcity.state().level')
    need = s.ev('mcity.scene.builder.levels[%d] ? mcity.scene.builder.levels[%d].xpNeed : null' % (lvl, lvl))
    s.note('level before', level=lvl, next_xp=need)
    s.ev('mcity.fastForward(24*60*60*1000), 0')
    time.sleep(2.5)
    ready = s.ev("mcity.state().modes.filter(m=>m[2]===5 && m[1].startsWith('houses')).map(m=>m[0])")
    s.note('rent ready for level', sids=ready)
    if need and ready:
        s.ev('mcity.scene.state.data.profile.exp = %d, 0' % (need - 1))

        def level_up():
            s.click_sid(ready[0])
            time.sleep(0.5)
            return s.state('mcity.state().level') > lvl
        sound('levelup.mp3 (+ money.mp3)', level_up, settle=3.5)
        s.shot('04_level_popup')
        s.note('level after', level=s.state('mcity.state().level'),
               popup=s.ev("[...document.querySelectorAll('#popup-host .swf-text')].map(e=>e.textContent).filter(Boolean).join(' | ')"))
        s.click_el('#level-popup .swf-button')
        time.sleep(0.3)
        s.note('level popup closed', hidden=s.ev("document.getElementById('level-popup').hidden"))
    else:
        sound_windows.append({'sound': 'levelup.mp3 (+ money.mp3)', 'action_ok': False, 'baseline': None, 'window': None})

    # Destroy the finished house.
    s.ev('mcity.fastForward(60*60*1000), 0')
    time.sleep(2)
    s.ev('mcity.selectTool("demolish"), 0')
    items = s.state('mcity.state().items')
    def destroy():
        s.click_expr('mcity.tileScreen(7,7)')
        time.sleep(0.5)
        s.shot('04b_destroy_popup')
        s.note('destroy popup', text=s.ev("[...document.querySelectorAll('#popup-host .swf-text')].map(t=>t.textContent).join(' | ')"),
               items=s.state('mcity.state().items'))
        s.click_el('#popup-host [data-layer=OkButton]')
        time.sleep(0.3)
        return s.state('mcity.state().items') < items
    sound('bulldoze.mp3', destroy)
    s.ev('mcity.selectTool("select"), 0')
    s.ev('mcity.scene.audio.setMusicEnabled(true), 0')

    # Phase 4: wonder info box in the shop, and PopupConfirm when a contract costs more than the player has.
    s.ev('mcity.selectTool("build"), 0')
    time.sleep(0.8)
    s.click_el('#shop-panel [data-layer=Wonders]')
    time.sleep(0.8)
    p0 = s.ev("(()=>{const b=document.querySelector('#shop-panel .shop-box [data-layer=unlock_FC]'); if(!b) return null; const q=b.getBoundingClientRect(); return {x:q.x+q.width/2, y:q.y-30}})()")
    if p0:
        s.c.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': p0['x'], 'y': p0['y']})
        time.sleep(0.6)
        s.shot('04d_wonder_info')
        s.note('wonder info', text=s.ev("[...document.querySelectorAll('#shop-panel .shop-info .swf-text')].map(t=>t.textContent).join(' | ')"))
    s.ev('mcity.selectTool("select"), 0')
    s.ev('mcity.scene.state.data.profile.coins = 50, 0')
    waiting = s.ev('(mcity.state().modes.find(m=>m[2]===1 || m[2]===7)||[])[0]||null')
    if waiting:
        s.click_sid(waiting)
        time.sleep(0.8)
        s.click_el('#contract-panel .contract-item.swf-button')
        time.sleep(0.5)
        s.shot('04e_no_cash')
        s.note('no cash', text=s.ev("[...document.querySelectorAll('#popup-host .swf-text')].map(t=>t.textContent).join(' | ')"),
               mode=s.ev('(mcity.state().modes.find(m=>m[0]===%d)||[])[2]' % waiting), coins=s.state('mcity.state().profile.coins'))
        s.click_el('#popup-host [data-layer=button_close]')
        s.ev("document.querySelector('#contract-panel [data-layer=mClose]') && 0")
        s.click_el('#contract-panel [data-layer=mClose]')
    s.ev('mcity.scene.state.data.profile.coins = 9000000, 0')

    # Mission with its own image (imageIsRequired): PopupMission uses popup_mission_background_01_image_01.
    s.ev('(()=>{const m=mcity.scene.missionPanel; m.showDescription(mcity.scene.missions.rule(10)); return 0})()')
    time.sleep(0.5)
    s.shot('04c_mission_image')
    s.note('mission image', layers=s.ev("document.querySelectorAll('#popup-host .mission-image .swf-layer').length"),
           text=s.ev("[...document.querySelectorAll('#popup-host .swf-text')].map(t=>t.textContent).filter(Boolean).join(' | ')"))
    s.ev("document.getElementById('popup-host').replaceChildren(), document.getElementById('popup-host').hidden=true, 0")

    # Plane after renaming the city (PopupName.saveName).
    s.ev('mcity.scene.openNamePopup(), 0')
    time.sleep(0.5)
    s.shot('05_name_popup')
    s.ev("(()=>{const i=document.querySelector('#popup-host input'); i.value='Phase Three'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); return 0})()")
    path = []
    t_start = now_ms()
    shot_taken = False
    while now_ms() - t_start < 60000:
        pl = s.state('[mcity.state().plane, mcity.state().camera, mcity.scene.cameras.main.worldView.left, mcity.scene.cameras.main.worldView.right]')
        path.append([now_ms() - t_start] + pl)
        if pl[0] is None:
            break
        if not shot_taken and pl[0][0] < (pl[2] + pl[3]) / 2:
            s.shot('06_plane')
            s.note('plane flag', ys=s.state('mcity.state().planeFlag'))
            s.ev('mcity.scene.cameras.main.setZoom(2), mcity.scene.cameras.main.centerOn(mcity.scene.plane.container.x + 200, mcity.scene.plane.container.y + 50), 0')
            time.sleep(0.3)
            s.shot('06b_plane_zoom')
            s.ev('mcity.scene.cameras.main.setZoom(1), 0')
            shot_taken = True
        time.sleep(0.5)
    s.note('plane', city=s.state('mcity.state().profile.cityName'), samples=len(path), first=path[0], last=path[-1])
    json.dump(path, open(os.path.join(s.out, 'plane_path.json'), 'w'))

    # Traffic and stability without interaction.
    samples = []
    t_start = time.time()
    while time.time() - t_start < traffic_s:
        cars = s.state('mcity.state().cars')
        heap = s.c.send('Runtime.getHeapUsage')
        samples.append({'s': round(time.time() - t_start, 1), 'fps': round(s.ev('mcity.state().fps'), 1),
                        'cars': len(cars), 'skus': sorted({c[0] for c in cars}), 'heap_used': heap['usedSize'],
                        'logic_steps': s.ev('mcity.state().logicSteps'),
                        'visibility': s.ev('document.visibilityState'), 'focus': s.ev('document.hasFocus()'),
                        'window': s.c.send('Browser.getWindowForTarget').get('bounds', {}).get('windowState')})
        if len(samples) in (2, 10):
            s.shot('07_traffic_%d' % len(samples))
        time.sleep(10)
    json.dump(samples, open(os.path.join(s.out, 'traffic_samples.json'), 'w'), indent=0)
    s.note('traffic', duration_s=round(time.time() - t_start), n=len(samples))

    # Reload without fresh=1: the saved state must come back unchanged.
    before = s.state('{profile: mcity.state().profile, items: mcity.state().items, storage: mcity.state().storage, missions: mcity.state().missions, counts: mcity.state().counts, roads: mcity.state().roads, terrain: mcity.state().terrain}')
    s.c.send('Page.navigate', {'url': BASE})
    s.wait_scene()
    time.sleep(3)
    after = s.state('{profile: mcity.state().profile, items: mcity.state().items, storage: mcity.state().storage, missions: mcity.state().missions, counts: mcity.state().counts, roads: mcity.state().roads, terrain: mcity.state().terrain}')
    s.shot('08_after_reload')
    diff = {k: [before[k], after[k]] for k in before if before[k] != after[k]}
    s.note('reload', equal=not diff, diff=diff)
    json.dump({'before': before, 'after': after}, open(os.path.join(s.out, 'reload.json'), 'w'), indent=1)
    return sound_windows


def main():
    out = os.path.abspath(sys.argv[1])
    traffic_s = int(sys.argv[2]) if len(sys.argv) > 2 else 190
    headless = '--headless' in sys.argv
    os.makedirs(out, exist_ok=True)
    profile = tempfile.mkdtemp(prefix='mcity_chrome_')
    meter_csv = os.path.join(out, 'audio_peaks.csv')
    stop_file = os.path.join(profile + '_stop')
    server = subprocess.Popen([NODE, os.path.join(ROOT, 'tools', 'serve.mjs')], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen([CHROME] + (['--headless=new'] if headless else []) + ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=%d' % PORT,
                               '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
                               '--autoplay-policy=no-user-gesture-required', '--disable-backgrounding-occluded-windows',
                               '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
                               '--window-size=1280,860', 'about:blank'])
    meter = subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                              os.path.join(ROOT, 'tools', 'audio_meter.ps1'), '-Profile', os.path.basename(profile), '-StopFile', stop_file,
                              '-Seconds', str(traffic_s + 400), '-IntervalMs', '20', '-Out', meter_csv],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    s = Session(out)
    windows = []
    try:
        time.sleep(2)
        s.c = CDP(page_ws(PORT), timeout=120)
        s.c.send('Runtime.enable')
        s.c.send('Log.enable')
        windows = run(s, traffic_s)
    finally:
        errors = [e for e in (s.c.events if s.c else []) if e.get('method') == 'Runtime.exceptionThrown' or
                  (e.get('method') == 'Runtime.consoleAPICalled' and e['params'].get('type') in ('error', 'warning')) or
                  (e.get('method') == 'Log.entryAdded' and e['params']['entry'].get('level') in ('error', 'warning'))]
        json.dump(errors, open(os.path.join(out, 'console.json'), 'w'), indent=1)
        open(stop_file, 'w').close()
        try:
            print(meter.communicate(timeout=30)[0])
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
        shutil.rmtree(profile, ignore_errors=True)
        os.remove(stop_file)
        json.dump(s.log, open(os.path.join(out, 'session_log.json'), 'w'), indent=1)
    for w in windows:
        if w['window'] and os.path.exists(meter_csv):
            w['peak'] = peaks(meter_csv, *w['window'])
            if w['baseline']:
                w['baseline_peak'] = peaks(meter_csv, *w['baseline'])
    json.dump(windows, open(os.path.join(out, 'audio_results.json'), 'w'), indent=1)
    print(json.dumps(windows, indent=1))
    print('console errors/warnings:', len(errors))


if __name__ == '__main__':
    main()
