"""Writes work/cues.js and work/footage.js for the composition page."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); W = os.path.join(ROOT, 'work')
cues = json.load(open(os.path.join(W, 'cues.json')))
open(os.path.join(W, 'cues.js'), 'w').write('window.CUES = ' + json.dumps(cues) + ';\n')
foot = {d: len([f for f in os.listdir(os.path.join(W, 'footage', d)) if f.endswith(('.jpg', '.png'))]) for d in sorted(os.listdir(os.path.join(W, 'footage'))) if os.path.isdir(os.path.join(W, 'footage', d))}
cuts = {d: json.load(open(os.path.join(W, 'footage', d, 'cuts.json'))) for d in foot if os.path.exists(os.path.join(W, 'footage', d, 'cuts.json'))}
open(os.path.join(W, 'footage.js'), 'w').write('window.FOOT = ' + json.dumps(foot) + ';\nwindow.CUTS = ' + json.dumps(cuts) + ';\n')
print(foot)
