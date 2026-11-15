"""Read-only SWF parser: tags, shapes, bitmaps, sprites, symbol classes and sounds."""
import struct
import zlib


class Bits:
    def __init__(self, data, pos=0):
        self.data = data
        self.bit = pos * 8

    @property
    def pos(self):
        return (self.bit + 7) >> 3

    def align(self):
        self.bit = ((self.bit + 7) >> 3) << 3

    def ub(self, n):
        v = 0
        for _ in range(n):
            v = (v << 1) | ((self.data[self.bit >> 3] >> (7 - (self.bit & 7))) & 1)
            self.bit += 1
        return v

    def sb(self, n):
        v = self.ub(n)
        return v - (1 << n) if n and v >> (n - 1) else v

    def fb(self, n):
        return self.sb(n) / 65536.0

    def u8(self):
        self.align()
        v = self.data[self.bit >> 3]
        self.bit += 8
        return v

    def u16(self):
        self.align()
        v = struct.unpack_from('<H', self.data, self.bit >> 3)[0]
        self.bit += 16
        return v

    def s16(self):
        self.align()
        v = struct.unpack_from('<h', self.data, self.bit >> 3)[0]
        self.bit += 16
        return v

    def u32(self):
        self.align()
        v = struct.unpack_from('<I', self.data, self.bit >> 3)[0]
        self.bit += 32
        return v

    def f32(self):
        self.align()
        v = struct.unpack_from('<f', self.data, self.bit >> 3)[0]
        self.bit += 32
        return v

    def raw(self, n):
        self.align()
        p = self.bit >> 3
        self.bit += n * 8
        return self.data[p:p + n]

    def cstr(self):
        self.align()
        p = self.bit >> 3
        e = self.data.index(0, p)
        self.bit = (e + 1) * 8
        return self.data[p:e].decode('utf-8', 'replace')

    def rect(self):
        self.align()
        n = self.ub(5)
        r = [self.sb(n) for _ in range(4)]
        self.align()
        return r  # xmin, xmax, ymin, ymax in twips

    def matrix(self):
        self.align()
        a = d = 1.0
        b = c = 0.0
        if self.ub(1):
            n = self.ub(5)
            a, d = self.fb(n), self.fb(n)
        if self.ub(1):
            n = self.ub(5)
            b, c = self.fb(n), self.fb(n)
        n = self.ub(5)
        tx, ty = self.sb(n), self.sb(n)
        self.align()
        return (a, b, c, d, tx, ty)

    def cxform(self, alpha):
        self.align()
        has_add, has_mult = self.ub(1), self.ub(1)
        n = self.ub(4)
        k = 4 if alpha else 3
        mult = [256] * 4
        add = [0] * 4
        if has_mult:
            mult[:k] = [self.sb(n) for _ in range(k)]
        if has_add:
            add[:k] = [self.sb(n) for _ in range(k)]
        self.align()
        return (tuple(m / 256.0 for m in mult), tuple(add))

    def rgb(self):
        return (self.u8(), self.u8(), self.u8(), 255)

    def rgba(self):
        return (self.u8(), self.u8(), self.u8(), self.u8())


IDENTITY = (1.0, 0.0, 0.0, 1.0, 0, 0)
NO_CX = ((1.0, 1.0, 1.0, 1.0), (0, 0, 0, 0))

SHAPE_TAGS = {2: 1, 22: 2, 32: 3, 83: 4}
MORPH_TAGS = {46, 84}
BITMAP_TAGS = {6, 20, 21, 35, 36, 90}
TEXT_TAGS = {11, 33, 37}
BUTTON_TAGS = {7, 34}
FONT_TAGS = {10, 48, 75}


def load(path):
    data = open(path, 'rb').read()
    sig = data[:3]
    if sig == b'CWS':
        body = zlib.decompress(data[8:])
    elif sig == b'FWS':
        body = data[8:]
    else:
        raise ValueError('unsupported SWF signature %r' % sig)
    b = Bits(body)
    frame_size = b.rect()
    p = b.pos
    rate = body[p + 1] + body[p] / 256.0
    frames = struct.unpack_from('<H', body, p + 2)[0]
    tags = list(iter_tags(body, p + 4))
    return {'version': data[3], 'frame_size': frame_size, 'frame_rate': rate, 'frame_count': frames, 'tags': tags}


def iter_tags(buf, pos, end=None):
    end = len(buf) if end is None else end
    while pos + 2 <= end:
        cl = struct.unpack_from('<H', buf, pos)[0]
        pos += 2
        code, length = cl >> 6, cl & 0x3F
        if length == 0x3F:
            length = struct.unpack_from('<I', buf, pos)[0]
            pos += 4
        yield code, buf[pos:pos + length]
        pos += length
        if code == 0:
            return


def gradient(b, shape_ver, focal):
    b.align()
    spread, interp, n = b.ub(2), b.ub(2), b.ub(4)
    stops = []
    for _ in range(n):
        ratio = b.u8()
        stops.append((ratio, b.rgba() if shape_ver >= 3 else b.rgb()))
    fp = b.s16() / 256.0 if focal else 0.0
    return {'spread': spread, 'interp': interp, 'stops': stops, 'focal': fp}


def fill_style(b, shape_ver):
    t = b.u8()
    if t == 0x00:
        return {'type': 'solid', 'color': b.rgba() if shape_ver >= 3 else b.rgb()}
    if t in (0x10, 0x12, 0x13):
        m = b.matrix()
        g = gradient(b, shape_ver, t == 0x13)
        g.update({'type': {0x10: 'linear', 0x12: 'radial', 0x13: 'focal'}[t], 'matrix': m})
        return g
    if t in (0x40, 0x41, 0x42, 0x43):
        bid = b.u16()
        m = b.matrix()
        return {'type': 'bitmap', 'bitmap': bid, 'matrix': m, 'repeat': t in (0x40, 0x42), 'smooth': t in (0x40, 0x41)}
    raise ValueError('fill type 0x%02x' % t)


def fill_styles(b, shape_ver):
    n = b.u8()
    if n == 0xFF and shape_ver >= 2:
        n = b.u16()
    return [fill_style(b, shape_ver) for _ in range(n)]


def line_styles(b, shape_ver):
    n = b.u8()
    if n == 0xFF and shape_ver >= 2:
        n = b.u16()
    out = []
    for _ in range(n):
        w = b.u16()
        if shape_ver < 4:
            out.append({'width': w, 'color': b.rgba() if shape_ver >= 3 else b.rgb(), 'cap': 0, 'join': 0})
            continue
        b.align()
        cap, join, has_fill = b.ub(2), b.ub(2), b.ub(1)
        b.ub(3)  # NoHScale, NoVScale, PixelHinting
        b.ub(5)
        b.ub(1)  # NoClose
        b.ub(2)  # end cap
        if join == 2:
            b.u16()
        if has_fill:
            fs = fill_style(b, shape_ver)
            color = fs['color'] if fs['type'] == 'solid' else (fs.get('stops') or [(0, (0, 0, 0, 255))])[0][1]
        else:
            color = b.rgba()
        out.append({'width': w, 'color': color, 'cap': cap, 'join': join})
    return out


def parse_shape(code, data):
    """Returns {'id', 'bounds', 'groups': [{'fills', 'lines', 'edges'}]}.

    Edges are (fill0, fill1, line, x0, y0, cx, cy, x1, y1) in twips; cx is None for straight edges."""
    ver = SHAPE_TAGS[code]
    b = Bits(data)
    sid = b.u16()
    bounds = b.rect()
    winding = False
    if ver == 4:
        b.rect()
        b.align()
        b.ub(5)
        winding = bool(b.ub(1))
        b.ub(2)
    groups = []
    group = {'fills': fill_styles(b, ver), 'lines': line_styles(b, ver), 'edges': []}
    groups.append(group)
    b.align()
    nf, nl = b.ub(4), b.ub(4)
    x = y = 0
    f0 = f1 = ln = 0
    while True:
        if b.ub(1) == 0:
            flags = b.ub(5)
            if flags == 0:
                break
            if flags & 1:
                n = b.ub(5)
                x, y = b.sb(n), b.sb(n)
            if flags & 2:
                f0 = b.ub(nf)
            if flags & 4:
                f1 = b.ub(nf)
            if flags & 8:
                ln = b.ub(nl)
            if flags & 16:
                group = {'fills': fill_styles(b, ver), 'lines': line_styles(b, ver), 'edges': []}
                groups.append(group)
                b.align()
                nf, nl = b.ub(4), b.ub(4)
                f0 = f1 = ln = 0
        elif b.ub(1):
            n = b.ub(4) + 2
            if b.ub(1):
                dx, dy = b.sb(n), b.sb(n)
            elif b.ub(1):
                dx, dy = 0, b.sb(n)
            else:
                dx, dy = b.sb(n), 0
            group['edges'].append((f0, f1, ln, x, y, None, None, x + dx, y + dy))
            x, y = x + dx, y + dy
        else:
            n = b.ub(4) + 2
            cx, cy = x + b.sb(n), y + b.sb(n)
            ax, ay = cx + b.sb(n), cy + b.sb(n)
            group['edges'].append((f0, f1, ln, x, y, cx, cy, ax, ay))
            x, y = ax, ay
    return {'id': sid, 'bounds': bounds, 'groups': groups, 'winding': winding}


def parse_place(code, data):
    b = Bits(data)
    if code == 4:
        cid, depth = b.u16(), b.u16()
        m = b.matrix()
        cx = b.cxform(False) if b.pos < len(data) else None
        return {'depth': depth, 'char': cid, 'move': False, 'matrix': m, 'cxform': cx}
    f1 = b.u8()
    f2 = b.u8() if code == 70 else 0
    depth = b.u16()
    r = {'depth': depth, 'move': bool(f1 & 1)}
    if code == 70 and (f2 & 0x08 or (f2 & 0x10 and f1 & 0x02)):
        r['class_name'] = b.cstr()
    if f1 & 0x02:
        r['char'] = b.u16()
    if f1 & 0x04:
        r['matrix'] = b.matrix()
    if f1 & 0x08:
        r['cxform'] = b.cxform(True)
    if f1 & 0x10:
        r['ratio'] = b.u16()
    if f1 & 0x20:
        r['name'] = b.cstr()
    if f1 & 0x40:
        r['clip_depth'] = b.u16()
    if code == 70:
        if f2 & 0x01:
            r['filters'] = parse_filters(b)
        if f2 & 0x02:
            r['blend'] = b.u8()
        if f2 & 0x04:
            r['cache_as_bitmap'] = b.u8()
        if f2 & 0x20:
            r['visible'] = b.u8()
            r['background'] = b.rgba()
    return r


FILTER_NAMES = {0: 'dropshadow', 1: 'blur', 2: 'glow', 3: 'bevel', 4: 'gradientglow', 5: 'convolution', 6: 'colormatrix', 7: 'gradientbevel'}


def parse_filters(b):
    out = []
    for _ in range(b.u8()):
        fid = b.u8()
        f = {'type': FILTER_NAMES.get(fid, fid)}
        if fid == 0:
            f.update(color=b.rgba(), blur_x=b.u32() / 65536, blur_y=b.u32() / 65536, angle=b.u32() / 65536,
                     distance=b.u32() / 65536, strength=b.u16() / 256)
            fl = b.u8()
            f.update(inner=bool(fl & 0x80), knockout=bool(fl & 0x40), passes=fl & 0x1F)
        elif fid == 1:
            f.update(blur_x=b.u32() / 65536, blur_y=b.u32() / 65536, passes=b.u8() >> 3)
        elif fid == 2:
            f.update(color=b.rgba(), blur_x=b.u32() / 65536, blur_y=b.u32() / 65536, strength=b.u16() / 256)
            fl = b.u8()
            f.update(inner=bool(fl & 0x80), knockout=bool(fl & 0x40), passes=fl & 0x1F)
        elif fid == 3:
            f.update(shadow=b.rgba(), highlight=b.rgba(), blur_x=b.u32() / 65536, blur_y=b.u32() / 65536,
                     angle=b.u32() / 65536, distance=b.u32() / 65536, strength=b.u16() / 256, flags=b.u8())
        elif fid in (4, 7):
            n = b.u8()
            f['colors'] = [b.rgba() for _ in range(n)]
            f['ratios'] = [b.u8() for _ in range(n)]
            f.update(blur_x=b.u32() / 65536, blur_y=b.u32() / 65536, angle=b.u32() / 65536,
                     distance=b.u32() / 65536, strength=b.u16() / 256, flags=b.u8())
        elif fid == 5:
            mx, my = b.u8(), b.u8()
            f.update(divisor=b.f32(), bias=b.f32(), matrix=[b.f32() for _ in range(mx * my)], color=b.rgba(), flags=b.u8())
        elif fid == 6:
            f['matrix'] = [b.f32() for _ in range(20)]
        else:
            raise ValueError('filter %d' % fid)
        out.append(f)
    return out


def parse_sprite(data):
    sid, frames = struct.unpack_from('<HH', data, 0)
    tl = []
    cur = {'ops': [], 'labels': [], 'sounds': [], 'actions': False}
    for code, t in iter_tags(data, 4):
        if code == 1:
            tl.append(cur)
            cur = {'ops': [], 'labels': [], 'sounds': [], 'actions': False}
        elif code in (4, 26, 70):
            cur['ops'].append(('place', parse_place(code, t)))
        elif code == 5:
            cur['ops'].append(('remove', {'depth': struct.unpack_from('<H', t, 2)[0]}))
        elif code == 28:
            cur['ops'].append(('remove', {'depth': struct.unpack_from('<H', t, 0)[0]}))
        elif code == 43:
            cur['labels'].append(t.split(b'\0')[0].decode('utf-8', 'replace'))
        elif code == 15:
            cur['sounds'].append(struct.unpack_from('<H', t, 0)[0])
        elif code in (12, 59):
            cur['actions'] = True
        elif code in (18, 19, 45):
            cur['sounds'].append('stream')
    if cur['ops'] or cur['labels']:
        tl.append(cur)
    return {'id': sid, 'frame_count': frames, 'frames': tl}


def symbol_classes(tags):
    out = {}
    for code, t in tags:
        if code in (76, 56):
            b = Bits(t)
            for _ in range(b.u16()):
                cid = b.u16()
                out[b.cstr()] = cid
    return out


class Movie:
    def __init__(self, path):
        m = load(path)
        self.path = path
        self.__dict__.update({k: v for k, v in m.items() if k != 'tags'})
        self.tags = m['tags']
        self.chars = {}
        self.jpeg_tables = None
        self.unsupported = {}
        self.sounds = {}
        for code, t in self.tags:
            if code == 8:
                self.jpeg_tables = t
            elif code in SHAPE_TAGS or code in BITMAP_TAGS or code in MORPH_TAGS or code in TEXT_TAGS \
                    or code in BUTTON_TAGS or code in FONT_TAGS or code == 39:
                self.chars[struct.unpack_from('<H', t, 0)[0]] = (code, t)
            elif code == 14:
                self.sounds[struct.unpack_from('<H', t, 0)[0]] = t
        self.symbols = symbol_classes(self.tags)
        self._cache = {}

    def char(self, cid):
        if cid in self._cache:
            return self._cache[cid]
        code, t = self.chars[cid]
        if code in SHAPE_TAGS:
            v = ('shape', parse_shape(code, t))
        elif code == 39:
            v = ('sprite', parse_sprite(t))
        elif code in BITMAP_TAGS:
            v = ('bitmap', (code, t))
        elif code in MORPH_TAGS:
            v = ('morph', t)
        elif code in TEXT_TAGS:
            v = ('text', (code, t))
        elif code in BUTTON_TAGS:
            v = ('button', (code, t))
        else:
            v = ('font', t)
        self._cache[cid] = v
        return v


def _morph_gradient(b):
    b.align()
    n = b.u8()
    spread, interp, count = n >> 6, (n >> 4) & 3, n & 15
    s, e = [], []
    for _ in range(count):
        s.append((b.u8(), b.rgba()))
        e.append((b.u8(), b.rgba()))
    return spread, interp, s, e


def _morph_fill(b):
    t = b.u8()
    if t == 0x00:
        return {'type': 'solid', 'color': b.rgba()}, {'type': 'solid', 'color': b.rgba()}
    if t in (0x10, 0x12, 0x13):
        ms, me = b.matrix(), b.matrix()
        spread, interp, s, e = _morph_gradient(b)
        fs = fe = 0.0
        if t == 0x13:
            fs, fe = b.s16() / 256.0, b.s16() / 256.0
        kind = {0x10: 'linear', 0x12: 'radial', 0x13: 'focal'}[t]
        return ({'type': kind, 'matrix': ms, 'spread': spread, 'interp': interp, 'stops': s, 'focal': fs},
                {'type': kind, 'matrix': me, 'spread': spread, 'interp': interp, 'stops': e, 'focal': fe})
    if t in (0x40, 0x41, 0x42, 0x43):
        bid = b.u16()
        ms, me = b.matrix(), b.matrix()
        common = {'type': 'bitmap', 'bitmap': bid, 'repeat': t in (0x40, 0x42), 'smooth': t in (0x40, 0x41)}
        return dict(common, matrix=ms), dict(common, matrix=me)
    raise ValueError('morph fill 0x%02x' % t)


def _shape_records(b, nf, nl, fills_cb=None):
    """Yields ('style', f0, f1, ln, moveto|None) and ('edge', dx..) records with absolute coordinates."""
    x = y = 0
    out = []
    while True:
        if b.ub(1) == 0:
            flags = b.ub(5)
            if flags == 0:
                break
            mv = None
            f0 = f1 = ln = None
            if flags & 1:
                n = b.ub(5)
                x, y = b.sb(n), b.sb(n)
                mv = (x, y)
            if flags & 2:
                f0 = b.ub(nf)
            if flags & 4:
                f1 = b.ub(nf)
            if flags & 8:
                ln = b.ub(nl)
            if flags & 16:
                raise ValueError('new styles inside morph shape')
            out.append(('style', f0, f1, ln, mv))
        elif b.ub(1):
            n = b.ub(4) + 2
            if b.ub(1):
                dx, dy = b.sb(n), b.sb(n)
            elif b.ub(1):
                dx, dy = 0, b.sb(n)
            else:
                dx, dy = b.sb(n), 0
            out.append(('edge', x, y, None, None, x + dx, y + dy))
            x, y = x + dx, y + dy
        else:
            n = b.ub(4) + 2
            cx, cy = x + b.sb(n), y + b.sb(n)
            ax, ay = cx + b.sb(n), cy + b.sb(n)
            out.append(('edge', x, y, cx, cy, ax, ay))
            x, y = ax, ay
    return out


def parse_morph(code, data):
    """Returns start/end style lists and paired edges for DefineMorphShape(2)."""
    b = Bits(data)
    mid = b.u16()
    sb_, eb_ = b.rect(), b.rect()
    if code == 84:
        b.rect()
        b.rect()
        b.u8()
    offset = b.u32()
    end_pos = b.pos + offset
    n = b.u8()
    if n == 0xFF:
        n = b.u16()
    fills = [_morph_fill(b) for _ in range(n)]
    n = b.u8()
    if n == 0xFF:
        n = b.u16()
    lines = []
    for _ in range(n):
        ws, we = b.u16(), b.u16()
        if code == 46:
            cs, ce = b.rgba(), b.rgba()
        else:
            b.align()
            b.ub(2)
            join = b.ub(2)
            has_fill = b.ub(1)
            b.ub(11)
            if join == 2:
                b.u16()
            if has_fill:
                fs, fe = _morph_fill(b)
                cs = fs.get('color', (0, 0, 0, 255))
                ce = fe.get('color', (0, 0, 0, 255))
            else:
                cs, ce = b.rgba(), b.rgba()
        lines.append(({'width': ws, 'color': cs, 'cap': 0, 'join': 0}, {'width': we, 'color': ce, 'cap': 0, 'join': 0}))
    b.align()
    nf, nl = b.ub(4), b.ub(4)
    start = _shape_records(b, nf, nl)
    e = Bits(data, end_pos)
    e.align()
    enf, enl = e.ub(4), e.ub(4)
    end = _shape_records(e, enf, enl)
    return {'id': mid, 'bounds': (sb_, eb_), 'fills': fills, 'lines': lines, 'start': start, 'end': end}


def _lerp(a, b, t):
    return a + (b - a) * t


def _lerp_matrix(a, b, t):
    return tuple(_lerp(x, y, t) for x, y in zip(a, b))


def _lerp_color(a, b, t):
    return tuple(int(round(_lerp(x, y, t))) for x, y in zip(a, b))


def morph_at(m, ratio):
    """Interpolates a parsed morph shape into the parse_shape() structure at ratio 0..65535."""
    t = ratio / 65535.0
    fills = []
    for s, e in m['fills']:
        f = dict(s)
        if s['type'] == 'solid':
            f['color'] = _lerp_color(s['color'], e['color'], t)
        else:
            f['matrix'] = _lerp_matrix(s['matrix'], e['matrix'], t)
            if 'stops' in s:
                f['stops'] = [(int(round(_lerp(a[0], b[0], t))), _lerp_color(a[1], b[1], t)) for a, b in zip(s['stops'], e['stops'])]
                f['focal'] = _lerp(s['focal'], e['focal'], t)
        fills.append(f)
    lines = [{'width': _lerp(s['width'], e['width'], t), 'color': _lerp_color(s['color'], e['color'], t), 'cap': 0, 'join': 0}
             for s, e in m['lines']]
    end_edges = [r for r in m['end'] if r[0] == 'edge']
    edges = []
    f0 = f1 = ln = 0
    k = 0
    for r in m['start']:
        if r[0] == 'style':
            if r[1] is not None:
                f0 = r[1]
            if r[2] is not None:
                f1 = r[2]
            if r[3] is not None:
                ln = r[3]
            continue
        if k >= len(end_edges):
            break
        a, b = r[1:], end_edges[k][1:]
        k += 1
        if a[2] is None and b[2] is not None:
            a = (a[0], a[1], (a[0] + a[4]) / 2, (a[1] + a[5]) / 2, a[4], a[5])
        if b[2] is None and a[2] is not None:
            b = (b[0], b[1], (b[0] + b[4]) / 2, (b[1] + b[5]) / 2, b[4], b[5])
        if a[2] is None:
            p = [_lerp(a[i], b[i], t) for i in (0, 1, 4, 5)]
            edges.append((f0, f1, ln, p[0], p[1], None, None, p[2], p[3]))
        else:
            p = [_lerp(a[i], b[i], t) for i in range(6)]
            edges.append((f0, f1, ln, p[0], p[1], p[2], p[3], p[4], p[5]))
    # Interpolated endpoints of consecutive edges must chain exactly for contour building.
    fixed = []
    for i, ed in enumerate(edges):
        if fixed and abs(fixed[-1][7] - ed[3]) < 1e-6 and abs(fixed[-1][8] - ed[4]) < 1e-6:
            ed = ed[:3] + (fixed[-1][7], fixed[-1][8]) + ed[5:]
        fixed.append(ed)
    sb_, eb_ = m['bounds']
    bounds = [_lerp(x, y, t) for x, y in zip(sb_, eb_)]
    return {'id': m['id'], 'bounds': bounds, 'groups': [{'fills': fills, 'lines': lines, 'edges': fixed}], 'winding': False}


def parse_edit_text(data):
    b = Bits(data)
    cid = b.u16()
    bounds = b.rect()
    f1, f2 = b.u8(), b.u8()
    r = {'id': cid, 'bounds': bounds, 'word_wrap': bool(f1 & 0x40), 'multiline': bool(f1 & 0x20),
         'read_only': bool(f1 & 0x08), 'auto_size': bool(f2 & 0x40), 'html': bool(f2 & 0x02), 'use_outlines': bool(f2 & 0x01),
         'font': None, 'height': None, 'color': (0, 0, 0, 255), 'align': 0, 'left_margin': 0, 'right_margin': 0,
         'indent': 0, 'leading': 0, 'variable': '', 'text': ''}
    if f1 & 0x01:
        r['font'] = b.u16()
    if f2 & 0x80:
        r['font_class'] = b.cstr()
    if f1 & 0x01 or f2 & 0x80:
        r['height'] = b.u16()
    if f1 & 0x04:
        r['color'] = b.rgba()
    if f1 & 0x02:
        r['max_length'] = b.u16()
    if f2 & 0x20:
        r['align'] = b.u8()
        r['left_margin'], r['right_margin'], r['indent'] = b.u16(), b.u16(), b.u16()
        r['leading'] = b.s16()
    r['variable'] = b.cstr()
    if f1 & 0x80:
        r['text'] = b.cstr()
    return r


def parse_static_text(code, data):
    b = Bits(data)
    cid = b.u16()
    bounds = b.rect()
    matrix = b.matrix()
    gbits, abits = b.u8(), b.u8()
    records = []
    font = None
    color = (0, 0, 0, 255)
    x = y = 0
    height = 0
    while True:
        b.align()
        flags = b.u8()
        if flags == 0:
            break
        if flags & 0x08:
            font = b.u16()
        if flags & 0x04:
            color = b.rgba() if code == 33 else b.rgb()
        if flags & 0x01:
            x = b.s16()
        if flags & 0x02:
            y = b.s16()
        if flags & 0x08:
            height = b.u16()
        n = b.u8()
        glyphs = []
        for _ in range(n):
            gi, adv = b.ub(gbits), b.sb(abits)
            glyphs.append((gi, x))
            x += adv
        records.append({'font': font, 'color': color, 'height': height, 'y': y, 'glyphs': glyphs})
    return {'id': cid, 'bounds': bounds, 'matrix': matrix, 'records': records}
