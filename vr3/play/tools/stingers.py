"""
Each level's sting (2026-11-12: "a 10 second fun stinger for each"; then "maybe 5 second hit ... when the level is selected"): ElevenLabs Music v2.5
takes (flow "Office, castle and lab sound effects", nodes "<level> start stinger"), two per level, in
tools/level-src/stingers/<level>-a.mp3 and -b.mp3. Writes public/audio/stingers/<level>.m4a.

    python3 tools/stingers.py castle       # remake a level's old sting, picking the better take (overwrites the user's hit)
    python3 tools/stingers.py castle=b     # or name the take

Nothing here was listened to. A take is picked by measurement: it should start at once (little silence at
its head) and end by ringing out (its last half second well under its loudest), not stop dead. Then its
lead-in silence is trimmed, its tail faded over 0.4 s, and it is levelled to -16 LUFS (a little over the
songs' -20: a sting should land) and written as AAC at 160 kbps. Needs ffmpeg.
"""
import os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'level-src', 'stingers')
OUT = os.path.join(HERE, '..', 'public', 'audio', 'stingers')
# (every level's sting is now the user's own hit, 2026-11-12, cut by hand with ffmpeg to -16 LUFS, AAC 160k:
# level-src/stingers/kyoto-hit.mp3 at 2.3 s with a 0.3 s fade; castle-hit2.mp3 (the Haunted Hall's second
# take) and lab-hit.mp3 at 2 s with a 0.3 s fade; office-hit5.mp3 (both office levels; -hit to -hit4 were
# earlier takes) at 2 s with a 0.3 s fade; inferno-hit.mp3 (fire-hit), knockout-hit.mp3 and space-hit2.mp3 (space-hit.mp3 was the first) at 2 s with a 0.3 s fade; lumber-hit2.mp3 (lumber-hit.mp3 was the first) at 1.6 s with a 0.3 s fade. So this script makes nothing now: name a level to remake its old ElevenLabs sting.)
LEVELS = [a.split('=')[0] for a in sys.argv[1:]]
LENGTH = 5.0       # seconds kept: the end of each take (0: all of it)


def levels_db(path, step=0.1):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af',
        f'aresample=8000,asetnsamples={int(8000 * step)},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
        '-f', 'null', '-'], capture_output=True, text=True).stderr
    return [float(v) if v not in ('-inf', 'inf') else -90.0 for v in re.findall(r'RMS_level=(-?[\d.]+|-?inf)', out)]


def score(path):
    lv = levels_db(path)
    if not lv:
        return -999, 0.0
    peak = max(lv)
    head = next((i for i, v in enumerate(lv) if v > peak - 25), 0) * 0.1          # seconds before it gets going
    tail = sum(lv[-5:]) / 5                                                          # its last half second
    rings_out = peak - tail                                                          # how far under its peak it ends
    return min(rings_out, 24) - head * 8, head


def main():
    os.makedirs(OUT, exist_ok=True)
    asked = dict(a.split('=') for a in sys.argv[1:] if '=' in a)
    for level in LEVELS:
        takes = [t for t in ('a', 'b') if os.path.exists(os.path.join(SRC, f'{level}-{t}.mp3'))]
        if not takes:
            print(level, 'no takes'); continue
        scored = {t: score(os.path.join(SRC, f'{level}-{t}.mp3')) for t in takes}
        take = asked.get(level) or max(takes, key=lambda t: scored[t][0])
        src, head = os.path.join(SRC, f'{level}-{take}.mp3'), scored[take][1]
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout)
        # (since 2026-11-12, later: a five-second hit as a level is chosen, so its last five seconds, which
        # build into its final hit, faded in over a moment; set LENGTH to 0 for the whole take)
        start = max(0.0, head - 0.05) if not LENGTH else max(head, dur - LENGTH); length = dur - start
        dest = os.path.join(OUT, f'{level}.m4a')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.2f}', '-i', src, '-vn',
            '-af', f'afade=t=in:st=0:d={0.12 if LENGTH else 0.01},afade=t=out:st={max(0, length - 0.4):.2f}:d=0.4,loudnorm=I=-16:TP=-1.5:LRA=11',
            '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dest], check=True)
        print(level, 'take', take, {t: round(s[0], 1) for t, s in scored.items()}, f'{length:.1f}s', os.path.getsize(dest) // 1024, 'KB')


if __name__ == '__main__':
    main()
