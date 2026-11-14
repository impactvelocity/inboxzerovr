The keyboard made ready in Keyboard Smash (2026-11-13: "make a better activate sound for keyboard, something maybe like a pc
turning on"). Four ElevenLabs takes (flow "Office, castle and lab sound effects", node "Keyboard made ready: retro PC power
on"), 1.6 s each. Take 3 is public/audio/office/arm.wav: chosen by measurement, not by ear (a click at once, a whir rising
from about 325 Hz to 1.9 kHz, a clear tone at about 2.8 kHz at the end). Made with:

  ffmpeg -i arm-pc-take3.mp3 -af "highpass=f=90,afade=t=out:st=1.5:d=0.1,loudnorm=I=-16:TP=-3:LRA=11,volume=3dB,alimiter=limit=0.6:attack=2:release=40:level=false,aresample=44100" -ac 1 -c:a pcm_s16le ../../../public/audio/office/arm.wav

To try another take, put its number in place of 3. Before this: Haunted Halls' sound (castle/arm.wav), and before that
arm-keyboard-before-2026-11-13.wav.
