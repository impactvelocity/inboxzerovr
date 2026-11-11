"""Render review stills and optional ambient/fade frames from the saved scene."""
from pathlib import Path
import sys, bpy
args=sys.argv[sys.argv.index('--')+1:]
out=Path(args[0]); out.mkdir(parents=True,exist_ok=True)
mode=args[1]
s=bpy.context.scene
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='METAL'; prefs.refresh_devices()
for d in prefs.devices: d.use=d.type=='METAL'
s.cycles.device='GPU'; s.render.image_settings.file_format='PNG'
s.render.use_persistent_data=True
if mode=='stills':
    s.render.resolution_percentage=100; s.cycles.samples=64
    items=[('dusk',1),('night',1153)]
else:
    s.render.resolution_percentage=30; s.cycles.samples=24
    s.cycles.adaptive_threshold=0.05
    frames=range(1,289,2) if mode=='ambient' else range(1,1441,24)
    items=[(f'{i:04d}',f) for i,f in enumerate(frames)]
for name,frame in items:
    s.frame_set(frame); s.render.filepath=str(out/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print(f'REVIEW {mode} {name} scene_frame={frame}',flush=True)
