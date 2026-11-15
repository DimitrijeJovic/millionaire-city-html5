"""Renders SWF characters (shapes, morph shapes, sprite frames) to SVG markup.

Coordinates stay in twips inside the document; the root group scales by 1/20. Color transforms are
composed down to the leaves and applied to fill colors directly, as Flash does per display object.
Bitmaps are referenced as external PNG files written by the caller."""
import math

import fonts
import swfparse

IDENT_CX = swfparse.NO_CX


def mat_mul(p, c):
    """Returns parent * child for (a, b, c, d, tx, ty) affine matrices."""
    a1, b1, c1, d1, x1, y1 = p
    a2, b2, c2, d2, x2, y2 = c
    return (a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
            a1 * x2 + c1 * y2 + x1, b1 * x2 + d1 * y2 + y1)


def cx_mul(parent, child):
    """Composes color transforms: child is applied first, then parent."""
    pm, pa = parent
    cm, ca = child
    return (tuple(pm[i] * cm[i] for i in range(4)), tuple(pa[i] + pm[i] * ca[i] for i in range(4)))


def cx_apply(cx, color):
    m, a = cx
    return tuple(max(0, min(255, int(round(color[i] * m[i] + a[i])))) for i in range(4))


def cx_is_identity(cx):
    m, a = cx
    return all(abs(x - 1) < 1e-9 for x in m) and not any(a)


def fmt(v):
    if isinstance(v, float):
        s = ('%.4f' % v).rstrip('0').rstrip('.')
        return s if s not in ('-0', '') else '0'
    return str(v)


def mat_attr(m):
    return 'matrix(%s)' % ' '.join(('%.7f' % float(x)).rstrip('0').rstrip('.') or '0' for x in m)


def hexcolor(c):
    return '#%02x%02x%02x' % c[:3]


def _key(x, y):
    return (round(x, 3), round(y, 3))


def build_contours(segs):
    """Chains directed segments (x0, y0, cx, cy, x1, y1) into closed contours."""
    by_start = {}
    for i, s in enumerate(segs):
        by_start.setdefault(_key(s[0], s[1]), []).append(i)
    used = [False] * len(segs)
    contours = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        path = [segs[i]]
        start = _key(segs[i][0], segs[i][1])
        cur = _key(segs[i][4], segs[i][5])
        while cur != start:
            nxt = None
            for j in by_start.get(cur, ()):
                if not used[j]:
                    nxt = j
                    break
            if nxt is None:
                break
            used[nxt] = True
            path.append(segs[nxt])
            cur = _key(segs[nxt][4], segs[nxt][5])
        contours.append(path)
    return contours


def path_data(contours, close=True):
    out = []
    for c in contours:
        out.append('M%s %s' % (fmt(float(c[0][0])), fmt(float(c[0][1]))))
        px, py = c[0][0], c[0][1]
        for s in c:
            if _key(s[0], s[1]) != _key(px, py):
                out.append('M%s %s' % (fmt(float(s[0])), fmt(float(s[1]))))
            if s[2] is None:
                out.append('L%s %s' % (fmt(float(s[4])), fmt(float(s[5]))))
            else:
                out.append('Q%s %s %s %s' % tuple(fmt(float(v)) for v in s[2:6]))
            px, py = s[4], s[5]
        if close:
            out.append('Z')
    return ''.join(out)


class Doc:
    """Collects <defs> for one SVG document."""

    def __init__(self, bitmap_href, prefix=''):
        self.prefix = prefix
        self.defs = []
        self.ids = {}
        self.bitmap_href = bitmap_href
        self.stats = {'filters_skipped': {}, 'text_skipped': 0, 'button_skipped': 0, 'blend_modes': {}}

    def uid(self, prefix, key):
        k = (prefix, key)
        if k not in self.ids:
            self.ids[k] = '%s%s%d' % (self.prefix, prefix, len(self.ids))
            return self.ids[k], True
        return self.ids[k], False

    def gradient(self, f, cx):
        stops = tuple((r, cx_apply(cx, c)) for r, c in f['stops'])
        key = (f['type'], f['matrix'], f['spread'], f['interp'], stops, f.get('focal', 0))
        gid, new = self.uid('g', key)
        if new:
            spread = ['pad', 'reflect', 'repeat'][min(f['spread'], 2)]
            interp = ' color-interpolation="linearRGB"' if f['interp'] == 1 else ''
            st = ''.join('<stop offset="%s" stop-color="%s"%s/>' % (
                fmt(r / 255.0), hexcolor(c), '' if c[3] == 255 else ' stop-opacity="%s"' % fmt(c[3] / 255.0)) for r, c in stops)
            common = 'id="%s" gradientUnits="userSpaceOnUse" gradientTransform="%s" spreadMethod="%s"%s' % (
                gid, mat_attr(f['matrix']), spread, interp)
            if f['type'] == 'linear':
                self.defs.append('<linearGradient %s x1="-16384" y1="0" x2="16384" y2="0">%s</linearGradient>' % (common, st))
            else:
                fx = ' fx="%s" fy="0"' % fmt(f['focal'] * 16384) if f['type'] == 'focal' else ''
                self.defs.append('<radialGradient %s cx="0" cy="0" r="16384"%s>%s</radialGradient>' % (common, fx, st))
        return gid

    def pattern(self, f, size):
        key = (f['bitmap'], f['matrix'], f['smooth'])
        pid, new = self.uid('p', key)
        if new:
            w, h = size
            rendering = '' if f['smooth'] else ' style="image-rendering:pixelated"'
            self.defs.append(
                '<pattern id="%s" patternUnits="userSpaceOnUse" width="%d" height="%d" patternTransform="%s">'
                '<image href="%s" width="%d" height="%d" preserveAspectRatio="none"%s/></pattern>' % (
                    pid, w, h, mat_attr(f['matrix']), self.bitmap_href(f['bitmap']), w, h, rendering))
        return pid

    def color_filter(self, cx):
        m, a = cx
        key = (m, a)
        fid, new = self.uid('c', key)
        if new:
            vals = '%s 0 0 0 %s 0 %s 0 0 %s 0 0 %s 0 %s 0 0 0 %s %s' % (
                fmt(m[0]), fmt(a[0] / 255.0), fmt(m[1]), fmt(a[1] / 255.0), fmt(m[2]), fmt(a[2] / 255.0), fmt(m[3]), fmt(a[3] / 255.0))
            self.defs.append('<filter id="%s" color-interpolation-filters="sRGB" x="-5%%" y="-5%%" width="110%%" height="110%%">'
                             '<feColorMatrix type="matrix" values="%s"/></filter>' % (fid, vals))
        return fid


class Renderer:
    def __init__(self, movie, bitmap_size, bitmap_href, frozen_children=False):
        # frozen_children mirrors BitmapDataFactory.generateAnimation: the client captures frames with
        # gotoAndStop in one synchronous loop, so nested clips never advance past their first frame.
        self.frozen_children = frozen_children
        self.m = movie
        self.fonts = {}
        self.target = None
        self.exclude = ()
        self.frame_override = {}
        self.path = []
        self.text_fields = []
        self.bitmap_size = bitmap_size
        self.bitmap_href = bitmap_href

    def shape_svg(self, doc, shape, cx):
        parts = []
        for g in shape['groups']:
            fills, lines = g['fills'], g['lines']
            for i, f in enumerate(fills, 1):
                segs = []
                for e in g['edges']:
                    f0, f1 = e[0], e[1]
                    if f1 == i:
                        segs.append((e[3], e[4], e[5], e[6], e[7], e[8]))
                    if f0 == i:
                        segs.append((e[7], e[8], e[5], e[6], e[3], e[4]))
                if not segs:
                    continue
                d = path_data(build_contours(segs))
                rule = 'nonzero' if shape.get('winding') else 'evenodd'
                if f['type'] == 'solid':
                    c = cx_apply(cx, f['color'])
                    if c[3] == 0:
                        continue
                    op = '' if c[3] == 255 else ' fill-opacity="%s"' % fmt(c[3] / 255.0)
                    parts.append('<path d="%s" fill="%s"%s fill-rule="%s"/>' % (d, hexcolor(c), op, rule))
                elif f['type'] in ('linear', 'radial', 'focal'):
                    parts.append('<path d="%s" fill="url(#%s)" fill-rule="%s"/>' % (d, doc.gradient(f, cx), rule))
                elif f['type'] == 'bitmap':
                    size = self.bitmap_size(f['bitmap'])
                    if size is None:
                        continue
                    flt = '' if cx_is_identity(cx) else ' filter="url(#%s)"' % doc.color_filter(cx)
                    parts.append('<path d="%s" fill="url(#%s)" fill-rule="%s"%s/>' % (d, doc.pattern(f, size), rule, flt))
            for i, ls in enumerate(lines, 1):
                segs = [(e[3], e[4], e[5], e[6], e[7], e[8]) for e in g['edges'] if e[2] == i]
                if not segs:
                    continue
                c = cx_apply(cx, ls['color'])
                if c[3] == 0:
                    continue
                d = path_data([segs], close=False)
                width = ls['width'] if ls['width'] > 0 else 20
                op = '' if c[3] == 255 else ' stroke-opacity="%s"' % fmt(c[3] / 255.0)
                cap = ['round', 'butt', 'square'][min(ls['cap'], 2)]
                join = ['round', 'bevel', 'miter'][min(ls['join'], 2)]
                parts.append('<path d="%s" fill="none" stroke="%s"%s stroke-width="%s" stroke-linecap="%s" stroke-linejoin="%s"/>' % (
                    d, hexcolor(c), op, fmt(float(width)), cap, join))
        return ''.join(parts)

    def char_svg(self, doc, cid, frame, cx, world):
        kind, v = self.m.char(cid)
        if kind == 'shape':
            return self.shape_svg(doc, v, cx)
        if kind == 'sprite':
            return self.sprite_frame_svg(doc, v, frame, cx, world)
        if kind == 'bitmap':
            size = self.bitmap_size(cid)
            return '<image href="%s" width="%d" height="%d" transform="scale(20)"/>' % (self.bitmap_href(cid), size[0], size[1])
        if kind == 'text':
            code, t = v
            if code == 37:
                self.record_edit_text(t, world, cx)
                return ''
            return self.static_text_svg(swfparse.parse_static_text(code, t), cx)
        if kind == 'button':
            doc.stats['button_skipped'] += 1
        return ''

    def font(self, fid):
        if fid not in self.fonts:
            code, t = self.m.chars[fid]
            self.fonts[fid] = fonts.parse_font(code, t) if code in (48, 75) else None
        return self.fonts[fid]

    def static_text_svg(self, st, cx):
        parts = []
        for rec in st['records']:
            f = self.font(rec['font']) if rec['font'] is not None else None
            if not f:
                continue
            k = rec['height'] / f['em']
            c = cx_apply(cx, rec['color'])
            d = []
            for gi, gx in rec['glyphs']:
                if gi >= len(f['glyphs']):
                    continue
                for contour in f['glyphs'][gi]:
                    for seg in contour:
                        if seg[0] == 'M':
                            d.append('M%s %s' % (fmt(gx + seg[1] * k), fmt(rec['y'] + seg[2] * k)))
                        elif seg[0] == 'L':
                            d.append('L%s %s' % (fmt(gx + seg[1] * k), fmt(rec['y'] + seg[2] * k)))
                        else:
                            d.append('Q%s %s %s %s' % (fmt(gx + seg[1] * k), fmt(rec['y'] + seg[2] * k), fmt(gx + seg[3] * k), fmt(rec['y'] + seg[4] * k)))
                    d.append('Z')
            if d:
                op = '' if c[3] == 255 else ' fill-opacity="%s"' % fmt(c[3] / 255.0)
                parts.append('<path d="%s" fill="%s"%s/>' % (''.join(d), hexcolor(c), op))
        if not parts:
            return ''
        return '<g transform="%s">%s</g>' % (mat_attr(st['matrix']), ''.join(parts))

    def record_edit_text(self, data, world, cx):
        et = swfparse.parse_edit_text(data)
        f = self.font(et['font']) if et['font'] is not None else None
        x0, x1, y0, y1 = et['bounds']
        pts = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
        xs = [world[0] * x + world[2] * y + world[4] for x, y in pts]
        ys = [world[1] * x + world[3] * y + world[5] for x, y in pts]
        self.text_fields.append({
            'path': '/'.join(self.path), 'variable': et['variable'], 'text': et['text'], 'html': et['html'],
            'box_px': [min(xs) / 20, min(ys) / 20, (max(xs) - min(xs)) / 20, (max(ys) - min(ys)) / 20],
            'scale': [math.hypot(world[0], world[1]), math.hypot(world[2], world[3])],
            'font': f['name'] if f else et.get('font_class'), 'font_id': et['font'], 'size_px': (et['height'] or 240) / 20,
            'color': '#%02x%02x%02x' % cx_apply(cx, et['color'])[:3], 'alpha': cx_apply(cx, et['color'])[3] / 255,
            'align': ['left', 'right', 'center', 'justify'][min(et['align'], 3)], 'multiline': et['multiline'],
            'word_wrap': et['word_wrap'], 'leading_px': et['leading'] / 20,
            'margins_px': [et['left_margin'] / 20, et['right_margin'] / 20], 'filters': [f_ for f_ in self.path_filters()],
        })
        # A rotated or skewed field keeps its unrotated bounds and world matrix so the client can draw it as Flash does.
        if abs(world[1]) > 1e-3 or abs(world[2]) > 1e-3:
            self.text_fields[-1]['local_px'] = [x0 / 20, y0 / 20, (x1 - x0) / 20, (y1 - y0) / 20]
            self.text_fields[-1]['matrix'] = [world[0], world[1], world[2], world[3], world[4] / 20, world[5] / 20]

    def path_filters(self):
        return list(getattr(self, '_filters', []))

    def morph_svg(self, doc, cid, ratio, cx):
        _, t = self.m.chars[cid]
        key = ('morph', cid)
        if key not in self.m._cache:
            self.m._cache[key] = swfparse.parse_morph(self.m.chars[cid][0], t)
        return self.shape_svg(doc, swfparse.morph_at(self.m._cache[key], ratio or 0), cx)

    def display_list(self, sprite, frame):
        """Display list after `frame` (0-based): depth -> entry with 'age' in frames."""
        dl = {}
        for i in range(min(frame + 1, len(sprite['frames']))):
            for op, d in sprite['frames'][i]['ops']:
                if op == 'remove':
                    dl.pop(d['depth'], None)
                    continue
                cur = dl.get(d['depth'])
                if cur is None or not d['move']:
                    if 'char' not in d:
                        continue
                    cur = {'char': d['char'], 'matrix': swfparse.IDENTITY, 'cxform': IDENT_CX, 'placed': i}
                    dl[d['depth']] = cur
                elif 'char' in d and d['char'] != cur['char']:
                    cur['char'] = d['char']
                    cur['placed'] = i
                for k in ('matrix', 'cxform', 'ratio', 'clip_depth', 'filters', 'blend', 'name', 'visible'):
                    if k in d and d[k] is not None:
                        cur[k] = d[k]
        return {k: dict(v, age=frame - v['placed']) for k, v in dl.items()}

    def sprite_frame_svg(self, doc, sprite, frame, cx, world, only_depth=None):
        dl = self.display_list(sprite, frame)
        if only_depth is not None:
            dl = {k: v for k, v in dl.items() if k == only_depth}
        out = []
        masks = []  # (clip_depth, mask_id, list of masked parts)
        for depth in sorted(dl):
            e = dl[depth]
            while masks and depth > masks[-1][0]:
                cd, mid, inner = masks.pop()
                (masks[-1][2] if masks else out).append('<g mask="url(#%s)">%s</g>' % (mid, ''.join(inner)))
            target = masks[-1][2] if masks else out
            if e.get('visible') == 0:
                continue
            if 'clip_depth' in e:
                # A mask clips whatever layer is being exported, so it is drawn whole, outside the layer filter.
                saved = self.target, self.exclude
                self.target, self.exclude = None, ()
                try:
                    part = self.entry_svg(doc, e, cx, world, as_mask=True)
                finally:
                    self.target, self.exclude = saved
            else:
                part = self.entry_svg(doc, e, cx, world)
            if 'clip_depth' in e:
                mid, _ = doc.uid('m', (id(sprite), frame, depth, len(doc.ids)))
                doc.defs.append('<mask id="%s" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">'
                                '<g filter="url(#%swhite)">%s</g></mask>' % (mid, doc.prefix, part))
                masks.append((e['clip_depth'], mid, []))
                continue
            target.append(part)
        while masks:
            cd, mid, inner = masks.pop()
            (masks[-1][2] if masks else out).append('<g mask="url(#%s)">%s</g>' % (mid, ''.join(inner)))
        return ''.join(out)

    def entry_svg(self, doc, e, cx, world, as_mask=False):
        m = e['matrix']
        w = mat_mul(world, m)
        kind, v = self.m.char(e['char'])
        filters = [] if as_mask else e.get('filters') or []
        blend = 0 if as_mask else e.get('blend', 0)
        own_cx = IDENT_CX if as_mask else e['cxform']
        if filters:
            inner_cx = IDENT_CX
        else:
            inner_cx = cx_mul(cx, own_cx)
        self.path.append(e.get('name') or '#%d' % e['char'])
        if not self.visible_path('/'.join(self.path)):
            self.path.pop()
            return ''
        self._filters = getattr(self, '_filters', [])
        pushed = 0
        for f in filters:
            self._filters.append({k: (list(v) if isinstance(v, tuple) else v) for k, v in f.items()})
            pushed += 1
        try:
            body = self._entry_body(doc, e, kind, v, inner_cx, w)
        finally:
            self.path.pop()
            for _ in range(pushed):
                self._filters.pop()
        if not body:
            return ''
        return self._entry_wrap(doc, e, m, w, body, filters, blend, cx, own_cx)

    def visible_path(self, p):
        """Layer export filter: keep the target's ancestors and descendants, drop excluded subtrees."""
        if self.target is None:
            return True
        t = self.target
        if not (p == t or t.startswith(p + '/') or p.startswith(t + '/')):
            return False
        return not any(p == x or p.startswith(x + '/') for x in self.exclude)

    def _entry_body(self, doc, e, kind, v, inner_cx, w):
        if kind == 'sprite':
            child_frame = 0 if self.frozen_children else e['age'] % max(1, v['frame_count'])
            child_frame = self.frame_override.get('/'.join(self.path), child_frame)
            body = self.sprite_frame_svg(doc, v, child_frame, inner_cx, w)
        elif kind == 'morph':
            body = self.morph_svg(doc, e['char'], e.get('ratio', 0), inner_cx)
        else:
            body = self.char_svg(doc, e['char'], 0, inner_cx, w)
        return body

    def _entry_wrap(self, doc, e, m, w, body, filters, blend, cx, own_cx):
        attrs = ''
        if blend > 1:
            mode = {2: 'normal', 3: 'multiply', 4: 'screen', 5: 'lighten', 6: 'darken', 7: 'difference',
                    8: 'plus-lighter', 9: 'normal', 12: 'overlay', 13: 'hard-light'}.get(blend, 'normal')
            doc.stats['blend_modes'][blend] = doc.stats['blend_modes'].get(blend, 0) + 1
            attrs += ' style="mix-blend-mode:%s"' % mode
        if filters:
            fid = self.filter_def(doc, filters, w)
            body = '<g filter="url(#%s)">%s</g>' % (fid, body) if fid else body
            total = cx_mul(cx, own_cx)
            if not cx_is_identity(total):
                body = '<g filter="url(#%s)">%s</g>' % (doc.color_filter(total), body)
        if m != swfparse.IDENTITY:
            attrs = ' transform="%s"' % mat_attr(m) + attrs
        return '<g%s>%s</g>' % (attrs, body) if attrs else body

    def filter_def(self, doc, filters, world):
        # Flash filters work in stage pixels and ignore the object's own scale.
        sx = math.hypot(world[0], world[1]) or 1.0
        sy = math.hypot(world[2], world[3]) or 1.0
        prims = []
        src = 'SourceGraphic'
        n = 0
        for f in filters:
            t = f['type']
            if t in ('glow', 'dropshadow', 'blur') and f.get('blur_x', 0) == 0 and f.get('blur_y', 0) == 0 and t == 'blur':
                continue
            sdx = _box_sigma(f.get('blur_x', 0), f.get('passes', 1)) * 20 / sx
            sdy = _box_sigma(f.get('blur_y', 0), f.get('passes', 1)) * 20 / sy
            if t == 'blur':
                prims.append('<feGaussianBlur in="%s" stdDeviation="%s %s" result="r%d"/>' % (src, fmt(sdx), fmt(sdy), n))
            elif t in ('glow', 'dropshadow'):
                c = f['color']
                dx = dy = 0.0
                if t == 'dropshadow':
                    dx = f['distance'] * math.cos(f['angle']) * 20 / sx
                    dy = f['distance'] * math.sin(f['angle']) * 20 / sy
                alpha_src = '%s' % src
                prims.append('<feGaussianBlur in="%s" stdDeviation="%s %s" result="b%d"/>' % (alpha_src, fmt(sdx), fmt(sdy), n))
                if dx or dy:
                    prims.append('<feOffset in="b%d" dx="%s" dy="%s" result="b%d"/>' % (n, fmt(dx), fmt(dy), n))
                if f.get('inner'):
                    prims.append('<feComposite in="SourceAlpha" in2="b%d" operator="out" result="b%d"/>' % (n, n))
                prims.append('<feComponentTransfer in="b%d" result="b%d"><feFuncA type="linear" slope="%s"/></feComponentTransfer>' % (
                    n, n, fmt(f['strength'])))
                prims.append('<feFlood flood-color="%s" flood-opacity="%s"/>' % (hexcolor(c), fmt(c[3] / 255.0)))
                prims.append('<feComposite in2="b%d" operator="in" result="g%d"/>' % (n, n))
                if f.get('inner'):
                    prims.append('<feComposite in="g%d" in2="SourceAlpha" operator="in" result="g%d"/>' % (n, n))
                    if f.get('knockout'):
                        prims.append('<feMerge result="r%d"><feMergeNode in="g%d"/></feMerge>' % (n, n))
                    else:
                        prims.append('<feMerge result="r%d"><feMergeNode in="%s"/><feMergeNode in="g%d"/></feMerge>' % (n, src, n))
                elif f.get('knockout'):
                    prims.append('<feComposite in="g%d" in2="SourceAlpha" operator="out" result="r%d"/>' % (n, n))
                else:
                    prims.append('<feMerge result="r%d"><feMergeNode in="g%d"/><feMergeNode in="%s"/></feMerge>' % (n, n, src))
            elif t == 'colormatrix':
                mm = list(f['matrix'])
                for k in (4, 9, 14, 19):
                    mm[k] /= 255.0
                prims.append('<feColorMatrix in="%s" type="matrix" values="%s" result="r%d"/>' % (src, ' '.join(fmt(x) for x in mm), n))
            else:
                doc.stats['filters_skipped'][t] = doc.stats['filters_skipped'].get(t, 0) + 1
                continue
            src = 'r%d' % n
            n += 1
        if not prims:
            return None
        key = tuple(prims)
        fid, new = doc.uid('f', key)
        if new:
            doc.defs.append('<filter id="%s" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" '
                            'x="-100000" y="-100000" width="200000" height="200000">%s</filter>' % (fid, ''.join(prims)))
        return fid


def _box_sigma(blur, passes):
    passes = max(1, passes or 1)
    if blur <= 1:
        return 0.0
    return math.sqrt(passes * (blur * blur - 1) / 12.0)


WHITE_FILTER = ('<filter id="%swhite" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" '
                'values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 255 0"/></filter>')


def document(doc, body, bounds_px, scale=1.0):
    """Wraps a twip-space body into an SVG whose viewBox is bounds_px = (x, y, w, h) in pixels."""
    x, y, w, h = bounds_px
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="%s" height="%s" viewBox="%s %s %s %s"><defs>%s%s</defs><g transform="scale(0.05)">%s</g></svg>' % (
                fmt(w * scale), fmt(h * scale), fmt(x), fmt(y), fmt(w), fmt(h), WHITE_FILTER % doc.prefix, ''.join(doc.defs), body))
