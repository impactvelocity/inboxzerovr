#!/usr/bin/env python3
"""The home screen's retro UI sounds: tools/ui-src to public/audio/ui.

    python3 vr3/play/tools/uisounds.py

Asked for on 2026-11-14: "use elvenlabs to find better UI noises / retro game for the how to play buttton / select
( instead of the in game noises )", "also same for keypad noises and button clicks in ui - how to play, enter code,
just play". All are ElevenLabs sound effects (eleven_text_to_sound_v2, flow "vr3 retro UI sounds"), three takes each:
  confirm-*  "Retro 8-bit game start confirm sound, a bright quick two-note ascending chiptune arpeggio, press start, ..."
  back-*     "Retro 8-bit menu back cancel sound, a short descending two-note square-wave blip, chiptune UI close, ..."
  finding-user  the user's own (2026-11-14, "sound to play on find game ( instead of your loading sound )":
              ~/Downloads/UIClick-Style_Clean,_tech-in-Elevenlabs): a clean tech hit, loud for 0.26 s, its tail fading out by
              1.7 s; kept to 1.2 s, faded over the last 0.4 s. (It replaced search-a, an ElevenLabs "8-bit searching" run, in the flow.)
  miss-a     "Retro 8-bit error sound: a short low descending two-note square-wave buzz, chiptune "wrong answer" or "not found",
              playful not harsh, single sound, dry, no reverb" (NO INBOX FOUND; the others sank into bass a headset can't play)
  found-c    "Retro 8-bit success fanfare: a quick bright ascending chiptune arpeggio ending on a sparkly victory chord, like
              finding treasure or a level unlocked in a classic video game, cheerful celebration, about one second, dry, no
              reverb" (INBOX READY: it climbs from 0.8 to 4 kHz; asked for 2026-11-14, "a better sound for loading / finding
              game, and not found, and found game celebration, keeping with retro")
  (the keypad was a thin ElevenLabs tick, then an ElevenLabs "boop", then the user's digital_key_pad_hit_#2, then their
   retro_game_bip_#2; those takes are not kept: the boop is in the flow, the user's in their Downloads)
  key-click  the user's own, the one used (2026-11-14, "noise for keypad and selects in ui try this one":
              ~/Downloads/UIClick-soft,_appealing,_cut-Elevenlabs): a soft tick, then an 800 Hz note from 0.05 s that falls
              20 dB by 0.15 s; cut to its first 0.3 s, faded over the last 0.12 s, lightly filtered.
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
    'key':     ('key-click', (0.0, 0.3), 'highpass=f=120', -9, 0.12),    # a keypad digit, a How to Play card or tab: the user's soft click                         # a keypad digit, a How to Play card or tab: a tiny tick
    'confirm': ('confirm-b', (0.0, 0.45), 'highpass=f=250', -8),                     # Enter Code, Just Play, Play, How to Play
    'back':    ('back-a', (0.0, 0.42), 'highpass=f=250', -9),                        # Back, Close, Clr
    'finding': ('finding-user', (0.0, 1.2), 'highpass=f=90', -9, 0.4),              # FINDING YOUR GAME: the user's tech hit
    'notfound': ('miss-a', (0.0, 0.5), 'highpass=f=120', -9, 0.15),                  # NO INBOX FOUND
    'found':   ('found-c', (0.0, 0.95), 'highpass=f=150', -8, 0.2),                  # INBOX READY
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, spec in SOUNDS.items():
        take, (t0, t1), chain, peak = spec[:4]
        fade = spec[4] if len(spec) > 4 else 0.05
        source = os.path.join(SRC, take + '.mp3')
        if not os.path.exists(source):
            print(f'  {name:8s} no take at {source}, skipped')
            continue
        x = A.decode(source, 1, chain)[0]
        cut = array.array('f', x[int(t0 * RATE):int(t1 * RATE)])
        rise, fall = RATE // 1000, min(int(fade * RATE), len(cut) // 3)
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
