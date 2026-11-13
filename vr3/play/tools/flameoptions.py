#!/usr/bin/env python3
"""Inferno's flame thrower, four ways (2026-11-13: "Make a better sound for flame thrower, more ummph,
sound more fun, give me some options for that").

    python3 vr3/play/tools/flameoptions.py

Takes are in tools/level-src/inferno/flame-options (ElevenLabs flow "Inferno level sound effects",
nodes "flame A/B/C ..." and "flame tail"). For each option this writes into public/audio/inferno/:

  hum-<x>.mp3   the jet, held while the trigger is down (a padded loop, as levelsounds.py makes them)
  arm-<x>.wav   the ignition, played as the trigger goes down
  off-<x>.wav   the cut-off, played as it comes up

and adds {"variants": {x: {seconds, lead}}} to set.json (run levelsounds.py inferno first: it rewrites set.json).
The game picks one with ?flame=<x> or from /flame.html (kept in localStorage); "0" is the original.

The old jet had its body taken out (two high-passes at 180 Hz), which is why it had no punch. These keep
everything over 70 Hz, push the 180-350 Hz a headset speaker can play, squeeze the roar so it is dense,
and are mastered about 4 dB louder. Nothing was auditioned: takes were chosen by measurement.
"""
import array
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import levelsounds as L  # noqa: E402

A = L.A
RATE = L.RATE
SRC = os.path.join(HERE, 'level-src', 'inferno', 'flame-options')
OUT = os.path.join(HERE, '..', 'public', 'audio', 'inferno')

# punch for a small speaker: rumble out, body and bite up, then squeezed so the roar stays dense
BODY = ('highpass=f=70,highpass=f=70,equalizer=f=220:t=q:w=1.1:g={body},equalizer=f=2600:t=q:w=1.0:g={bite},'
        'acompressor=threshold=-20dB:ratio=4:attack=8:release=120:makeup=4')

OPTIONS = {
    # A, Big Roar: a thick, deep blast with rolling crackle inside it (a-loop-1 is steady from 0.4 s to 5.5 s)
    'a': dict(loop=[('a-loop-1.mp3', (0.45, 5.45), 1.0)], body=6, bite=4, fold=0.9, even=0.7, lufs=-17,
              ignite='a-ignite-1.mp3', ignite_body=5, tail='tail-1.mp3'),
    # B, Arcade: bright cartoon FWOOSH with snapping crackle (b-loop-2 is steady from 0.25 s to 4.8 s;
    # b-ignite-1 is nearly all thump under 150 Hz, so b-ignite-2)
    'b': dict(loop=[('b-loop-2.mp3', (0.3, 4.8), 1.0)], body=4, bite=6, fold=0.8, even=0.7, lufs=-17,
              ignite='b-ignite-2.mp3', ignite_body=6, tail='tail-2.mp3'),
    # C, Napalm Jet: a fierce pressurised hiss, sputtering and gritty; steady end to end, but thin under 600 Hz
    'c': dict(loop=[('c-loop-2.mp3', (0.1, 7.5), 1.0)], body=8, bite=2, fold=1.2, even=0.8, lufs=-17,
              ignite='c-ignite-2.mp3', ignite_body=6, tail='tail-2.mp3'),
    # D, Big Roar + Jet: A's body under C's hiss, the way a film would layer it
    'd': dict(loop=[('a-loop-1.mp3', (0.45, 5.45), 0.8), ('c-loop-2.mp3', (1.0, 6.0), 0.7)], body=5, bite=3, fold=0.9, even=0.7, lufs=-16,
              ignite='a-ignite-1.mp3', ignite_body=5, tail='tail-1.mp3'),
}


def loop(x, spec):
    chain = BODY.format(body=spec['body'], bite=spec['bite'])
    parts = []
    for name, (t0, t1), gain in spec['loop']:
        a = A.decode(os.path.join(SRC, name), 1, chain)[0][int(t0 * RATE):int(t1 * RATE)]
        parts.append(array.array('f', (v * gain for v in a)))
    n = min(len(p) for p in parts)
    mixed = array.array('f', (sum(p[i] for p in parts) for i in range(n)))
    channels = A.even_out([A.fold(mixed, int(spec['fold'] * RATE))], spec['even'])
    probe = os.path.join(OUT, f'hum-{x}.probe.wav')
    A.write_wav(probe, channels, repeat=2)
    lufs, peak = A.loudness(probe)
    os.remove(probe)
    gain_db = min(spec['lufs'] - lufs, -1.5 - peak)
    padded = os.path.join(OUT, f'hum-{x}.padded.wav')
    A.write_wav(padded, channels, 10 ** (gain_db / 20), lead=int(L.LEAD * RATE))
    A.run('ffmpeg', '-v', 'error', '-y', '-i', padded, '-c:a', 'libmp3lame', '-b:a', '128k', os.path.join(OUT, f'hum-{x}.mp3'))
    os.remove(padded)
    seconds = len(channels[0]) / RATE
    print(f'  hum-{x}  {seconds:5.2f} s  {lufs:6.1f} -> {lufs + gain_db:6.1f} LUFS')
    return seconds


def shot(x, kind, source, body, spec):
    chain = BODY.format(body=body, bite=3)
    cut = L.trim(A.decode(os.path.join(SRC, source), 1, chain)[0], spec)
    gain = 10 ** (spec['peak'] / 20) / max(abs(v) for v in cut)
    A.write_wav(os.path.join(OUT, f'{kind}-{x}.wav'), [cut], gain)
    print(f'  {kind}-{x}  {len(cut) / RATE:5.2f} s')


def main():
    variants = {}
    for x, spec in OPTIONS.items():
        print(f'option {x}')
        variants[x] = {'seconds': loop(x, spec), 'lead': L.LEAD}
        # the ignition lands on top of the jet's first second: a WHOOMP, then the roar
        shot(x, 'arm', spec['ignite'], spec['ignite_body'], dict(peak=-2, start=-24, end=-40, longest=0.95))
        # the cut-off: a puff and the embers, quieter than the ignition
        shot(x, 'off', spec['tail'], 3, dict(peak=-6, start=-24, end=-40, longest=0.9))
    path = os.path.join(OUT, 'set.json')
    with open(path) as f:
        made = json.load(f)
    made['variants'] = variants
    with open(path, 'w') as f:
        json.dump(made, f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
