"""captions.srt from the script's words (not a transcription), timed by the voice cues."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
c = json.load(open(os.path.join(ROOT, 'work', 'cues.json')))['cues']
fix = {'Or...': 'Or…'}
def ts(t): h, r = divmod(t, 3600); m, s = divmod(r, 60); return f'{int(h):02}:{int(m):02}:{int(s):02},{int(round((s % 1) * 1000)):03}'.replace(',1000', ',999')
out = []
items = list(c.items())
for i, (k, v) in enumerate(items):
    end = min(v['end'] + .25, items[i + 1][1]['start'] - .02) if i + 1 < len(items) else v['end'] + 1.0
    text = fix.get(v['text'], v['text']).rstrip('.,')
    out.append(f"{i + 1}\n{ts(v['start'])} --> {ts(end)}\n{text}\n")
open(os.path.join(ROOT, 'captions.srt'), 'w').write('\n'.join(out))
print(len(out), 'captions')
