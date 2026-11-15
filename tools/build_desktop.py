"""Assembles the Windows desktop build in dist/windows/.

Electron runtime: build/electron_dl/runtime (official electron-v44.10.0-win32-x64.zip, SHA-256 checked against the
release SHASUMS256.txt and the npm package checksums). The game is a copy of public/ after `npm run build`.

Usage: python -I tools/build_desktop.py"""
import hashlib
import json
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME = os.path.join(ROOT, 'build', 'electron_dl', 'runtime')
NAME = 'Millionaire City HTML5'
DIST = os.path.join(ROOT, 'dist', 'windows')
APP_DIR = os.path.join(DIST, NAME)
VERSION = json.load(open(os.path.join(ROOT, 'desktop', 'package.json')))['version']

if not os.path.isfile(os.path.join(RUNTIME, 'electron.exe')):
    raise SystemExit('Electron runtime missing: extract the checked electron zip to build/electron_dl/runtime')
if os.path.exists(APP_DIR):
    shutil.rmtree(APP_DIR)
shutil.copytree(RUNTIME, APP_DIR, ignore=shutil.ignore_patterns('default_app.asar'))
os.rename(os.path.join(APP_DIR, 'electron.exe'), os.path.join(APP_DIR, NAME + '.exe'))
app = os.path.join(APP_DIR, 'resources', 'app')
os.makedirs(app)
for f in ('main.js', 'package.json'):
    shutil.copy2(os.path.join(ROOT, 'desktop', f), app)
shutil.copytree(os.path.join(ROOT, 'public'), os.path.join(app, 'game'))
shutil.copy2(os.path.join(ROOT, 'desktop', 'README.txt'), os.path.join(APP_DIR, 'README.txt'))

zip_path = os.path.join(DIST, 'MillionaireCityHTML5-%s-portable-win-x64.zip' % VERSION)
if os.path.exists(zip_path):
    os.remove(zip_path)
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for dp, _, files in os.walk(APP_DIR):
        for f in files:
            full = os.path.join(dp, f)
            z.write(full, os.path.join(NAME, os.path.relpath(full, APP_DIR)))
size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(APP_DIR) for f in fs)
h = hashlib.sha256(open(zip_path, 'rb').read()).hexdigest()
print(json.dumps({'app_dir': APP_DIR, 'app_bytes': size, 'zip': zip_path, 'zip_bytes': os.path.getsize(zip_path), 'zip_sha256': h}, indent=1))
