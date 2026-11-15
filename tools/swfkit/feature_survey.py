"""Parses every SWF under a root and counts the rendering features the exporter has to support.

Usage: python -I feature_survey.py <assets_root> <out.json>"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import swfparse  # noqa: E402

root, out = sys.argv[1], sys.argv[2]
c = collections.Counter()
errors = []
per_file = {}
for dp, _, fs in os.walk(root):
    for f in fs:
        if not f.lower().endswith('.swf'):
            continue
        p = os.path.join(dp, f)
        rel = os.path.relpath(p, root).replace('\\', '/')
        try:
            m = swfparse.Movie(p)
        except Exception as e:  # noqa: BLE001
            errors.append((rel, 'load', repr(e)))
            continue
        c['files'] += 1
        c['rate_%g' % m.frame_rate] += 1
        abc = b''.join(t for code, t in m.tags if code in (72, 82))
        if b'addFrameScript' in abc:
            c['files_with_addFrameScript'] += 1
        per_file[rel] = {'symbols': len(m.symbols), 'chars': len(m.chars), 'frame_scripts': b'addFrameScript' in abc}
        for cid, (code, _) in m.chars.items():
            try:
                kind, v = m.char(cid)
            except Exception as e:  # noqa: BLE001
                errors.append((rel, cid, repr(e)))
                continue
            c['char_' + kind] += 1
            if kind == 'shape':
                for g in v['groups']:
                    for fs_ in g['fills']:
                        c['fill_' + fs_['type']] += 1
                        if fs_['type'] in ('linear', 'radial', 'focal'):
                            c['gradient_spread_%d' % fs_['spread']] += 1
                            c['gradient_interp_%d' % fs_['interp']] += 1
                    c['line_styles'] += len(g['lines'])
            elif kind == 'sprite':
                if v['frame_count'] > 1:
                    c['sprite_multiframe'] += 1
                for fr in v['frames']:
                    if fr['actions']:
                        c['sprite_frames_with_as2_actions'] += 1
                    if fr['sounds']:
                        c['sprite_frames_with_sound'] += 1
                    for op, d in fr['ops']:
                        if op != 'place':
                            continue
                        if 'clip_depth' in d:
                            c['place_mask'] += 1
                        if 'filters' in d:
                            for flt in d['filters']:
                                c['filter_' + str(flt['type'])] += 1
                        if d.get('blend', 0) > 1:
                            c['blend_%d' % d['blend']] += 1
                        if 'cxform' in d and d['cxform']:
                            mult, add = d['cxform']
                            if any(add) or any(abs(x - 1) > 1e-9 for x in mult[:3]):
                                c['cxform_color'] += 1
                            elif abs(mult[3] - 1) > 1e-9:
                                c['cxform_alpha_only'] += 1
                        if 'ratio' in d:
                            c['place_ratio'] += 1
                        if 'class_name' in d:
                            c['place_class_name'] += 1
json.dump({'counts': dict(sorted(c.items())), 'errors': errors, 'files': per_file}, open(out, 'w'), indent=1)
print(json.dumps(dict(sorted(c.items())), indent=0))
print('errors', len(errors), errors[:10])
