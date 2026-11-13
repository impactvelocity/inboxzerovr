#!/usr/bin/env python3
"""The sounds of the sword becoming live (its trigger held): tools/sword-src to public/audio.

    python3 vr3/play/tools/swordsounds.py

  arm.wav   the blade made ready: a knife drawn, cut to the sound itself and levelled
  hum.mp3   the live blade's hum, as a loop with no seam, and hum.json with its exact length

Both takes are ElevenLabs sound effects (eleven_text_to_sound_v2):
  arm  "Knife blade drawn quickly from a sheath, short bright metallic shing with a clean ringing tail, close, dry"
  hum  "Soft steady hum of an energy sword held still, low warm electric drone with a faint slow shimmer, quiet,
        constant, no swings" (loop on)
The work is done by the functions in ../../../web/tools/ambience.py, which explains the loop format
(a period of sound with a little of itself either side, because MP3 decoders pad the ends).
To try another take, replace the file in tools/sword-src and run this again.
"""
import array
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'web', 'tools'))
import ambience as A  # noqa: E402

SRC = os.path.join(HERE, 'sword-src')
OUT = os.path.join(HERE, '..', 'public', 'audio')
RATE = A.RATE


def arm():
    a = A.decode(os.path.join(SRC, 'arm.mp3'), 1, 'highpass=f=300')[0]
    hop = RATE // 200
    level = [math.sqrt(sum(x * x for x in a[i:i + hop]) / hop) for i in range(0, len(a) - hop + 1, hop)]
    top = max(level)
    loud = [i for i, v in enumerate(level) if v > top * 10 ** (-30 / 20)]
    tail = [i for i, v in enumerate(level) if v > top * 10 ** (-48 / 20)]
    # it has to answer the trigger at once: start right where the sound does
    cut = array.array('f', a[max(0, loud[0] * hop - RATE // 500):min(len(a), (tail[-1] + 1) * hop + RATE // 25)])
    rise, fall = RATE // 500, min(RATE // 12, len(cut) // 3)
    for i in range(rise):
        cut[i] *= i / rise
    for i in range(fall):
        cut[len(cut) - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / fall)
    gain = 10 ** (-4 / 20) / max(abs(x) for x in cut)
    A.write_wav(os.path.join(OUT, 'arm.wav'), [cut], gain)
    print(f'arm   {len(cut) / RATE:5.3f} s  gain {20 * math.log10(gain):+5.1f} dB')


def hum():
    # a headset's speakers have little below 150 Hz: lift the part of the hum they can play
    channels = A.decode(os.path.join(SRC, 'hum.mp3'), 1, 'highpass=f=85,equalizer=f=520:t=q:w=0.7:g=7,lowpass=f=5000')
    channels = [A.fold(ch, int(0.9 * RATE)) for ch in channels]
    channels = A.even_out(channels, 0.9)
    n = len(channels[0])
    probe = os.path.join(OUT, 'hum.probe.wav')
    A.write_wav(probe, channels, repeat=3)
    lufs, peak = A.loudness(probe)
    gain = 10 ** (min(-30 - lufs, -3 - peak) / 20)
    os.remove(probe)
    padded = os.path.join(OUT, 'hum.padded.wav')
    A.write_wav(padded, channels, gain, lead=int(A.LEAD * RATE))
    A.run('ffmpeg', '-v', 'error', '-y', '-i', padded, '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, 'hum.mp3'))
    os.remove(padded)
    with open(os.path.join(OUT, 'hum.json'), 'w') as out:
        json.dump({'seconds': n / RATE, 'lead': A.LEAD}, out)
    print(f'hum   {n / RATE:5.3f} s  {lufs:6.1f} -> -30 LUFS')


if __name__ == '__main__':
    arm()
    hum()
