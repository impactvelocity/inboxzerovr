"""Render a frame range of a saved courtyard .blend as a PNG sequence.

    Blender --background scene.blend --python source/render_preview.py -- out_dir percent samples start end step
"""
import sys
from pathlib import Path

import bpy

a = sys.argv[sys.argv.index("--") + 1:]
out, pct, samples, start, end, step = Path(a[0]), int(a[1]), int(a[2]), int(a[3]), int(a[4]), int(a[5])
out.mkdir(parents=True, exist_ok=True)
s = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.refresh_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
s.cycles.device = 'GPU'
s.cycles.samples = samples
s.cycles.adaptive_threshold = 0.04
s.render.resolution_percentage = pct
s.render.use_persistent_data = True
s.render.image_settings.file_format = 'PNG'
for i, f in enumerate(range(start, end + 1, step)):
    s.frame_set(f)
    s.render.filepath = str(out / f"{i:04d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"PREVIEW {i} scene_frame={f}", flush=True)
