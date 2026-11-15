"""Builds public/assets/locale/en.json ({TID: text}) from the client's TextIDs constants and Locale/EN.txt.

Usage: python -I tools/extract_locale.py <Dollars.swf> <EN.txt> <out.json>"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'swfkit'))
import avm2  # noqa: E402
import swfparse  # noqa: E402

swf, txt, out = sys.argv[1:4]
m = swfparse.load(swf)
abc = b''.join(t[4:][t[4:].index(0) + 1:] if c == 82 else t for c, t in m['tags'] if c in (72, 82))
ids = {k: v for k, v in avm2.ABC(abc).consts['TextIDs'].items() if isinstance(v, int)}
lines = open(txt, encoding='utf-8').read().split('\n')
texts = {tid: lines[i].replace('\n', '\n') for tid, i in ids.items() if i < len(lines)}
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
json.dump(texts, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
print('ids', len(ids), 'lines', len(lines), 'mapped', len(texts))
for k in ('TID_BUILDING_HQ', 'TID_BUILDING_HOUSE_01', 'TID_BUILDING_COMMERCE_01', 'TID_BUILDING_DECORATION_04'):
    print(k, repr(texts.get(k)))
