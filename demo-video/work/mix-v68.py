"""The soundtrack: voice on top, the game's own music ducked under it, the game's sounds as effects.

Stems land in work/audio (bed.wav, sfx.wav, vo.wav) so the balance can be changed without re-rendering.
Reads work/cues.json and work/sfx.json (written by `node tools/render.mjs sfx`).
"""
import json, os, struct, subprocess, sys, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); A = os.path.join(ROOT, 'work', 'audio')
sys.path.insert(0, os.path.join(ROOT, 'tools')); from env import env
cues = json.load(open(os.path.join(ROOT, 'work', 'cues.json'))); C = lambda k: cues['cues'][k]['start']
fx = json.load(open(os.path.join(ROOT, 'work', 'sfx.json'))); DUR = fx['dur']
SR = 44100
VOICE_FX = False              # v40: "remove the effect on the voice over voice" (True: the How to Play chain, tools/voicefx.py)
MUSIC = True                  # v18: "add the inferno level music...", v23: "use the kyoto song instead of inferno"
MUSIC_FILE = os.path.join(ROOT, '..', 'vr3', 'play', 'public', 'audio', 'office', 'music.m4a')      # v68: "change background song to the keyboard smash level song" (v59-v67: Inferno's, v42-v58: Keyboard Smash's)
MUSIC_LEN = 281.20            # the track's length
MUSIC_FROM = None             # v21: None = start where the track's own ending lands on the film's end (its loudest stretch, from the first frame)
DUCK_DB = -13.0               # music under the voice (kept well under it: the voice must stay very clear)
HOOK_DUCK_DB = -7.0           # v21: lighter under the 7 s hook, so the music is heard from the start (about 12 dB under her)
BED_DB, END_DB = -6.0, -2.0   # music level in the gaps, and in the 20 s gameplay outro after the voice
DUCKING = False               # v34: "make the background music be same level throughout the video": no ducking; the song is evened out and held at MUSIC_LUFS
END_SONG = os.path.join(ROOT, '..', 'vr3', 'play', 'public', 'audio', 'office', 'music.m4a')      # v41: the Keyboard Smash song over the ending clip
END_SONG_LEN = 281.2          # its length: its own ending lands on the film's last frame
END_LUFS = -23.0              # louder than the bed: no voice over the ending
ANTHEM = os.path.join(ROOT, '..', 'vr3', 'play', 'public', 'audio', 'office', 'anthem.m4a')      # v43: Keyboard Smash's end anthem over the ending
ANTHEM_LUFS = -19.0           # the chorus up front, about level with the voice sections after mastering
T_OUT = cues['cues']['try']['end'] + 1.6      # (v57: the last line is 'try' now)      # where the ending clip takes over (OUT_HOLD in scenes/film.js)
MUSIC_LUFS = -31.0            # about 13 dB under the voice, everywhere
MUSIC_IN, MUSIC_IN_LEN = C('sword'), 1.1      # v64: "start of video, make music 0% then fade in to normal level on the have you tried a sword" (in by the split, 0:06.5)
GAP_BOOST_DB = 1.5            # v59: "when voice over is silent, increase background music 10%": about 10% louder (+1.5 dB) in the voice's pauses
SFX_DB = -7.0                 # v18 hits: "there but not overboard"
SFX_NORM = -20.0              # each hit is first levelled to this (they range from -16 to -32 LUFS as made)

def run(*a): subprocess.run(a, check=True, capture_output=True)
def wav(name): return os.path.join(A, name)

if MUSIC:
    # 1. music: the Inferno track from MUSIC_FROM, faded in at the start and out over the last 3 s
    start = MUSIC_FROM if MUSIC_FROM is not None else max(0, MUSIC_LEN - DUR - 0.05)      # v42: the song's own ending lands on the last frame
    # v21: "play the sound track music right away": no fade in; the track's own ending closes the film
    run('ffmpeg', '-y', '-ss', f'{start:.3f}', '-t', f'{DUR:.3f}', '-i', MUSIC_FILE, '-ac', '2', '-ar', str(SR),
        '-af', f'afade=t=in:d=0.02,apad,atrim=0:{DUR:.3f},afade=t=out:st={DUR - 0.4:.3f}:d=0.4', wav('music.wav'))
    print('music from', round(start, 2), 's into the track')

    if not DUCKING:
        # v34: one steady level: the song's own swells evened out with a slow leveller, then set to MUSIC_LUFS
        import re as _re
        def _lufs(path):
            err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
            return float(_re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])
        # (the leveller needs a run-up: level 20 s of the song before the film's start too, then trim it off)
        pre = min(20.0, start)
        run('ffmpeg', '-y', '-ss', f'{start - pre:.3f}', '-t', f'{DUR + pre:.3f}', '-i', MUSIC_FILE, '-ac', '2', '-ar', str(SR),
            '-af', f'dynaudnorm=f=500:g=31:p=0.9:m=8:s=0,atrim={pre:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02', '-c:a', 'pcm_s16le', wav('music-even.wav'))
        g = MUSIC_LUFS - _lufs(wav('music-even.wav'))
        if ANTHEM and fx.get('anthem') is not None:
            # v43: "when the end plays with keyboard smash outro - play the keyboard smash level end song anthem, so it ends
            # with the power metal chorus": the levelled bed runs until the anthem starts (scenes/film.js puts its first
            # "Smash" on the ending clip's first hit), fading under its opening; the anthem plays whole, unlevelled, to the end
            X = fx['anthem']
            run('ffmpeg', '-y', '-i', ANTHEM, '-ac', '2', '-ar', str(SR), '-c:a', 'pcm_s16le', wav('anthem-raw.wav'))
            eg = ANTHEM_LUFS - _lufs(wav('anthem-raw.wav')); ms = int(X * 1000)
            run('ffmpeg', '-y', '-i', wav('music-even.wav'), '-i', wav('anthem-raw.wav'), '-filter_complex',
                f'[0]volume={g:.2f}dB,afade=t=out:st={X - .15:.3f}:d=0.6,atrim=0:{X + .5:.3f}[a];[1]volume={eg:.2f}dB,adelay={ms}|{ms}[b];'
                f'[a][b]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur={DUR:.3f},atrim=0:{DUR:.3f},afade=t=out:st={DUR - 0.25:.3f}:d=0.25', '-c:a', 'pcm_s16le', wav('bed.wav'))
            print('bed until', round(X, 2), 's, then the anthem whole (', round(eg, 1), 'dB )')
        elif END_SONG:
            # v42: one song from start to end (END_SONG is the same file): the levelled bed until the ending, then the same song
            # unlevelled and louder, so its real last hits and ring-out close the film; the two are on one timeline, so the
            # handover at T_OUT is only a level change
            X = T_OUT - .3
            run('ffmpeg', '-y', '-ss', f'{start + X:.3f}', '-t', f'{DUR - X:.3f}', '-i', MUSIC_FILE, '-ac', '2', '-ar', str(SR), '-c:a', 'pcm_s16le', wav('end-song-raw.wav'))
            eg = END_LUFS - _lufs(wav('end-song-raw.wav')); ms = int(X * 1000)
            run('ffmpeg', '-y', '-i', wav('music-even.wav'), '-i', wav('end-song-raw.wav'), '-filter_complex',
                f'[0]volume={g:.2f}dB,afade=t=out:st={X:.3f}:d=0.6,atrim=0:{X + .7:.3f}[a];[1]volume={eg:.2f}dB,afade=t=in:d=0.6,adelay={ms}|{ms}[b];'
                f'[a][b]amix=inputs=2:normalize=0:duration=longest,atrim=0:{DUR:.3f}', '-c:a', 'pcm_s16le', wav('bed.wav'))
            print('one song from', round(start, 2), 's in; up to the ending level at', round(X, 2), 's')
        else:
            run('ffmpeg', '-y', '-i', wav('music-even.wav'), '-af', f'volume={g:.2f}dB,afade=t=out:st={DUR - 0.5:.3f}:d=0.5,atrim=0:{DUR:.3f}', '-c:a', 'pcm_s16le', wav('bed.wav'))
    # 2. ducking envelope from the voice, with look-ahead so the music dips before each line
    if DUCKING:
        e = env(wav('vo.wav'), 100)
        on = [1.0 if x > 0.012 else 0.0 for x in e]
        look = 12; act = [max(on[i:i + look + 1] or [0]) for i in range(len(on))]
        g, gains, cur = [], [], 0.0
        for i in range(int(DUR * 100) + 2):
            tgt = act[i] if i < len(act) else 0.0
            cur += (tgt - cur) * (0.35 if tgt > cur else 0.05)        # fast down, slow back up
            t = i / 100
            base = END_DB if t > cues['cues']['try']['end'] else BED_DB
            db = base + (HOOK_DUCK_DB if t < C('slash') else DUCK_DB) * cur
            gains.append(10 ** (db / 20))
        # write the envelope as a stereo wav at full rate and multiply
        step = SR // 100
        with open(wav('duck.raw'), 'wb') as f:
            for i in range(len(gains) - 1):
                a, b = gains[i], gains[i + 1]
                f.write(b''.join(struct.pack('<ff', a + (b - a) * k / step, a + (b - a) * k / step) for k in range(step)))
        run('ffmpeg', '-y', '-i', wav('music.wav'), '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', wav('duck.raw'),
            '-filter_complex', '[0][1]amultiply,atrim=0:%.3f' % DUR, '-c:a', 'pcm_s16le', wav('bed.wav'))

# v59: lift the bed in the voice's pauses (only pauses of 0.4 s or more, starting a beat after the voice stops and back
# down just before it starts again, with soft ramps), up to the ending anthem, which keeps its own level
if MUSIC and GAP_BOOST_DB:
    e = env(wav('vo.wav'), 100); n = int(DUR * 100) + 2
    on = [(e[i] > 0.012) if i < len(e) else False for i in range(n)]
    tgt = [0.0] * n; i = 0
    while i < n:
        if on[i]: i += 1; continue
        j = i
        while j < n and not on[j]: j += 1
        if j - i >= 40:
            for k in range(i + 12, max(i + 12, j - 15)): tgt[k] = 1.0
        i = j
    stop = int((fx.get('anthem') or DUR) * 100) - 30
    gains, cur = [], 0.0
    for i in range(n):
        t_ = tgt[i] if i < stop else 0.0
        cur += (t_ - cur) * (0.06 if t_ > cur else 0.3)      # (up over about a third of a second, down fast)
        fin = (lambda q: q * q * (3 - 2 * q))(min(1.0, max(0.0, (i / 100 - MUSIC_IN) / MUSIC_IN_LEN)))      # v64: silent, then in on "have you tried a sword"
        gains.append(10 ** (GAP_BOOST_DB * cur / 20) * fin)
    step = SR // 100
    with open(wav('boost.raw'), 'wb') as f:
        for i in range(len(gains) - 1):
            a, b = gains[i], gains[i + 1]
            f.write(b''.join(struct.pack('<ff', a + (b - a) * k / step, a + (b - a) * k / step) for k in range(step)))
    os.replace(wav('bed.wav'), wav('bed-flat.wav'))
    run('ffmpeg', '-y', '-i', wav('bed-flat.wav'), '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', wav('boost.raw'),
        '-filter_complex', '[0]aformat=channel_layouts=stereo[m];[m][1]amultiply,atrim=0:%.3f' % DUR, '-c:a', 'pcm_s16le', wav('bed.wav'))
    print('bed lifted %.1f dB in the pauses: %.1f s of them' % (GAP_BOOST_DB, sum(tgt[:stop]) / 100))

# 3. effects, from the game's own sounds, and each level's own room tone under its shot (looped, faded at the cuts)
ins, parts = [], []
amb = fx.get('amb', [])
for k, m in enumerate(amb):
    path = os.path.normpath(os.path.join(ROOT, 'scenes', m['file']))
    ins += ['-stream_loop', '-1', '-i', path]
    ms = max(0, int(m['t'] * 1000))
    parts.append(f"[{k}]aformat=channel_layouts=stereo:sample_rates={SR},atrim=0:{m['dur']:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st={m['dur'] - 0.3:.3f}:d=0.3,"
                 f"volume={m['gain'] * 10 ** (SFX_DB / 20):.4f},adelay={ms}|{ms},apad=whole_dur={DUR:.3f},atrim=0:{DUR:.3f}[a{k}]")      # (v65: padded to the film's length too: with duration=first, an unpadded room tone ended the whole effects track early)
_lv = {}
def level_of(path):
    if path not in _lv:
        err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        _lv[path] = float(__import__('re').findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])
    return _lv[path]
for i, s in enumerate(fx['sfx']):
    path = os.path.normpath(os.path.join(ROOT, 'scenes', s['file']))
    norm = 10 ** ((SFX_NORM - level_of(path)) / 20)
    ins += ['-i', path]
    ms = max(0, int(s['t'] * 1000))
    parts.append(f"[{i + len(amb)}]aformat=channel_layouts=stereo:sample_rates={SR},highpass=f=90,volume={s['gain'] * norm * 10 ** (SFX_DB / 20):.4f},adelay={ms}|{ms},apad=whole_dur={DUR:.3f},atrim=0:{DUR:.3f}[s{i}]")      # (v42: every track exactly the film's length, so the mix has a fixed end)
if parts:
    graph = ';'.join(parts) + ';' + ''.join(f'[a{k}]' for k in range(len(amb))) + ''.join(f'[s{i}]' for i in range(len(fx['sfx']))) + f"amix=inputs={len(amb) + len(fx['sfx'])}:normalize=0:duration=first,atrim=0:{DUR:.3f}"
    run('ffmpeg', '-y', *ins, '-filter_complex', graph, '-c:a', 'pcm_s16le', wav('sfx.wav'))

else:      # no effects at all (v7): a silent stem, so the rest of the chain is unchanged
    run('ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r={SR}:cl=stereo', '-t', f'{DUR:.3f}', '-c:a', 'pcm_s16le', wav('sfx.wav'))

# 4. the mix, mastered to about -16 LUFS with a -1.5 dBTP ceiling
stems = [wav('vo-fx.wav') if VOICE_FX else wav('vo.wav')] + ([wav('bed.wav')] if MUSIC else []) + [wav('sfx.wav')]
run('ffmpeg', '-y', *sum((['-i', x] for x in stems), []), '-filter_complex',
    f"[0]aformat=channel_layouts=stereo:sample_rates={SR},apad,atrim=0:{DUR:.3f}[v];[v]{''.join(f'[{i}]' for i in range(1, len(stems)))}amix=inputs={len(stems)}:normalize=0:duration=longest,"
    f"loudnorm=I=-16:TP=-1.5:LRA=11,aresample={SR}", '-c:a', 'pcm_s16le', wav('mix.wav'))
print('mix', DUR, 's, music' if MUSIC else 's, no music')
