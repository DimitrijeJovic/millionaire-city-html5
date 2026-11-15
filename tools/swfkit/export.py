"""Exports SWF symbols to per-frame SVG inside one HTML page plus metadata, ready for rasterize.py.

Usage: python -I export.py <file.swf> <out_dir> <symbol> [<symbol> ...]
Writes <out_dir>/<symbol>.html, <out_dir>/<symbol>.json and <out_dir>/bitmaps/<swf>_<id>.png."""
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bitmaps  # noqa: E402
import svgexport  # noqa: E402
import swfparse  # noqa: E402

PAD_PX = 24
FRAMES_PER_PAGE = 40


def transform_rect(m, r):
    x0, x1, y0, y1 = r
    pts = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
    xs = [m[0] * x + m[2] * y + m[4] for x, y in pts]
    ys = [m[1] * x + m[3] * y + m[5] for x, y in pts]
    return [min(xs), max(xs), min(ys), max(ys)]


def union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return [min(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), max(a[3], b[3])]


def char_bounds(r, cid, frame, m):
    kind, v = r.m.char(cid)
    if kind == 'shape':
        return transform_rect(m, v['bounds'])
    if kind == 'morph':
        p = swfparse.parse_morph(r.m.chars[cid][0], r.m.chars[cid][1])
        return transform_rect(m, union(list(p['bounds'][0]), list(p['bounds'][1])))
    if kind == 'bitmap':
        w, h = r.bitmap_size(cid)
        return transform_rect(m, [0, w * 20, 0, h * 20])
    if kind == 'text':
        b = swfparse.Bits(v[1], 2)
        return transform_rect(m, b.rect())
    if kind != 'sprite':
        return None
    out = None
    for depth, e in r.display_list(v, frame).items():
        kind2, v2 = r.m.char(e['char'])
        f = e['age'] % max(1, v2['frame_count']) if kind2 == 'sprite' and not r.frozen_children else 0
        out = union(out, char_bounds(r, e['char'], f, svgexport.mat_mul(m, e['matrix'])))
    return out


def path_bounds(r, sprite, path):
    """Bounds in px of the named instance path inside a sprite's first frame (also for invisible shapes)."""
    m = swfparse.IDENTITY
    cur = sprite
    entry = None
    for name in path.split('/'):
        entry = next((e for e in r.display_list(cur, 0).values() if e.get('name') == name), None)
        if entry is None:
            return None
        m = svgexport.mat_mul(m, entry['matrix'])
        kind, cur = r.m.char(entry['char'])
        if kind != 'sprite':
            break
    b = char_bounds(r, entry['char'], 0, m)
    return [b[0] / 20, b[2] / 20, (b[1] - b[0]) / 20, (b[3] - b[2]) / 20] if b else None


class Exporter:
    def __init__(self, swf_path, out_dir, frozen_children=False):
        self.movie = swfparse.Movie(swf_path)
        self.out_dir = out_dir
        self.swf_name = os.path.splitext(os.path.basename(swf_path))[0]
        self.bitmap_dir = os.path.join(out_dir, 'bitmaps')
        self.bitmap_info = {}
        self.renderer = svgexport.Renderer(self.movie, self.bitmap_size, self.bitmap_href, frozen_children)

    def _bitmap(self, cid):
        if cid not in self.bitmap_info:
            if cid not in self.movie.chars or self.movie.chars[cid][0] not in swfparse.BITMAP_TAGS:
                self.bitmap_info[cid] = None
                return None
            code, t = self.movie.chars[cid]
            img, src_fmt = bitmaps.decode(code, t, self.movie.jpeg_tables)
            os.makedirs(self.bitmap_dir, exist_ok=True)
            name = '%s_%d.png' % (self.swf_name, cid)
            path = os.path.join(self.bitmap_dir, name)
            img.save(path, optimize=True)
            self.bitmap_info[cid] = {'file': 'bitmaps/' + name, 'size': img.size, 'format': src_fmt,
                                     'sha256': hashlib.sha256(open(path, 'rb').read()).hexdigest()}
        return self.bitmap_info[cid]

    def bitmap_size(self, cid):
        b = self._bitmap(cid)
        return tuple(b['size']) if b else None

    def bitmap_href(self, cid):
        return self._bitmap(cid)['file']

    def export(self, symbol, layers=False, explode=()):
        """Exports every timeline frame, or with layers=True every top-level child of frame 0 as its own
        'frame' on a shared canvas (named by instance name), so a UI can show and hide parts."""
        cid = self.movie.symbols[symbol]
        kind, sprite = self.movie.char(cid)
        layer_list = []
        if layers:
            # Each layer: (target path, frame overrides, excluded subtrees, name). `explode` entries such as
            # "name_city/arrow_down_red@2" become their own layers and are removed from their parent layer.
            dl = self.renderer.display_list(sprite, 0)
            exploded = []
            for spec in explode:
                path, _, frame = spec.partition('@')
                exploded.append((path, int(frame) - 1 if frame else None, spec))
            ex_paths = sorted({p for p, _, _ in exploded})
            for d in sorted(dl):
                if 'clip_depth' in dl[d]:
                    continue
                name = dl[d].get('name') or '#%d' % dl[d]['char']
                layer_list.append((name, {}, tuple(x for x in ex_paths if x.startswith(name + '/')), name))
            for path, frame, spec in exploded:
                layer_list.append((path, {path: frame} if frame is not None else {},
                                   tuple(x for x in ex_paths if x.startswith(path + '/')), spec))
            count = len(layer_list)
        elif kind == 'sprite':
            count = max(1, sprite['frame_count'])
        else:
            count = 1
        frames_svg = []
        bounds = None
        stats = []
        text_fields = []
        for f in range(count):
            self.renderer.text_fields = []
            doc = svgexport.Doc(self.bitmap_href, 'f%d_' % f)
            if layers:
                target, overrides, excluded, _ = layer_list[f]
                self.renderer.target, self.renderer.frame_override, self.renderer.exclude = target, overrides, excluded
                body = self.renderer.sprite_frame_svg(doc, sprite, 0, svgexport.IDENT_CX, swfparse.IDENTITY)
                self.renderer.target, self.renderer.frame_override, self.renderer.exclude = None, {}, ()
            elif kind == 'sprite':
                body = self.renderer.sprite_frame_svg(doc, sprite, f, svgexport.IDENT_CX, swfparse.IDENTITY)
            else:
                body = self.renderer.char_svg(doc, cid, 0, svgexport.IDENT_CX, swfparse.IDENTITY)
            b = char_bounds(self.renderer, cid, 0 if layers else f, swfparse.IDENTITY)
            bounds = union(bounds, b)
            frames_svg.append((doc, body))
            if layers:
                text_fields += [dict(t, layer=layer_list[f][3]) for t in self.renderer.text_fields]
            elif f == 0:
                text_fields = self.renderer.text_fields
            stats.append(doc.stats)
        if bounds is None:
            bounds = [0, 20, 0, 20]
        x0 = int(bounds[0] // 20) - PAD_PX
        y0 = int(bounds[2] // 20) - PAD_PX
        w = int(-(-bounds[1] // 20)) + PAD_PX - x0
        h = int(-(-bounds[3] // 20)) + PAD_PX - y0
        svgs = [svgexport.document(doc, body, (x0, y0, w, h)) for doc, body in frames_svg]
        labels, sounds = {}, {}
        if kind == 'sprite':
            for i, fr in enumerate(sprite['frames']):
                for lb in fr['labels']:
                    labels[lb] = i
                if fr['sounds']:
                    sounds[i] = [s if isinstance(s, str) else int(s) for s in fr['sounds']]
        # Large animations are split over several pages so the headless browser keeps memory bounded.
        os.makedirs(self.out_dir, exist_ok=True)
        parts = []
        for start in range(0, len(svgs), FRAMES_PER_PAGE):
            name = symbol + ('.html' if start == 0 else '.part%d.html' % (start // FRAMES_PER_PAGE))
            html = ['<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}'
                    'svg{position:absolute;left:0;top:0;display:none}</style></head><body>']
            for i, svg in enumerate(svgs[start:start + FRAMES_PER_PAGE], start):
                html.append(svg.replace('<svg ', '<svg id="f%d" ' % i, 1))
            html.append('<script>window.show=function(i){for(const e of document.querySelectorAll("svg[id^=f]"))'
                        'e.style.display=e.id==="f"+i?"block":"none";};</script></body></html>')
            open(os.path.join(self.out_dir, name), 'w', encoding='utf-8').write(''.join(html))
            parts.append([start, min(FRAMES_PER_PAGE, len(svgs) - start), name])
        skipped = {}
        for s in stats:
            for k, v in s['filters_skipped'].items():
                skipped[k] = skipped.get(k, 0) + v
        meta = {'swf': self.swf_name, 'symbol': symbol, 'char': cid, 'frames': count, 'frame_rate_declared': self.movie.frame_rate,
                'origin_px': [-x0, -y0], 'canvas_px': [w, h], 'labels': labels, 'sounds': sounds,
                'skipped': {'filters': skipped, 'text': sum(s['text_skipped'] for s in stats),
                            'buttons': sum(s['button_skipped'] for s in stats)},
                'bitmaps': {str(k): v for k, v in self.bitmap_info.items() if v},
                'text_fields': text_fields, 'pages': parts, 'layers': [lay[3] for lay in layer_list],
                'layer_bounds_px': {lay[3]: path_bounds(self.renderer, sprite, lay[0]) for lay in layer_list} if layers else {}}
        json.dump(meta, open(os.path.join(self.out_dir, symbol + '.json'), 'w'), indent=1)
        return meta


if __name__ == '__main__':
    ex = Exporter(sys.argv[1], sys.argv[2])
    for sym in sys.argv[3:]:
        meta = ex.export(sym)
        print(sym, meta['frames'], meta['canvas_px'], meta['origin_px'], meta['skipped'])
