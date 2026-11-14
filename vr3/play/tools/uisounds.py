#!/usr/bin/env python3
"""The home screen's retro UI sounds: tools/ui-src to public/audio/ui.

    python3 vr3/play/tools/uisounds.py

Asked for on 2026-11-14: "use elvenlabs to find better UI noises / retro game for the how to play buttton / select
( instead of the in game noises )", "also same for keypad noises and button clicks in ui - how to play, enter code,
just play". All are ElevenLabs sound effects (eleven_text_to_sound_v2, flow "vr3 retro UI sounds"), three takes each:
  confirm-*  "Retro 8-bit game start confirm sound, a bright quick two-note ascending chiptune arpeggio, press start, ..."
  back-*     "Retro 8-bit menu back cancel sound, a short descending two-note square-wave blip, chiptune UI close, ..."
  (the keypad was a thin ElevenLabs tick, then an ElevenLabs "boop", then the user's digital_key_pad_hit_#2, before their bip;
   those takes are not kept: the boop is in the flow, the hit in the user's Downloads)
  key-bip    the user's own, the one used (2026-11-14, "try this one instead": ~/Downloads/retro_game_bip_#2): a quick bright
              retro bip, 0.15 s of sound in a 0.49 s file; cut to its first 0.18 s, lightly filtered.
Chosen by measurement, not by ear (one event, a quick start, little energy under 250 Hz); only the chosen takes are kept in
tools/ui-src (the rest, and select / open / tab, were dropped on 2026-11-14 when the user asked for the keypad's tick on the
cards and tabs and Enter Code's sound on How to Play). The flow still has every take. src/uisound.ts plays them.
"""
import array
import math
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'web', 'tools'))
import ambience as A  # noqa: E402

SRC = os.path.join(HERE, 'ui-src')
OUT = os.path.join(HERE, '..', 'public', 'audio', 'ui')
RATE = A.RATE

# out name: take, (from, to) seconds after the filter, ffmpeg filter, peak dBFS
SOUNDS = {
    'key':     ('key-bip', (0.0, 0.18), 'highpass=f=120', -9),           # a keypad digit, a How to Play card or tab: the user's bip                         # a keypad digit, a How to Play card or tab: a tiny tick
    'confirm': ('confirm-b', (0.0, 0.45), 'highpass=f=250', -8),                     # Enter Code, Just Play, Play, How to Play
    'back':    ('back-a', (0.0, 0.42), 'highpass=f=250', -9),                        # Back, Close, Clr
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (take, (t0, t1), chain, peak) in SOUNDS.items():
        source = os.path.join(SRC, take + '.mp3')
        if not os.path.exists(source):
            print(f'  {name:8s} no take at {source}, skipped')
            continue
        x = A.decode(source, 1, chain)[0]
        cut = array.array('f', x[int(t0 * RATE):int(t1 * RATE)])
        rise, fall = RATE // 1000, min(int(0.05 * RATE), len(cut) // 3)
        for i in range(rise):
            cut[i] *= i / rise
        for i in range(fall):
            cut[len(cut) - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / fall)
        gain = 10 ** (peak / 20) / max(abs(v) for v in cut)
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, name + '.wav')
            A.write_wav(wav, [cut], gain)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'flac', os.path.join(OUT, name + '.flac')], check=True)
        print(f'  {name:8s} {len(cut) / RATE:4.2f} s from {take}  peak {peak} dBFS')


if __name__ == '__main__':
    main()
