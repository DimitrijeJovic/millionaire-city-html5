"""Adds shop icons for items whose SWF has no icon symbol and rebuilds the shop icon atlas.

ItemDefinition.getIcon builds the shop picture from the item's "normal" symbol (scaled to fit the box), so an item
without icon_02 / icon_02_new gets the first exported frame of its "normal" art. Items that already have an icon keep
it (build/assets/icons). Usage: python -I tools/fill_shop_icons.py"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'swfkit'))
import atlas  # noqa: E402

OUT = os.path.join(ROOT, 'public', 'assets')
ICONS = os.path.join(ROOT, 'build', 'assets', 'icons')
manifest_path = os.path.join(OUT, 'manifest.json')
manifest = json.load(open(manifest_path))
provenance = json.load(open(os.path.join(OUT, 'provenance.json')))
added = []
for sku, it in sorted(manifest['items'].items()):
    if it.get('status') != 'ok' or it.get('icon'):
        continue
    meta = json.load(open(os.path.join(OUT, it['atlas'])))
    frame = next(f for t in meta['textures'] for f in t['frames'] if f['filename'] == sku + '/0')
    page = next(t for t in meta['textures'] if frame in t['frames'])
    r = frame['frame']
    img = Image.open(os.path.join(OUT, os.path.dirname(it['atlas']), page['image'])).convert('RGBA').crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    img.save(os.path.join(ICONS, sku + '.png'))
    it['icon'] = 'icon/' + sku
    added.append(sku)
frames = []
for sku, it in sorted(manifest['items'].items()):
    if it.get('icon'):
        img = Image.open(os.path.join(ICONS, sku + '.png')).convert('RGBA')
        frames.append(('icon/' + sku, img, img.width, img.height, 0, 0, (0.5, 0.5)))
for f in os.listdir(os.path.join(OUT, 'atlas')):
    if f.startswith('shop_icons_') and f.endswith('.png'):
        os.remove(os.path.join(OUT, 'atlas', f))
images = atlas.write(atlas.pack(frames), os.path.join(OUT, 'atlas'), 'shop_icons')
manifest['shop_icon_atlas']['images'] = images
json.dump(manifest, open(manifest_path, 'w'), indent=1)
provenance['atlas:shop_icons'] = dict(provenance.get('atlas:shop_icons', {}), method=(
    'first frame of each item SWF icon symbol (icon_02_new / icon_02); items without one use the first frame of their '
    '"normal" art, as ItemDefinition.getIcon does'))
json.dump(provenance, open(os.path.join(OUT, 'provenance.json'), 'w'), indent=1)
print('added', len(added), 'icons total', len(frames), 'pages', images)
