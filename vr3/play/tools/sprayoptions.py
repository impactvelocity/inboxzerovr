#!/usr/bin/env python3
"""The lab's sprayer, four ways (2026-11-13: "make the spray sound more fun, keep current as back up, but make
some more and give me some options - more like spray can / spray paint").

    python3 vr3/play/tools/sprayoptions.py

Takes are in tools/level-src/lab/spray (ElevenLabs flow "Office, castle and lab sound effects", nodes
"Lab spray: ..."). For each option this writes into public/audio/lab/:

  hum-<x>.mp3   the spray, held while the trigger is down (a padded loop, as levelsounds.py makes them)
  arm-<x>.wav   a spray can's rattle, played as the trigger goes down
  off-<x>.wav   a short "pfft" as the nozzle shuts, played as it comes up

and adds {"variants": {x: {seconds, lead}}} to set.json (run levelsounds.py lab first: it rewrites set.json).
The game uses the same switch as Inferno's flame thrower (ambience.ts, humVariant): pick one on /spray.html
(kept in localStorage); "0" is the original hiss, which is still hum.mp3 and arm.wav, untouched.

The old hiss was cut to everything over 1.1 kHz and flattened (even 1.0), which is why it was a plain whistle
of air. These keep some body from 450 Hz, lift the "psss" around 4 kHz, take the fizz over 10 kHz down a
little, and leave half the sputter in. Mastered 2 dB louder than the old one. Nothing was auditioned: takes
were chosen by measurement (levelsounds.py --measure tools/level-src/lab/spray).
"""
import array
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import levelsounds as L  # noqa: E402

A = L.A
RATE = L.RATE
SRC = os.path.join(HERE, 'level-src', 'lab', 'spray')
OUT = os.path.join(HERE, '..', 'public', 'audio', 'lab')

CHAIN = 'highpass=f={low},highpass=f={low},equalizer=f=4000:t=q:w=0.9:g={psss},treble=g=-3:f=10000'

OPTIONS = {
    # A, Spray Paint: the steadiest and fullest of the takes, a dense pressurised psssh
    'a': dict(take='paint-a.mp3', low=450, psss=5, even=0.6, rattle='rattle-a.mp3'),
    # B, Graffiti: airier, with crackles of droplets in it; the most top end, so less lift
    'b': dict(take='graffiti-a.mp3', low=500, psss=4, even=0.5, rattle='rattle-a.mp3'),
    # C, Cartoon: the liveliest take (7 dB between its quiet and loud moments, the others 2-3): kept uneven
    'c': dict(take='cartoon-a.mp3', low=500, psss=5, even=0.2, rattle='rattle-b.mp3'),
    # D, Foamy: the most body between 600 Hz and 2.5 kHz, a wet sputtering spray
    'd': dict(take='foam-a.mp3', low=350, psss=4, even=0.4, rattle='rattle-b.mp3',
              # the one the game uses (2026-11-13: "use D ..foam sound for spray - and make .loud"): squeezed and 8 dB up
              squeeze=True, lufs=-14, arm_peak=-1.5, off_peak=-6),
}
LUFS = -22          # the old hiss is -24, played at 0.42 (lab.ts, labSound.hum)


def loop(x, spec):
    chain = CHAIN.format(low=spec['low'], psss=spec['psss'])
    if spec.get('squeeze'):
        chain += ',acompressor=threshold=-24dB:ratio=4:attack=5:release=80:makeup=6,alimiter=limit=0.8:attack=2:release=40'
    a = A.decode(os.path.join(SRC, spec['take']), 1, chain)[0][int(0.1 * RATE):int(5.9 * RATE)]
    channels = A.even_out([A.fold(a, int(1.0 * RATE))], spec['even'])
    probe = os.path.join(OUT, f'hum-{x}.probe.wav')
    A.write_wav(probe, channels, repeat=2)
    lufs, peak = A.loudness(probe)
    os.remove(probe)
    gain_db = min(spec.get('lufs', LUFS) - lufs, -1.0 - peak)
    padded = os.path.join(OUT, f'hum-{x}.padded.wav')
    A.write_wav(padded, channels, 10 ** (gain_db / 20), lead=int(L.LEAD * RATE))
    A.run('ffmpeg', '-v', 'error', '-y', '-i', padded, '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, f'hum-{x}.mp3'))
    os.remove(padded)
    seconds = len(channels[0]) / RATE
    print(f'  hum-{x}  {seconds:5.2f} s  {lufs:6.1f} -> {lufs + gain_db:6.1f} LUFS')
    return seconds, chain


def rattle(x, spec):
    # the clacks of the ball in the can; the take's thump under 150 Hz is taken off
    cut = L.trim(A.decode(os.path.join(SRC, spec['rattle']), 1, 'highpass=f=260,highpass=f=260,equalizer=f=3000:t=q:w=1:g=3')[0],
                 dict(start=-24, end=-36, longest=0.4))
    gain = 10 ** (spec.get('arm_peak', -5) / 20) / max(abs(v) for v in cut)
    A.write_wav(os.path.join(OUT, f'arm-{x}.wav'), [cut], gain)
    print(f'  arm-{x}  {len(cut) / RATE:5.2f} s')


def pfft(x, spec, chain):
    # the nozzle shutting: a fifth of a second of the spray itself, falling away fast
    a = A.decode(os.path.join(SRC, spec['take']), 1, chain)[0][int(2.0 * RATE):int(2.22 * RATE)]
    n = len(a)
    shaped = array.array('f', (v * min(1.0, i / (0.004 * RATE)) * math.exp(-5.5 * i / n) for i, v in enumerate(a)))
    gain = 10 ** (spec.get('off_peak', -12) / 20) / max(abs(v) for v in shaped)
    A.write_wav(os.path.join(OUT, f'off-{x}.wav'), [shaped], gain)
    print(f'  off-{x}  {n / RATE:5.2f} s')


def main():
    variants = {}
    for x, spec in OPTIONS.items():
        print(f'option {x}')
        seconds, chain = loop(x, spec)
        variants[x] = {'seconds': seconds, 'lead': L.LEAD}
        rattle(x, spec)
        pfft(x, spec, chain)
    path = os.path.join(OUT, 'set.json')
    with open(path) as f:
        made = json.load(f)
    made['variants'] = variants
    with open(path, 'w') as f:
        json.dump(made, f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
