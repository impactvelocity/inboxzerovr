"""Save the camera view with actual scene lighting and without rig overlays."""
import bpy
s=bpy.context.scene
s.frame_set(1); s.cycles.preview_samples=24
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='RENDERED'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
