#!/usr/bin/env python3
"""The How to Play intro's voice, made a little digital: tools/howto-src to public/audio/howto.

    python3 vr3/play/tools/howtovoice.py

Asked for on 2026-11-14: "try and apply an effect for the intro voice over thats not the main annoncer voive ( ready lets
go, fight, etc ) to make it send a bit more digital, video gamer announcer", first for the three explaining lines
(how-to-play, round-one, round-two), then "use that same effect and swap older "ready? lets go" voice over": READY? LET'S GO!
is the user's first take again (~/Downloads/lets-go.mp3, not i-ready-letsgo), with the same effect.

tools/howto-src holds the dry lines as the user gave them. The chain, in order:
  - clean up and shape: lows cut under 160 Hz, a dip at 250 Hz (less boom), a lift at 3.2 kHz (presence), compressed hard
    so it sits forward like an announcer;
  - the digital part: a copy crushed to 8 bits and held every 3 samples (a gritty, aliased game-console edge), filtered
    and mixed in under the clean voice at DIGITAL (0.35), so the words stay clear;
  - size: a light two-voice chorus (a doubled, slightly synthetic sheen) and a short slapback echo at 70 / 140 ms;
  - levelled to the other clips (about -17 LUFS integrated, under -1.5 dBFS peak).
Nothing was auditioned: to make it more or less digital change DIGITAL (0 is dry, 1 is all crushed) and run this again;
to go back to the dry lines, copy tools/howto-src/*.mp3 into public/audio/howto.
"""
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'howto-src')
OUT = os.path.join(HERE, '..', 'public', 'audio', 'howto')
LINES = ['how-to-play', 'round-one', 'round-two', 'lets-go']
DIGITAL = 0.35
TARGET = -17.0

CHAIN = (
    "[0:a]aformat=channel_layouts=mono,highpass=f=160,"
    "equalizer=f=250:t=q:w=1:g=-3,equalizer=f=3200:t=q:w=1.2:g=4,"
    "acompressor=threshold=-20dB:ratio=4:attack=4:release=80:makeup=2,asplit[dry][wet];"
    "[wet]acrusher=bits=8:samples=3:mix=1:mode=log:aa=0.5,lowpass=f=6500,volume={digital}[crushed];"
    "[dry][crushed]amix=inputs=2:normalize=0,"
    "chorus=0.8:0.9:20|27:0.3|0.25:0.4|0.3:1.5|1.2,"
    "aecho=1:0.8:70|140:0.2|0.1,"
    "lowpass=f=9500,volume={gain}dB,alimiter=limit=0.84:level=false[out]"
)


def render(source, target, gain):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', source, '-filter_complex', CHAIN.format(digital=DIGITAL, gain=gain),
                    '-map', '[out]', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', target], check=True)


def loudness(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    i = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', out)[-1]); peak = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', out)[-1])
    return i, peak


def main():
    for name in LINES:
        source, target = os.path.join(SRC, name + '.mp3'), os.path.join(OUT, name + '.mp3')
        render(source, target, 0)
        level, _ = loudness(target)
        render(source, target, round(TARGET - level, 2))      # (once more, at the level the others are)
        level, peak = loudness(target)
        print(f'  {name:12s} {level:6.1f} LUFS  peak {peak:5.1f} dBFS')


if __name__ == '__main__':
    main()
