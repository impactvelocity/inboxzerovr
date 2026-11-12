"""
The home screen's per-level logos (the user's own art, 2026-11-11), cut out of their white
backgrounds into transparent WebP.

    python3 tools/logos.py

Reads tools/level-src/logos/<level>.webp, writes public/logos/<level>.webp. Needs dwebp and
cwebp (brew install webp); nothing else. Art that is already transparent is only cropped. Otherwise the white is flood-filled in from the edges (so the
cream letters inside their dark outlines are kept), then a narrow band along the cut is given
partial alpha by how white it is, with the white taken back out of its colour, so the edge is soft
on any background. Then it is cropped to what is left, with a little margin.
"""
import os, subprocess, sys, tempfile
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'level-src', 'logos')
OUT = os.path.join(HERE, '..', 'public', 'logos')
LEVELS = ['kyoto', 'office', 'castle', 'lab']
WHITE = 232     # a pixel this white in every channel (and grey, not tinted) is background, if it touches the edge
SOFT = 70       # along the cut, alpha runs from 0 at pure white to 1 this far below it
BAND = 3        # pixels from the cut that get soft alpha
PAD = 12
HAZE = 10      # alpha under this (out of 255) is left out: a faint haze round the art that would stop the crop


def read_pam(path):
    with open(path, 'rb') as f:
        data = f.read()
    head, _, rest = data.partition(b'ENDHDR\n')
    fields = dict(line.split(b' ', 1) for line in head.split(b'\n')[1:] if b' ' in line)
    w, h, depth = int(fields[b'WIDTH']), int(fields[b'HEIGHT']), int(fields[b'DEPTH'])
    assert depth == 4, depth
    return w, h, bytearray(rest[:w * h * 4])


def write_pam(path, w, h, px):
    with open(path, 'wb') as f:
        f.write(b'P7\nWIDTH %d\nHEIGHT %d\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n' % (w, h))
        f.write(px)


def cut(w, h, px):
    if px[3] == 0 and px[(w * h - 1) * 4 + 3] == 0:
        # already transparent (the user's art as it came, 2026-11-11): only crop it, leaving out the faint haze
        for i in range(w * h):
            if px[i * 4 + 3] < HAZE:
                px[i * 4:i * 4 + 4] = b'\0\0\0\0'
        return crop(w, h, px)
    def whiteish(i):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        return min(r, g, b) >= WHITE and max(r, g, b) - min(r, g, b) < 14
    bg = bytearray(w * h)
    todo = deque()
    for x in range(w):
        for y in (0, h - 1):
            todo.append(y * w + x)
    for y in range(h):
        for x in (0, w - 1):
            todo.append(y * w + x)
    while todo:
        i = todo.popleft()
        if bg[i] or not whiteish(i):
            continue
        bg[i] = 1
        x, y = i % w, i // w
        if x > 0: todo.append(i - 1)
        if x < w - 1: todo.append(i + 1)
        if y > 0: todo.append(i - w)
        if y < h - 1: todo.append(i + w)
    # distance (in steps) from the background, out to BAND
    near = bytearray(w * h)
    frontier = [i for i in range(w * h) if bg[i]]
    for step in range(1, BAND + 1):
        nxt = []
        for i in frontier:
            x, y = i % w, i // w
            for j, ok in ((i - 1, x > 0), (i + 1, x < w - 1), (i - w, y > 0), (i + w, y < h - 1)):
                if ok and not bg[j] and not near[j]:
                    near[j] = step
                    nxt.append(j)
        frontier = nxt
    for i in range(w * h):
        o = i * 4
        if bg[i]:
            px[o:o + 4] = b'\0\0\0\0'
        elif near[i]:
            r, g, b = px[o], px[o + 1], px[o + 2]
            a = max(0.0, min(1.0, (255 - min(r, g, b)) / SOFT))
            if a <= 0.004:
                px[o:o + 4] = b'\0\0\0\0'
                continue
            # take the white it was blended with back out
            for k in range(3):
                c = (px[o + k] - 255 * (1 - a)) / a
                px[o + k] = max(0, min(255, int(round(c))))
            px[o + 3] = int(round(a * 255))
    return crop(w, h, px)


def crop(w, h, px):
    xs, ys = [], []
    for y in range(h):
        row = y * w
        for x in range(w):
            if px[(row + x) * 4 + 3]:
                xs.append(x); ys.append(y)
                break
        for x in range(w - 1, -1, -1):
            if px[(row + x) * 4 + 3]:
                xs.append(x)
                break
    x0, x1 = max(0, min(xs) - PAD), min(w - 1, max(xs) + PAD)
    y0, y1 = max(0, min(ys) - PAD), min(h - 1, max(ys) + PAD)
    out = bytearray()
    for y in range(y0, y1 + 1):
        out += px[(y * w + x0) * 4:(y * w + x1 + 1) * 4]
    return x1 - x0 + 1, y1 - y0 + 1, out


def main():
    levels = sys.argv[1:] or LEVELS
    with tempfile.TemporaryDirectory() as tmp:
        for level in levels:
            src = os.path.join(SRC, f'{level}.webp')
            pam = os.path.join(tmp, f'{level}.pam')
            subprocess.run(['dwebp', src, '-pam', '-o', pam], check=True, capture_output=True)
            w, h, px = read_pam(pam)
            cw, ch, out = cut(w, h, px)
            cut_pam = os.path.join(tmp, f'{level}-cut.pam')
            write_pam(cut_pam, cw, ch, out)
            png = os.path.join(tmp, f'{level}.png')
            # (cwebp cannot read PAM: ffmpeg turns it into a PNG first)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', cut_pam, png], check=True)
            dest = os.path.join(OUT, f'{level}.webp')
            subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '100', '-exact', '-resize', '1400', '0', png, '-o', dest], check=True)
            print(level, f'{w}x{h} -> {cw}x{ch}', os.path.getsize(dest) // 1024, 'KB')


if __name__ == '__main__':
    main()
