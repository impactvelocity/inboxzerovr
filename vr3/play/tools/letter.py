#!/usr/bin/env python3
"""Bring the paper letter from the Unity game into vr3: public/mail/letter.json and washi.webp.

    python3 vr3/play/tools/letter.py

The letter is the Unity game's Resources/Kyoto/Letter (a slightly curled sheet, 50 by 31 cm, a
closed shell with the email's picture mapped on its front), as the web build's exporter wrote it
to web/public/kyoto/props.bin. Unity is left-handed: z is turned over here and each triangle's
winding with it, so the readable face looks along +z, towards a viewer looking down -z.
"""
import json
import os
import shutil
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
KYOTO = os.path.join(HERE, '..', '..', 'web', 'public', 'kyoto')
OUT = os.path.join(HERE, '..', 'public', 'mail')

manifest = json.load(open(os.path.join(KYOTO, 'courtyard.json')))
part = next(p for p in manifest['props'] if p['name'] == 'Letter')
data = open(os.path.join(KYOTO, 'props.bin'), 'rb').read()
n = part['vertices']
position = list(struct.unpack_from(f'<{n * 3}f', data, part['position']))
normal = [v / 127 for v in struct.unpack_from(f'<{n * 4}b', data, part['normal'])]
uv = struct.unpack_from(f'<{n * 2}f', data, part['uv'])
index = list(struct.unpack_from(f'<{part["indices"]}I', data, part['index']))
for i in range(n):
    position[i * 3 + 2] = -position[i * 3 + 2]
normal3 = []
for i in range(n):
    normal3 += [normal[i * 4], normal[i * 4 + 1], -normal[i * 4 + 2]]
for t in range(0, len(index), 3):
    index[t + 1], index[t + 2] = index[t + 2], index[t + 1]
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'letter.json'), 'w') as out:
    json.dump({'position': [round(v, 5) for v in position], 'normal': [round(v, 3) for v in normal3],
               'uv': [round(v, 5) for v in uv], 'index': index}, out, separators=(',', ':'))
shutil.copyfile(os.path.join(KYOTO, 'tex', 'Letter_Washi.webp'), os.path.join(OUT, 'washi.webp'))
front = sum(1 for i in range(n) if normal3[i * 3 + 2] > .5)
print(f'letter: {n} vertices, {len(index) // 3} triangles, {front} vertices on the face that is read')
