"""Phase 8 feature check inside the packaged EXE (temporary --mcity-user-data profile, never the player's data):
version, zoom levels, shop catalogue, NPC visit and return, contractors, rent, local profiles and full screen.

Usage: python -I tools/exe_features.py <exe> <out.json>"""
import base64
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
PORT = 9353
prof = tempfile.mkdtemp(prefix='mcity_exe_features_')
R = {}


def start():
    p = subprocess.Popen([EXE, '--mcity-user-data=' + prof, '--remote-debugging-port=%d' % PORT])
    c = CDP(page_ws(PORT, timeout=60), timeout=60)
    c.send('Runtime.enable')
    wait(c)
    return p, c


def wait(c):
    end = time.time() + 60
    while time.time() < end:
        try:
            # A hidden window gets no animation frames, so Phaser would never create the scene.
            keep_visible(c)
            if c.eval('!!(window.mcity && window.mcity.state && window.mcity.scene)'):
                break
        except Exception:  # noqa: BLE001 - page navigating
            pass
        time.sleep(0.5)
    time.sleep(2)


def ev(c, js):
    r = c.send('Runtime.evaluate', {'expression': js, 'awaitPromise': True, 'returnByValue': True, 'userGesture': True})
    if 'exceptionDetails' in r:
        raise RuntimeError(json.dumps(r['exceptionDetails'])[:300])
    return r['result'].get('value')


def keep_visible(c):
    # A minimized (hidden) window renders no frames; restore the app's windows (Electron has no Browser.getWindowForTarget).
    if ev(c, 'document.visibilityState') == 'hidden':
        subprocess.run(['powershell', '-NoProfile', '-Command',
                        "Add-Type -Name W -Namespace U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(System.IntPtr h, int c);"
                        " [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(System.IntPtr h);';"
                        " Get-Process -Name 'Millionaire City HTML5' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } |"
                        " ForEach-Object { [U.W]::ShowWindow($_.MainWindowHandle, 9) | Out-Null; [U.W]::SetForegroundWindow($_.MainWindowHandle) | Out-Null }"],
                       capture_output=True)
        time.sleep(1.5)
        R.setdefault('window_restored', 0)
        R['window_restored'] += 1


def click_el(c, sel):
    keep_visible(c)
    q = ev(c, "(()=>{const e=document.querySelector(%s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()" % json.dumps(sel))
    if q:
        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
            c.send('Input.dispatchMouseEvent', {'type': t, 'x': q['x'], 'y': q['y'], 'button': 'left', 'clickCount': 1})
    return bool(q)


def close(p):
    p.terminate()
    try:
        p.wait(15)
    except subprocess.TimeoutExpired:
        p.kill()
    time.sleep(2)
    subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], capture_output=True)


p, c = start()
try:
    R['url'] = ev(c, 'location.href')
    for _ in range(6):
        click_el(c, '.options-panel [data-layer=zoomout]')
    time.sleep(1.5)
    R['zoom_min'] = ev(c, 'mcity.scene.zoom.target')
    ev(c, 'mcity.selectTool("build"),0')
    time.sleep(0.6)
    R['shop_houses'] = ev(c, '({items: mcity.scene.shop.list.length, expired: mcity.scene.shop.list.filter(e=>e.lockReason==="expired").length})')
    ev(c, 'mcity.selectTool("select"),0')
    # Rent: sign a contract, let 10 minutes pass, collect twice.
    sid = ev(c, '(mcity.state().modes.find(m=>m[1].startsWith("houses") && (m[2]===1 || m[2]===7))||[])[0]||null')
    ok = ev(c, '(()=>{const s=mcity.scene; const v=s.views.find(v=>v.item.sid===%d); s.openContracts(v); const sku=s.state.contractsFor(%d)[0]; s.signContract(sku); return s.state.item(%d).state.mode})()' % (sid, sid, sid))
    time.sleep(3.5)
    ev(c, 'mcity.fastForward(10*60*1000),0')
    time.sleep(2.5)
    # Contractors: Rent Collector through its original popup (free trial), applied to the area around the ready house.
    R['rent_ready_mode'] = ev(c, 'mcity.scene.state.item(%d).state.mode' % sid)
    ev(c, '(()=>{const s=mcity.scene; s.startServiceTool("moneyCollector"); const v=s.views.find(v=>v.item.sid===%d); const cam=s.cameras.main; const wv=cam.worldView;'
          ' const x=(v.item.tileX*32+16-wv.x)*cam.zoom, y=(v.item.tileY*32+16-wv.y)*cam.zoom; window.__c0=s.state.data.profile.coins; s.serviceClick({x,y}); return 0})()' % sid)
    time.sleep(0.8)
    boxes = ev(c, 'document.querySelectorAll("#popup-host .service-box").length')
    click_el(c, '#popup-host .service-box:last-of-type [data-layer=ContractButton]')
    time.sleep(1)
    R['contractors'] = ev(c, '({boxes:%d, paid: mcity.scene.state.data.profile.coins - window.__c0, gold: mcity.scene.state.data.profile.cash,'
                             ' trialMinutesLeft: Math.round((mcity.state().services.data.moneyCollector.until-Date.now())/60000),'
                             ' multibar: !!document.querySelector(".multifunction-bar")})' % boxes)
    second = ev(c, '(()=>{const s=mcity.scene; const v=s.views.find(v=>v.item.sid===%d); const a=s.state.data.profile.coins; s.collect(v); return s.state.data.profile.coins-a})()' % sid)
    R['rent'] = {'sid': sid, 'mode_after_sign': ok, 'paid_by_collector': R['contractors']['paid'], 'paid_second_click': second}
    ev(c, 'mcity.selectTool("select"),0')
    # Phase 9: page elements, map surround, cancel contract, Move, storage.
    R['page'] = ev(c, '({loadingHidden: document.getElementById("loading-screen").hidden, profileButton: document.querySelector(".profile-toggle")?.textContent,'
                      ' surround: ["left","right","top","bottom"].every(k=>mcity.scene.textures.exists("surround:"+k))})')
    w = ev(c, '(mcity.state().modes.find(m=>m[1].startsWith("houses") && (m[2]===1 || m[2]===7))||[])[0]||null')
    ev(c, '(()=>{const s=mcity.scene; const v=s.views.find(v=>v.item.sid===%d); s.openContracts(v); s.signContract(s.state.contractsFor(%d)[0]); return 0})()' % (w, w))
    time.sleep(3.5)
    keep_visible(c)
    ev(c, '(()=>{const s=mcity.scene; s.state.advance(Date.now()); s.select(s.views.find(v=>v.item.sid===%d)); return 0})()' % w)
    time.sleep(0.5)
    click_el(c, '#popup-host [data-layer=OkButton]')
    time.sleep(3.6)
    ev(c, 'mcity.scene.state.advance(Date.now()),0')
    R['cancel_contract'] = {'sid': w, 'mode_after': ev(c, 'mcity.scene.state.item(%d).state.mode' % w)}
    target = ev(c, '''(()=>{const s=mcity.scene, b=s.builder, v=s.views.find(v=>v.item.sid===%d), d=v.item.def; s.state.data.profile.coins += 1000000;
      for (let r=2; r<=16; r++) for (let dx=-r; dx<=r; dx++) for (let dy=-r; dy<=r; dy++) { if (Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
        const x=v.item.tileX+dx, y=v.item.tileY+dy; let ok=true;
        for (let i=0;i<d.baseCols&&ok;i++) for (let j=0;j<d.baseRows&&ok;j++) if (b.canBuyTerrain(x+i,y+j)!==null && b.canMove(%d,x,y)!==null) ok=false;
        if (!ok) continue; for (let i=0;i<d.baseCols;i++) for (let j=0;j<d.baseRows;j++) if (b.canBuyTerrain(x+i,y+j)===null) b.buyTerrain(x+i,y+j);
        if (b.canMove(%d,x,y)===null) { s.refreshGround(); return [x,y]; } } return null})()''' % (w, w, w))
    price = ev(c, 'mcity.scene.builder.movePrice(%d).coins' % w)
    k0 = ev(c, 'mcity.scene.state.data.profile.coins')
    ev(c, 'mcity.scene.startServiceTool("move"),0')
    ev(c, '(()=>{const s=mcity.scene; return s.pickMoveItem(s.views.find(v=>v.item.sid===%d))})()' % w)
    ev(c, 'mcity.scene.placeMovedItem(%d,%d,%d),0' % (w, target[0], target[1]))
    time.sleep(0.5)
    click_el(c, '#popup-host [data-layer=OkButton]')
    time.sleep(0.6)
    R['move'] = {'sid': w, 'target': target, 'price': price, 'paid': k0 - ev(c, 'mcity.scene.state.data.profile.coins'),
                 'tile': ev(c, '(v=>[v.item.tileX,v.item.tileY])(mcity.scene.views.find(v=>v.item.sid===%d))' % w)}
    ev(c, 'mcity.selectTool("storage"),0')
    time.sleep(0.6)
    R['storage'] = ev(c, '({open: !document.getElementById("storage-panel").hidden, text: document.querySelector("#storage-panel").innerText.replace(/\\s+/g," ").slice(0,80)})')
    ev(c, 'mcity.selectTool("select"),0')
    ev(c, 'mcity.scene.persist(),0')
    # Local profiles and the visit, each reloads the page.
    before = ev(c, 'JSON.stringify({items:mcity.state().items, coins:mcity.state().profile.coins})')
    ev(c, '(()=>{const s=mcity.scene; const n=s.neighbors().find(n=>n.name==="Ronald"); s.selectNeighbor(n); return 0})()')
    time.sleep(3)
    wait(c)
    v = ev(c, '({visit: mcity.state().visit, items: mcity.state().items, upgradable: mcity.state().upgradable.length, banner: document.querySelector("#visit-banner").textContent})')
    up = ev(c, '(()=>{const s=mcity.scene; const sid=mcity.state().upgradable[0]; const v=s.views.find(v=>v.item.sid===sid); const a=s.state.data.profile.coins; s.visitClick(v); const b=s.state.data.profile.coins; s.visitClick(v); return [b-a, s.state.data.profile.coins-b]})()')
    v['upgrade_paid'], v['upgrade_second'] = up
    ev(c, 'mcity.scene.goHome(),0')
    time.sleep(3)
    wait(c)
    v['home'] = ev(c, 'JSON.stringify({items:mcity.state().items, coins:mcity.state().profile.coins})')
    v['home_before'] = before
    R['visit'] = v
    ev(c, '(()=>{mcity.scene.switchProfile(null, "EXE Test"); return 0})()')
    time.sleep(3)
    wait(c)
    R['profile'] = ev(c, '({list: localStorage.getItem("mcity.profiles.v1"), keys: Object.keys(localStorage).filter(k=>k.includes(".p_"))})')
    ev(c, '(()=>{mcity.scene.switchProfile(""); return 0})()')
    time.sleep(3)
    wait(c)
    R['profile_back'] = ev(c, 'JSON.parse(localStorage.getItem("mcity.profiles.v1")).active')
    click_el(c, '.options-panel [data-layer=fullscreen]')
    time.sleep(1.5)
    R['fullscreen_on'] = ev(c, '!!document.fullscreenElement')
    open(os.path.splitext(OUT)[0] + '_fullscreen.png', 'wb').write(base64.b64decode(c.send('Page.captureScreenshot', {'format': 'png'})['data']))
    click_el(c, '.options-panel [data-layer=fullscreen]')
    time.sleep(1.5)
    R['fullscreen_off'] = not ev(c, '!!document.fullscreenElement')
    R['console_errors'] = len([e for e in c.events if e.get('method') == 'Runtime.exceptionThrown'
                               or (e.get('method') == 'Runtime.consoleAPICalled' and e['params'].get('type') == 'error')])
finally:
    close(p)
    shutil.rmtree(prof, ignore_errors=True)
    out = subprocess.run(['powershell', '-NoProfile', '-Command', "(Get-Process -Name 'Millionaire City HTML5' -ErrorAction SilentlyContinue | Measure-Object).Count"],
                         capture_output=True, text=True).stdout.strip()
    R['leftover_processes'] = int(out or 0)
    json.dump(R, open(OUT, 'w'), indent=1)
    print(json.dumps(R, indent=1))
