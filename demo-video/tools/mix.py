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
MUSIC = False                 # v2: no background music (the user's call); the game's sound effects stay
MUSIC_FROM = 150.8            # the energetic part of the user's Kyoto track
DUCK_DB = -11.0               # music under the voice
BED_DB, END_DB = -2.0, 0.0   # music level in the gaps, and on the end card
SFX_DB = -4.0
words = [w['t'] for w in cues['words'] if w['s'] == 'sword' and w['w'] == 'sword']
T_OPEN = words[0] + 0.34      # the music opens up when the sword cuts the inbox
T_ANTHEM = C('hero') - 0.35   # the anthem takes over for the end, its last note on the end card
ANTHEM_END = 28.55            # where the anthem's final chord rings out (measured)

def run(*a): subprocess.run(a, check=True, capture_output=True)
def wav(name): return os.path.join(A, name)

if MUSIC:
    # 1. music: the bed muffled under the hook, opening up on the sword, then the anthem's ending
    run('ffmpeg', '-y', '-ss', str(MUSIC_FROM), '-t', f'{T_ANTHEM + 1.0:.3f}', '-i', wav('music-src.m4a'), '-ac', '2', '-ar', str(SR), wav('bed-raw.wav'))
    an_from = ANTHEM_END - (DUR - 0.25 - T_ANTHEM)
    run('ffmpeg', '-y', '-ss', f'{an_from:.3f}', '-i', wav('anthem-src.m4a'), '-ac', '2', '-ar', str(SR), wav('anthem-cut.wav'))
    run('ffmpeg', '-y', '-i', wav('bed-raw.wav'), '-i', wav('anthem-cut.wav'), '-filter_complex',
        f"[0]asplit=2[a][b];"
        f"[a]lowpass=f=700,volume=0.7,afade=t=in:d=0.8,afade=t=out:st={T_OPEN - 0.05:.3f}:d=0.12[muff];"
        f"[b]afade=t=in:st={T_OPEN - 0.05:.3f}:d=0.08,afade=t=out:st={T_ANTHEM:.3f}:d=0.6[open];"
        f"[1]afade=t=in:d=0.35,adelay={int(T_ANTHEM * 1000)}|{int(T_ANTHEM * 1000)},afade=t=out:st={DUR - 0.6:.3f}:d=0.55[an];"
        f"[muff][open][an]amix=inputs=3:normalize=0:duration=longest,atrim=0:{DUR:.3f}", wav('music.wav'))

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
        db = base + DUCK_DB * cur
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
for i, s in enumerate(fx['sfx']):
    path = os.path.normpath(os.path.join(ROOT, 'scenes', s['file']))
    ins += ['-i', path]
    ms = max(0, int(s['t'] * 1000))
    parts.append(f"[{i + len(amb)}]aformat=channel_layouts=stereo:sample_rates={SR},highpass=f=90,volume={s['gain'] * 10 ** (SFX_DB / 20):.4f},adelay={ms}|{ms}[s{i}]")
graph = ';'.join(parts) + ';' + ''.join(f'[a{k}]' for k in range(len(amb))) + ''.join(f'[s{i}]' for i in range(len(fx['sfx']))) + f"amix=inputs={len(amb) + len(fx['sfx'])}:normalize=0:duration=longest,apad,atrim=0:{DUR:.3f}"
run('ffmpeg', '-y', *ins, '-filter_complex', graph, '-c:a', 'pcm_s16le', wav('sfx.wav'))

# 4. the mix, mastered to about -16 LUFS with a -1.5 dBTP ceiling
stems = [wav('vo-fx.wav') if VOICE_FX else wav('vo.wav')] + ([wav('bed.wav')] if MUSIC else []) + [wav('sfx.wav')]
run('ffmpeg', '-y', *sum((['-i', x] for x in stems), []), '-filter_complex',
    f"[0]aformat=channel_layouts=stereo:sample_rates={SR},apad,atrim=0:{DUR:.3f}[v];[v]{''.join(f'[{i}]' for i in range(1, len(stems)))}amix=inputs={len(stems)}:normalize=0:duration=longest,"
    f"loudnorm=I=-16:TP=-1.5:LRA=11,aresample={SR}", '-c:a', 'pcm_s16le', wav('mix.wav'))
print('mix', DUR, 's, music' if MUSIC else 's, no music')
