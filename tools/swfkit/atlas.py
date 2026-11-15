"""Packs trimmed frames into power-of-two atlas pages in Phaser's multiatlas JSON format."""
import json
import os

from PIL import Image

PAD = 2


def trim(img):
    box = img.getchannel('A').getbbox()
    if box is None:
        return img.crop((0, 0, 1, 1)), (0, 0, 1, 1)
    return img.crop(box), box


def _pot(n):
    p = 64
    while p < n:
        p *= 2
    return p


def pack(frames, max_size=4096):
    """frames: list of (name, image, source_w, source_h, offset_x, offset_y, pivot).

    Returns pages: list of (Image, [frame entries])."""
    order = sorted(range(len(frames)), key=lambda i: -frames[i][1].height)
    pages = []
    remaining = order
    while remaining:
        x = y = shelf_h = 0
        placed, rest = [], []
        width_used = height_used = 0
        for i in remaining:
            im = frames[i][1]
            w, h = im.width + PAD, im.height + PAD
            if w > max_size or h > max_size:
                raise ValueError('frame %s larger than atlas page' % frames[i][0])
            if x + w > max_size:
                x, y, shelf_h = 0, y + shelf_h, 0
            if y + h > max_size:
                rest.append(i)
                continue
            placed.append((i, x, y))
            x += w
            shelf_h = max(shelf_h, h)
            width_used = max(width_used, x)
            height_used = max(height_used, y + h)
        page = Image.new('RGBA', (_pot(width_used), _pot(height_used)), (0, 0, 0, 0))
        entries = []
        for i, px, py in placed:
            name, im, sw, sh, ox, oy, pivot = frames[i]
            page.paste(im, (px, py))
            entries.append({'filename': name, 'rotated': False, 'trimmed': True,
                            'frame': {'x': px, 'y': py, 'w': im.width, 'h': im.height},
                            'spriteSourceSize': {'x': ox, 'y': oy, 'w': im.width, 'h': im.height},
                            'sourceSize': {'w': sw, 'h': sh}, 'pivot': {'x': pivot[0], 'y': pivot[1]}})
        pages.append((page, entries))
        remaining = rest
    return pages


def write(pages, out_dir, name):
    os.makedirs(out_dir, exist_ok=True)
    textures = []
    for k, (img, entries) in enumerate(pages):
        fn = '%s_%d.png' % (name, k)
        img.save(os.path.join(out_dir, fn), optimize=True)
        textures.append({'image': fn, 'format': 'RGBA8888', 'size': {'w': img.width, 'h': img.height}, 'scale': 1, 'frames': entries})
    json.dump({'textures': textures, 'meta': {'app': 'MillionaireCity_HTML5 tools/swfkit/atlas.py', 'version': '1'}},
              open(os.path.join(out_dir, name + '.json'), 'w'), separators=(',', ':'))
    return [t['image'] for t in textures]
