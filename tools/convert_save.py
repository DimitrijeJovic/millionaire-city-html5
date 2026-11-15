"""Converts a COPY of the original server database into the client's city fixture (read-only on the copy).

Usage: python -I tools/convert_save.py <copied mcity.sqlite> <out city.json>
Refuses to open a database inside an installation's generated/data folder."""
import json
import os
import sqlite3
import sys

src, out = os.path.abspath(sys.argv[1]), sys.argv[2]
if os.sep.join(['generated', 'data']) in src:
    raise SystemExit('refusing to read a live installation database; copy it first')
con = sqlite3.connect('file:%s?mode=ro' % src.replace(os.sep, '/'), uri=True)
doc = json.loads(con.execute("select json from save_documents where tag='universe'").fetchone()[0])['universe']
profile_el = next(x for x in doc if 'Profile' in x)
world = next(x for x in doc if 'World' in x)['World']
own = next(el for el in world if el.get('whose') == '0')
map_el = next(el for el in world if 'Map' in el)['Map']


def chunk(tag):
    for el in map_el:
        if tag in el:
            return [tuple(int(v) for v in p.split(':')) for p in el['chunk'].split(',') if p]
    return []


def missions(tag):
    for el in profile_el['Profile'][0]['Missions']:
        if tag in el:
            return [int(v) for v in el['chunk'].split(',') if v]
    return []


def poll_counts():
    out = {}
    for group in profile_el['Profile']:
        for el in group.get('PollManager', []):
            for part in el.get('chunk', '').split(','):
                key, _, value = part.rpartition('/')
                if key and value.lstrip('-').isdigit():
                    out[key] = int(value)
    return out


items = []
for c in own.get('Company', []):
    it = c['Item'][0]
    items.append({'sid': int(c['sid']), 'sku': c['sku'], 'x': int(c['x']), 'y': int(c['y']),
                  'state': {k: v for k, v in it.items() if k != 'State'}})
fan_row = con.execute("select json from save_documents where tag='fan'").fetchone()
fan = json.loads(fan_row[0]).get('value', '0') if fan_row else '0'
city = {
    'format': 'mcity-html5-city/1',
    'source': {'file': os.path.basename(src), 'tag': 'universe'},
    # Assumption: a fan document value other than "0" means the player is a fan (unlockCondition "fan").
    'profile': dict({k: profile_el[k] for k in ('exp', 'DCCoins', 'DCCash', 'cityname', 'companyValue', 'tutorialEnd', 'planeSku', 'userName')},
                    isFan='0' if fan in ('', '0') else '1'),
    'missions': {'up': missions('Up'), 'reached': missions('Reached'), 'given': missions('Given')},
    'pollCounts': poll_counts(),
    'hqLevel': int(own.get('HQLevel', 0)),
    'items': items,
    'roads': chunk('Road'),
    'terrain': chunk('Terrain'),
}
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
json.dump(city, open(out, 'w'), indent=1)
print('items', len(items), 'roads', len(city['roads']), 'terrain', len(city['terrain']))
