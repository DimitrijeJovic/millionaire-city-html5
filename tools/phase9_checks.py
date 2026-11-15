"""Phase 9 checks in the Chrome started by phase7_browser.py (temporary profile, test city data only): contractor
popups, cancel contract, Move, storage, expansion popup, company value, owner HUD on visits and repeated city
switches. Screenshots and <out_dir>/phase9_checks.json.

Usage: python -I tools/phase9_checks.py <out_dir>"""
import base64
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402

HOST = 'http://127.0.0.1:8417/'
OUT = os.path.abspath(sys.argv[1])
os.makedirs(OUT, exist_ok=True)
c = CDP(page_ws(9351), timeout=120)
c.send('Runtime.enable')
R = {}


def ev(js):
    r = c.send('Runtime.evaluate', {'expression': js, 'awaitPromise': True, 'returnByValue': True})
    if 'exceptionDetails' in r:
        raise RuntimeError(json.dumps(r['exceptionDetails'])[:400])
    return r['result'].get('value')


def visible():
    wid = c.send('Browser.getWindowForTarget')['windowId']
    if c.send('Browser.getWindowBounds', {'windowId': wid})['bounds']['windowState'] == 'minimized':
        c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
        c.send('Page.bringToFront')
        time.sleep(1.2)


def shot(name):
    visible()
    open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(c.send('Page.captureScreenshot', {'format': 'png'})['data']))


def wait_scene(timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if ev('!!(window.mcity && window.mcity.state && document.getElementById("loading-screen").hidden)'):
                time.sleep(1.5)
                return True
        except RuntimeError:
            pass
        time.sleep(0.25)
    return False


def nav(query):
    visible()
    c.send('Page.navigate', {'url': HOST + query})
    time.sleep(0.5)
    return wait_scene()


def click_el(sel):
    q = ev("(()=>{const e=document.querySelector(%s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()" % json.dumps(sel))
    if q:
        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
            c.send('Input.dispatchMouseEvent', {'type': t, 'x': q['x'], 'y': q['y'], 'button': 'left', 'clickCount': 1})
    return bool(q)


def own_save():
    # The own city without the timers, which every save recomputes from the clock (savedAt / timeMs).
    return ev('''JSON.stringify((d=>({items: d.items.map(i=>[i.sid,i.sku,i.x,i.y,i.state&&i.state.mode,i.state&&i.state.contractSku,i.state&&i.state.cycle,!!i.construction]),
      roads: d.roads, terrain: d.terrain, areas: d.areas, storage: d.storage, coins: d.profile.coins, cash: d.profile.cash, exp: d.profile.exp}))
      ((k=>JSON.parse(localStorage.getItem(k)))(Object.keys(localStorage).find(k=>k.startsWith("mcity.save.v1") && !k.endsWith(".prev")))))''')


def coins():
    return ev('mcity.scene.state.data.profile.coins')


FIND = """(()=>{const s=mcity.scene, b=s.builder, v=s.views.find(v=>v.item.sid===%d), d=v.item.def, dir=%d;
  const mine=(tx,ty)=>tx>=v.item.tileX && tx<v.item.tileX+d.baseCols && ty>=v.item.tileY && ty<v.item.tileY+d.baseRows;
  for (let r=2; r<=16; r++) for (let dx=-r; dx<=r; dx++) for (let dy=-r; dy<=r; dy++) {
    if (Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
    const x=v.item.tileX+dx*dir, y=v.item.tileY+dy*dir; let ok=true;
    for (let i=0;i<d.baseCols&&ok;i++) for (let j=0;j<d.baseRows&&ok;j++) { const tx=x+i, ty=y+j;
      if (mine(tx,ty)) continue; if (b.canBuyTerrain(tx,ty)!==null && b.canMove(%d,x,y)!==null) ok=false; }
    if (!ok) continue;
    for (let i=0;i<d.baseCols;i++) for (let j=0;j<d.baseRows;j++) if (b.canBuyTerrain(x+i,y+j)===null) b.buyTerrain(x+i,y+j);
    if (b.canMove(%d,x,y)===null) { s.refreshGround(); return [x,y]; } }
  return null})()"""


def find_target(sid, direction=1):
    return ev(FIND % (sid, direction, sid, sid))


# A fresh copy of the test city in this temporary profile.
nav('?city=test')
ev('localStorage.clear(),0')
nav('?city=test&view=1090,690')
R['start'] = {'coins': coins(), 'companyValue': ev('mcity.state().profile.companyValue')}

# 1. Contractor popups (1920 x 1080 window): Rent Collector and Contract Renewal with the rotated Special Offer badge.
ev('mcity.scene.startServiceTool("moneyCollector"),0')
ev('(()=>{const s=mcity.scene; const cam=s.cameras.main; s.serviceClick({x:cam.width/2,y:cam.height/2}); return 0})()')
time.sleep(0.8)
shot('contractors_rent_collector_1920')
R['contractor_popup'] = ev('(()=>{const r=document.querySelector("#popup-host .swf-panel").getBoundingClientRect(); const b=[...document.querySelectorAll("#popup-host .swf-text")].find(e=>e.textContent==="Special Offer");'
                          ' return {w:Math.round(r.width), h:Math.round(r.height), scale:document.querySelector("#popup-host .swf-panel").style.transform, top:Math.round(r.top), bottom:Math.round(r.bottom),'
                          ' badge: b ? {transform:b.style.transform, rect:(x=>[x.x,x.y,x.width,x.height].map(Math.round))(b.getBoundingClientRect())} : null}})()')
ev('(()=>{const h=document.getElementById("popup-host"); h.hidden=true; h.replaceChildren(); mcity.scene.stopServiceTool(); return 0})()')
ev('mcity.scene.startServiceTool("contractSignator"),0')
ev('(()=>{const s=mcity.scene; const cam=s.cameras.main; s.serviceClick({x:cam.width/2,y:cam.height/2}); return 0})()')
time.sleep(0.8)
shot('contractors_select_contractor_1920')
ev('(()=>{const h=document.getElementById("popup-host"); h.hidden=true; h.replaceChildren(); mcity.scene.setTool("select"); return 0})()')

# 2. Cancel contract: sign a contract on a house, let it rent, click it, accept TID_CANCEL_CONTRACT.
sid = ev('(mcity.state().modes.find(m=>m[1].startsWith("houses") && (m[2]===1 || m[2]===7))||[])[0]||null')
ev('(()=>{const s=mcity.scene; const v=s.views.find(v=>v.item.sid===%d); s.openContracts(v); s.signContract(s.state.contractsFor(%d)[0]); return 0})()' % (sid, sid))
time.sleep(3.6)
mode_renting = ev('(()=>{mcity.scene.state.advance(Date.now()); return mcity.scene.state.item(%d).state.mode})()' % sid)
c0 = coins()
ev('(()=>{const s=mcity.scene; s.select(s.views.find(v=>v.item.sid===%d)); return 0})()' % sid)
time.sleep(0.5)
shot('cancel_contract_confirm')
msg = ev('document.querySelector("#popup-host").innerText')
click_el('#popup-host [data-layer=OkButton]')
time.sleep(0.4)
mode_cancel = ev('mcity.scene.state.item(%d).state.mode' % sid)
time.sleep(3.5)
ev('(()=>{mcity.scene.state.advance(Date.now()); return 0})()')
mode_after = ev('mcity.scene.state.item(%d).state.mode' % sid)
ev('mcity.scene.persist(),0')
nav('?city=test&view=1090,690')
R['cancel_contract'] = {'sid': sid, 'renting_mode': mode_renting, 'popup_text': msg, 'mode_while_cancelling': mode_cancel, 'mode_after_3s': mode_after,
                        'coins_change': coins() - c0, 'mode_after_reload': ev('mcity.scene.state.item(%d).state.mode' % sid)}

# 3. Move: pay, cancel by closing, rent the crane operator (10 gold), then a free move; positions survive a reload.
ev('(()=>{mcity.scene.state.data.profile.cash = 50; mcity.scene.persist(); return 0})()')
ev('(()=>{mcity.scene.state.data.profile.coins += 5000000; return 0})()')
free = find_target(sid)
pos0 = ev('[mcity.scene.state.item(%d).x, mcity.scene.state.item(%d).y]' % (sid, sid))
price = ev('mcity.scene.builder.movePrice(%d)' % sid)
ev('mcity.scene.startServiceTool("move"),0')
ev('(()=>{const s=mcity.scene; return s.pickMoveItem(s.views.find(v=>v.item.sid===%d))})()' % sid)
time.sleep(0.4)
hidden_while_carried = ev('!mcity.scene.views.find(v=>v.item.sid===%d).sprite.visible' % sid)
ev('mcity.scene.placeMovedItem(%d,%d,%d),0' % (sid, free[0], free[1]))
time.sleep(0.5)
shot('move_pay_popup')
pay_popup = ev('document.querySelector("#popup-host").innerText')
click_el('#popup-host [data-layer=mClose]')
time.sleep(0.4)
after_close = {'pos': ev('[mcity.scene.state.item(%d).x, mcity.scene.state.item(%d).y]' % (sid, sid)), 'visible': ev('mcity.scene.views.find(v=>v.item.sid===%d).sprite.visible' % sid),
               'coins': coins()}
c1 = coins()
ev('(()=>{const s=mcity.scene; return s.pickMoveItem(s.views.find(v=>v.item.sid===%d))})()' % sid)
time.sleep(0.3)
ev('mcity.scene.placeMovedItem(%d,%d,%d),0' % (sid, free[0], free[1]))
time.sleep(0.4)
click_el('#popup-host [data-layer=OkButton]')
time.sleep(0.6)
paid = {'coins_change': coins() - c1, 'pos': ev('[mcity.scene.state.item(%d).x, mcity.scene.state.item(%d).y]' % (sid, sid)),
        'items_with_sid': ev('mcity.scene.state.data.items.filter(i=>i.sid===%d).length' % sid), 'views_with_sid': ev('mcity.scene.views.filter(v=>v.item.sid===%d).length' % sid)}
g0, c2 = ev('mcity.scene.state.data.profile.cash'), coins()
ev('(()=>{const s=mcity.scene; return s.pickMoveItem(s.views.find(v=>v.item.sid===%d))})()' % sid)
time.sleep(0.3)
target = find_target(sid)
ev('mcity.scene.placeMovedItem(%d,%d,%d),0' % (sid, target[0], target[1]))
time.sleep(0.4)
click_el('#popup-host [data-layer=RentButton]')
time.sleep(0.6)
rented = {'gold_change': ev('mcity.scene.state.data.profile.cash') - g0, 'coins_change': coins() - c2,
          'move_service_hours': round(ev('(mcity.state().services.data.move.until-Date.now())/3600000'), 2),
          'pos': ev('[mcity.scene.state.item(%d).x, mcity.scene.state.item(%d).y]' % (sid, sid))}
ev('(()=>{const s=mcity.scene; return s.pickMoveItem(s.views.find(v=>v.item.sid===%d))})()' % sid)
time.sleep(0.3)
target2 = find_target(sid, -1)
ev('mcity.scene.placeMovedItem(%d,%d,%d),0' % (sid, target2[0], target2[1]))
time.sleep(0.5)
shot('move_free_confirm_popup')
free_popup = ev('document.querySelector("#popup-host").innerText')
c3, g3 = coins(), ev('mcity.scene.state.data.profile.cash')
click_el('#popup-host [data-layer=OkButton]')
time.sleep(0.6)
free_move = {'coins_change': coins() - c3, 'gold_change': ev('mcity.scene.state.data.profile.cash') - g3, 'pos': ev('[mcity.scene.state.item(%d).x, mcity.scene.state.item(%d).y]' % (sid, sid))}
ev('mcity.scene.setTool("select"),0')
shot('move_after')
nav('?city=test&view=1090,690')
R['move'] = {'sid': sid, 'price': price, 'start': pos0, 'hidden_while_carried': hidden_while_carried, 'pay_popup': pay_popup, 'after_close_popup': after_close,
             'paid_move': paid, 'rent_then_move': rented, 'free_popup': free_popup, 'free_move': free_move,
             'pos_after_reload': ev('[mcity.scene.state.item(%d).x, mcity.scene.state.item(%d).y]' % (sid, sid)),
             'mode_after_reload': ev('mcity.scene.state.item(%d).state.mode' % sid)}

# 4. Storage (Vault button): empty, then with stored items; Use starts placing the item.
ev('mcity.selectTool("storage"),0')
time.sleep(0.6)
shot('storage_empty')
R['storage_empty'] = ev('document.querySelector("#storage-panel").innerText.replace(/\\s+/g," ")')
ev('mcity.selectTool("select"),0')
ev('(()=>{const d=mcity.scene.state.data; d.storage.push("decorations_tree_01","decorations_tree_01","houses_001_001","commerce_pizza","decorations_font_02","houses_002_001"); mcity.scene.persist(); return 0})()')
ev('mcity.selectTool("storage"),0')
time.sleep(0.8)
shot('storage_items')
R['storage_items'] = ev('({boxes: document.querySelectorAll("#storage-panel .storage-box").length, text: document.querySelector("#storage-panel").innerText.replace(/\\s+/g," ")})')
click_el('#storage-panel [data-layer=arrow_right]')
time.sleep(0.3)
R['storage_after_arrow'] = ev('[...document.querySelectorAll("#storage-panel .storage-box")].map(b=>b.innerText.replace(/\\s+/g," "))')
click_el('#storage-panel .storage-box [data-layer=button_use]')
time.sleep(0.6)
R['storage_use'] = ev('({placing: mcity.state().placing, storageOpen: !document.getElementById("storage-panel").hidden})')
ev('mcity.selectTool("select"),0')

# 5. Expansion popup with the investment column.
ev('(()=>{const s=mcity.scene; const i=s.builder.expansionRules.find(r=>s.builder.plots()[r.index]===1)?.index ?? s.builder.expansionRules[0].index; s.openExpansion(i); return 0})()')
time.sleep(0.6)
shot('expansion_popup')
R['expansion_popup'] = ev('document.querySelector("#popup-host").innerText.replace(/\\s+/g," ")')
click_el('#popup-host .swf-panel .swf-panel [data-layer=ButtonText]')
ev('(()=>{const h=document.getElementById("popup-host"); h.hidden=true; h.replaceChildren(); return 0})()')

# 6. Company value follows every change of money, items and contracts (recomputed like Company.getCompanyValue).
hud_cv = lambda: ev('document.querySelector("#hud").innerText.match(/\\$[\\d,]+/)[0]')
cv0, hud0, k0 = ev('mcity.state().profile.companyValue'), hud_cv(), coins()
w = ev('(()=>{const s=mcity.scene; const v=s.views.find(v=>v.item.def.kind==="house" && s.state.item(v.item.sid).state && s.state.item(v.item.sid).state.mode===1); if(!v) return null;'
       ' s.openContracts(v); s.signContract(s.state.contractsFor(v.item.sid)[0]); return v.item.sid})()')
time.sleep(0.5)
cv1, hud1, k1 = ev('mcity.state().profile.companyValue'), hud_cv(), coins()
R['company_value'] = {'before': cv0, 'hud_before': hud0, 'after_contract': cv1, 'hud_after': hud1, 'coins_change': k1 - k0, 'value_change': cv1 - cv0,
                      'parts_total': ev('mcity.scene.companyValue().total')}
shot('company_value_after_contract')
ev('mcity.fastForward(30*60*1000),0')
time.sleep(1.5)
rs = ev('(mcity.state().modes.find(m=>m[1].startsWith("houses") && m[2]===5)||[])[0]||null')
if rs:
    cv2, k2 = ev('mcity.state().profile.companyValue'), coins()
    ev('(()=>{const s=mcity.scene; s.collect(s.views.find(v=>v.item.sid===%d)); return 0})()' % rs)
    time.sleep(0.5)
    R['company_value']['rent'] = {'sid': rs, 'coins_change': coins() - k2, 'value_change': ev('mcity.state().profile.companyValue') - cv2,
                                  'hud_after': hud_cv(), 'parts_total': ev('mcity.scene.companyValue().total')}
    shot('company_value_after_rent')

# 7. City switches: Own -> Ronald -> Own, Own -> Sheik -> Own, Own -> Ronald -> Sheik -> Own, five times in a row.
ev('mcity.scene.persist(),0')
base = own_save()
switches = []


def go(target):
    t0 = time.time()
    if target == 'home':
        ev('mcity.scene.goHome(),0')
    else:
        ev('(()=>{const s=mcity.scene; s.selectNeighbor(s.neighbors().find(n=>n.name===%s)); return 0})()' % json.dumps(target))
    time.sleep(0.15)
    loading = ev('!document.getElementById("loading-screen").hidden')
    ok = wait_scene()
    row = {'to': target, 'loading_screen_shown': loading, 'loaded': ok, 'seconds': round(time.time() - t0, 2),
           'visit': ev('mcity.state().visit'), 'hud': ev('document.querySelector("#hud").innerText.replace(/\\s+/g," ").slice(0,60)'),
           'owner_value_shown': ev('document.querySelector("#hud").innerText.match(/\\$[\\d,]+/)?.[0] ?? null')}
    switches.append(row)
    return row


for rnd in range(5):
    for seq in (['Ronald', 'home'], ['Sheik', 'home'], ['Ronald', 'Sheik', 'home']):
        for t in seq:
            r = go(t)
            if rnd == 0 and t != 'home':
                shot('visit_%s_owner_hud' % t.lower())
            if rnd == 0 and t == 'home' and seq[0] == 'Ronald' and len(seq) == 2:
                shot('home_after_ronald')
R['switches'] = switches
R['own_city_unchanged_after_switches'] = own_save() == base
R['npc_values'] = ev('mcity.scene.neighbors().map(n=>[n.name,n.companyValue])')
json.dump(R, open(os.path.join(OUT, 'phase9_checks.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in R.items() if k != 'switches'}, indent=1)[:6000])
print('switches', len(switches), 'all loaded', all(s['loaded'] for s in switches), 'loading shown', sum(s['loading_screen_shown'] for s in switches))
