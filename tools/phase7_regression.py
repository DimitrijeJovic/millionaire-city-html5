"""Phase 7 regression in the Chrome started by phase7_browser.py (temporary profile, test city only).

Plot purchase, contract signing, rent collection, shop income, double-pay checks, two plane flights in a row, both
NPC cities, save/load across a reload and a full close of every window. Results go to <out_dir>/regression.json.

Usage: python -I tools/phase7_regression.py <out_dir>"""
import base64
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402

PORT = 9351
HOST = 'http://127.0.0.1:8417/'
OUT = os.path.abspath(sys.argv[1])
R = {}
c = CDP(page_ws(PORT), timeout=120)
c.send('Runtime.enable')


def ev(js):
    r = c.send('Runtime.evaluate', {'expression': js, 'awaitPromise': True, 'returnByValue': True})
    if 'exceptionDetails' in r:
        raise RuntimeError(json.dumps(r['exceptionDetails'])[:500])
    return r['result'].get('value')


def shot(name):
    open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(c.send('Page.captureScreenshot', {'format': 'png'})['data']))


def keep_visible():
    # A minimized window renders no frames, so Phaser neither updates nor handles input; restore it first.
    wid = c.send('Browser.getWindowForTarget')['windowId']
    if c.send('Browser.getWindowBounds', {'windowId': wid})['bounds']['windowState'] == 'minimized':
        c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
        c.send('Page.bringToFront')
        R.setdefault('window_restored', 0)
        R['window_restored'] += 1
        time.sleep(1.5)


def mouse(x, y, kinds=('mouseMoved', 'mousePressed', 'mouseReleased')):
    keep_visible()
    for t in kinds:
        c.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})


def click_el(sel):
    keep_visible()
    p = ev("(()=>{const e=document.querySelector(%s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()" % json.dumps(sel))
    if p:
        mouse(p['x'], p['y'])
    return bool(p)


def click_sid(sid):
    keep_visible()
    ev('(()=>{const v=mcity.scene.views.find(v=>v.item.sid===%d); mcity.scene.cameras.main.centerOn(v.sprite.x, v.sprite.y-40); return 0})()' % sid)
    time.sleep(0.4)
    p = ev('mcity.screenOf(%d)' % sid)
    mouse(p['x'], p['y'])


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
    time.sleep(2)


def coins():
    return ev('mcity.state().profile.coins')


def modes():
    return ev('mcity.state().modes')


def note(key, value):
    R[key] = value
    print(key, json.dumps(value)[:400], flush=True)


def run():
    open_city('?city=test&view=1090,690')
    mouse(900, 500, ('mouseMoved',))
    # Plot purchase with the terrain tool.
    ev('mcity.selectTool("terrain"), 0')
    free = ev('(()=>{for(let r=2;r<14;r++)for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++) if(mcity.why(x,y).terrain===null) return [x,y]; return null})()')
    t0, c0 = ev('mcity.state().terrain'), coins()
    price = ev('mcity.scene.builder.terrainPrice()')
    if free:
        ev('(()=>{const s=mcity.scene; const p=mcity.tileScreen(%d,%d); s.cameras.main.scrollX += (p.x-900); s.cameras.main.scrollY += (p.y-500); return 0})()' % tuple(free))
        time.sleep(0.4)
        p = ev('mcity.tileScreen(%d,%d)' % tuple(free))
        mouse(p['x'], p['y'])
        time.sleep(0.4)
    note('plot_purchase', {'tile': free, 'terrain_before': t0, 'terrain_after': ev('mcity.state().terrain'), 'coins_spent': c0 - coins(), 'price': price})
    ev('mcity.selectTool("select"), 0')
    # Contract on a house waiting for one (or abandoned).
    waiting = ev('(mcity.state().modes.find(m=>m[1].startsWith("houses") && (m[2]===1 || m[2]===7))||[])[0]||null')
    signed = None
    if waiting:
        click_sid(waiting)
        time.sleep(0.8)
        c1 = coins()
        click_el('#contract-panel .contract-item.swf-button')
        time.sleep(0.6)
        signed = {'sid': waiting, 'mode_after': [m for m in modes() if m[0] == waiting][0][2], 'coins_spent': c1 - coins()}
    note('contract_sign', signed)
    # Rent: ten minutes later the short contract has rent ready (later it would be abandoned); collect once, then again.
    keep_visible()
    time.sleep(3.5)
    ev('mcity.fastForward(10*60*1000), 0')
    time.sleep(2.5)
    ready = [m[0] for m in modes() if m[2] == 5 and m[1].startswith('houses')]
    rent = None
    if ready:
        c1 = coins()
        click_sid(ready[0])
        time.sleep(0.6)
        c2 = coins()
        click_sid(ready[0])
        time.sleep(0.6)
        rent = {'sid': ready[0], 'paid': c2 - c1, 'paid_second_click': coins() - c2}
    note('rent_collect', rent)
    # Shop income: sign contracts near the pizzeria so it has customers, then let a shop period pass.
    shop = ev('(mcity.state().modes.find(m=>m[1].startsWith("commerce"))||[])[0]||null')
    for _ in range(4):
        w = ev('(mcity.state().modes.find(m=>m[1].startsWith("houses") && (m[2]===1 || m[2]===7))||[])[0]||null')
        if not w:
            break
        click_sid(w)
        time.sleep(0.7)
        click_el('#contract-panel .contract-item.swf-button')
        time.sleep(0.5)
        click_el('#contract-panel [data-layer=mClose]')
    keep_visible()
    time.sleep(3.5)
    ev('mcity.fastForward(10*60*1000), 0')
    time.sleep(2.5)
    income = None
    if shop:
        m = [x for x in modes() if x[0] == shop][0]
        c1 = coins()
        click_sid(shop)
        time.sleep(0.6)
        c2 = coins()
        click_sid(shop)
        time.sleep(0.6)
        income = {'sid': shop, 'mode_before': m[2], 'customers': ev('mcity.scene.state.customerSids(%d).length' % shop), 'paid': c2 - c1,
                  'paid_second_click': coins() - c2}
    note('shop_income', income)
    # Two plane flights in a row through the city name popup.
    flights = []
    for name in ('Phase Seven A', 'Phase Seven B'):
        ev('mcity.scene.openNamePopup(), 0')
        time.sleep(0.4)
        ev("(()=>{const i=document.querySelector('#popup-host input'); i.value=%s; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); return 0})()" % json.dumps(name))
        t0 = time.time()
        seen = False
        while time.time() - t0 < 45:
            st = ev('mcity.state().plane')
            if st is None:
                break
            seen = True
            keep_visible()
            time.sleep(0.5)
        flights.append({'name': name, 'flew': seen, 'seconds': round(time.time() - t0, 1), 'flag_texture_after': ev('mcity.scene.textures.exists("plane_flag")'),
                        'city': ev('mcity.state().profile.cityName')})
    note('plane_flights', flights)
    # Save/load: the state before a reload equals the state after it.
    key = '{profile: mcity.state().profile, items: mcity.state().items, storage: mcity.state().storage, missions: mcity.state().missions, roads: mcity.state().roads, terrain: mcity.state().terrain}'
    before = json.loads(ev('JSON.stringify(%s)' % key))
    open_city('?city=test&view=1090,690')
    after = json.loads(ev('JSON.stringify(%s)' % key))
    note('save_load', {'equal_after_reload': before == after, 'diff': [k for k in before if before[k] != after[k]],
                       'save_valid': ev('(()=>{try{const d=JSON.parse(localStorage.getItem("mcity.save.v1.test")); return d.version===3 && Array.isArray(d.paidCycles)}catch(e){return false}})()')})
    # Every window opens and closes.
    closes = {}
    ev('mcity.selectTool("build"), 0')
    time.sleep(0.6)
    closes['shop'] = click_el('#shop-panel [data-layer=mClose]') and ev('document.getElementById("shop-panel").hidden')
    ev('mcity.selectTool("storage"), 0')
    time.sleep(0.6)
    closes['storage'] = click_el('#storage-panel [data-layer=mClose]') and ev('document.getElementById("storage-panel").hidden')
    hq = ev('mcity.scene.views.find(v=>v.item.def.kind==="headquarters").item.sid')
    click_sid(hq)
    time.sleep(0.6)
    closes['company_value'] = click_el('#popup-host [data-layer=OkButton]') and ev('document.getElementById("popup-host").hidden')
    click_el('.toolbar [data-layer=SpecialButton]')
    time.sleep(0.4)
    opened = ev('!!document.querySelector(".multifunction-bar") && !document.querySelector(".multifunction-bar").hidden')
    if opened:
        # Phase 8: the Contractors button opens the multifunction bar; a second click closes it.
        click_el('.toolbar [data-layer=SpecialButton]')
        closes['contractors_bar'] = ev('document.querySelector(".multifunction-bar").hidden')
    else:
        closes['contractors_notice'] = click_el('#popup-host [data-layer=button_close]') and ev('document.getElementById("popup-host").hidden')
    click_el('.profile-toggle')
    closes['profile_open'] = ev('!document.querySelector(".profile-panel").hidden')
    click_el('.profile-toggle')
    closes['profile_closed'] = ev('document.querySelector(".profile-panel").hidden')
    note('close_windows', closes)
    shot('24_regression_test_city')
    # NPC cities (original offline data): load, count items, no visit mode.
    npc = {}
    for city in ('npc_advisor', 'npc_boss'):
        open_city('?city=%s' % city)
        npc[city] = {'items': ev('mcity.state().items'), 'city': ev('mcity.state().profile.cityName'), 'neighbors': ev('document.querySelectorAll(".friend-box").length')}
        shot('25_npc_%s' % city)
    note('npc_cities', npc)
    open_city('?city=test&view=1090,690')


if __name__ == '__main__':
    try:
        run()
    finally:
        json.dump(R, open(os.path.join(OUT, 'regression.json'), 'w'), indent=1)
