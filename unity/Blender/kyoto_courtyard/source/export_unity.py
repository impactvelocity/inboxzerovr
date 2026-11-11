"""Bake the courtyard for the Unity level and export it.

    Blender --background kyoto_courtyard_dusk_polished.blend --python source/export_unity.py [-- --preview]

The game cannot run Cycles, so what Cycles sees is baked here, twice: at
twilight (frame 1) and at blue hour (frame 1153). Every result goes through
the scene's view transform, so the stored colours are what the render shows
and the Unity shaders only fade from one set to the other.

  Courtyard         the big surfaces (ground, deck, timber, plaster, stone).
                    Their materials and light are baked into an image atlas,
                    so wood grain, plaster and wet earth keep their detail.
  Courtyard_Detail  blossoms, leaves, reeds, moss and roof tiles: thousands of
                    small faces, lit per vertex instead.
  Env_*             panoramas from the middle of the garden and from the seat,
                    for reflections and for lighting the katana and the letter.

What each vertex carries (see Kyoto.shader):
    colour rgb   twilight colour (detail)   colour a   gloss (0 matte .. 1 water)
    uv0          blue hour red, green       uv1        blue hour blue, sway weight
    uv2          sway phase, unused         uv3        atlas position (surfaces)

Written to unity/Assets/Resources/Kyoto: Courtyard.fbx, Katana.fbx,
Letter.fbx, Atlas_*.png, Env_*.png, Backdrop_*.png, Cloud_Tile.png,
Letter_Washi.png and Look.json (seat position, fade times, cloud colours).
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "Assets", "Resources", "Kyoto"))
SCRATCH = os.path.join(bpy.app.tempdir, "kyoto_export")
os.makedirs(OUT, exist_ok=True)
os.makedirs(SCRATCH, exist_ok=True)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

DUSK, NIGHT = 1, 1153
MAX_EDGE = 0.7          # long faces are cut to this so the baked light has somewhere to live
GLOSS = {"Timber_Deck": 0.34, "Roof_Tile": 0.2, "Stone_Wet": 0.16, "Gutter_Metal": 0.2}
SWAY = {"Blossom": 1.0, "Leaf": 0.55, "Reed": 0.9, "Pine": 0.3}
# The door-head lintel and the wall above it frame the still camera's view; in
# the game, with a far wider view, they are a black band across it.
SKIP = ("Petal_Falling", "Ground_Outer", "Veranda_Lintel", "Veranda_Transom")
# Materials made of many small faces: lit per vertex rather than in the atlas.
DETAIL = {"Blossom", "Leaf", "Reed", "Pine", "Petal", "Moss", "Roof_Tile", "Gutter_Metal"}
# Where the game's seat is, in courtyard space: forward of the still camera,
# so the wider game view frames the garden as the render does.
SEAT = (0.0, 0.0, 1.55)
GARDEN = (0.9, 9.0, 0.3)

scene = bpy.context.scene
view = bpy.context.view_layer


def gpu():
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.refresh_devices()
    available = any(d.type == 'METAL' for d in prefs.devices)
    for d in prefs.devices:
        d.use = d.type == ('METAL' if available else 'CPU')
    scene.cycles.device = 'GPU' if available else 'CPU'
    print('BAKE DEVICE', 'Metal GPU' if available else 'CPU (Metal unavailable)', flush=True)


def to_display(rgb):
    """Scene-linear colours -> what the scene's view transform shows (0..1).
    Done by saving them as an image 'as render' and reading it back."""
    rgb = np.asarray(rgb, dtype=np.float32).reshape(-1, 3)
    n = len(rgb)
    w = 2048
    h = max(1, math.ceil(n / w))
    px = np.zeros((h * w, 4), dtype=np.float32)
    px[:n, :3] = rgb
    px[:, 3] = 1
    img = bpy.data.images.new("tonemap_in", w, h, alpha=False, float_buffer=True)
    img.pixels.foreach_set(px.ravel())
    path = os.path.join(SCRATCH, "tonemap.png")
    old = scene.render.image_settings.file_format, scene.render.image_settings.color_mode, scene.render.image_settings.color_depth
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '16'
    img.save_render(path, scene=scene)
    (scene.render.image_settings.file_format, scene.render.image_settings.color_mode,
     scene.render.image_settings.color_depth) = old
    bpy.data.images.remove(img)
    back = bpy.data.images.load(path)
    back.colorspace_settings.name = 'Non-Color'      # read the stored display values untouched
    out = np.empty(h * w * 4, dtype=np.float32)
    back.pixels.foreach_get(out)
    bpy.data.images.remove(back)
    return out.reshape(-1, 4)[:n, :3].copy()


def collect():
    """Mesh objects that make up the courtyard itself."""
    keep = []
    for name in ("Architecture", "Garden", "Tree"):
        for o in bpy.data.collections[name].all_objects:
            if o.type != 'MESH' or o.hide_render or o.hide_viewport or o.name.startswith(SKIP):
                continue
            keep.append(o)
    return keep


def tag(o):
    """Per-vertex gloss, sway weight and sway phase from the object's material."""
    o.data = o.data.copy()
    me = o.data
    mats = [m.name if m else "" for m in me.materials] or [""]
    n = len(me.vertices)
    gloss = np.zeros(n, dtype=np.float32)
    sway = np.zeros(n, dtype=np.float32)
    co = np.empty(n * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    z = co[:, 2]
    span = max(1e-4, float(z.max() - z.min())) if n else 1.0
    rise = (z - z.min()) / span if n else z
    first = mats[0]
    if first in GLOSS:
        gloss[:] = GLOSS[first]
    if first == "Ground_Wet":
        wet = np.array([c.color[0] for c in me.color_attributes["Wetness"].data], dtype=np.float32)
        still = np.array([c.color[0] for c in me.color_attributes["StandingWater"].data], dtype=np.float32)
        gloss[:] = np.clip(np.maximum(still, 0.22 * wet), 0, 1)
    if first in SWAY:
        k = SWAY[first]
        sway[:] = k if first == "Blossom" else k * rise ** (2.0 if first == "Reed" else 1.2)
    w = o.matrix_world.translation
    phase = (w.x * 0.37 + w.y * 0.11 + (sum(map(ord, o.name)) % 97) / 97.0 * 0.6) % 1.0
    for name, values in (("k_gloss", gloss), ("k_sway", sway), ("k_phase", np.full(n, phase, dtype=np.float32))):
        a = me.attributes.new(name, 'FLOAT', 'POINT')
        a.data.foreach_set("value", values)
    # Preserve material input attributes through both bakes. Previously removing
    # Wetness/StandingWater here silently baked the entire garden as dry dirt.
    if first == "Ground_Wet":
        moss = np.array([c.color[0] for c in me.color_attributes["MossCoverage"].data],dtype=np.float32)
        me.attributes["k_gloss"].data.foreach_set("value",gloss*(1-moss))
    # Object Info Random changes when objects are joined. Freeze it per mesh.
    import hashlib
    variation = int(hashlib.sha256(o.name.encode()).hexdigest()[:8],16)/0xffffffff
    a=me.attributes.new("PaintVariation",'FLOAT','POINT')
    a.data.foreach_set("value",np.full(n,variation,dtype=np.float32))


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    base = next((o for o in objs if o.name in ("Ground", "Courtyard")), objs[0])
    view.objects.active = base
    bpy.ops.object.join()
    o = view.objects.active
    o.name = o.data.name = name
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    # whatever object the others were joined into, leave the mesh in world space
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def cut_long_edges(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    # Remember which way every face looks: the cuts below can turn some of the
    # new faces over, and a face lit from its back bakes black.
    way = bm.faces.layers.float_vector.new("way")
    for f in bm.faces:
        f[way] = f.normal
    for _ in range(4):
        long = [e for e in bm.edges if e.calc_length() > MAX_EDGE]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    turned = 0
    for f in bm.faces:
        if f.normal.dot(f[way]) < 0:
            f.normal_flip()
            turned += 1
    bm.faces.layers.float_vector.remove(way)
    # The light is baked per vertex, so that it runs smoothly across a wall.
    # Faces that meet at a crease must not share one, or each would take on
    # the other's light: split the mesh along every hard edge.
    hard = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(24)]
    bmesh.ops.split_edges(bm, edges=hard)
    bm.to_mesh(o.data)
    bm.free()


def bake(o, attr, frame, kind='COMBINED'):
    scene.frame_set(frame)
    me = o.data
    if attr not in me.color_attributes:
        me.color_attributes.new(attr, 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = me.color_attributes[attr]
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    view.objects.active = o
    scene.render.bake.target = 'VERTEX_COLORS'
    if kind == 'COMBINED':
        bpy.ops.object.bake(type='COMBINED', pass_filter={'EMIT', 'DIRECT', 'INDIRECT', 'DIFFUSE', 'TRANSMISSION'},
                            target='VERTEX_COLORS')
    else:
        bpy.ops.object.bake(type='EMIT', target='VERTEX_COLORS')
    out = np.empty(len(me.vertices) * 4, dtype=np.float32)
    me.color_attributes[attr].data.foreach_get("color", out)
    idx = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", idx)
    return out.reshape(-1, 4)[idx, :3].copy()         # one colour per face corner


def corner(me, name):
    """A point attribute spread onto face corners."""
    vals = np.empty(len(me.vertices), dtype=np.float32)
    me.attributes[name].data.foreach_get("value", vals)
    idx = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", idx)
    return vals[idx]


def pack(o, dusk, night, gloss, sway, phase, material, atlas=None):
    """Replace the mesh's layers with the ones the Unity shader reads."""
    me = o.data
    atlas_uv = None
    if atlas:
        atlas_uv = np.empty(len(me.loops) * 2, dtype=np.float32)
        me.uv_layers[atlas].data.foreach_get("uv", atlas_uv)
    for c in [c.name for c in me.color_attributes]:
        me.color_attributes.remove(me.color_attributes[c])
    for u in [u.name for u in me.uv_layers]:
        me.uv_layers.remove(me.uv_layers[u])
    for a in [a.name for a in me.attributes if a.name.startswith("k_") or a.name in ("grain", "endcut")]:
        me.attributes.remove(me.attributes[a])
    n = len(me.loops)
    col = me.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    col.data.foreach_set("color", np.column_stack([dusk, gloss]).astype(np.float32).ravel())
    for name, a, b in (("UV0_NightRG", night[:, 0], night[:, 1]), ("UV1_NightB_Sway", night[:, 2], sway),
                       ("UV2_Phase", phase, np.zeros(n, dtype=np.float32))):
        layer = me.uv_layers.new(name=name)
        layer.data.foreach_set("uv", np.column_stack([a, b]).astype(np.float32).ravel())
    if atlas_uv is not None:
        me.uv_layers.new(name="UV3_Atlas").data.foreach_set("uv", atlas_uv)
    me.materials.clear()
    me.materials.append(material)
    me.polygons.foreach_set("material_index", np.zeros(len(me.polygons), dtype=np.int32))
    me.update()


def export(objs, filename, empties=False, shapes=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    view.objects.active = objs[0]
    bpy.ops.export_scene.fbx(
        filepath=os.path.join(OUT, filename), use_selection=True,
        object_types={"MESH", "EMPTY"} if empties else {"MESH"},
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS", bake_space_transform=True,
        axis_forward="-Z", axis_up="Y", mesh_smooth_type="FACE", colors_type='LINEAR',
        use_mesh_modifiers=not shapes, add_leaf_bones=False, bake_anim=False)
    print("EXPORTED", filename)


def unseen(o, others, eye):
    """Faces that cannot be seen from anywhere a seated head could be."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(x, dg) for x in [o] + others]
    views = [Vector((eye[0] + dx, eye[1] + dy, eye[2] + dz))
             for dx in (-0.8, 0.0, 0.8) for dy in (-0.6, 0.5) for dz in (-0.35, 0.3)]
    me = o.data
    hidden = []
    for poly in me.polygons:
        c, n = poly.center, poly.normal
        pts = [c] + [c.lerp(me.vertices[v].co, 0.85) for v in poly.vertices]
        if poly.area > 0.6:
            pts += [c.lerp(me.vertices[v].co, 0.45) for v in poly.vertices]
        seen = False
        for eye_at in views:
            for pt in pts:
                d = pt - eye_at
                if d.dot(n) >= 0:
                    continue                      # turned away from this eye
                dist = d.length
                way = d / dist
                if all(t.ray_cast(eye_at, way, dist - 0.02)[0] is None for t in trees):
                    seen = True
                    break
            if seen:
                break
        if poly.area > 15 and os.environ.get("KYOTO_DEBUG"):
            print("BIG", "seen" if seen else "UNSEEN", round(poly.area, 1), [round(v, 2) for v in c], [round(v, 2) for v in n], len(poly.vertices))
        if not seen:
            hidden.append(poly.index)
            if False:
                eye_at = views[0]
                d = c - eye_at
                hits = [t.ray_cast(eye_at, d.normalized(), d.length - 0.02) for t in trees]
                print("BIG UNSEEN", round(poly.area, 1), [round(v, 2) for v in c], [round(v, 2) for v in n],
                      [(None if h[0] is None else ([round(v, 2) for v in h[0]], round(h[3], 2))) for h in hits])
    return hidden


def part_hidden(o, hidden):
    """Move the listed faces into an object of their own. They are cut free of
    their neighbours first: a seen face that shares all its corners with unseen
    ones would otherwise be swept along with them."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    faces = [bm.faces[i] for i in hidden]
    cut = bmesh.ops.split(bm, geom=faces)
    faces = [g for g in cut["geom"] if isinstance(g, bmesh.types.BMFace)]
    for v in bm.verts:
        v.select = False
    for e in bm.edges:
        e.select = False
    for f in bm.faces:
        f.select = False
    for f in faces:
        f.select_set(True)
    bm.to_mesh(me)
    bm.free()
    before = set(bpy.data.objects)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    view.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    return next(x for x in bpy.data.objects if x not in before)


def squeeze(o, name, v0, v1):
    """Fit an unwrapped object's atlas into the band v0..v1."""
    uv = np.empty(len(o.data.loops) * 2, dtype=np.float32)
    o.data.uv_layers[name].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    uv[:, 1] = v0 + uv[:, 1] * (v1 - v0)
    o.data.uv_layers[name].data.foreach_set("uv", uv.ravel())


def unwrap(o, name="Atlas"):
    """Give every face its own place in the atlas, sized by its area."""
    me = o.data
    layer = me.uv_layers.new(name=name)
    me.uv_layers.active = layer
    layer.active_render = True
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    view.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # The room's walls and ceiling are huge and plain: half the texel density
    # is plenty for them, and leaves more of the atlas for the garden.
    layer = o.data.uv_layers[name]                 # the old handle does not survive edit mode
    for poly in o.data.polygons:
        if poly.area > 15:
            uvs = [layer.data[i].uv for i in poly.loop_indices]
            mid = sum(uvs, Vector((0, 0))) / len(uvs)
            for uv in uvs:
                uv[:] = mid + (uv - mid) * 0.5
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=0.0012)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_atlas(o, size, frame, tag_name):
    """Bake the surfaces' materials and light into one image and save what
    the view transform makes of it."""
    scene.frame_set(frame)
    img = bpy.data.images.new(f"Atlas_{tag_name}_linear", size, size, alpha=False, float_buffer=True)
    for m in o.data.materials:
        nt = m.node_tree
        n = nt.nodes.get("Bake_Target") or nt.nodes.new("ShaderNodeTexImage")
        n.name = "Bake_Target"
        n.image = img
        for other in nt.nodes:
            other.select = False
        n.select = True
        nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    view.objects.active = o
    scene.render.bake.target = 'IMAGE_TEXTURES'
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type='COMBINED', pass_filter={'EMIT', 'DIRECT', 'INDIRECT', 'DIFFUSE', 'TRANSMISSION'},
                        target='IMAGE_TEXTURES', margin=8, use_clear=True)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    shown = to_display(px.reshape(-1, 4)[:, :3])
    out = bpy.data.images.new(f"Atlas_{tag_name}", size, size, alpha=False)
    out.colorspace_settings.name = 'Non-Color'
    full = np.ones((size * size, 4), dtype=np.float32)
    full[:, :3] = shown
    out.pixels.foreach_set(full.ravel())
    out.filepath_raw = os.path.join(OUT, f"Atlas_{tag_name}.png")
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)
    print("ATLAS", tag_name)


def panorama(name, location, width):
    """What the scene looks like in every direction from one point, at both
    times: the game's reflections and the light on its props come from these."""
    cam = bpy.data.cameras.new(name)
    cam.type = 'PANO'
    try:
        cam.panorama_type = 'EQUIRECTANGULAR'
    except AttributeError:
        cam.cycles.panorama_type = 'EQUIRECTANGULAR'
    cam.clip_start, cam.clip_end = 0.02, 1500
    o = bpy.data.objects.new(name, cam)
    o.location, o.rotation_euler = location, (math.pi / 2, 0, 0)     # looking along +Y, the game's forward
    scene.collection.objects.link(o)
    old = scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage
    scene.camera = o
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = width, width // 2, 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    for tag_name, frame in (("Dusk", DUSK), ("Night", NIGHT)):
        scene.frame_set(frame)
        scene.render.filepath = os.path.join(OUT, f"{name}_{tag_name}.png")
        bpy.ops.render.render(write_still=True)
    scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = old
    bpy.data.objects.remove(o)
    print("PANORAMA", name)


def main():
    preview = "--preview" in args
    gpu()
    scene.render.engine = 'CYCLES'
    scene.frame_set(DUSK)
    look = {"seat": list(SEAT), "desktopFieldOfView": 42.0}

    # ---- the letter and the katana leave on their own
    letter_obj, anchor = bpy.data.objects["Letter"], bpy.data.objects["TextAnchor"]
    flight = bpy.data.objects["Letter_Flight"]
    flight.animation_data_clear()
    flight.location, flight.rotation_euler, flight.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
    letter_obj.data.shape_keys.animation_data_clear()
    letter_obj.data.shape_keys.key_blocks["Flutter"].value = 0
    letter_obj.parent = None
    view.update()
    export([letter_obj, anchor], "Letter.fbx", empties=True, shapes=True)
    washi = bpy.data.images["Letter_Washi"]
    washi.filepath_raw = os.path.join(OUT, "Letter_Washi.png")
    washi.file_format = 'PNG'
    washi.save()
    katana = bpy.data.objects["Katana"]
    parts = [c for c in katana.children if c.type == 'MESH']
    katana.location, katana.rotation_euler = (0, 0, 0), (0, 0, 0)
    view.update()
    export(parts, "Katana.fbx")
    for o in [letter_obj, anchor, flight, katana] + parts + [o for o in bpy.data.objects if o.name.startswith(("Blade_Reflector", "Petal_Falling"))]:
        o.hide_render = True
        o.hide_set(True)

    # ---- the framing pieces of the still camera's view do not go to the game
    for name in ("Veranda_Lintel", "Veranda_Transom"):
        bpy.data.objects[name].hide_render = True
        bpy.data.objects[name].hide_set(True)
    # ---- reflection capture from the virtual eye under the water plane.
    # Project from this fixed point in world space, so the gate/window reflection
    # meets the real geometry at the shoreline instead of sliding around a probe.
    scene.cycles.samples = 48 if preview else 192
    scene.cycles.use_denoising = True
    hidden_for_water = [o for o in bpy.data.objects if o.type == 'MESH' and
                        (o.name.startswith(('Ground','Deck_Board','Deck_Edge','Deck_Fascia')))]
    old_hidden = [(o,o.hide_render) for o in hidden_for_water]
    for o,_ in old_hidden: o.hide_render=True
    panorama("Reflection", (SEAT[0],SEAT[1],-SEAT[2]+0.06),1024 if preview else 4096)
    for o,hidden in old_hidden: o.hide_render=hidden
    look["reflectionEye"] = [SEAT[0],-SEAT[2]+0.06,SEAT[1]]

    # ---- panoramas, while the scene is still whole
    scene.cycles.samples = 48 if preview else 256
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    panorama("Env_Garden", GARDEN, 1024 if preview else 2048)
    panorama("Env_Seat", (SEAT[0], SEAT[1] + 0.5, SEAT[2] - 0.15), 1024 if preview else 2048)

    # ---- the courtyard, lit at both ends of the fade
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False      # it stops a bake early and leaves each face its own noise
    objs = collect()
    for o in objs:
        tag(o)
    # Joined geometry must retain the palette of each original object.
    for material in bpy.data.materials:
        if not material.use_nodes: continue
        nt=material.node_tree
        for nd in list(nt.nodes):
            if nd.type != 'OBJECT_INFO': continue
            edges=list(nd.outputs['Random'].links)
            if not edges: continue
            attr=nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name='PaintVariation'
            for edge in edges: nt.links.new(attr.outputs['Fac'],edge.to_socket)
    small = [o for o in objs if (o.data.materials[0].name if o.data.materials and o.data.materials[0] else "") in DETAIL]
    big = [o for o in objs if o not in small]
    yard = join(big, "Courtyard")
    detail = join(small, "Courtyard_Detail")
    cut_long_edges(detail)
    outer = bpy.data.objects["Ground_Outer"]         # the land beyond the walls stays one big face
    tag(outer)
    detail = join([detail, outer], "Courtyard_Detail")
    for o in (yard, detail):
        print(o.name.upper(), "verts", len(o.data.vertices), "tris", sum(len(p.vertices) - 2 for p in o.data.polygons))
    flat = bpy.data.materials.new("Kyoto")

    # Faces no seated player can see (the far sides of walls, the tops of roofs
    # under their tiles) share a thin strip of the atlas; the rest is for what shows.
    hidden = unseen(yard, [detail], SEAT)
    print("UNSEEN", len(hidden), "of", len(yard.data.polygons))
    back_faces = part_hidden(yard, hidden)
    if os.environ.get("KYOTO_DEBUG"):
        for tag_name, ob in (("VISIBLE", yard), ("HIDDEN", back_faces)):
            big = [p for p in ob.data.polygons if p.area > 15]
            print("PART", tag_name, ob.name, len(ob.data.polygons), "big:", [(round(p.area, 1), [round(v, 1) for v in p.normal]) for p in big])
    unwrap(yard)
    unwrap(back_faces)
    squeeze(yard, "Atlas", 0.05, 1.0)
    squeeze(back_faces, "Atlas", 0.0, 0.042)
    yard = join([yard, back_faces], "Courtyard")
    yard.data.uv_layers.active = yard.data.uv_layers["Atlas"]
    yard.data.uv_layers["Atlas"].active_render = True
    g = [p for p in yard.data.polygons if abs(p.center.z) < 0.6 and p.normal.z > 0.9 and p.area < 0.05 and 6 < p.center.y < 12]
    if g:
        uvl = yard.data.uv_layers["Atlas"].data
        def uv_area(p):
            pts = [uvl[i].uv for i in p.loop_indices]
            return abs(sum(pts[k].x * pts[(k + 1) % len(pts)].y - pts[(k + 1) % len(pts)].x * pts[k].y for k in range(len(pts)))) / 2
        dens = math.sqrt(sum(uv_area(p) for p in g) / sum(p.area for p in g))
        print("GROUND TEXELS PER METRE at 4096:", round(dens * 4096))
    if os.environ.get("KYOTO_DEBUG"):
        uvl = yard.data.uv_layers["Atlas"].data
        for poly in yard.data.polygons:
            if poly.area > 15:
                us = [uvl[i].uv for i in poly.loop_indices]
                print("UVBOX", round(poly.area, 1), [round(v, 2) for v in poly.center], [round(v, 1) for v in poly.normal],
                      "du", round(max(u.x for u in us) - min(u.x for u in us), 4), "dv", round(max(u.y for u in us) - min(u.y for u in us), 4),
                      "at", round(us[0].x, 3), round(us[0].y, 3))
    size = 1024 if preview else 4096
    scene.cycles.samples = 24 if preview else 320
    for tag_name, frame in (("Dusk", DUSK), ("Night", NIGHT)):
        bake_atlas(yard, size, frame, tag_name)
    scene.cycles.samples = 64 if preview else 768
    dusk = bake(detail, "BakeDusk", DUSK)
    night = bake(detail, "BakeNight", NIGHT)
    pack(detail, to_display(dusk), to_display(night), corner(detail.data, "k_gloss"), corner(detail.data, "k_sway"),
         corner(detail.data, "k_phase"), flat)
    n = len(yard.data.loops)
    white = np.ones((n, 3), dtype=np.float32)
    pack(yard, white, white, corner(yard.data, "k_gloss"), np.zeros(n, dtype=np.float32), np.zeros(n, dtype=np.float32),
         flat, atlas="Atlas")

    # ---- sky dome and the glow behind the gate: plain emitters, baked per vertex
    emitters = []
    for name in ("Sky_Dome", "Gate_Glow"):
        o = bpy.data.objects[name]
        if name == "Gate_Glow":
            cut_long_edges(o)
        d0 = bake(o, "BakeDusk", DUSK, 'EMIT')
        d1 = bake(o, "BakeNight", NIGHT, 'EMIT')
        zeros = np.zeros(len(o.data.loops), dtype=np.float32)
        pack(o, to_display(d0), to_display(d1), zeros, zeros, zeros, flat)
        emitters.append(o)

    # ---- painted distance and clouds keep their UVs; their colours go through the view transform too
    from kyoto import atmosphere
    back = bpy.data.objects["Painted_Distant_Landscape"]
    img = bpy.data.images["Kyoto_Painted_Twilight_2172px"]
    w, h = img.size
    for tag_name, lin in (("Dusk", atmosphere.dusk_pixels(img)), ("Night", atmosphere.night_pixels(img))):
        shown = to_display(lin.reshape(-1, 3))
        out = bpy.data.images.new(f"Backdrop_{tag_name}", w, h, alpha=False)
        out.colorspace_settings.name = 'Non-Color'
        full = np.ones((w * h, 4), dtype=np.float32)
        full[:, :3] = shown
        out.pixels.foreach_set(full.ravel())
        out.filepath_raw = os.path.join(OUT, f"Backdrop_{tag_name}.png")
        out.file_format = 'PNG'
        out.save()
    tile = bpy.data.images["Cloud_Tile"]
    tile.filepath_raw = os.path.join(OUT, "Cloud_Tile.png")
    tile.file_format = 'PNG'
    tile.save()
    clouds = [bpy.data.objects["Clouds_Near"], bpy.data.objects["Clouds_Far"]]
    from kyoto import sky as sky_mod
    from kyoto.common import hx
    L = sky_mod.LOOKS["dusk"]
    for tag_name, src in (("Dusk", L), ("Night", sky_mod.LOOKS["night"])):
        cols = np.array([hx(src["cloud_hi"]), hx(src["cloud_lo"])], dtype=np.float32) * L["sky_strength"] * 0.95
        shown = to_display(cols)
        look[f"cloud{tag_name}"] = dict(high=[float(v) for v in shown[0]], low=[float(v) for v in shown[1]])
    look["cloudOpacity"] = L["cloud_opacity"]
    look["fade"] = dict(holdSeconds=5.0, endSeconds=48.0)
    for o in clouds + [back]:
        o.data.materials.clear()
        o.data.materials.append(flat)
    export([yard, detail, back] + emitters + clouds, "Courtyard.fbx")
    with open(os.path.join(OUT, "Look.json"), "w") as f:
        json.dump(look, f, indent=1)


main()
