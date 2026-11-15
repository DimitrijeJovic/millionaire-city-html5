"""Converts embedded SWF fonts (DefineFont2/DefineFont3) to TrueType with the original glyph outlines.

SWF glyphs are quadratic curves like TrueType glyf outlines, so the conversion is lossless apart from
rounding to font units. Usage: python -I fonts.py <file.swf> <out_dir>"""
import os
import struct
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import swfparse  # noqa: E402


def _glyph_records(data, start, end):
    b = swfparse.Bits(data, start)
    nf, nl = b.ub(4), b.ub(4)
    x = y = 0
    contours = []
    cur = None
    while b.bit < end * 8:
        if b.ub(1) == 0:
            flags = b.ub(5)
            if flags == 0:
                break
            if flags & 1:
                n = b.ub(5)
                x, y = b.sb(n), b.sb(n)
                cur = [('M', x, y)]
                contours.append(cur)
            if flags & 2:
                b.ub(nf)
            if flags & 4:
                b.ub(nf)
            if flags & 8:
                b.ub(nl)
        elif b.ub(1):
            n = b.ub(4) + 2
            if b.ub(1):
                dx, dy = b.sb(n), b.sb(n)
            elif b.ub(1):
                dx, dy = 0, b.sb(n)
            else:
                dx, dy = b.sb(n), 0
            x, y = x + dx, y + dy
            if cur is None:
                cur = [('M', 0, 0)]
                contours.append(cur)
            cur.append(('L', x, y))
        else:
            n = b.ub(4) + 2
            cx, cy = x + b.sb(n), y + b.sb(n)
            x, y = cx + b.sb(n), cy + b.sb(n)
            if cur is None:
                cur = [('M', 0, 0)]
                contours.append(cur)
            cur.append(('Q', cx, cy, x, y))
    return contours


def parse_font(code, data):
    b = swfparse.Bits(data)
    fid = b.u16()
    flags = b.u8()
    b.u8()
    name = b.raw(b.u8()).split(b'\0')[0].decode('utf-8', 'replace')
    n = b.u16()
    wide_offsets, wide_codes = bool(flags & 0x08), bool(flags & 0x04)
    base = b.pos
    fmt = '<I' if wide_offsets else '<H'
    size = 4 if wide_offsets else 2
    offsets = [struct.unpack_from(fmt, data, base + i * size)[0] for i in range(n)]
    code_off = struct.unpack_from(fmt, data, base + n * size)[0]
    glyphs = []
    for i in range(n):
        end = offsets[i + 1] if i + 1 < n else code_off
        glyphs.append(_glyph_records(data, base + offsets[i], base + end))
    p = base + code_off
    codes = []
    for _ in range(n):
        if wide_codes:
            codes.append(struct.unpack_from('<H', data, p)[0])
            p += 2
        else:
            codes.append(data[p])
            p += 1
    ascent = descent = leading = None
    advances = None
    if flags & 0x80:
        ascent, descent, leading = struct.unpack_from('<HHh', data, p)
        p += 6
        advances = [struct.unpack_from('<h', data, p + 2 * i)[0] for i in range(n)]
    return {'id': fid, 'name': name, 'bold': bool(flags & 1), 'italic': bool(flags & 2), 'glyphs': glyphs, 'codes': codes,
            'ascent': ascent, 'descent': descent, 'leading': leading, 'advances': advances,
            'em': 20480 if code == 75 else 1024}


def to_ttf(font, path, family=None):
    scale = 2048 / font['em']
    fb = FontBuilder(2048, isTTF=True)
    names = ['.notdef'] + ['g%d' % i for i in range(len(font['glyphs']))]
    fb.setupGlyphOrder(names)
    cmap = {}
    for i, c in enumerate(font['codes']):
        if c and c not in cmap:
            cmap[c] = names[i + 1]
    fb.setupCharacterMap(cmap)
    glyf = {'.notdef': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (1024, 0)}
    for i, contours in enumerate(font['glyphs']):
        pen = TTGlyphPen(None)
        xmin = None
        for c in contours:
            pts = [(round(c[0][1] * scale), round(-c[0][2] * scale))]
            ops = []
            for seg in c[1:]:
                if seg[0] == 'L':
                    ops.append(('L', (round(seg[1] * scale), round(-seg[2] * scale))))
                else:
                    ops.append(('Q', (round(seg[1] * scale), round(-seg[2] * scale)), (round(seg[3] * scale), round(-seg[4] * scale))))
            if not ops:
                continue
            pen.moveTo(pts[0])
            for op in ops:
                if op[0] == 'L':
                    pen.lineTo(op[1])
                else:
                    pen.qCurveTo(op[1], op[2])
            pen.closePath()
            for p in [pts[0]] + [q for op in ops for q in op[1:]]:
                xmin = p[0] if xmin is None else min(xmin, p[0])
        glyf[names[i + 1]] = pen.glyph()
        adv = font['advances'][i] if font['advances'] else font['em'] // 2
        metrics[names[i + 1]] = (max(0, round(adv * scale)), xmin or 0)
    fb.setupGlyf(glyf)
    fb.setupHorizontalMetrics(metrics)
    asc = round((font['ascent'] or font['em'] * 0.8) * scale)
    desc = round((font['descent'] or font['em'] * 0.2) * scale)
    fb.setupHorizontalHeader(ascent=asc, descent=-desc)
    fam = family or font['name'] or 'swf%d' % font['id']
    fb.setupNameTable({'familyName': fam, 'styleName': 'Bold' if font['bold'] else 'Regular'})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=-desc, usWinAscent=asc, usWinDescent=desc)
    fb.setupPost()
    fb.save(path)
    return fam


if __name__ == '__main__':
    m = swfparse.Movie(sys.argv[1])
    os.makedirs(sys.argv[2], exist_ok=True)
    for cid, (code, t) in m.chars.items():
        if code in (48, 75):
            f = parse_font(code, t)
            safe = ''.join(ch for ch in f['name'] if ch.isalnum()) or 'font%d' % cid
            out = os.path.join(sys.argv[2], '%s_%d.ttf' % (safe, cid))
            to_ttf(f, out)
            print(cid, f['name'], 'glyphs', len(f['glyphs']), 'codes', ''.join(chr(c) for c in f['codes'][:60] if c), out)
