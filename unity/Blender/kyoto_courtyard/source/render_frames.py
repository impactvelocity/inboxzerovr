"""Render chosen frames of a saved courtyard .blend for quick checks.

    Blender --background kyoto_courtyard_dusk.blend --python render_frames.py -- out_prefix pct samples f1 f2 ...
"""
import sys
import bpy

a = sys.argv[sys.argv.index("--") + 1:]
prefix, pct, samples, frames = a[0], int(a[1]), int(a[2]), [int(f) for f in a[3:]]
sc = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.refresh_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
sc.cycles.device = 'GPU'
sc.render.resolution_percentage = pct
sc.cycles.samples = samples
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = f"{prefix}{f:04d}.png"
    bpy.ops.render.render(write_still=True)
