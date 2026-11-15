"""Checks the packaged desktop EXE: start, resources, NPC data, offline behaviour, save, close, restart, reload.

Runs the EXE with a temporary --mcity-user-data profile (never the player's %APPDATA% profile) and a local
DevTools port for inspection. Usage: python -I tools/exe_check.py <exe> <out_dir>"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402

EXE, OUT = sys.argv[1], os.path.abspath(sys.argv[2])
PORT = 9347
os.makedirs(OUT, exist_ok=True)
profile = tempfile.mkdtemp(prefix='mcity_exe_profile_')
log = []


def note(what, **kw):
    row = {'t': round(time.time(), 1), 'what': what, **kw}
    log.append(row)
    print(json.dumps(row)[:600], flush=True)


def ps(cmd):
    return subprocess.run(['powershell', '-NoProfile', '-Command', cmd], capture_output=True, text=True).stdout.strip()


def app_pids():
    out = ps("Get-CimInstance Win32_Process -Filter \"Name='Millionaire City HTML5.exe'\" | ForEach-Object { $_.ProcessId }")
    return [int(x) for x in out.split()] if out else []


def listening_ports(pids):
    if not pids:
        return []
    out = ps("Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { @(%s) -contains $_.OwningProcess } | "
             "ForEach-Object { '{0}:{1}' -f $_.LocalAddress, $_.LocalPort }" % ','.join(map(str, pids)))
    return sorted(set(out.split())) if out else []


def start():
    proc = subprocess.Popen([EXE, '--mcity-user-data=' + profile, '--remote-debugging-port=%d' % PORT, '--remote-debugging-address=127.0.0.1'])
    t0 = time.time()
    c = CDP(page_ws(PORT, timeout=60), timeout=120)
    end = time.time() + 90
    while time.time() < end:
        try:
            if c.eval('!!(window.mcity && window.mcity.state)'):
                break
        except RuntimeError:
            pass
        time.sleep(0.3)
    else:
        raise SystemExit('game scene did not start')
    time.sleep(2)
    note('started', seconds=round(time.time() - t0, 1), url=c.eval('location.href'))
    return proc, c


def state(c):
    return json.loads(c.eval('JSON.stringify({coins: mcity.state().profile.coins, exp: mcity.state().profile.exp, items: mcity.state().items, '
                             'terrain: mcity.state().terrain, roads: mcity.state().roads, missing: mcity.state().missing, views: mcity.state().views, '
                             'paid: JSON.parse(localStorage.getItem("mcity.save.v1")).paidCycles.length})'))


def keep_visible(c):
    # A minimized window renders no frames, so Phaser never sees the input; restore it before clicking.
    vis = c.eval('document.visibilityState')
    try:
        wid = c.send('Browser.getWindowForTarget')['windowId']
        if c.send('Browser.getWindowBounds', {'windowId': wid})['bounds']['windowState'] == 'minimized':
            c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
            time.sleep(1.2)
            note('restored window', visibility_before=vis)
    except RuntimeError:
        # Electron has no Browser.getWindowForTarget: restore the app's own top-level windows (SW_RESTORE).
        if vis == 'hidden':
            ps("Add-Type -Name W -Namespace U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(System.IntPtr h, int c);"
               " [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(System.IntPtr h);';"
               " Get-Process -Name 'Millionaire City HTML5' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } |"
               " ForEach-Object { [U.W]::ShowWindow($_.MainWindowHandle, 9) | Out-Null; [U.W]::SetForegroundWindow($_.MainWindowHandle) | Out-Null }")
            time.sleep(1.5)
            note('restored window', visibility_before=vis, visibility_after=c.eval('document.visibilityState'))


def close(proc, c):
    try:
        c.send('Browser.close', timeout=10)
    except Exception:
        pass
    try:
        proc.wait(30)
    except subprocess.TimeoutExpired:
        proc.kill()
    time.sleep(3)
    note('closed', exit_code=proc.returncode, leftover_pids=app_pids())


results = {}
try:
    proc, c = start()
    pids = app_pids()
    ports = listening_ports(pids)
    note('processes', pids=len(pids), listening=ports)
    results['listening_ports_besides_devtools'] = [p for p in ports if not p.endswith(':%d' % PORT)]
    s0 = state(c)
    note('first state', **s0)
    results['all_items_defined'] = s0['missing'] == [] or s0['missing'] == 0
    npc = c.eval('Promise.all(["data/npc_boss.json","data/npc_advisor.json"].map(f=>fetch(f).then(r=>r.json()).then(j=>[f, j.profile.cityname, j.items.length])))')
    note('npc data', files=npc)
    results['npc_data'] = npc
    ext = c.eval('fetch("https://example.com/").then(()=>"reached").catch(e=>"blocked: "+e.message)')
    note('external request', result=ext)
    results['external_request'] = ext
    r = c.send('Page.captureScreenshot', {'format': 'png'})
    import base64
    open(os.path.join(OUT, 'exe_first_start.png'), 'wb').write(base64.b64decode(r['data']))
    # Changes on the temporary profile: one plot of terrain, one contract, then rent three hours later.
    def click_world(expr):
        keep_visible(c)
        p = c.eval(expr)
        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
            c.send('Input.dispatchMouseEvent', {'type': t, 'x': p['x'], 'y': p['y'], 'button': 'left', 'clickCount': 1})
        time.sleep(0.5)

    def click_sid(sid):
        c.eval('(()=>{const v=mcity.scene.views.find(v=>v.item.sid===%d); mcity.scene.cameras.main.centerOn(v.sprite.x, v.sprite.y-40); return 0})()' % sid)
        time.sleep(0.4)
        click_world('mcity.screenOf(%d)' % sid)

    free = c.eval('(()=>{for(let r=1;r<12;r++)for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++){if(mcity.why(x,y).terrain===null)return [x,y]}return null})()')
    t0 = state(c)['terrain']
    if free:
        c.eval('mcity.selectTool("terrain"), 0')
        c.eval('(()=>{const t=mcity.scene.cameras.main; const p=mcity.tileScreen(%d,%d); return 0})()' % tuple(free))
        c.eval('(()=>{const s=mcity.scene; const p=mcity.tileScreen(%d,%d); s.cameras.main.scrollX += (p.x-640); s.cameras.main.scrollY += (p.y-400); return 0})()' % tuple(free))
        time.sleep(0.4)
        click_world('mcity.tileScreen(%d,%d)' % tuple(free))
        c.eval('mcity.selectTool("select"), 0')
    note('terrain bought', tile=free, terrain_before=t0, terrain=state(c)['terrain'])
    results['terrain_bought'] = state(c)['terrain'] == t0 + 1
    note('house modes', modes=c.eval('mcity.state().modes.map(m=>m[2])'))
    c.eval('mcity.fastForward(96*60*60*1000), 0')
    time.sleep(2.5)
    note('house modes after 96 h', modes=c.eval('mcity.state().modes.map(m=>m[2])'))
    ready = c.eval("mcity.state().modes.filter(m=>m[2]===5 && m[1].startsWith('houses')).map(m=>m[0])")
    before = state(c)
    if ready:
        click_sid(ready[0])
    s1 = state(c)
    note('after collect', sid=ready[0] if ready else None, coins_before=before['coins'], coins=s1['coins'], paid=s1['paid'])
    results['collect_paid'] = s1['coins'] > before['coins']
    waiting = c.eval('(mcity.state().modes.find(m=>m[2]===1 || m[2]===7)||[])[0]||null')
    if waiting:
        click_sid(waiting)
        c.eval("(()=>{const e=document.querySelector('#contract-panel .contract-item.swf-button'); const r=e.getBoundingClientRect(); window._p={x:r.x+r.width/2,y:r.y+r.height/2}; return 0})()")
        click_world('window._p')
        time.sleep(3.5)
    contract_mode = c.eval('(mcity.state().modes.find(m=>m[0]===%d)||[])[2]' % waiting) if waiting else None
    note('contract signed', sid=waiting, mode=contract_mode)
    results['contract_signed'] = contract_mode in (2, 4)
    s1 = state(c)
    time.sleep(1.5)
    close(proc, c)
    results['clean_exit_1'] = not app_pids()
    proc, c = start()
    s2 = state(c)
    note('after restart', **s2)
    results['state_kept'] = all(s2[k] == s1[k] for k in ('coins', 'exp', 'items', 'terrain', 'roads', 'paid'))
    # The same house must not pay again after the restart.
    if ready:
        click_sid(ready[0])
        s3 = state(c)
        results['no_double_payment'] = s3['coins'] == s2['coins']
        note('second click after restart', coins=s3['coins'])
    store = c.eval('JSON.stringify(Object.keys(localStorage))')
    note('local storage keys', keys=store)
    close(proc, c)
    results['clean_exit_2'] = not app_pids()
    results['profile_files'] = sorted(os.listdir(profile))
    results['local_storage_in_profile'] = os.path.isdir(os.path.join(profile, 'Local Storage'))
finally:
    for pid in app_pids():
        subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], capture_output=True)
    json.dump({'results': results, 'log': log}, open(os.path.join(OUT, 'exe_check.json'), 'w'), indent=1)
    shutil.rmtree(profile, ignore_errors=True)
print(json.dumps(results, indent=1))
