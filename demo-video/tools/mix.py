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
VOICE_FX = True               # v3: reverb + a hint of robot on the voice (tools/voicefx.py makes vo-fx.wav)
MUSIC = True                  # v18: "add the inferno level music...", v23: "use the kyoto song instead of inferno"
MUSIC_FILE = os.path.join(ROOT, '..', 'vr3', 'play', 'public', 'audio', 'kyoto', 'music.m4a')      # v23: the Kyoto song (was Inferno's)
MUSIC_LEN = 298.72            # the track's length
MUSIC_FROM = None             # v21: None = start where the track's own ending lands on the film's end (its loudest stretch, from the first frame)
DUCK_DB = -13.0               # music under the voice (kept well under it: the voice must stay very clear)
HOOK_DUCK_DB = -7.0           # v21: lighter under the 7 s hook, so the music is heard from the start (about 12 dB under her)
BED_DB, END_DB = -6.0, -2.0   # music level in the gaps, and in the 20 s gameplay outro after the voice
SFX_DB = -7.0                 # v18 hits: "there but not overboard"
SFX_NORM = -20.0              # each hit is first levelled to this (they range from -16 to -32 LUFS as made)

def run(*a): subprocess.run(a, check=True, capture_output=True)
def wav(name): return os.path.join(A, name)

if MUSIC:
    # 1. music: the Inferno track from MUSIC_FROM, faded in at the start and out over the last 3 s
    start = MUSIC_FROM if MUSIC_FROM is not None else max(0, MUSIC_LEN - DUR - 0.3)
    # v21: "play the sound track music right away": no fade in; the track's own ending closes the film
    run('ffmpeg', '-y', '-ss', f'{start:.3f}', '-t', f'{DUR:.3f}', '-i', MUSIC_FILE, '-ac', '2', '-ar', str(SR),
        '-af', f'afade=t=in:d=0.02,apad,atrim=0:{DUR:.3f},afade=t=out:st={DUR - 0.4:.3f}:d=0.4', wav('music.wav'))
    print('music from', round(start, 2), 's into the track')

    # 2. ducking envelope from the voice, with look-ahead so the music dips before each line
    e = env(wav('vo.wav'), 100)
    on = [1.0 if x > 0.012 else 0.0 for x in e]
    look = 12; act = [max(on[i:i + look + 1] or [0]) for i in range(len(on))]
    g, gains, cur = [], [], 0.0
    for i in range(int(DUR * 100) + 2):
        tgt = act[i] if i < len(act) else 0.0
        cur += (tgt - cur) * (0.35 if tgt > cur else 0.05)        # fast down, slow back up
        t = i / 100
        base = END_DB if t > C('hero') + cues['cues']['hero']['end'] - C('hero') else BED_DB
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

# 3. effects, from the game's own sounds, and each level's own room tone under its shot (looped, faded at the cuts)
ins, parts = [], []
amb = fx.get('amb', [])
for k, m in enumerate(amb):
    path = os.path.normpath(os.path.join(ROOT, 'scenes', m['file']))
    ins += ['-stream_loop', '-1', '-i', path]
    ms = max(0, int(m['t'] * 1000))
    parts.append(f"[{k}]aformat=channel_layouts=stereo:sample_rates={SR},atrim=0:{m['dur']:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st={m['dur'] - 0.3:.3f}:d=0.3,"
                 f"volume={m['gain'] * 10 ** (SFX_DB / 20):.4f},adelay={ms}|{ms}[a{k}]")
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
    parts.append(f"[{i + len(amb)}]aformat=channel_layouts=stereo:sample_rates={SR},highpass=f=90,volume={s['gain'] * norm * 10 ** (SFX_DB / 20):.4f},adelay={ms}|{ms}[s{i}]")
if parts:
    graph = ';'.join(parts) + ';' + ''.join(f'[a{k}]' for k in range(len(amb))) + ''.join(f'[s{i}]' for i in range(len(fx['sfx']))) + f"amix=inputs={len(amb) + len(fx['sfx'])}:normalize=0:duration=longest,apad,atrim=0:{DUR:.3f}"
    run('ffmpeg', '-y', *ins, '-filter_complex', graph, '-c:a', 'pcm_s16le', wav('sfx.wav'))

else:      # no effects at all (v7): a silent stem, so the rest of the chain is unchanged
    run('ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r={SR}:cl=stereo', '-t', f'{DUR:.3f}', '-c:a', 'pcm_s16le', wav('sfx.wav'))

# 4. the mix, mastered to about -16 LUFS with a -1.5 dBTP ceiling
stems = [wav('vo-fx.wav') if VOICE_FX else wav('vo.wav')] + ([wav('bed.wav')] if MUSIC else []) + [wav('sfx.wav')]
run('ffmpeg', '-y', *sum((['-i', x] for x in stems), []), '-filter_complex',
    f"[0]aformat=channel_layouts=stereo:sample_rates={SR},apad,atrim=0:{DUR:.3f}[v];[v]{''.join(f'[{i}]' for i in range(1, len(stems)))}amix=inputs={len(stems)}:normalize=0:duration=longest,"
    f"loudnorm=I=-16:TP=-1.5:LRA=11,aresample={SR}", '-c:a', 'pcm_s16le', wav('mix.wav'))
print('mix', DUR, 's, music' if MUSIC else 's, no music')
