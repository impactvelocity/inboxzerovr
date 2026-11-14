"""Keys the Higgsfield seated-player take (not a true chroma green: a dark teal gradient) and retimes it.

1. A clean background plate: the take's background sampled on a coarse grid across several frames
   (only cells that are clearly background), holes filled from neighbours, smoothly upscaled.
2. A difference matte against that plate, with the colour un-mixed from the background, so the
   figure's soft glow and the slash's pink glow come out as light rather than a teal or brown halo.
3. Retimed to the voice: the grab lands on "come to you", the slash on "stretching".
Output: work/footage/seated/NNNN.png (RGBA, 30 fps).
"""
import os, subprocess, json, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(ROOT, 'work', 'seated'); SRC = os.path.join(S, 'src', 'seated-take1.mp4')
OUT = os.path.join(ROOT, 'work', 'footage', 'seated')
W, H, GW, GH, SRC_FPS = 1280, 720, 64, 36, 24
# (film seconds into the scene, source seconds): a smooth, monotone mapping between these
TIMING = [(0.0, 0.8), (2.5, 3.6), (3.3, 7.2), (4.1, 8.7), (5.2, 11.8)]      # v7's re-read: "stretching" comes 0.4 s sooner
NOISE, SOFT = 14, 40     # darker-than-background parts: below NOISE is background, NOISE+SOFT is opaque
LIGHT0, LIGHT0_BLUE, LIGHT_SOFT = 45, 20, 70   # lighter-than-background parts: weak added light stays a faint tint

def run(*a, **k): return subprocess.run(a, check=True, capture_output=True, **k)

# 1. the plate
cells = [[[] for _ in range(GW)] for _ in range(GH)]
for t in [0.3, 1.0, 5.0, 6.5, 12.0, 14.5]:
    raw = run('ffmpeg', '-v', 'error', '-ss', str(t), '-i', SRC, '-frames:v', '1', '-vf', f'scale={GW}:{GH}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-').stdout
    for y in range(GH):
        for x in range(GW):
            r, g, b = raw[(y * GW + x) * 3:(y * GW + x) * 3 + 3]
            if g - max(r, b) >= 14: cells[y][x].append((r, g, b))
plate = [[None] * GW for _ in range(GH)]
for y in range(GH):
    for x in range(GW):
        c = sorted(cells[y][x], key=lambda p: p[1])
        if c: plate[y][x] = c[len(c) // 2]
for _ in range(80):      # fill the holes (where the figure always is) from the neighbours
    holes = 0
    new = [row[:] for row in plate]
    for y in range(GH):
        for x in range(GW):
            if plate[y][x] is None:
                n = [plate[j][i] for j, i in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)) if 0 <= j < GH and 0 <= i < GW and plate[j][i] is not None]
                if n: new[y][x] = tuple(sum(p[k] for p in n) // len(n) for k in range(3))
                else: holes += 1
    plate = new
    if not holes: break
open(os.path.join(S, 'plate.rgb'), 'wb').write(bytes(v for row in plate for p in row for v in p))
run('ffmpeg', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{GW}x{GH}', '-i', os.path.join(S, 'plate.rgb'),
    '-vf', f'scale={W}:{H}:flags=bicubic,gblur=sigma=6', '-frames:v', '1', os.path.join(S, 'plate.png'))

# 2. the matte: frame and plate side by side (same frame rate), one geq reads both, then crop back.
#    Lighter than the background in every channel = light (the figure, its glow, the paper, the pink slash and
#    its haze): opacity grows with how much light was added, and the colour is un-mixed from the plate, so a
#    weak glow becomes a pale tint on white instead of a teal or brown smudge. Darker than the background
#    (chair, sword, visor) = a plain difference key, also cut by the green-excess key so noise specks vanish.
c = lambda ch: f"{ch}(X\\,Y)"; pl = lambda ch: f"{ch}(X+{W}\\,Y)"
d = lambda ch: f"({c(ch)}-{pl(ch)})"
m = f"max(abs({d('r')})\\,max(abs({d('g')})\\,abs({d('b')})))"
lo = f"min({d('r')}\\,min({d('g')}\\,{d('b')}))"
excess = f"({c('g')}-max({c('r')}\\,{c('b')}))"
a_light = f"clip(({m}-if(gt({c('b')}\\,{c('r')})\\,{LIGHT0_BLUE}\\,{LIGHT0}))/{LIGHT_SOFT}\\,0\\,1)"      # (the bluish figure goes solid sooner than the pink haze)
a_dark = f"min(clip(1-({excess}-4)/12\\,0\\,1)\\,clip(({m}-{NOISE})/{SOFT}\\,0\\,1))"
a = f"if(gte({lo}\\,-8)\\,{a_light}\\,{a_dark})"
un = lambda ch: f"clip({pl(ch)}+{d(ch)}/max({a}\\,0.05)\\,0\\,255)"
graph = (f"[0]format=gbrap[v];[1]format=gbrap[p];[v][p]hstack=inputs=2:shortest=1,"
         f"geq=r='{un('r')}':g='{un('g')}':b='{un('b')}':a='255*{a}',crop={W}:{H}:0:0")
open(os.path.join(S, 'key2.txt'), 'w').write(graph)
keyed = os.path.join(S, 'keyed')
if not os.environ.get('RETIME_ONLY'):
    shutil.rmtree(keyed, ignore_errors=True); os.makedirs(keyed)
    run('ffmpeg', '-y', '-i', SRC, '-loop', '1', '-framerate', str(SRC_FPS), '-i', os.path.join(S, 'plate.png'),
        '-/filter_complex', os.path.join(S, 'key2.txt'), '-fps_mode', 'passthrough', os.path.join(keyed, '%04d.png'))

# 3. retime: monotone cubic through TIMING, one output frame per 1/30 s
xs, ys = [p[0] for p in TIMING], [p[1] for p in TIMING]
sl = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(len(xs) - 1)]
tan = [sl[0]] + [0 if sl[i - 1] * sl[i] <= 0 else 2 / (1 / sl[i - 1] + 1 / sl[i]) for i in range(1, len(sl))] + [sl[-1]]
def src_at(u):
    i = max(0, min(len(xs) - 2, max(k for k in range(len(xs) - 1) if xs[k] <= u) if u >= xs[0] else 0))
    h = xs[i + 1] - xs[i]; t = (u - xs[i]) / h
    h00, h10, h01, h11 = 2*t**3 - 3*t**2 + 1, t**3 - 2*t**2 + t, -2*t**3 + 3*t**2, t**3 - t**2
    return h00 * ys[i] + h10 * h * tan[i] + h01 * ys[i + 1] + h11 * h * tan[i + 1]
n_src = len(os.listdir(keyed))
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
frames = int(TIMING[-1][0] * 30)
for f in range(frames):
    s = min(n_src, max(1, round(src_at(f / 30) * SRC_FPS) + 1))
    shutil.copy(os.path.join(keyed, f'{s:04d}.png'), os.path.join(OUT, f'{f + 1:04d}.png'))
print('keyed', n_src, 'source frames;', frames, 'film frames')
