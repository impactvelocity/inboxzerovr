The axe made ready. NOW (2026-11-13, later: "a weird sound that doesnt fit an axe, make it a blade, just a heavy blade"):
arm-blade-take4.mp3 is public/audio/lumber/arm.wav. Four ElevenLabs takes of a heavy steel blade drawn (node "LumberHack: heavy
blade made ready"), chosen by measurement, not by ear: it starts at once, has the most body (150-800 Hz) of the four, and its ring
is the lowest and steadiest (about 1.35 kHz). Cut to 0.6 s, brought to about -20 dB mean (as the old one) with peaks at -4 dB.

  ffmpeg -i arm-blade-take4.mp3 -af "highpass=f=60,atrim=0:0.6,afade=t=out:st=0.5:d=0.1,aresample=44100" -ac 1 b4.wav, then
  volume to -20 dB mean into alimiter=limit=0.63

Before it: the "axe made ready" takes (arm-axe-take1..4, a ringing shing, take 2 was used for a moment), and before those
arm-before-2026-11-13.wav.
