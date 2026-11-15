"""Prints the exported symbols of SWFs and the character tree under each one.

Usage: python -I inspect_symbols.py <file.swf> [symbol-substring ...]"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import swfparse  # noqa: E402


def walk(m, cid, depth, seen):
    kind, v = m.char(cid)
    line = '  ' * depth + '#%d %s' % (cid, kind)
    if kind == 'shape':
        line += ' bounds=%s fills=%s' % ([x / 20 for x in v['bounds']], sorted({f['type'] for g in v['groups'] for f in g['fills']}))
    if kind != 'sprite':
        print(line)
        return
    places = [d for f in v['frames'] for op, d in f['ops'] if op == 'place']
    labels = [lb for f in v['frames'] for lb in f['labels']]
    line += ' frames=%d labels=%s filters=%d masks=%d sounds=%d' % (
        v['frame_count'], labels[:8], sum(1 for d in places if 'filters' in d),
        sum(1 for d in places if 'clip_depth' in d), sum(len(f['sounds']) for f in v['frames']))
    print(line)
    if cid in seen or depth > 6:
        return
    seen.add(cid)
    for k in sorted({d['char'] for d in places if 'char' in d}):
        walk(m, k, depth + 1, seen)


m = swfparse.Movie(sys.argv[1])
print('== %s rate=%g symbols=%s' % (os.path.basename(sys.argv[1]), m.frame_rate, m.symbols))
for name, cid in m.symbols.items():
    if len(sys.argv) == 2 or any(s in name for s in sys.argv[2:]):
        print('-- symbol', name)
        walk(m, cid, 0, set())
