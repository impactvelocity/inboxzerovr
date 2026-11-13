#!/usr/bin/env python3
"""Bright retro video-game chimes for throwing a letter to keep it (Kyoto): public/audio/kyoto/keep1..3.wav.

    python3 vr3/play/tools/chimes.py

Asked for on 2026-11-11: "something simple like a bright video game coins points, something familiar like
a classic game of winning a power up". Made here from square and pulse waves rather than recorded, so they
are crisp and exact and belong to no particular game:
  keep1  a coin: two quick notes, the second a fourth up, ringing out
  keep2  a power up: a fast rising arpeggio of a major chord over two octaves
  keep3  points: three quick rising notes and a sparkle on top
"""
import array
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'web', 'tools'))
import ambience as A  # noqa: E402

RATE = A.RATE
OUT = os.path.join(HERE, '..', 'public', 'audio', 'kyoto')


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def tone(out, start, length, freq, level, duty=0.5, decay=6.0, vibrato=0.0):
    """A pulse wave added into `out` from `start` seconds, `length` long, fading as it rings."""
    s0, n = int(start * RATE), int(length * RATE)
    phase = 0.0
    for i in range(n):
        t = i / RATE
        f = freq * (1 + vibrato * math.sin(2 * math.pi * 6 * t))
        phase = (phase + f / RATE) % 1.0
        wave = 1.0 if phase < duty else -1.0
        env = min(1.0, t / 0.003) * math.exp(-decay * t) * min(1.0, (length - t) / 0.01)
        if s0 + i < len(out):
            out[s0 + i] += wave * level * env


def soften(out):
    """A gentle low-pass, so the squares are bright but not harsh."""
    prev = 0.0
    for i in range(len(out)):
        prev += (out[i] - prev) * 0.45
        out[i] = prev


def write(name, out):
    soften(out)
    peak = max(abs(x) for x in out) or 1
    A.write_wav(os.path.join(OUT, name + '.wav'), [out], 10 ** (-5 / 20) / peak)
    print(f'  {name}  {len(out) / RATE:4.2f} s')


def main():
    os.makedirs(OUT, exist_ok=True)
    # a coin: B5, then E6 held and ringing
    out = array.array('f', [0.0] * int(0.75 * RATE))
    tone(out, 0.0, 0.07, note(83), 0.5, duty=0.5, decay=4)
    tone(out, 0.07, 0.65, note(88), 0.5, duty=0.5, decay=5.5)
    write('keep1', out)
    # a power up: C major arpeggio rising over two octaves, fast, the top note ringing with a little vibrato
    out = array.array('f', [0.0] * int(0.95 * RATE))
    for k, m in enumerate([72, 76, 79, 84, 88, 91]):
        tone(out, k * 0.045, 0.12, note(m), 0.42, duty=0.25, decay=10)
    tone(out, 6 * 0.045, 0.62, note(96), 0.42, duty=0.25, decay=5, vibrato=0.006)
    write('keep2', out)
    # points: G, C, E quick, and a high sparkle
    out = array.array('f', [0.0] * int(0.8 * RATE))
    for k, m in enumerate([79, 84, 88]):
        tone(out, k * 0.06, 0.1 if k < 2 else 0.5, note(m), 0.45, duty=0.5, decay=9 if k < 2 else 5)
    for k, m in enumerate([100, 103, 100, 103]):
        tone(out, 0.2 + k * 0.035, 0.05, note(m), 0.12, duty=0.5, decay=20)
    write('keep3', out)


if __name__ == '__main__':
    main()
