"""Builds runtime assets for the HTML5 client from the original game files (read-only).

Usage: python -I tools/build_assets.py [--source <Datas dir>] [--skus sku1,sku2 | --city <city.json>]

Outputs to public/assets/: item atlases (2x), background tiles, tileset, sounds, rules JSON, and
provenance.json (source path + SHA-256 + conversion method for every output)."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'swfkit'))
import atlas  # noqa: E402
import bitmaps  # noqa: E402
import export  # noqa: E402
import rasterize  # noqa: E402
import swfparse  # noqa: E402

ROOT = os.path.dirname(HERE)
DEFAULT_SOURCE = os.environ.get('MCITY_DATAS_SOURCE', '')
OUT = os.path.join(ROOT, 'public', 'assets')
WORK = os.path.join(ROOT, 'build', 'assets')
ART_SCALE = 2
# BitmapAnimation.update advances one frame per ItemObject.logicUpdate, which runs once per stage frame
# of Dollars.swf (25 fps), independent of the frame rate declared by the item SWF.
ITEM_ANIMATION_FPS = 25

provenance = {}

def _previous(name):
    path = os.path.join(os.path.dirname(HERE), 'public', 'assets', name)
    return json.load(open(path)) if os.path.exists(path) else {}


PREVIOUS = _previous('provenance.json')
PREVIOUS_MANIFEST = _previous('manifest.json')


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def record(out_rel, source, method, **extra):
    provenance[out_rel] = dict({'source': os.path.relpath(source, SOURCE).replace('\\', '/') if source else None,
                                'source_sha256': sha256(source) if source and os.path.isfile(source) else None,
                                'method': method}, **extra)


def item_swf(sku):
    if sku == 'HeadQuarter':
        return os.path.join(SOURCE, 'Assets', 'items', 'HQDecorations', 'HeadQuarter_01.swf'), ['Asset_new', 'Asset']
    for dp, _, fs in os.walk(os.path.join(SOURCE, 'Assets', 'items')):
        if sku + '.swf' in fs:
            return os.path.join(dp, sku + '.swf'), ['normal_new', 'normal']
    return None, None


def bar_position(swf, symbol):
    """ItemObject.buildResources: icons and bars sit at the first child of the item's BarPosition symbol."""
    m = swfparse.Movie(swf)
    name = 'BarPosition_new' if symbol.endswith('_new') and 'BarPosition_new' in m.symbols else 'BarPosition'
    if name not in m.symbols:
        return None
    kind, sp = m.char(m.symbols[name])
    for op, d in sp['frames'][0]['ops'] if kind == 'sprite' else []:
        if op == 'place' and 'char' in d:
            mat = d.get('matrix', swfparse.IDENTITY)
            return [mat[4] / 20.0, mat[5] / 20.0]
    return None


# Collection feedback: StateOnRent rent animation (houses_info Event_Income_anim_ok) and the particle a
# shop shows on each customer house (CommerceTypeDefinition.getDOIconOnHouse -> common.swf Event_common).
FX_SYMBOLS = [
    ('Assets/GUI/houses_info.swf', 'Event_Income_anim_ok'),
    ('Assets/items/CommerceTypes/common.swf', 'Event_common'),
    # Map.buyTerrain / roadTileBuild (AssetManager_TerrainParticle) and Map.destroyTileApplyEconomy.
    ('Assets/GUI/houses_info.swf', 'Event_terraint_anim_ok'),
    ('Assets/GUI/houses_info.swf', 'Event_terraint_destroy_anim_ok'),
    # NotificationConstructionEnd.getButtonClass / getButtonEndClass.
    ('Assets/GUI/houses_info.swf', 'Event_Contract_anim'),
    ('Assets/GUI/houses_info.swf', 'Event_Contract_anim_ok'),
    # StateOnRentVisitor.upgradeDoSetDOs: VISITOR_UPGRADES_SWF (CommerceTypes/upgrades.swf) Event_upgrade.
    ('Assets/items/CommerceTypes/upgrades.swf', 'Event_upgrade'),
]


def build_fx(browser):
    """Live MovieClip effects: nested clips keep playing, one stage frame (25 fps) per frame."""
    frames, manifest = [], {}
    for rel, symbol in FX_SYMBOLS:
        swf = os.path.join(SOURCE, rel)
        key = os.path.splitext(os.path.basename(rel))[0] + '.' + symbol
        work = os.path.join(WORK, 'fx', key)
        meta = export.Exporter(swf, work).export(symbol)
        _, files = rasterize.rasterize(browser, work, os.path.join(work, 'png'), ART_SCALE, symbol + '.html')
        ox, oy = meta['origin_px']
        for k, fn in enumerate(files):
            img = Image.open(os.path.join(work, 'png', fn)).convert('RGBA')
            cropped, box = atlas.trim(img)
            frames.append(('%s/%d' % (key, k), cropped, img.width, img.height, box[0], box[1],
                           (ox * ART_SCALE / img.width, oy * ART_SCALE / img.height)))
        manifest[key] = {'frames': len(files), 'fps': ITEM_ANIMATION_FPS, 'art_scale': ART_SCALE, 'text_fields': len(meta['text_fields'])}
        record('atlas:fx/' + key, swf, 'swfkit export of %s (live clip, nested timelines play) -> Edge raster x%d' % (symbol, ART_SCALE))
    images = atlas.write(atlas.pack(frames), os.path.join(OUT, 'atlas'), 'fx')
    return manifest, images


def _export_frames(swf, symbol, work, browser, frozen):
    meta = export.Exporter(swf, work, frozen_children=frozen).export(symbol)
    _, files = rasterize.rasterize(browser, work, os.path.join(work, 'png'), ART_SCALE, symbol + '.html')
    ox, oy = meta['origin_px']
    frames = []
    for fn in files:
        img = Image.open(os.path.join(work, 'png', fn)).convert('RGBA')
        cropped, box = atlas.trim(img)
        frames.append((cropped, img.width, img.height, box[0], box[1], (ox * ART_SCALE / img.width, oy * ART_SCALE / img.height)))
    return meta, frames


def build_construction(browser):
    """BuildingState.swf T<rows>x<cols> bitmaps shown while an item is under construction
    (ItemObject.buildResources: bottom-aligned with the base)."""
    swf = os.path.join(SOURCE, 'Assets', 'items', 'bases_building', 'BuildingState.swf')
    m = swfparse.Movie(swf)
    frames, manifest = [], {}
    for name, cid in sorted(m.symbols.items()):
        if not name.startswith('T') or m.chars.get(cid, (None,))[0] not in swfparse.BITMAP_TAGS:
            continue
        img, _ = bitmaps.decode(*m.chars[cid], m.jpeg_tables)
        frames.append(('construction/' + name, img, img.width, img.height, 0, 0, (0, 0)))
        manifest[name] = {'frame': 'construction/' + name, 'w': img.width, 'h': img.height}
    images = atlas.write(atlas.pack(frames), os.path.join(OUT, 'atlas'), 'construction')
    record('atlas:construction', swf, 'BitmapData symbols T<rows>x<cols> copied unscaled')
    return manifest, images


def build_cars(holder):
    """Traffic agents (rules/trafficAgents): 'car_new' (else 'car') with one frame per degree of heading."""
    out_dir = os.path.join(OUT, 'cars')
    manifest = {}
    root = ET.parse(os.path.join(SOURCE, 'rules', 'trafficAgents', 'trafficAgentDefinitions.xml')).getroot()
    for d in root:
        sku = d.get('sku')
        swf = os.path.join(SOURCE, 'Assets', 'items', 'cars', sku + '.swf')
        if not os.path.exists(swf):
            manifest[sku] = {'status': 'missing_swf'}
            continue
        symbols = swfparse.Movie(swf).symbols
        symbol = 'car_new' if 'car_new' in symbols else next(iter(symbols))
        digest = sha256(swf)
        if os.path.exists(os.path.join(out_dir, sku + '.json')) and PREVIOUS.get('cars/' + sku, {}).get('source_sha256') == digest:
            manifest[sku] = PREVIOUS_MANIFEST.get('cars', {}).get(sku) or {'status': 'ok', 'frames': 360, 'atlas': 'cars/' + sku + '.json',
                                                                          'art_scale': ART_SCALE}
            provenance['cars/' + sku] = PREVIOUS['cars/' + sku]
            continue
        # The headless browser occasionally dies on these 360-frame exports; each car gets three attempts.
        frames = None
        for attempt in range(3):
            try:
                meta, frames = _export_frames(swf, symbol, os.path.join(WORK, 'cars', sku), holder.b, True)
                break
            except Exception as e:  # noqa: BLE001
                manifest[sku] = {'status': 'export_failed', 'error': repr(e)[:200], 'attempts': attempt + 1}
                holder.restart()
        if frames is None:
            continue
        # 1024 px pages: the 4096 px pages made the headless renderer crash once cars were drawn.
        atlas.write(atlas.pack([('%s/%d' % (sku, k),) + f for k, f in enumerate(frames)], max_size=1024), out_dir, sku)
        manifest[sku] = {'status': 'ok', 'frames': len(frames), 'atlas': 'cars/' + sku + '.json', 'art_scale': ART_SCALE}
        record('cars/' + sku, swf, 'swfkit export of %s, %d heading frames -> Edge raster x%d' % (symbol, len(frames), ART_SCALE))
    return manifest


class BrowserHolder:
    """Restarts the headless browser after a crash so one bad page does not stop the build."""

    def __init__(self):
        self.b = rasterize.Browser()

    def restart(self):
        try:
            self.b.close()
        except Exception:  # noqa: BLE001
            pass
        self.b = rasterize.Browser()


def build_items(skus, holder):
    """One atlas per item (public/assets/items/<sku>.json), loaded by the client on demand. Items whose
    source SWF hash matches the previous build are reused."""
    out_dir = os.path.join(OUT, 'items')
    os.makedirs(out_dir, exist_ok=True)
    old_manifest = {}
    old_prov = {}
    if os.path.exists(os.path.join(OUT, 'manifest.json')):
        old_manifest = json.load(open(os.path.join(OUT, 'manifest.json'))).get('items', {})
    if os.path.exists(os.path.join(OUT, 'provenance.json')):
        old_prov = json.load(open(os.path.join(OUT, 'provenance.json')))
    manifest, icons = {}, []
    for n, sku in enumerate(sorted(set(skus))):
        swf, candidates = item_swf(sku)
        if swf is None:
            manifest[sku] = {'status': 'missing_swf'}
            continue
        movie_symbols = swfparse.Movie(swf).symbols
        symbol = next((s_ for s_ in candidates if s_ in movie_symbols), None)
        if symbol is None:
            manifest[sku] = {'status': 'missing_symbol', 'swf': os.path.basename(swf)}
            continue
        key = 'items/' + sku
        digest = sha256(swf)
        icon_symbol = next((s_ for s_ in ('icon_02_new', 'icon_02', 'Icon') if s_ in movie_symbols), None)
        work = os.path.join(WORK, 'items', sku)
        reuse = (old_prov.get(key, {}).get('source_sha256') == digest and old_manifest.get(sku, {}).get('status') == 'ok'
                 and os.path.exists(os.path.join(out_dir, sku + '.json')))
        if reuse:
            manifest[sku] = old_manifest[sku]
            provenance[key] = old_prov[key]
        else:
            try:
                meta, frames = _export_frames(swf, symbol, work, holder.b, True)
            except Exception as e:  # noqa: BLE001
                manifest[sku] = {'status': 'export_failed', 'error': repr(e)[:200]}
                print('FAILED', sku, repr(e)[:200], flush=True)
                holder.restart()
                continue
            pages = atlas.pack([('%s/%d' % (sku, k),) + f for k, f in enumerate(frames)])
            atlas.write(pages, out_dir, sku)
            ox, oy = meta['origin_px']
            manifest[sku] = {'status': 'ok', 'frames': len(frames), 'fps': ITEM_ANIMATION_FPS, 'origin': [ox, oy],
                             'bar_position': bar_position(swf, symbol), 'size': meta['canvas_px'], 'art_scale': ART_SCALE,
                             'atlas': 'items/' + sku + '.json', 'labels': meta['labels'], 'skipped': meta['skipped']}
            record(key, swf, 'swfkit export (symbol %s, nested clips frozen) -> SVG -> Edge raster x%d -> trim' % (symbol, ART_SCALE),
                   symbol=symbol)
        if icon_symbol:
            icon_png = os.path.join(WORK, 'icons', sku + '.png')
            if not (reuse and os.path.exists(icon_png)):
                try:
                    _, iframes = _export_frames(swf, icon_symbol, os.path.join(WORK, 'icons_work', sku), holder.b, True)
                except Exception as e:  # noqa: BLE001
                    print('ICON FAILED', sku, repr(e)[:200], flush=True)
                    holder.restart()
                    continue
                os.makedirs(os.path.dirname(icon_png), exist_ok=True)
                iframes[0][0].save(icon_png)
            icons.append(('icon/' + sku, Image.open(icon_png).convert('RGBA'), 0, 0, 0, 0, (0, 0)))
            manifest[sku]['icon'] = 'icon/' + sku
        if n % 25 == 0:
            print('items', n, len(skus), flush=True)
            # A fresh browser every few dozen pages keeps memory use flat over the full catalogue.
            holder.restart()
    icon_frames = [(name, img, img.width, img.height, 0, 0, (0.5, 0.5)) for name, img, *_ in icons]
    images = atlas.write(atlas.pack(icon_frames), os.path.join(OUT, 'atlas'), 'shop_icons')
    record('atlas:shop_icons', None, 'first frame of each item SWF icon symbol (icon_02_new / icon_02), Edge raster x%d' % ART_SCALE)
    return manifest, images


TOOL_BUTTONS = {'SelectButton': 4, 'BuyButton': 4, 'BuildButton': 5, 'RoadButton': 4, 'DemolitionButton': 4}
SHOP_TABS = ['Houses', 'Commerces', 'Decorations', 'Wonders']
# (swf, symbol, extra layers): "path@frame" exports a button state (UpState=1, OverState=2, DownState=3, SelectState=last).
UI_SYMBOLS = [
    ('Assets/hud/hud.swf', 'hud_new', ['name_city/arrow_down_red@1', 'name_city/arrow_down_red@2', 'name_city/photo',
                                       'XP/fill_bar/bar', 'XP/fill_bar/bar_size', 'XP/ExperienceStar']),
    ('Assets/hud/hud.swf', 'tool_panel', ['%s@%d' % (b, f) for b, last in TOOL_BUTTONS.items() for f in (2, 3, last)]),
    ('Assets/hud/hud.swf', 'shop', ['%s@%d' % (t, f) for t in SHOP_TABS for f in (2, 3)] +
     ['mArrowLeft@2', 'mArrowLeft@4', 'mArrowRight@2', 'mArrowRight@4', 'mClose@2']),
    # ItemContentUnlocked sets the currency icon, the offer star and the old price at run time, so the button's
    # placeholders are separate layers that the client can hide.
    ('popups/shop/shop.swf', 'shop_box', ['unlock_FC@2', 'unlock_FC@3', 'unlock_FC/ButtonText/icon',
                                          'unlock_FC/ButtonText/offer', 'unlock_FC/ButtonText/old_prize']),
    ('popups/shop/shop.swf', 'shop_box_locked', ['fan@2', 'fan@3']),
    ('Assets/GUI/Missions.swf', 'popup_mission_background_01', []),
    # PopupMission uses the _image_01 variant when the mission definition has imageIsRequired; the image is the
    # "image" symbol of Assets/missions/<type>_<parameter> (beat: <type>_<condition>), added to the image_01 clip.
    ('Assets/GUI/Missions.swf', 'popup_mission_background_01_image_01', []),
    ('Assets/GUI/Missions.swf', 'popup_well_done', []),
    ('Assets/hud/hud.swf', 'popup_next_level', []),
    ('Assets/GUI/Missions.swf', 'popup_mission_Name_01', ['Done@2', 'Done@3']),
    ('Assets/GUI/expansions.swf', 'popup_for_sale_expansion', []),
    ('Assets/GUI/expansions.swf', 'popup_confirm_expansion', ['mClose@2']),
    ('Assets/GUI/expansions.swf', 'box_cash', []),
    ('Assets/GUI/expansions.swf', 'box_gold', []),
    ('Assets/GUI/expansions.swf', 'button_buy', ['ButtonText']),
    ('plain.swf', 'plain', []),
    # ContractBox (contracts.swf): background with arrows and close, one box per contract, contract_NN icons.
    ('Assets/GUI/contracts.swf', 'popup_background_contract', ['mArrowLeft@2', 'mArrowLeft@4', 'mArrowRight@2', 'mArrowRight@4', 'mClose@2']),
    ('Assets/GUI/contracts.swf', 'popup_box_contract', []),
    ('Assets/GUI/contracts.swf', 'popup_box_contract_locked', []),
    # ShopMenuInfoHouse / Commerce / Deco: hover boxes of the shop (right, or left near the stage edge).
] + [('Assets/hud/hud.swf', 'popup_info_box_%s%s' % (kind, side), []) for kind in ('', 'commerce_', 'decoration_', 'wonder_')
     for side in ('left', 'right')] + [
    # PopupConfirm (title, text, close; button_1..3 are slots the original fills with buttons).
    ('popups/confirm/popup_confirm.swf', 'popup_confirm', ['button_close@2']),
    # Phase 7: OptionsPanel, FriendsBar, map info boxes (StateOnRent.doInfoBoxGetBox), PopupValue, NoteRain notes.
    ('Assets/hud/hud.swf', 'options_panel', ['%s@%d' % (b, f) for b in ('zoomin', 'zoomout', 'fullscreen', 'music', 'volume', 'quality', 'options')
                                             for f in (2, 3, 4)]),
    ('Assets/hud/hud.swf', 'friends_bar', ['mArrowRight01@2', 'mArrowRight03@2', 'mArrowLeft01@2', 'mArrowLeft03@2']),
    ('Assets/hud/hud.swf', 'hud_friend_box', []),
    ('Assets/hud/hud.swf', 'hud_friend_box_add_friend', []),
    ('Assets/hud/hud.swf', 'hud_friend_box_yourself', []),
    # DCFillBar scales the FillBar's "bar" child to the remaining time; "bar_size" gives its full width.
] + [('Assets/GUI/houses_info.swf', 'popup_info_%s_%s' % (k, side), ['FillBar/bar', 'FillBar/bar_size'])
     for k in ('house', 'commerce') for side in ('left', 'right')] + [
    ('Assets/GUI/houses_info.swf', 'popup_value', ['OkButton@2']),
    ('Assets/GUI/houses_info.swf', 'popup_value_without_gold', ['OkButton@2']),
] + [('Dollars.swf', name, []) for name in ('note', 'note_01', 'note_02', 'note_03', 'note_04')] + [
    # Phase 8, contractors (MultifunctionBar, PopupRentMoneyCollector, PopupMultiContract, ItemService boxes).
    ('Assets/hud/hud.swf', 'button_multifuncion', ['%s@%d' % (b, f) for b in ('move', 'collector', 'contract') for f in (2, 3, 4)]),
    ('Assets/GUI/houses_info.swf', 'PopupRentMoneyCollector', ['mClose@2']),
    ('Assets/GUI/houses_info.swf', 'popup_contract', ['mClose@2']),
] + [('Assets/GUI/houses_info.swf', name, ['ContractButton@2', 'ContractButton@3', 'gold@2'])
     for name in ('popup_collect_box_cash', 'popup_contract_box')] + [
    ('Assets/GUI/houses_info.swf', 'popup_collect_box_cash_locked', []),
    ('Assets/GUI/houses_info.swf', 'popup_contract_box_cash_locked', []),
] + [
    # InfoBoxContract: hud.swf has symbols with the same names, hence the aliases.
    ('Assets/GUI/contracts.swf', 'popup_info_box_left', [], 'contract_info_left'),
    ('Assets/GUI/contracts.swf', 'popup_info_box_right', [], 'contract_info_right'),
] + [('Assets/GUI/contracts.swf', 'contract_%02d' % n, []) for n in range(2, 15)] + [
    # PopupConfirmDestroy shows the PopupDestroy clip embedded in the client (AssetManager), not houses_info.swf.
] + [('Assets/missions/%s.swf' % n, 'image', [], 'mission_' + n) for n in (
    'beat_2', 'bonus_houses_001', 'bonus_houses_001_001', 'build_Decorations_tree', 'checkInfluence_commerce_pizza')] + [
    ('../../../../../generated/client/Dollars.private.swf', 'com.dchoc.framework.utils.AssetManager_PopupDestroy',
     ['OkButton@2', 'CancelButton@2'], 'popup_destroy'),
    # Phase 9: ItemContentUnlocked.getBox uses shop_box_wonder for wonders; PopupStorage (VaultBar storage) with one
    # StorageItemContent (storage_box) per stored item; PopupConfirmExpansion puts box_invest_pending in box_2;
    # ToolMove: PopupConfirmMove (free move) and PopupPayMove (price or rent the move service).
    ('popups/shop/shop.swf', 'shop_box_wonder', ['unlock_FC@2', 'unlock_FC@3', 'unlock_FC/ButtonText/icon',
                                                 'unlock_FC/ButtonText/offer', 'unlock_FC/ButtonText/old_prize']),
    ('Assets/GUI/Storage.swf', 'popup_storage', ['arrow_left@2', 'arrow_left@4', 'arrow_right@2', 'arrow_right@4', 'mClose@2']),
    ('Assets/GUI/Storage.swf', 'storage_box', ['button_use@2', 'button_use@3']),
    ('Assets/GUI/expansions.swf', 'box_invest_pending', []),
    ('Assets/GUI/houses_info.swf', 'popup_confirm_buy_crane_operator', ['OkButton@2', 'OkButton@3', 'mClose@2']),
    ('Assets/GUI/houses_info.swf', 'popup_confirm_buy_rent_crane_operator', ['OkButton@2', 'OkButton@3', 'RentButton@2', 'mClose@2']),
]


def build_ui(browser):
    """Exports UI symbols layer by layer (one image per top-level instance) plus their text fields."""
    import fonts
    frames = []
    frame_keys = set()
    layouts = {}
    font_files = {}
    for entry in UI_SYMBOLS:
        rel, symbol, explode = entry[:3]
        alias = entry[3] if len(entry) > 3 else symbol
        swf = os.path.normpath(os.path.join(SOURCE, rel))
        work = os.path.join(WORK, 'ui', alias)
        ex = export.Exporter(swf, work)
        meta = ex.export(symbol, layers=True, explode=explode)
        _, files = rasterize.rasterize(browser, work, os.path.join(work, 'png'), ART_SCALE, symbol + '.html')
        ox, oy = meta['origin_px']
        layers = {}
        for name, fn in zip(meta['layers'], files):
            img = Image.open(os.path.join(work, 'png', fn)).convert('RGBA')
            cropped, box = atlas.trim(img)
            if box == (0, 0, 1, 1):
                continue
            key = '%s/%s' % (alias, name)
            # An exploded child can repeat a layer name (button_buy/ButtonText); the atlas keeps the first image.
            if key in frame_keys:
                continue
            frame_keys.add(key)
            frames.append((key, cropped, cropped.width, cropped.height, 0, 0, (0, 0)))
            layers[name] = {'frame': key, 'x': box[0] / ART_SCALE - ox, 'y': box[1] / ART_SCALE - oy,
                            'w': cropped.width / ART_SCALE, 'h': cropped.height / ART_SCALE}
        mv = swfparse.Movie(swf)
        ops = mv.char(mv.symbols[symbol])[1]['frames'][0]['ops']
        # Registration points of named children, where the original adds clips at run time (addChild).
        origins = {op[1]['name']: [op[1]['matrix'][4] / 20.0, op[1]['matrix'][5] / 20.0]
                   for op in ops if op[0] == 'place' and op[1].get('name') and op[1].get('matrix')}
        layouts[alias] = {'layers': layers, 'order': [n for n in meta['layers'] if n in layers], 'text_fields': meta['text_fields'],
                          'bounds': meta['layer_bounds_px'], 'origins': origins}
        record('atlas:ui/' + alias, swf, 'swfkit layer export (one image per top-level instance) -> Edge raster x%d' % ART_SCALE)
        m = swfparse.Movie(swf)
        for cid, (code, t) in m.chars.items():
            if code in (48, 75):
                f = fonts.parse_font(code, t)
                if not f['name'] or f['name'] in font_files or len(f['glyphs']) < 20:
                    continue
                fn = ''.join(ch for ch in f['name'] if ch.isalnum()) + '.ttf'
                os.makedirs(os.path.join(OUT, 'fonts'), exist_ok=True)
                fonts.to_ttf(f, os.path.join(OUT, 'fonts', fn))
                font_files[f['name']] = fn
                record('fonts/' + fn, swf, 'DefineFont%d %d glyph outlines -> TrueType (fontTools)' % (3 if code == 75 else 2, cid))
    pages = atlas.pack(frames)
    images = atlas.write(pages, os.path.join(OUT, 'atlas'), 'ui')
    css = ''.join('@font-face{font-family:"%s";src:url("%s") format("truetype");}' % (n, f) + chr(10) for n, f in font_files.items())
    open(os.path.join(OUT, 'fonts', 'fonts.css'), 'w').write(css)
    json.dump(layouts, open(os.path.join(OUT, 'ui_layout.json'), 'w'), indent=1)
    return images, font_files


def build_background():
    swf = os.path.join(SOURCE, 'Assets', 'terrain', 'terrain.swf')
    m = swfparse.Movie(swf)
    kind, sprite = m.char(m.symbols['background'])
    place = sprite['frames'][0]['ops'][0][1]
    shape = m.char(place['char'])[1]
    fill = next(f for g in shape['groups'] for f in g['fills'] if f['type'] == 'bitmap' and f['bitmap'] in m.chars)
    img, fmt_ = bitmaps.decode(*m.chars[fill['bitmap']], m.jpeg_tables)
    a, b, c, d, tx, ty = fill['matrix']
    pm = place.get('matrix', swfparse.IDENTITY)
    if abs(a - 20) > 1e-3 or abs(d - 20) > 1e-3 or b or c or pm[:4] != (1.0, 0.0, 0.0, 1.0):
        raise SystemExit('background bitmap is transformed; expected a 1:1 bitmap fill')
    offset = [(tx + pm[4]) / 20.0, (ty + pm[5]) / 20.0]
    out_dir = os.path.join(OUT, 'background')
    os.makedirs(out_dir, exist_ok=True)
    tiles = []
    T = 1024
    for ty_ in range(0, img.height, T):
        for tx_ in range(0, img.width, T):
            tile = img.crop((tx_, ty_, min(tx_ + T, img.width), min(ty_ + T, img.height)))
            fn = 'bg_%d_%d.png' % (tx_ // T, ty_ // T)
            tile.convert('RGB').save(os.path.join(out_dir, fn), optimize=True)
            tiles.append({'file': fn, 'x': tx_ + offset[0], 'y': ty_ + offset[1], 'w': tile.width, 'h': tile.height})
    record('background/', swf, 'bitmap %d (%s) of symbol "background", split into %dpx tiles, unscaled' % (fill['bitmap'], fmt_, T))
    return {'tiles': tiles, 'size': list(img.size), 'offset': offset}


def copy_file(src_rel, dst_rel, method='copied unchanged'):
    src = os.path.join(SOURCE, src_rel)
    dst = os.path.join(OUT, dst_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    record(dst_rel, src, method)


def xml_to_json(path):
    def conv(el):
        node = dict(el.attrib)
        kids = [conv(k) for k in el]
        if kids:
            node['_children'] = kids
        node['_tag'] = el.tag
        return node
    return conv(ET.parse(path).getroot())


def build_rules():
    out = os.path.join(OUT, 'rules')
    os.makedirs(out, exist_ok=True)
    rules_dir = os.path.join(SOURCE, 'rules')
    names = []
    for dp, _, fs in os.walk(rules_dir):
        for f in fs:
            if f.endswith('.xml'):
                src = os.path.join(dp, f)
                rel = os.path.relpath(src, rules_dir).replace('\\', '/')
                dst = rel[:-4].replace('/', '__') + '.json'
                json.dump(xml_to_json(src), open(os.path.join(out, dst), 'w'), separators=(',', ':'))
                record('rules/' + dst, src, 'XML -> JSON (attributes as strings, children in _children)')
                names.append(dst)
    return sorted(names)


def main():
    global SOURCE
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', default=DEFAULT_SOURCE)
    ap.add_argument('--skus', default='')
    ap.add_argument('--city', default=os.path.join(ROOT, 'public', 'data', 'city.json'))
    ap.add_argument('--all-items', action='store_true', help='every sku in the item, commerce, decoration and wonder rules')
    ap.add_argument('--skip-items', action='store_true', help='keep the item atlases and shop icons of the previous build')
    args = ap.parse_args()
    if not args.source:
        ap.error('--source is required (or set MCITY_DATAS_SOURCE) pointing to the original game Datas directory')
    SOURCE = os.path.abspath(args.source)
    if os.path.commonpath([SOURCE, ROOT]) == ROOT:
        raise SystemExit('source must not be inside the project')
    skus = [s for s in args.skus.split(',') if s]
    if args.all_items:
        for f in ('itemDefinitions', 'commerceDefinitions', 'decorationDefinitions', 'wonderDefinitions'):
            path = os.path.join(SOURCE, 'rules', f + '.xml')
            if os.path.exists(path):
                skus += [d.get('sku') for d in ET.parse(path).getroot() if d.get('sku')]
    if not skus and os.path.exists(args.city):
        skus = sorted({it['sku'] for it in json.load(open(args.city))['items']})
    os.makedirs(OUT, exist_ok=True)
    holder = BrowserHolder()
    try:
        if args.skip_items:
            prev = json.load(open(os.path.join(OUT, 'manifest.json')))
            items, images = prev['items'], prev['shop_icon_atlas']['images']
            provenance.update({k: v for k, v in json.load(open(os.path.join(OUT, 'provenance.json'))).items()
                               if k.startswith('items/') or k == 'atlas:shop_icons'})
        else:
            items, images = build_items(skus, holder)
        ui_images, font_files = build_ui(holder.b)
        fx, fx_images = build_fx(holder.b)
        construction, construction_images = build_construction(holder.b)
        cars = build_cars(holder)
    finally:
        holder.b.close()
    bg = build_background()
    copy_file('Assets/terrain/tiles/tileset.png', 'terrain/tileset.png')
    for icon in ('rentIcon.png', 'contractIcon.png'):
        copy_file('Assets/items/common/' + icon, 'icons/' + icon)
    # FriendsBar NPC photos (NPCDefinitions url) and the Skyscraper Week tab picture (shopTabDefinitions feedImg).
    for npc in ('Ronald.png', 'Cindy.png', 'Sheik.png'):
        copy_file('Assets/npcs/' + npc, 'icons/npcs/' + npc)
    copy_file('feed/newitemimage.png', 'icons/newitemimage.png')
    # The original loading screen (pages/Background_loading.png), shown while a city loads.
    copy_file('pages/Background_loading.png', 'icons/Background_loading.png')
    for icon in ('cash.png', 'gold.png'):
        copy_file('button/common/' + icon, 'icons/' + icon)
    # PopupReward.loadImage: the mission's feedImg from feed/ (only pictures that exist in the original files).
    missions_xml = ET.parse(os.path.join(SOURCE, 'rules', 'missionDefinitions.xml')).getroot()
    feed_images = []
    for img in sorted({m.get('feedImg') for m in missions_xml.iter() if m.get('feedImg')}):
        if os.path.isfile(os.path.join(SOURCE, 'feed', img)):
            copy_file('feed/' + img, 'feed/' + img)
            feed_images.append(img)
    mission_icons = sorted(os.listdir(os.path.join(SOURCE, 'Assets', 'missions', 'icons')))
    for icon in mission_icons:
        copy_file('Assets/missions/icons/' + icon, 'icons/missions/' + icon)
    icon_dir = os.path.join(SOURCE, 'Assets', 'items', 'CommerceTypes', 'icons')
    commerce_icons = sorted(f for f in os.listdir(icon_dir) if f.endswith('.png'))
    for icon in commerce_icons:
        copy_file('Assets/items/CommerceTypes/icons/' + icon, 'icons/commerce/' + icon)
    for snd in sorted(os.listdir(os.path.join(SOURCE, 'sounds'))):
        copy_file('sounds/' + snd, 'sounds/' + snd)
    rules = build_rules()
    locale_out = os.path.join(OUT, 'locale', 'en.json')
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'extract_locale.py'), os.path.join(SOURCE, 'Dollars.swf'),
                    os.path.join(SOURCE, 'Locale', 'EN.txt'), locale_out], check=True)
    record('locale/en.json', os.path.join(SOURCE, 'Locale', 'EN.txt'), 'line index from TextIDs constants in Dollars.swf ABC')
    manifest = {'items': items, 'shop_icon_atlas': {'json': 'atlas/shop_icons.json', 'images': images},
                'ui_atlas': {'json': 'atlas/ui.json', 'images': ui_images, 'layout': 'ui_layout.json'},
                'fx': fx, 'fx_atlas': {'json': 'atlas/fx.json', 'images': fx_images},
                'cars': cars,
                'construction': construction, 'construction_atlas': {'json': 'atlas/construction.json', 'images': construction_images},
                'mission_icons': {f[:-4]: 'icons/missions/' + f for f in mission_icons if f.endswith('.png')},
                'feed_images': feed_images,
                'status_icons': {'rent': 'icons/rentIcon.png', 'contract': 'icons/contractIcon.png', 'frame': 75,
                                 'commerce': {f[:-4]: 'icons/commerce/' + f for f in commerce_icons}},
                'fonts': font_files, 'locale': 'locale/en.json', 'background': bg,
                'tileset': {'file': 'terrain/tileset.png', 'tile': 32, 'columns': 16},
                'sounds': sorted(os.listdir(os.path.join(OUT, 'sounds'))), 'rules': rules}
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    json.dump(provenance, open(os.path.join(OUT, 'provenance.json'), 'w'), indent=1)
    bad = {k: v for k, v in items.items() if v['status'] != 'ok'}
    print('items', len(items), 'not ok', bad, 'atlas pages', images, 'rules', len(rules))


if __name__ == '__main__':
    main()
