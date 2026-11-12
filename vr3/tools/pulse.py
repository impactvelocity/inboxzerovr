"""
The beat of a song, for things that pulse with the music (the end of a game, 2026-11-11): its low end's
loudness every 50 ms, from 0 (quiet) to 1 (its loudest kicks), written beside it as <song>-pulse.json.

    python3 tools/pulse.py public/audio/kyoto/anthem.m4a [...]

Needs ffmpeg. Low-passed at 160 Hz so the kick and bass drive it, not the melody; each value is how far
that moment's level sits between the song's quiet (10th percentile) and its peaks (98th).
"""
import json, os, re, subprocess, sys

STEP = 0.05
for path in sys.argv[1:]:
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af',
        f'lowpass=f=160,aresample=8000,asetnsamples={int(8000 * STEP)},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
        '-f', 'null', '-'], capture_output=True, text=True).stderr
    levels = [float(v) if v not in ('-inf', 'inf') else -90.0 for v in re.findall(r'RMS_level=(-?[\d.]+|-?inf)', out)]
    ordered = sorted(levels)
    low, high = ordered[int(len(ordered) * 0.10)], ordered[int(len(ordered) * 0.98)]
    pulse = [round(max(0.0, min(1.0, (v - low) / max(1e-6, high - low))) ** 1.6, 3) for v in levels]
    dest = re.sub(r'\.\w+$', '-pulse.json', path)
    with open(dest, 'w') as f:
        json.dump({'step': STEP, 'pulse': pulse}, f, separators=(',', ':'))
    print(path, len(pulse), 'steps', os.path.getsize(dest) // 1024, 'KB')
