"""Builds the sped-up voice track and its timings (cues.json) from the two takes.

Sentence times below are from silencedetect on the original take (no Whisper model on this machine);
words inside a sentence are placed by their share of its letters, which is close enough to land
things on the word for a first draft. A new take: re-measure the gaps and edit SENTENCES/SECTIONS.
"""
import json, subprocess, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
A = os.path.join(ROOT, 'work', 'audio')
SPEED, END_SPEED, LEAD = 1.0, 1.0, 1.0
SEAT_HOLD = 3.5       # seconds after "your weapons do the stretching" (v9)
HOLD = 3.5            # seconds of level after each level line (v4 had 5, v5 3.5)

# v7: four takes. vo1 is the first full take; how / built / close are the re-reads for the agent (MCP) flow.
SOURCES = {'vo1': 'vo-1-original.mp3', 'how': 'how-it-works-iz-original.mp3', 'built': 'builtwith-iz-original.mp3', 'close': 'try-it-yourself-iz-original.mp3'}
# source, name, start, end (cut inside true silences), beat after
SECTIONS = [
    ('vo1', 'hook', 0.00, 8.63, 0.55),
    ('vo1', 'intro', 8.63, 17.40, 0.6),
    # how it works: a little room after each agent step, so the flow can be seen
    ('how', 'how-connect', 0.00, 5.08, 0.7),
    ('how', 'how-link', 5.08, 10.25, 0.9),
    ('how', 'how-play', 10.25, 12.10, 0.4),
    ('how', 'how-hands', 12.10, 19.18, 0.3),
    ('how', 'how-replies', 19.18, 28.45, 0.6),
    # from the keyboard line on, each level line gets a hold after it so more of the level is seen
    ('vo1', 'minutes', 38.07, 41.135, 0.0),
    ('vo1', 'office', 41.135, 44.355, HOLD),
    ('vo1', 'castle', 44.355, 46.76, HOLD),
    ('vo1', 'lab', 46.76, 49.18, HOLD),
    ('vo1', 'inferno', 49.18, 51.90, HOLD),
    ('vo1', 'kyoto', 51.90, 54.875, HOLD),
    ('vo1', 'axe', 54.875, 56.91, HOLD),
    ('vo1', 'space', 56.91, 60.35, HOLD),
    ('built', 'built-sdk', 0.00, 5.63, 0.0),
    ('built', 'built-chair', 5.63, 10.42, SEAT_HOLD),      # v9: room for the seated take after "stretching"
    ('built', 'built-clear', 10.42, 12.85, 0.3),
    ('built', 'built-agent', 12.85, 16.96, 0.9),
    ('built', 'built-private', 16.96, 21.24, 0.7),
    ('close', 'close', 0.00, 7.88, 0.05),
    ('close', 'hero', 7.88, 10.61, 0.0),
]
# id, source, start, end, text (as said)
SENTENCES = [
    ('unread', 'vo1', 0.00, 2.71, 'Have you got 181 unread emails?'),
    ('tried', 'vo1', 3.05, 4.74, 'Tried filters, or reminders?'),
    ('sword', 'vo1', 5.04, 7.08, 'But have you tried a sword?'),
    ('flame', 'vo1', 7.33, 8.52, 'Or a flamethrower?'),
    ('slash', 'vo1', 8.75, 12.11, 'Slash, burn, and smash your way to Inbox Zero!'),
    ('hack', 'vo1', 12.33, 14.06, 'Built for the Meta Start Hackathon,'),
    ('game', 'vo1', 14.16, 15.98, "it's a game to clear your inbox,"),
    ('round', 'vo1', 16.12, 17.24, 'one round at a time'),
    ('howit', 'how', 0.14, 1.11, "Here's how it works"),
    ('connect', 'how', 1.39, 3.45, 'Connect our MCP to your Muse agent'),
    ('ask', 'how', 3.57, 4.91, 'and ask it to set up a game!'),
    ('reads', 'how', 5.26, 7.83, 'It reads your newest unread emails'),
    ('link', 'how', 7.90, 10.08, 'and makes you a special link that opens right on your Meta Quest!'),
    ('pick', 'how', 10.41, 11.01, 'Pick your level,'),
    ('play', 'how', 11.17, 11.90, 'and hit play!'),
    ('grab', 'how', 12.31, 14.33, 'Grab an email with your left hand to read it,'),
    ('throw', 'how', 14.54, 15.56, 'throw it to keep it,'),
    ('cut', 'how', 15.75, 19.00, 'or take your right hand and cut it up into tiny little pieces'),
    ('replies', 'how', 19.36, 22.77, 'Every email you keep comes back with two short replies from your agent'),
    ('hold', 'how', 23.14, 24.31, 'Hold it up to the one you like,'),
    ('pull', 'how', 24.56, 25.98, 'pull it close to say your own,'),
    ('later', 'how', 26.20, 28.27, 'or throw it away and leave it for tomorrow'),
    ('minutes', 'vo1', 38.21, 41.07, 'Just a few minutes a day to clear your email anxiety,'),
    ('monitor', 'vo1', 41.20, 44.23, 'and you finally get to smash your monitor with your keyboard!'),
    ('castle', 'vo1', 44.48, 46.66, 'Defend your castle from haunted mail!'),
    ('lab', 'vo1', 46.86, 49.06, 'Disinfect toxic spam in the lab!'),
    ('inferno', 'vo1', 49.30, 51.78, 'Torch your inbox in the Inferno mail room!'),
    ('kyoto', 'vo1', 52.02, 54.77, 'Slice your worries away in a Kyoto zen garden!'),
    ('axe', 'vo1', 54.98, 56.85, 'Split your backlog with an axe!'),
    ('or', 'vo1', 56.97, 57.34, 'Or...'),
    ('space', 'vo1', 57.52, 60.23, 'slice through deep space with a laser sword!'),
    ('iwsdk', 'built', 0.06, 2.61, "It's built with Meta's Immersive Web SDK,"),
    ('browser', 'built', 2.67, 4.17, 'so it runs right in the browser,'),
    ('nodl', 'built', 4.25, 5.49, 'with nothing to download!'),
    ('chair', 'built', 5.78, 7.27, "It's made to play from your chair"),
    ('come', 'built', 7.58, 10.25, 'Emails come to you, and your weapons do the stretching!'),
    ('really', 'built', 10.60, 12.68, 'And it really does clear your inbox'),
    ('archives', 'built', 13.03, 14.50, 'Your agent archives what you cut'),
    ('sends', 'built', 14.58, 15.65, 'and sends your replies,'),
    ('okay', 'built', 15.74, 16.77, 'after you say okay'),
    ('never', 'built', 17.16, 18.96, 'The game never touches your inbox,'),
    ('deleted', 'built', 19.08, 21.00, "and each round is deleted once it's done"),
    ('try', 'close', 0.09, 3.22, 'Try it yourself at InboxZeroVR.com!'),
    ('seven', 'close', 3.46, 5.33, 'Play the demo in all seven levels,'),
    ('agent', 'close', 5.42, 7.77, 'or connect your agent and play your own inbox'),
    ('hero', 'close', 8.00, 10.24, 'Become a hero with inbox zero!'),
]

def run(*a): subprocess.run(a, check=True, capture_output=True)

def lufs(path):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])

def main():
    # the takes are levelled to the first one, so the joins don't jump in loudness
    ref = lufs(os.path.join(A, SOURCES['vo1']))
    gain = {k: ref - lufs(os.path.join(A, f)) for k, f in SOURCES.items()}
    parts, t, offsets = [], LEAD, {}
    silence = lambda d, name: (run('ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', f'{d:.3f}', '-c:a', 'pcm_s16le', os.path.join(A, name)), name)[1]
    parts.append(silence(LEAD, 'sil-lead.wav'))
    for i, (src, name, s, e, beat) in enumerate(SECTIONS):
        out = f'sec-{i:02}-{name}.wav'
        run('ffmpeg', '-y', '-ss', f'{s}', '-to', f'{e}', '-i', os.path.join(A, SOURCES[src]),
            '-af', f'volume={gain[src]:.2f}dB,atempo={SPEED},afade=t=in:d=0.02,afade=t=out:st={(e - s) / SPEED - 0.03:.3f}:d=0.03', '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', os.path.join(A, out))
        offsets[name] = (t, s); parts.append(out); t += (e - s) / SPEED
        if beat > 0: parts.append(silence(beat, f'sil-{i:02}.wav')); t += beat
    with open(os.path.join(A, 'concat.txt'), 'w') as f: f.writelines(f"file '{p}'\n" for p in parts)
    run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(A, 'concat.txt'), '-c:a', 'pcm_s16le', os.path.join(A, 'vo.wav'))

    def at(src, orig):
        sec = [x for x in SECTIONS if x[0] == src and x[2] <= orig < x[3] + 0.001][-1]
        o, s = offsets[sec[1]]; return round(o + (orig - s) / SPEED, 3)
    cues, words = {}, []
    for sid, src, s, e, text in SENTENCES:
        a, b = at(src, s), at(src, e); cues[sid] = {'start': a, 'end': b, 'text': text}
        toks = list(re.finditer(r"\S+", text)); total = sum(len(m.group()) for m in toks); acc = 0
        for m in toks:
            w = m.group(); words.append({'s': sid, 'w': re.sub(r"[^\w']", '', w).lower(), 't': round(a + (b - a) * acc / total, 3)}); acc += len(w) + 0.5
    json.dump({'duration': round(t, 3), 'cues': cues, 'words': words}, open(os.path.join(ROOT, 'work', 'cues.json'), 'w'), indent=1)
    print('voice length', round(t, 2), 'gains', {k: round(v, 1) for k, v in gain.items()})

main()
