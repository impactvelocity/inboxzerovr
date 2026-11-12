#!/usr/bin/env python3
"""Video-game swooshes for throwing a letter to keep it, in every level: public/audio/swoosh1..3.wav.

    python3 vr3/tools/swooshes.py

Asked for on 2026-11-11: "when throw, instead of the coin or game noise, just make it a swoosh video game
noise". Made here rather than recorded: noise swept through a resonant band-pass filter that rises fast and
falls away, with a faint tone riding the sweep, so it reads as a clean arcade "fwoosh" rather than real air.
  swoosh1  a quick bright rising swoosh
  swoosh2  a longer swoosh that rises and turns over
  swoosh3  a double swoosh, two quick sweeps
(The coin and power-up chimes it replaced are tools/chimes.py.)
"""
import array
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'web', 'tools'))
import ambience as A  # noqa: E402

RATE = A.RATE
OUT = os.path.join(HERE, '..', 'public', 'audio')


def sweep(out, start, length, f0, f1, level, q=6.0, tone=0.12, curve=0.5, seed=1):
    """Noise through a band-pass whose centre moves from f0 to f1 (log), shaped by a rise and a fall."""
    rnd = random.Random(seed)
    s0, n = int(start * RATE), int(length * RATE)
    low = band = 0.0
    phase = 0.0
    for i in range(n):
        t = i / n
        f = f0 * (f1 / f0) ** (t ** curve)
        # a state-variable band-pass
        g = 2 * math.sin(math.pi * min(f, RATE / 6) / RATE)
        x = rnd.uniform(-1, 1)
        high = x - low - band / q
        band += g * high
        low += g * band
        phase = (phase + f * 0.5 / RATE) % 1.0
        env = math.sin(math.pi * min(1.0, t / 0.35) / 2) ** 2 * (1 - t) ** 1.6
        v = (band * 0.9 + math.sin(2 * math.pi * phase) * tone) * env * level
        if s0 + i < len(out):
            out[s0 + i] += v


def write(name, out):
    peak = max(abs(x) for x in out) or 1
    A.write_wav(os.path.join(OUT, name + '.wav'), [out], 10 ** (-5 / 20) / peak)
    print(f'  {name}  {len(out) / RATE:4.2f} s')


def main():
    out = array.array('f', [0.0] * int(0.42 * RATE)); sweep(out, 0.0, 0.40, 500, 4200, 1.0, seed=3); write('swoosh1', out)
    out = array.array('f', [0.0] * int(0.62 * RATE)); sweep(out, 0.0, 0.34, 400, 3600, 1.0, seed=5); sweep(out, 0.22, 0.38, 3600, 900, 0.7, curve=1.2, seed=6); write('swoosh2', out)
    out = array.array('f', [0.0] * int(0.55 * RATE)); sweep(out, 0.0, 0.24, 700, 3800, 0.9, seed=8); sweep(out, 0.18, 0.34, 600, 4600, 1.0, seed=9); write('swoosh3', out)


if __name__ == '__main__':
    main()
