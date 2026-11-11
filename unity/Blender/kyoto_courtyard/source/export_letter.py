"""Build the paper letter on its own, export it for Unity and render a sheet.

    Blender --background --python source/export_letter.py

Writes export/Letter.fbx (mesh, Flutter blend shape, TextAnchor),
export/Letter_Washi.png, export/Letter.blend and renders/letter_sheet.png.
"""
import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kyoto import letter                       # noqa: E402
from kyoto.common import coll, hx, new_obj     # noqa: E402

OUT = os.path.abspath(os.path.join(HERE, "..", "export"))
RENDERS = os.path.abspath(os.path.join(HERE, "..", "renders"))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
c = coll("Letter")
sheet, anchor = letter.build(c, OUT)

# same conventions as build_models.py, plus the anchor empty
for o in bpy.data.objects:
    o.select_set(o in (sheet, anchor))
bpy.context.view_layer.objects.active = sheet
bpy.ops.export_scene.fbx(
    filepath=os.path.join(OUT, "Letter.fbx"), use_selection=True, object_types={"MESH", "EMPTY"},
    apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS", bake_space_transform=True,
    axis_forward="-Z", axis_up="Y", mesh_smooth_type="FACE", add_leaf_bones=False, bake_anim=False)
me = sheet.data
print(f"LETTER verts={len(me.vertices)} tris={sum(len(p.vertices) - 2 for p in me.polygons)} "
      f"size={[round(d, 4) for d in sheet.dimensions]} anchor={[round(v, 4) for v in anchor.location]}")

# turnaround sheet: front, three-quarter and edge-on, on neutral grey
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.refresh_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
scene.cycles.device = 'GPU'
scene.cycles.samples = 96
scene.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new("Sheet_Grey")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = hx("#5d606c", 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.75
scene.world = w
L = coll("Sheet_Rig")
key = bpy.data.lights.new("Sheet_Key", 'AREA')
key.energy, key.size, key.color = 70, 1.2, hx("#fff0dc")
ko = new_obj("Sheet_Key", key, L, loc=(-1.0, -0.75, 0.9))
ko.rotation_euler = (Vector((0, 0, 0)) - ko.location).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.cameras.new("Sheet_Camera")
cam.type, cam.ortho_scale = 'ORTHO', 0.62
co = new_obj("Sheet_Camera", cam, L, loc=(0, -2, 0), rot=(math.pi / 2, 0, 0))
scene.camera = co
scene.render.resolution_x, scene.render.resolution_y = 1000, 700
parts = []
for name, turn in (("front", 0), ("three_quarter", -48), ("edge", 90)):
    sheet.rotation_euler.z = math.radians(turn)
    scene.render.filepath = os.path.join(RENDERS, f"_letter_{name}.png")
    bpy.ops.render.render(write_still=True)
    parts.append(scene.render.filepath)
sheet.rotation_euler.z = 0
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", parts[0], "-i", parts[1], "-i", parts[2], "-filter_complex",
                "[1]crop=560:700:220:0[b];[2]crop=200:700:400:0[c];[0][b][c]hstack=inputs=3",
                os.path.join(RENDERS, "letter_sheet.png")], check=False)
for p in parts:
    os.remove(p)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "Letter.blend"))
