"""Phase 9 shop audit in the Chrome started by phase7_browser.py: every tab (Houses, Commerces, Decorations, Wonders)
and the two special lists (Specials, Skyscraper Week), every page, every card. For each card it records the item,
the card symbol (shop_box / shop_box_wonder / shop_box_locked), the lock reason, the icon (atlas frame and opacity)
and the colour of the card background measured on a screenshot of the page, then checks the background against
the original: unlocked cards show the grass, locked cards the grass under the 80 % (101,151,182) layer of
shop_box_locked shape #63. One screenshot per page.

Usage: python -I tools/phase9_shop_audit.py <out_dir> [expired_offers 0|1]"""
import base64
import io
import json
import os
import sys
import time

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
from cdp import CDP, page_ws  # noqa: E402

OUT = os.path.abspath(sys.argv[1])
EXPIRED = len(sys.argv) > 2 and sys.argv[2] == '1'
# Optional: the experience of the test profile for this run (e.g. 99999999 unlocks every level-locked item).
EXP = int(sys.argv[3]) if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
c = CDP(page_ws(9351), timeout=120)
c.send('Runtime.enable')
OVERLAY = (101, 151, 182)
ALPHA = 204 / 255


def ev(js):
    r = c.send('Runtime.evaluate', {'expression': js, 'awaitPromise': True, 'returnByValue': True})
    if 'exceptionDetails' in r:
        raise RuntimeError(json.dumps(r['exceptionDetails'])[:400])
    return r['result'].get('value')


def screenshot():
    wid = c.send('Browser.getWindowForTarget')['windowId']
    if c.send('Browser.getWindowBounds', {'windowId': wid})['bounds']['windowState'] == 'minimized':
        c.send('Browser.setWindowBounds', {'windowId': wid, 'bounds': {'windowState': 'normal'}})
        c.send('Page.bringToFront')
        time.sleep(1.2)
    return base64.b64decode(c.send('Page.captureScreenshot', {'format': 'png'})['data'])


def nav(url):
    c.send('Page.navigate', {'url': url})
    end = time.time() + 90
    while time.time() < end:
        try:
            if ev('!!(window.mcity && window.mcity.state && document.getElementById("loading-screen").hidden)'):
                break
        except RuntimeError:
            pass
        time.sleep(0.3)
    time.sleep(2)


nav('http://127.0.0.1:8417/?city=test&view=1090,690')
ev('(()=>{const k="mcity.settings.v1"; const s=JSON.parse(localStorage.getItem(k)||"{}"); s.expiredOffers=%s; localStorage.setItem(k, JSON.stringify(s)); return 0})()'
   % ('true' if EXPIRED else 'false'))
if EXP is not None:
    ev('(()=>{mcity.scene.state.data.profile.exp=%d; mcity.scene.persist(); return 0})()' % EXP)
nav('http://127.0.0.1:8417/?city=test&view=1090,690')
ev('mcity.selectTool("build"),0')
time.sleep(0.8)

CARDS = """(()=>{const out=[]; const sh=mcity.scene.shop; const base=sh.page*8;
  document.querySelectorAll('#shop-panel .shop-box').forEach((b,k)=>{const e=sh.list[base+k]; const r=b.getBoundingClientRect();
    const layer=[...b.querySelectorAll('.swf-layer')][0]; const icon=b.querySelector('.shop-icon');
    const img=b.querySelector('[data-layer=image]');
    out.push({sku:e.def.sku, kind:e.def.kind, locked:e.locked, reason:e.lockReason, rect:[r.x,r.y,r.width,r.height].map(Math.round),
      bg:layer? getComputedStyle(layer).backgroundImage.slice(0,60)+'|'+getComputedStyle(layer).backgroundPosition : null,
      layout: b.dataset.layout || null, icon: !!icon, iconOpacity: icon? getComputedStyle(icon).opacity : null,
      iconFrame: icon? icon.style.backgroundPosition : null, imageRect: img? (q=>[q.x,q.y,q.width,q.height].map(Math.round))(img.getBoundingClientRect()) : null});});
  return out})()"""

tabs = [('houses', 'tab', 0), ('commerces', 'tab', 1), ('decorations', 'tab', 2), ('wonders', 'tab', 3), ('specials', 'special', 'featured'),
        ('skyscraper_week', 'special', 'new_items')]
report = {'expired_offers_option': EXPIRED, 'exp': EXP, 'level': ev('mcity.state().level'), 'tabs': {}}
problems = []
for name, kind, arg in tabs:
    ev('mcity.scene.shop.%s(%s),0' % ('showTab' if kind == 'tab' else 'showSpecial', json.dumps(arg)))
    time.sleep(0.6)
    total = ev('mcity.scene.shop.list.length')
    pages = max(1, -(-total // 8))
    cards = []
    for page in range(pages):
        ev('(()=>{const s=mcity.scene.shop; s.page=%d; s.render(); return 0})()' % page)
        time.sleep(0.5 + (0.6 if page == 0 else 0))
        png = screenshot()
        open(os.path.join(OUT, '%s_p%02d.png' % (name, page + 1)), 'wb').write(png)
        img = Image.open(io.BytesIO(png)).convert('RGB')
        for card in ev(CARDS):
            # Card origin from the "image" placeholder (shop_box bounds: image at 2.75, 20.9; grass #16 from 1.5, 0.5 to
            # 126.5, 178.5; the price button from y 134.85). Two 6 x 6 patches at the bottom corners of the picture area,
            # where the centred item icon is transparent: left and right of the item's base.
            ix, iy = card['imageRect'][0], card['imageRect'][1]
            ox, oy = ix - 2.75, iy - 20.9

            def patch(dx, dy):
                px = [img.getpixel((round(ox + dx + i), round(oy + dy + j))) for i in range(6) for j in range(6)]
                return tuple(round(sum(p[k] for p in px) / len(px)) for k in range(3))

            def klass(avg):
                if avg[1] > avg[0] + 20 and avg[1] > avg[2] + 10:
                    return 'grass'
                if avg[2] > avg[0] + 20 and abs(avg[2] - avg[1]) < 40:
                    return 'locked_tint'
                return 'other'
            samples = [patch(5, 124), patch(116, 124)]
            card['bg_rgb'] = samples
            card['page'] = page + 1
            want = 'locked_tint' if card['locked'] else 'grass'
            card['bg_class'] = [klass(a) for a in samples]
            card['bg_ok'] = want in card['bg_class']
            card['icon_ok'] = card['icon'] and (card['iconOpacity'] == ('0.5' if card['locked'] else '1'))
            if not (card['bg_ok'] and card['icon_ok']):
                problems.append({k: card[k] for k in ('sku', 'page', 'locked', 'bg_rgb', 'bg_class', 'icon', 'iconOpacity')} | {'tab': name})
            cards.append(card)
    report['tabs'][name] = {'items': total, 'pages': pages, 'locked': sum(c_['locked'] for c_ in cards),
                            'expired': sum(c_['reason'] == 'expired' for c_ in cards), 'cards': cards}
    print(name, total, 'items', pages, 'pages', flush=True)

# Locked composite check: the same pixel of an unlocked and a locked card of the same page column differs by the
# 80 % overlay only (grass x 0.2 + overlay x 0.8), measured where no picture or label covers the card.
pairs = []
for name in ('houses', 'commerces', 'decorations'):
    cards = report['tabs'][name]['cards']
    for lk in [c_ for c_ in cards if c_['locked']][:3]:
        un = next((c_ for c_ in cards if not c_['locked']), None)
        if not un:
            continue
        for side in (0, 1):
            if un['bg_class'][side] != 'grass':
                continue
            g = un['bg_rgb'][side]
            exp = tuple(round(ALPHA * OVERLAY[k] + (1 - ALPHA) * g[k]) for k in range(3))
            got = lk['bg_rgb'][side]
            pairs.append({'tab': name, 'side': side, 'locked': lk['sku'], 'unlocked': un['sku'], 'grass': g, 'locked_px': got, 'expected_composite': exp,
                          'max_diff': max(abs(exp[k] - got[k]) for k in range(3))})
report['locked_composite'] = pairs
report['problems'] = problems
report['summary'] = {t: {k: v for k, v in d.items() if k != 'cards'} for t, d in report['tabs'].items()}
report['summary']['all_cards'] = sum(d['items'] for d in report['tabs'].values())
report['summary']['cards_checked'] = sum(len(d['cards']) for d in report['tabs'].values())
report['summary']['problems'] = len(problems)
json.dump(report, open(os.path.join(OUT, 'shop_audit.json'), 'w'), indent=1)
ev('mcity.selectTool("select"),0')
print(json.dumps(report['summary'], indent=1))
print('composite', json.dumps(pairs)[:800])
print('problems', json.dumps(problems)[:1500])
