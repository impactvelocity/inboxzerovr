#!/usr/bin/env python3
"""Kyoto's own cut sounds and the samurai's yells and grunts: tools/level-src/kyoto to public/audio/kyoto.

    python3 vr3/tools/kyotosounds.py

All are ElevenLabs sound effects (eleven_text_to_sound_v2), made on 2026-11-11 when the user asked for
"better sounds for cutting the emails" and "samurai yells when swinging", then "short yells and grunts" (grunts later taken out):
  cut-*    "A razor-sharp katana slicing cleanly through a sheet of thick paper in one fast stroke: a crisp
            bright swish with a clean papery slice and a short metallic ring at the end, close, dry,
            punchy, no low rumble, under one second"
  yell-*   "A single short fierce samurai kiai battle shout, one male voice yelling a sharp powerful
            "HYAH!" as he strikes with a sword, close, dry, energetic, no music, no echo, under one second"
            (they came back about 1.5 s long: only the attack of each is used, faded, to keep them short)
  grunt-*  "One short sharp male effort grunt of a samurai swinging a sword, a quick forceful "hah" exhale
            through the teeth, close, dry, very short, no music, no echo"
Each is cut to the stretch named below (seconds into the take), faded at its ends and levelled. To try
another take, replace the file and run this again. src/ambience.ts plays them (kiai(), and play() finds
kyoto/<name> first in Kyoto).
"""
import array
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'web', 'tools'))
import ambience as A  # noqa: E402

SRC = os.path.join(HERE, 'level-src', 'kyoto')
OUT = os.path.join(HERE, '..', 'public', 'audio', 'kyoto')
RATE = A.RATE

# out name: take, (from, to) seconds, filter, peak dBFS
SOUNDS = {
    'slash1': ('cut-d', (0.0, 0.45), 'highpass=f=150', -3),
    'slash2': ('cut-a', (0.0, 0.60), 'highpass=f=150', -3),
    'slash3': ('cut-c', (0.12, 0.75), 'highpass=f=150', -3),
    'yell1': ('yell-a', (0.0, 0.55), 'highpass=f=120', -5),
    'yell2': ('yell-b', (0.16, 0.70), 'highpass=f=120', -5),
    'yell3': ('yell-c', (0.02, 0.55), 'highpass=f=120', -5),
    'yell4': ('yell-d', (0.10, 0.70), 'highpass=f=120', -5),
    # (grunt-a..d were used as grunts for a while; taken out at the user's asking. The takes are still here.)
    # The sword made ready, a different one each time the trigger is pressed (asked for on 2026-11-11):
    # arm-orig is the original knife draw (tools/sword-src/arm.mp3); the others answer the prompt
    # "A katana drawn quickly from its wooden scabbard and made ready: one short bright metallic shing
    # that rings out clean, with a faint magical shimmer at the end, close, dry, crisp, no low rumble,
    # no music". (arm-a swells up over a second, too slow to answer a trigger, and is not used.)
    'arm1': ('arm-orig', (0.0, 0.62), 'highpass=f=300', -4),
    'arm2': ('arm-b', (0.10, 0.62), 'highpass=f=300', -4),
    'arm3': ('arm-c', (0.0, 0.66), 'highpass=f=300', -4),
    'arm4': ('arm-d', (0.06, 0.52), 'highpass=f=300', -4),
    # The user's own (2026-11-11, ElevenLabs takes from their Downloads): two more sword slashes for the
    # cuts, and two five-second energetic stingers, one at the start of each round (stereo).
    'slash4': ('sword-a', (0.04, 0.90), 'highpass=f=150', -3),
    'slash5': ('sword-b', (0.02, 0.80), 'highpass=f=150', -3),
    'stinger1': ('stinger-a', (0.44, 5.0), 'highpass=f=30', -3, 2),
    'stinger2': ('stinger-b', (0.0, 5.0), 'highpass=f=30', -3, 2),
    # Throwing a letter to keep it (asked for on 2026-11-11: "more fun, like another stinger, 2 second fun
    # Japanese sound"): "A playful two-second Japanese game reward stinger: a quick bright ascending koto and
    # shamisen pluck flourish ending on a crisp taiko drum hit and a small wooden clapper, fun, upbeat,
    # cheerful, clean, close, no vocals". keep-b and keep-d have the most flourish in them; keep-c is too short.
    # (keep1..3 were these ElevenLabs flourishes for a while; the user did not like them, and the throw
    # sounds are now made by tools/chimes.py. The takes keep-a..d are still in level-src/kyoto.)
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, spec in SOUNDS.items():
        take, (t0, t1), chain, peak = spec[:4]
        channels = spec[4] if len(spec) > 4 else 1
        source = os.path.join(SRC, take + '.mp3')
        if not os.path.exists(source):
            print(f'  {name:7s} no take at {source}, skipped')
            continue
        cuts = []
        for a in A.decode(source, channels, chain):
            cut = array.array('f', a[int(t0 * RATE):int(t1 * RATE)])
            rise, fall = RATE // 400, min(int(0.12 * RATE), len(cut) // 3)
            for i in range(rise):
                cut[i] *= i / rise
            for i in range(fall):
                cut[len(cut) - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / fall)
            cuts.append(cut)
        gain = 10 ** (peak / 20) / max(abs(x) for cut in cuts for x in cut)
        A.write_wav(os.path.join(OUT, name + '.wav'), cuts, gain)
        print(f'  {name:8s} {len(cuts[0]) / RATE:4.2f} s from {take}  {channels} ch  peak {peak} dBFS')


if __name__ == '__main__':
    main()
