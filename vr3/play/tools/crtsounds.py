#!/usr/bin/env python3
"""The second office's monitor: its own four sounds, made here from sums of tones and noise.

    python3 vr3/play/tools/crtsounds.py

  crton    switched on: a relay's click, the degauss thrum, the whine coming up, a crackle of static
  crtoff   switched off: a click, the picture's "pyoom" falling away, a breath of static
  glass    a blow on the screen: a crack, the thud of the case, splinters ringing
  zap      a short in a battered tube: a ragged electric buzz

They are written to tools/level-src/office (where levelsounds.py copies them from when it rebuilds
the office) and to public/audio/office, and added to that folder's set.json. Nothing here is a
recording and none of it was chosen by ear: they are placeholders with the right shape, to be
replaced by takes if they sound wrong (same names, same folder).
"""
import json
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'level-src', 'office')
OUT = os.path.join(HERE, '..', 'public', 'audio', 'office')
RATE = 44100
TAU = math.tau


def blank(seconds):
    return [0.0] * int(seconds * RATE)


def add(to, samples, at=0.0, gain=1.0):
    start = int(at * RATE)
    for i, x in enumerate(samples):
        if start + i >= len(to):
            break
        to[start + i] += x * gain


def noise(seconds, rng, high=0.0, low=1.0):
    """White noise through a one-pole high-pass (`high`: 0 none .. 1 only the top) and low-pass (`low`: 1 none)."""
    out, slow, smooth = [], 0.0, 0.0
    for _ in range(int(seconds * RATE)):
        x = rng.uniform(-1, 1)
        slow += (x - slow) * (1 - high) if high else 0.0
        x = x - slow if high else x
        smooth += (x - smooth) * low
        out.append(smooth)
    return out


def shaped(samples, decay, attack=0.002):
    return [x * min(1.0, i / (attack * RATE)) * math.exp(-i / (decay * RATE)) for i, x in enumerate(samples)]


def sweep(seconds, f0, f1, harmonics=((1, 1.0),)):
    """A tone going from f0 to f1 Hz along an exponential curve."""
    out, phase = [], 0.0
    n = int(seconds * RATE)
    for i in range(n):
        f = f0 * (f1 / f0) ** (i / n)
        phase += TAU * f / RATE
        out.append(sum(a * math.sin(phase * k) for k, a in harmonics))
    return out


def crackle(seconds, rng, rate):
    """Single clicks at random, `rate` a second, each a few samples long."""
    out = blank(seconds)
    for i in range(len(out)):
        if rng.random() < rate / RATE:
            for k in range(6):
                if i + k < len(out):
                    out[i + k] += rng.uniform(0.4, 1) * (1 - k / 6) * rng.choice((-1, 1))
    return out


def crton(rng):
    s = blank(1.05)
    add(s, shaped(noise(0.02, rng, high=0.6), 0.004), 0.0, 0.9)                                       # the relay
    thrum = sweep(0.9, 100, 100, tuple((k, 1 / k) for k in range(2, 9)))                               # degauss: mains hum, all harmonics
    add(s, [x * (1 + 0.6 * math.sin(TAU * 13 * i / RATE) * math.exp(-i / (0.3 * RATE))) for i, x in enumerate(shaped(thrum, 0.24, 0.02))], 0.03, 0.55)
    add(s, shaped(sweep(0.6, 2600, 8200), 0.28, 0.05), 0.05, 0.07)                                     # the whine coming up
    add(s, [x * math.exp(-i / (0.25 * RATE)) for i, x in enumerate(crackle(0.7, rng, 90))], 0.08, 0.22)
    return s, -8


def crtoff(rng):
    s = blank(0.85)
    add(s, shaped(noise(0.02, rng, high=0.6), 0.004), 0.0, 0.8)
    add(s, shaped(sweep(0.45, 1500, 90, ((1, 1.0), (2, 0.3), (3, 0.12))), 0.15, 0.004), 0.01, 0.7)     # the picture closing
    add(s, shaped(sweep(0.3, 8000, 2200), 0.09, 0.003), 0.0, 0.1)
    add(s, shaped(noise(0.5, rng, high=0.3, low=0.35), 0.1), 0.02, 0.3)                                # static letting go
    add(s, [x * math.exp(-i / (0.2 * RATE)) for i, x in enumerate(crackle(0.6, rng, 40))], 0.1, 0.12)
    return s, -8


def glass(rng):
    s = blank(0.6)
    add(s, shaped(noise(0.08, rng, high=0.75), 0.011, 0.0005), 0.0, 1.0)                               # the crack
    add(s, shaped(sweep(0.2, 210, 150, ((1, 1.0), (1.9, 0.5), (3.1, 0.25))), 0.04, 0.001), 0.0, 0.55)  # the case
    for _ in range(16):                                                                                # splinters
        f = rng.uniform(2600, 9000)
        add(s, shaped(sweep(0.25, f, f * rng.uniform(0.98, 1.02)), rng.uniform(0.02, 0.07), 0.0005), rng.uniform(0.0, 0.28) ** 1.5 * 1.6 % 0.3, rng.uniform(0.08, 0.3))
    add(s, [x * math.exp(-i / (0.09 * RATE)) for i, x in enumerate(crackle(0.3, rng, 160))], 0.01, 0.3)
    return s, -5


def zap(rng):
    n = int(0.32 * RATE)
    hiss = noise(0.32, rng, high=0.5)
    out, on = [], True
    for i in range(n):
        if rng.random() < 260 / RATE:
            on = not on                                                                                 # ragged: it catches and lets go
        gate = 1.0 if math.sin(TAU * 110 * i / RATE) > -0.2 else 0.15
        buzz = math.sin(TAU * 2300 * i / RATE + 3 * math.sin(TAU * 110 * i / RATE))
        out.append((hiss[i] * 0.8 + buzz * 0.35) * gate * (1.0 if on else 0.2) * math.exp(-i / (0.11 * RATE)))
    return out, -9


def main():
    made = {}
    for name, make in (('crton', crton), ('crtoff', crtoff), ('glass', glass), ('zap', zap)):
        samples, peak = make(random.Random(sum(map(ord, name))))
        fade = int(0.01 * RATE)
        for i in range(fade):
            samples[-1 - i] *= i / fade
        k = 10 ** (peak / 20) / (max(abs(x) for x in samples) or 1)
        data = b''.join(struct.pack('<h', int(max(-1.0, min(1.0, x * k)) * 32767)) for x in samples)
        for folder in (SRC, OUT):
            os.makedirs(folder, exist_ok=True)
            with wave.open(os.path.join(folder, name + '.wav'), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(data)
        made[name] = len(samples) / RATE
        print(f'  {name:7s} {made[name]:.2f} s, peak {peak} dBFS')
    path = os.path.join(OUT, 'set.json')
    with open(path) as f:
        info = json.load(f)
    for name in made:
        if name not in info['shots']:
            info['shots'].append(name)
    with open(path, 'w') as f:
        json.dump(info, f, indent=1)
    print('  set.json shots:', ', '.join(info['shots']))


if __name__ == '__main__':
    main()
