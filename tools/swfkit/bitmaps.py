"""Decodes SWF bitmap characters to RGBA Pillow images."""
import io
import struct
import zlib

from PIL import Image

SOI_ERR = b'\xff\xd9\xff\xd8'


def _jpeg(data, tables=None):
    if data.startswith(SOI_ERR):
        data = data[4:]
    if tables:
        t = tables[:-2] if tables.endswith(b'\xff\xd9') else tables
        if t.startswith(SOI_ERR):
            t = t[4:]
        data = t + data[2:] if data.startswith(b'\xff\xd8') else t + data
    # Some encoders leave an extra EOI/SOI pair inside the stream; Flash ignores it.
    i = data.find(SOI_ERR, 2)
    if i > 0:
        data = data[:i] + data[i + 4:]
    return Image.open(io.BytesIO(data)).convert('RGBA')


def _unpremultiply(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 255:
                px[x, y] = (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a)
    return img


def _lossless(code, t):
    cid, fmt, w, h = struct.unpack_from('<HBHH', t, 0)
    alpha = code == 36
    if fmt == 3:
        n = t[7] + 1
        raw = zlib.decompress(t[8:])
        csz = 4 if alpha else 3
        pal = [tuple(raw[i * csz:(i + 1) * csz]) + (() if alpha else (255,)) for i in range(n)]
        stride = (w + 3) & ~3
        data = raw[n * csz:]
        img = Image.new('RGBA', (w, h))
        px = img.load()
        for y in range(h):
            row = data[y * stride:y * stride + w]
            for x, idx in enumerate(row):
                px[x, y] = pal[idx] if idx < n else (0, 0, 0, 0)
        return _unpremultiply(img) if alpha else img
    raw = zlib.decompress(t[7:])
    if fmt == 4:
        stride = (w * 2 + 3) & ~3
        img = Image.new('RGBA', (w, h))
        px = img.load()
        for y in range(h):
            for x in range(w):
                v = struct.unpack_from('>H', raw, y * stride + x * 2)[0]
                px[x, y] = (((v >> 10) & 31) * 255 // 31, ((v >> 5) & 31) * 255 // 31, (v & 31) * 255 // 31, 255)
        return img
    if fmt == 5:
        img = Image.frombytes('RGBA', (w, h), raw[:w * h * 4], 'raw', 'ARGB')
        if not alpha:
            img.putalpha(255)
            return img
        return _unpremultiply(img)
    raise ValueError('lossless format %d' % fmt)


def decode(code, t, jpeg_tables=None):
    """Returns (image, source_format)."""
    if code in (20, 36):
        return _lossless(code, t), 'lossless%s_fmt%d' % ('2' if code == 36 else '', t[2])
    if code == 6:
        return _jpeg(t[2:], jpeg_tables), 'jpeg1'
    if code == 21:
        return _jpeg(t[2:]), 'jpeg2'
    if code in (35, 90):
        off = struct.unpack_from('<I', t, 2)[0]
        start = 6 if code == 35 else 8
        img = _jpeg(t[start:start + off])
        alpha = t[start + off:]
        fmt = 'jpeg3' if code == 35 else 'jpeg4'
        if alpha and not t[start:start + 4].startswith(b'\x89PNG'):
            a = zlib.decompress(alpha)
            w, h = img.size
            if len(a) >= w * h:
                img.putalpha(Image.frombytes('L', (w, h), a[:w * h]))
                fmt += '_alpha'
        return img, fmt
    raise ValueError('bitmap tag %d' % code)
