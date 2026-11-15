"""Lays rendered frames side by side on a neutral background for visual review.

Usage: python -I contact_sheet.py <out.png> <zoom> <frame.png> [...]"""
import sys

from PIL import Image

out, zoom, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGBA') for f in files]
w = max(i.width for i in ims)
h = max(i.height for i in ims)
cols = min(len(ims), 10)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGBA', (w * cols, h * rows), (200, 230, 200, 255))
for k, im in enumerate(ims):
    sheet.alpha_composite(im, ((k % cols) * w, (k // cols) * h))
sheet.resize((sheet.width * zoom, sheet.height * zoom), Image.NEAREST).save(out)
