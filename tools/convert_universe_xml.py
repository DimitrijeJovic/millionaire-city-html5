"""Converts an original offline universe file (Datas/userData/universe*.xml) into the client's city format.

The original client reads these files in its offline mode (UserDataFacadeOffline.requestTask): the boss NPC (Sheik)
gets universeAdvisorCity1_AbuDabhi.xml and the other NPCs universeAdvisorCity.xml. The source is only read.

Usage: python -I tools/convert_universe_xml.py <universe.xml> <out city.json>"""
import json
import os
import sys
import xml.etree.ElementTree as ET

src, out = os.path.abspath(sys.argv[1]), sys.argv[2]
root = ET.parse(src).getroot()
profile = root.find('Profile')
world = root.find('World')
own = next(c for c in world.findall('Company') if c.get('whose') == '0')
map_el = world.find('Map')


def pairs(tag):
    out = []
    for el in map_el.findall(tag):
        out += [tuple(int(v) for v in p.split(':')) for p in el.get('chunk', '').split(',') if p]
    return out


def missions(tag):
    el = profile.find('Missions/' + tag)
    return [int(v) for v in (el.get('chunk', '') if el is not None else '').split(',') if v]


counts = {}
for el in profile.findall('PollManager/Count'):
    for part in el.get('chunk', '').split(','):
        key, _, value = part.rpartition('/')
        if key and value.lstrip('-').isdigit():
            counts[key] = int(value)

items = []
for it in own.findall('Item'):
    state = it.find('State')
    items.append({'sid': int(it.get('sid')), 'sku': it.get('sku'), 'x': int(it.get('x')), 'y': int(it.get('y')),
                  'state': dict(state.attrib) if state is not None else {}})

city = {
    'format': 'mcity-html5-city/1',
    'source': {'file': os.path.basename(src), 'tag': 'offline universe (UserDataFacadeOffline)'},
    'profile': {k: profile.get(k, '') for k in ('exp', 'DCCoins', 'DCCash', 'cityname', 'companyValue', 'tutorialEnd', 'planeSku')},
    'missions': {'up': missions('Up'), 'reached': missions('Reached'), 'given': missions('Given')},
    'pollCounts': counts,
    'hqLevel': int(own.get('HQLevel', 0)),
    'items': items,
    'roads': pairs('Road'),
    'terrain': pairs('Terrain'),
}
city['profile']['isFan'] = '0'
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
json.dump(city, open(out, 'w'), indent=1)
print(city['profile']['cityname'], 'items', len(items), 'roads', len(city['roads']), 'terrain', len(city['terrain']))
