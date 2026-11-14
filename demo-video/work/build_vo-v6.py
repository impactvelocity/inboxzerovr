"""Builds the sped-up voice track and its timings (cues.json) from the two takes.

Sentence times below are from silencedetect on the original take (no Whisper model on this machine);
words inside a sentence are placed by their share of its letters, which is close enough to land
things on the word for a first draft. A new take: re-measure the gaps and edit SENTENCES/SECTIONS.
"""
import json, subprocess, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
A = os.path.join(ROOT, 'work', 'audio')
SPEED, END_SPEED, LEAD = 1.0, 1.0, 1.0
HOLD = 3.5            # seconds of level after each level line (v4 had 5, v5 3.5)

# (start, end) in the ORIGINAL take, cut inside true silences; then a beat after each section
SECTIONS = [  # name, orig start, orig end, beat after
    ('hook', 0.00, 8.63, 0.55),
    ('intro', 8.63, 17.40, 0.6),
    ('how', 17.40, 38.07, 0.6),
    # v4: from the keyboard line on, each level line gets a hold after it so more of the level is seen
    ('minutes', 38.07, 41.135, 0.0),
    ('office', 41.135, 44.355, HOLD),
    ('castle', 44.355, 46.76, HOLD),
    ('lab', 46.76, 49.18, HOLD),
    ('inferno', 49.18, 51.90, HOLD),
    ('kyoto', 51.90, 54.875, HOLD),
    ('axe', 54.875, 56.91, HOLD),
    ('space', 56.91, 60.35, HOLD),
    ('built', 60.35, 80.49, 0.6),
    ('close', 80.49, 85.84, 0.05),
]
# id, orig start, orig end, text (as said)
SENTENCES = [
    ('unread', 0.00, 2.71, 'Have you got 181 unread emails?'),
    ('tried', 3.05, 4.74, 'Tried filters, or reminders?'),
    ('sword', 5.04, 7.08, 'But have you tried a sword?'),
    ('flame', 7.33, 8.52, 'Or a flamethrower?'),
    ('slash', 8.75, 12.11, 'Slash, burn, and smash your way to Inbox Zero!'),
    ('hack', 12.33, 14.06, 'Built for the Meta Start Hackathon,'),
    ('game', 14.16, 15.98, "it's a game to clear your inbox,"),
    ('round', 16.12, 17.24, 'one round at a time'),
    ('howit', 17.56, 18.45, "Here's how it works"),
    ('connect', 18.70, 22.06, 'Connect your Gmail, and your latest unread emails become a game!'),
    ('grab', 22.30, 24.26, 'Grab an email with your left hand to read it,'),
    ('throw', 24.48, 25.46, 'throw it to keep it,'),
    ('cut', 25.67, 28.94, 'or take your right hand and cut it up into tiny little pieces'),
    ('replies', 29.20, 32.33, 'Every email you keep comes back with two short replies'),
    ('hold', 32.56, 33.85, 'Hold it up to the one you like,'),
    ('pull', 34.07, 35.53, 'pull it close to say your own,'),
    ('later', 35.68, 37.93, 'or throw it away and leave it for tomorrow'),
    ('minutes', 38.21, 41.07, 'Just a few minutes a day to clear your email anxiety,'),
    ('monitor', 41.20, 44.23, 'and you finally get to smash your monitor with your keyboard!'),
    ('castle', 44.48, 46.66, 'Defend your castle from haunted mail!'),
    ('lab', 46.86, 49.06, 'Disinfect toxic spam in the lab!'),
    ('inferno', 49.30, 51.78, 'Torch your inbox in the Inferno mail room!'),
    ('kyoto', 52.02, 54.77, 'Slice your worries away in a Kyoto zen garden!'),
    ('axe', 54.98, 56.85, 'Split your backlog with an axe!'),
    ('or', 56.97, 57.34, 'Or...'),
    ('space', 57.52, 60.23, 'slice through deep space with a laser sword!'),
    ('iwsdk', 60.48, 62.96, "It's built with Meta's Immersive Web SDK,"),
    ('browser', 63.09, 64.57, 'so it runs right in the browser,'),
    ('nodl', 64.65, 65.93, 'with nothing to download'),
    ('chair', 66.15, 67.84, "It's made to play from your chair"),
    ('come', 68.02, 70.88, 'Emails come to you, and your weapons do the stretching!'),
    ('really', 71.11, 73.28, 'And it really does clear your inbox'),
    ('tags', 73.47, 76.69, 'AI tags each email and boils it down to a quick summary'),
    ('forgets', 76.92, 79.12, 'The AI reads your mail, then forgets it,'),
    ('saved', 79.31, 80.36, 'nothing is saved'),
    ('try', 80.63, 83.50, 'Try it yourself at InboxZeroVR.com'),
    ('seven', 83.61, 85.75, 'and play the demo in all seven levels'),
]

def run(*a): subprocess.run(a, check=True, capture_output=True)

def main():
    parts, t, offsets = [], LEAD, {}
    silence = lambda d, name: (run('ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=mono', '-t', f'{d:.3f}', '-c:a', 'pcm_s16le', os.path.join(A, name)), name)[1]
    parts.append(silence(LEAD, 'sil-lead.wav'))
    for i, (name, s, e, beat) in enumerate(SECTIONS):
        out = f'sec-{i}-{name}.wav'
        run('ffmpeg', '-y', '-ss', f'{s}', '-to', f'{e}', '-i', os.path.join(A, 'vo-1-original.mp3'),
            '-af', f'atempo={SPEED},afade=t=in:d=0.02,afade=t=out:st={(e - s) / SPEED - 0.03:.3f}:d=0.03', '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', os.path.join(A, out))
        offsets[name] = (t, s); parts.append(out); t += (e - s) / SPEED
        if beat > 0: parts.append(silence(beat, f'sil-{i}.wav')); t += beat
    # the sung end: the replacement take
    end_len = 2.769 / END_SPEED
    run('ffmpeg', '-y', '-i', os.path.join(A, 'vo-end-original.mp3'), '-af', f'atempo={END_SPEED}', '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', os.path.join(A, 'sec-end.wav'))
    hero_at = t; parts.append('sec-end.wav'); t += end_len
    with open(os.path.join(A, 'concat.txt'), 'w') as f: f.writelines(f"file '{p}'\n" for p in parts)
    run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(A, 'concat.txt'), '-c:a', 'pcm_s16le', os.path.join(A, 'vo.wav'))

    def at(orig):
        sec = [x for x in SECTIONS if x[1] <= orig < x[2] + 0.001][-1]
        o, s = offsets[sec[0]]; return round(o + (orig - s) / SPEED, 3)
    cues, words = {}, []
    for sid, s, e, text in SENTENCES:
        a, b = at(s), at(e); cues[sid] = {'start': a, 'end': b, 'text': text}
        toks = list(re.finditer(r"\S+", text)); total = sum(len(m.group()) for m in toks); acc = 0
        for m in toks:
            w = m.group(); words.append({'s': sid, 'w': re.sub(r"[^\w']", '', w).lower(), 't': round(a + (b - a) * acc / total, 3)}); acc += len(w) + 0.5
    cues['hero'] = {'start': round(hero_at, 3), 'end': round(hero_at + 2.49 / END_SPEED, 3), 'text': 'Become a hero with inbox zero!'}
    for w, f in [('become', 0.0), ('a', 0.12), ('hero', 0.2), ('with', 0.45), ('inbox', 0.6), ('zero', 0.8)]:
        words.append({'s': 'hero', 'w': w, 't': round(hero_at + f * 2.49 / END_SPEED, 3)})
    json.dump({'duration': round(t, 3), 'cues': cues, 'words': words}, open(os.path.join(ROOT, 'work', 'cues.json'), 'w'), indent=1)
    print('voice length', round(t, 2), 'hero at', round(hero_at, 2))

main()
