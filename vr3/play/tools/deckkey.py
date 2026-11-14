#!/usr/bin/env python3
"""Key the green windows out of Super Space's deck paintings, for the layered stage (src/levels/space.ts).

    python3 vr3/play/tools/deckkey.py

Reads design/space-kyoto-perspective-v1/light.png and dark.png (the deck painted with its windows flat
chroma green, 2026-11-13) and writes, under public/levels/space/:

    deck-start.webp, deck-end.webp   the deck at its two lightings, opaque: the window panes are filled
                                     with the deck's own colours from round about (a blur of them), so
                                     nothing green can bleed in when the texture is filtered or mipmapped
    windows.webp                     the windows, white, as one mask for both (the paintings are the
                                     same room; the mask is the union of the two keys), edges kept soft

The edge pixels are un-mixed: a pixel part green is taken to be green laid over the deck by its
greenness, and the deck's share is recovered, so the frames do not keep a green rim when space shows
through instead. Needs ffmpeg and cwebp. Run again if the deck is repainted.
"""
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
SOURCE = os.path.join(ROOT, 'design', 'space-kyoto-perspective-v1')
OUT = os.path.join(HERE, '..', 'public', 'levels', 'space')
W, H = 2000, 667
GREEN = (0, 255, 0)
# greenness = g - max(r, b): the deck never goes past LOW; the painted panes are near 255
LOW, HIGH = 18.0, 130.0


def load(name):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SOURCE, name), '-vf', f'scale={W}:{H}:flags=area',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], check=True, capture_output=True).stdout
    assert len(raw) == W * H * 3, name
    return raw


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def key(rgb):
    out = [0.0] * (W * H)
    for i in range(W * H):
        r, g, b = rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]
        out[i] = smooth((g - max(r, b) - LOW) / (HIGH - LOW))
    return out


def box_blur(plane, radius):
    """Mean over a (2r+1) square, by a summed-area table (edges clamp the box)."""
    s = [0.0] * ((W + 1) * (H + 1))
    for y in range(H):
        row = 0.0
        base, above = (y + 1) * (W + 1), y * (W + 1)
        for x in range(W):
            row += plane[y * W + x]
            s[base + x + 1] = s[above + x + 1] + row
    out = [0.0] * (W * H)
    for y in range(H):
        y0, y1 = max(0, y - radius), min(H, y + radius + 1)
        for x in range(W):
            x0, x1 = max(0, x - radius), min(W, x + radius + 1)
            out[y * W + x] = s[y1 * (W + 1) + x1] - s[y0 * (W + 1) + x1] - s[y1 * (W + 1) + x0] + s[y0 * (W + 1) + x0]
    return out


def fill(rgb, glass):
    """The deck with its panes un-mixed at the edges and filled from round about inside."""
    solid = [1.0 - a for a in glass]
    deck = [[0.0] * (W * H) for _ in range(3)]
    for i in range(W * H):
        a = glass[i]
        v = [float(rgb[i * 3 + c]) for c in range(3)]
        if 0 < a < 0.85:
            v = [(v[c] - a * GREEN[c]) / (1 - a) for c in range(3)]      # un-mix the green that was laid over it
        v[1] = min(v[1], max(v[0], v[2]))                                # and no green left anywhere (there is none in the deck; shaded spill is)
        for c in range(3):
            deck[c][i] = min(255.0, max(0.0, v[c]))
    # inside the panes: the deck's own colours from round about, blurred out (several sizes, nearest that reaches)
    weight = [s * s for s in solid]
    layers = []
    for radius in (6, 24, 90):
        wsum = box_blur(weight, radius)
        sums = [box_blur([deck[c][i] * weight[i] for i in range(W * H)], radius) for c in range(3)]
        layers.append((wsum, sums))
    out = bytearray(W * H * 3)
    for i in range(W * H):
        a = glass[i]
        mixed = [deck[c][i] for c in range(3)]
        if a > 0:
            for wsum, sums in layers:
                if wsum[i] > 1e-3:
                    around = [sums[c][i] / wsum[i] for c in range(3)]
                    break
            else:
                around = [20.0, 16.0, 40.0]
            t = smooth((a - 0.5) / 0.4)
            mixed = [mixed[c] * (1 - t) + around[c] * t for c in range(3)]
        for c in range(3):
            out[i * 3 + c] = int(round(min(255.0, max(0.0, mixed[c]))))
    return bytes(out)


def save(raw, fmt, path, *cwebp):
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as png:
        name = png.name
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', fmt, '-s', f'{W}x{H}', '-i', '-', name], input=raw, check=True)
    subprocess.run(['cwebp', '-quiet', *cwebp, name, '-o', path], check=True)
    os.unlink(name)
    print('wrote', os.path.relpath(path, ROOT), os.path.getsize(path) // 1024, 'kB')


def main():
    light, dark = load('light.png'), load('dark.png')
    glass = [max(a, b) for a, b in zip(key(light), key(dark))]
    print(f'windows: {sum(1 for a in glass if a > 0.5) / (W * H):.1%} of the painting')
    save(bytes(int(round(a * 255)) for a in glass), 'gray', os.path.join(OUT, 'windows.webp'), '-lossless', '-exact')
    for raw, name in ((light, 'deck-start.webp'), (dark, 'deck-end.webp')):
        save(fill(raw, glass), 'rgb24', os.path.join(OUT, name), '-q', '92', '-sharp_yuv')


if __name__ == '__main__':
    main()
