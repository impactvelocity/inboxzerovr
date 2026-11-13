#!/usr/bin/env python3
"""Find the sky in the two panoramas and write it as a mask, public/garden/sky-v2.webp.

    python3 vr3/play/tools/skymask.py

White is open sky, black is everything in front of it (mountains, the cherry, roofs, the veranda);
the edge is feathered. The panorama shader (src/atmosphere.ts) uses it to keep the drifting
clouds and the stars on the sky alone. Run again if the panoramas are repainted.

Sky is told from the rest by colour, measured in the paintings: it is bright; down among the
mountains it is never greener than it is red (they are); and round the cherry it is not the
blossom's pink (red over blue, blue well over green). Then only what joins up with known patches
of sky is kept. Needs ffmpeg and cwebp.
"""
import os
import subprocess
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
GARDEN = os.path.join(HERE, '..', 'public', 'garden')
W, H = 1086, 362            # half the panorama's size: the mask is soft anyway


def load(name):
    return subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(GARDEN, name), '-vf', f'scale={W}:{H}:flags=area',
                           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], check=True, capture_output=True).stdout


def main():
    dusk, twilight = load('dusk-v2.webp'), load('twilight-v2.webp')

    def sky_coloured(i, u, v):
        r, g, b = dusk[i * 3], dusk[i * 3 + 1], dusk[i * 3 + 2]
        if max(r, g, b) < 150:
            return False                        # too dark: roofs, beams, pines
        if .31 < u < .47 and v < .65 and r > b and b - g > 25:
            return False                        # the cherry's blossom (pink cloud elsewhere is sky)
        if v > .59:
            return True                         # above the highest peak, whatever is bright is sky
        # down among the mountains: they are greener than they are red, the sky never is
        return r > g + 2 and twilight[i * 3] > twilight[i * 3 + 1]

    # only inside the opening between the big posts, above the horizon and under the roof beam
    def inside(x, y):
        u, v = (x + .5) / W, 1 - (y + .5) / H
        return .20 < u < .83 and .50 < v < .70 - 1.2 * (u - .5) ** 2 + .02

    ok = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            if inside(x, y) and sky_coloured(y * W + x, (x + .5) / W, 1 - (y + .5) / H):
                ok[y * W + x] = 1
    # what joins up with these patches of sky (u, v), in each bay between the posts
    mask = bytearray(W * H)
    queue = deque()
    for u, v in [(.52, .62), (.40, .665), (.60, .60), (.335, .60), (.74, .575), (.265, .58), (.66, .60), (.715, .585), (.285, .60), (.80, .57), (.22, .57)]:
        i = int((1 - v) * H) * W + int(u * W)
        if ok[i] and not mask[i]:
            mask[i] = 1
            queue.append(i)
    while queue:
        i = queue.popleft()
        x = i % W
        for j in (i - W, i + W, i - 1 if x else -1, i + 1 if x < W - 1 else -1):
            if 0 <= j < W * H and ok[j] and not mask[j]:
                mask[j] = 1
                queue.append(j)

    def spread(src, radius, want):
        """Grow (want=1) or shrink (want=0) by `radius` pixels: a square brush, in two passes."""
        out = bytearray(src)
        for horizontal in (True, False):
            cur = bytes(out)
            for y in range(H):
                for x in range(W):
                    if cur[y * W + x] == want:
                        continue
                    for k in range(1, radius + 1):
                        if horizontal:
                            hit = (x >= k and cur[y * W + x - k] == want) or (x + k < W and cur[y * W + x + k] == want)
                        else:
                            hit = (y >= k and cur[(y - k) * W + x] == want) or (y + k < H and cur[(y + k) * W + x] == want)
                        if hit:
                            out[y * W + x] = want
                            break
        return out

    # close the pinholes cloud edges leave, then pull the edge in off the things in front
    mask = spread(spread(mask, 3, 1), 5, 0)
    # feather: three box blurs, about 6 pixels of ramp
    level = [255.0 * m for m in mask]
    for _ in range(3):
        for horizontal in (True, False):
            src = level[:]
            for y in range(H):
                for x in range(W):
                    total = n = 0
                    for k in range(-2, 3):
                        xx, yy = (x + k, y) if horizontal else (x, y + k)
                        if 0 <= xx < W and 0 <= yy < H:
                            total += src[yy * W + xx]
                            n += 1
                    level[y * W + x] = total / n
    gray = bytes(int(v + .5) for v in level)
    png = os.path.join(GARDEN, 'sky-v2.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{W}x{H}', '-i', '-', png], input=gray, check=True)
    subprocess.run(['cwebp', '-quiet', '-q', '90', png, '-o', os.path.join(GARDEN, 'sky-v2.webp')], check=True)
    os.remove(png)
    print(f'sky: {sum(mask) / (W * H):.1%} of the picture')


if __name__ == '__main__':
    main()
