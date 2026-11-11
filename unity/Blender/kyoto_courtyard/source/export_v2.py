"""Export the old courtyard's buildings for the Kyoto v2 level.

    Blender --background kyoto_courtyard_dusk_polished.blend --python source/export_v2.py [-- --preview]

Kyoto v2 is lit by Unity (URP) together with the Komorebi Nature assets, so
no light is baked here. The trees, rocks, lantern and plants of this scene
stay behind; the pack's take their places. What leaves, to
unity/Assets/KyotoV2:

  Architecture.fbx            four meshes (Veranda, Machiya, Gate, Walls), so
                              each takes the lamps nearest to it, with one
                              submesh per kind of surface (Wood, Deck,
                              Plaster, Stone, Tile, Metal, PaperLit, PaperDim)
  Architecture_Albedo.png     the materials' own colour: grain, plaster
                              mottle, tile tones
  Architecture_Occlusion.png  how much open sky each surface sees; Unity dims
                              its ambient light by it, so the room is dark
                              and the garden is not

Faces no seated player can see keep their geometry (they still cast shadows)
but share one flat swatch per material, so the atlas goes to what shows.
"""
import hashlib
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from bpy_extras import mesh_utils
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "Assets", "KyotoV2"))
os.makedirs(OUT, exist_ok=True)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "--preview" in args

SEAT = (0.0, 2.2, 1.55)                       # the game's eye, in courtyard space
SKIP = ("Veranda_Lintel", "Veranda_Transom")  # they frame the still camera; a band across a headset view
KIND = {"Timber_Dark": "Wood", "Timber_Facade": "Wood", "Timber_Deck": "Deck", "Plaster": "Plaster",
        "Stone_Dry": "Stone", "Stone_Base": "Stone", "Roof_Tile": "Tile", "Gutter_Metal": "Metal",
        "Paper_Lit": "PaperLit", "Paper_Dim": "PaperDim"}
REGIONS = ("Veranda", "Machiya", "Gate", "Walls")
SWATCH_V = 0.972                              # the atlas above this line holds the unseen faces' swatches
ATLAS = 2048 if PREVIEW else 4096
OCCLUSION = 1024 if PREVIEW else 2048

scene = bpy.context.scene
view = bpy.context.view_layer


def gpu():
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.refresh_devices()
    available = any(d.type == 'METAL' for d in prefs.devices)
    for d in prefs.devices:
        d.use = d.type == ('METAL' if available else 'CPU')
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU' if available else 'CPU'


def collect():
    variants = set(bpy.data.collections["Roof_Tile_Variants"].objects)
    return [o for o in bpy.data.collections["Architecture"].all_objects
            if o.type == 'MESH' and not o.hide_render and o not in variants and not o.name.startswith(SKIP)]


def region_of(o):
    """Which of the four meshes an object ends up in."""
    homes = {c.name for c in o.users_collection}
    if homes & {"Veranda", "Veranda_Roof"}:
        return 0
    if "Machiya" in homes:
        return 1
    if "Gate" in homes:
        return 2
    if "Walls" in homes:
        return 3
    c = sum((o.matrix_world @ Vector(corner) for corner in o.bound_box), Vector()) / 8   # a roof tile
    if c.y < 4.6:
        return 0
    if c.x > 2.9 and c.y < 12.3 and c.z > 2.7:
        return 1
    if 0.3 < c.x < 4.4 and c.y > 15 and c.z > 2.6:
        return 2
    return 3


def freeze_variation(objs):
    """Materials tint each object by Object Info > Random, which changes when
    objects are joined. Store it on the mesh and read it from there."""
    for o in objs:
        o.data = o.data.copy()
        value = int(hashlib.sha256(o.name.encode()).hexdigest()[:8], 16) / 0xffffffff
        a = o.data.attributes.new("PaintVariation", 'FLOAT', 'POINT')
        a.data.foreach_set("value", np.full(len(o.data.vertices), value, dtype=np.float32))
        r = o.data.attributes.new("region", 'INT', 'FACE')
        r.data.foreach_set("value", np.full(len(o.data.polygons), region_of(o), dtype=np.int32))
    for material in bpy.data.materials:
        nt = material.node_tree
        if nt is None:
            continue
        for nd in list(nt.nodes):
            if nd.type != 'OBJECT_INFO':
                continue
            edges = list(nd.outputs['Random'].links)
            if not edges:
                continue
            attr = nt.nodes.new('ShaderNodeAttribute')
            attr.attribute_name = 'PaintVariation'
            for edge in edges:
                nt.links.new(attr.outputs['Fac'], edge.to_socket)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    view.objects.active = objs[0]
    bpy.ops.object.join()
    o = view.objects.active
    o.name = o.data.name = name
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def unseen(o, others):
    """Faces that cannot be seen from anywhere a seated head could be."""
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(x, dg) for x in [o] + others]
    eyes = [Vector((SEAT[0] + dx, SEAT[1] + dy, SEAT[2] + dz))
            for dx in (-1.0, 0.0, 1.0) for dy in (-0.8, 0.7) for dz in (-0.4, 0.35)]
    me = o.data
    hidden = []
    for poly in me.polygons:
        c, n = poly.center, poly.normal
        pts = [c] + [c.lerp(me.vertices[v].co, 0.85) for v in poly.vertices]
        if poly.area > 0.6:
            pts += [c.lerp(me.vertices[v].co, 0.45) for v in poly.vertices]
        seen = False
        for eye in eyes:
            for pt in pts:
                d = pt - eye
                if d.dot(n) >= 0:
                    continue
                dist = d.length
                if all(t.ray_cast(eye, d / dist, dist - 0.02)[0] is None for t in trees):
                    seen = True
                    break
            if seen:
                break
        if not seen:
            hidden.append(poly.index)
    return hidden


def part_hidden(o, hidden):
    """Move the listed faces into an object of their own. They are cut free of
    their neighbours first: a seen face that shares all its corners with unseen
    ones would otherwise be swept along with them."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    cut = bmesh.ops.split(bm, geom=[bm.faces[i] for i in hidden])
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


def unwrap(o):
    """An atlas for the faces that show: sized by area, and by how near the
    seat they are (the deck underfoot gets more texels than the far wall)."""
    me = o.data
    for name in [u.name for u in me.uv_layers]:
        me.uv_layers.remove(me.uv_layers[name])
    layer = me.uv_layers.new(name="Atlas")
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

    me = o.data
    uvs = me.uv_layers["Atlas"].data             # the old handle does not survive edit mode
    seat = Vector(SEAT)
    for island in mesh_utils.mesh_linked_uv_islands(me):
        polys = [me.polygons[i] for i in island]
        area = sum(p.area for p in polys)
        near = min((p.center - seat).length for p in polys)
        weight = 1.75 if near < 4.5 else 1.3 if near < 8 else 1.0
        if area > 15:
            weight *= 0.5                     # the room's walls and ceiling: huge and plain
        if abs(weight - 1) < 1e-3:
            continue
        loops = [i for p in polys for i in p.loop_indices]
        mid = sum((uvs[i].uv for i in loops), Vector((0, 0))) / len(loops)
        for i in loops:
            uvs[i].uv = mid + (uvs[i].uv - mid) * weight

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=0.0012)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Leave a strip along the top for one swatch per material.
    me = o.data
    uvs = me.uv_layers["Atlas"].data
    co = np.empty(len(me.loops) * 2, dtype=np.float32)
    uvs.foreach_get("uv", co)
    uvs.foreach_set("uv", (co * (SWATCH_V - 0.004)).ravel())


def onto_swatches(o, names):
    """Every face of the unseen part sits on its material's swatch."""
    me = o.data
    for name in [u.name for u in me.uv_layers]:
        me.uv_layers.remove(me.uv_layers[name])
    uvs = me.uv_layers.new(name="Atlas").data
    co = np.zeros((len(me.loops), 2), dtype=np.float32)
    for p in me.polygons:
        co[list(p.loop_indices)] = swatch(names.index(me.materials[p.material_index].name))
    uvs.foreach_set("uv", co.ravel())


def swatch(slot):
    return (0.016 + slot * 0.03, (SWATCH_V + 1) / 2)


def bake(o, kind, size, name, colour):
    img = bpy.data.images.new(name, size, size, alpha=False)
    if not colour:
        img.colorspace_settings.name = 'Non-Color'
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
    if kind == 'DIFFUSE':
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, target='IMAGE_TEXTURES', margin=8, use_clear=True)
    else:
        bpy.ops.object.bake(type='AO', target='IMAGE_TEXTURES', margin=8, use_clear=True)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return img, px.reshape(size, size, 4)


def paint_swatches(o, px, names, flat=None):
    """Fill each material's swatch with the average of what was baked for it."""
    me = o.data
    size = px.shape[0]
    uvs = me.uv_layers["Atlas"].data
    by_name = {}
    for p in me.polygons:
        by_name.setdefault(me.materials[p.material_index].name, []).append(p)
    for slot, name in enumerate(names):
        polys = by_name.get(name, [])[::max(1, len(by_name.get(name, [])) // 400)]
        if flat is not None:
            value = flat
        elif polys:
            samples = []
            for p in polys:
                mid = sum((uvs[k].uv for k in p.loop_indices), Vector((0, 0))) / len(p.loop_indices)
                samples.append(px[min(size - 1, int(mid.y * size)), min(size - 1, int(mid.x * size)), :3])
            value = np.mean(samples, axis=0)
        else:
            value = np.array([0.2, 0.17, 0.16])
        u, _ = swatch(slot)
        x0, x1 = int((u - 0.013) * size), int((u + 0.013) * size)
        px[int(SWATCH_V * size):, x0:x1, :3] = value
    return px


def save(img, px, filename):
    img.pixels.foreach_set(px.astype(np.float32).ravel())
    img.filepath_raw = os.path.join(OUT, filename)
    img.file_format = 'PNG'
    img.save()
    print("SAVED", filename, flush=True)


def main():
    gpu()
    scene.frame_set(1)
    # Only the buildings and the ground they stand on shade one another.
    for name in ("Tree", "Katana", "Letter", "Sky", "Water", "Lighting"):
        for o in bpy.data.collections[name].all_objects:
            o.hide_render = True
    for name in ("Stepping_Stones", "Boulders", "Plants", "Stone_Lantern"):
        for o in bpy.data.collections[name].all_objects:
            o.hide_render = True
    for name in SKIP:
        bpy.data.objects[name].hide_render = True
        bpy.data.objects[name].hide_set(True)

    objs = collect()
    freeze_variation(objs)
    arch = join(objs, "Architecture")
    print("ARCHITECTURE verts", len(arch.data.vertices), "tris",
          sum(len(p.vertices) - 2 for p in arch.data.polygons), flush=True)

    ground = bpy.data.objects["Ground"]
    names = [m.name for m in arch.data.materials]
    hidden = unseen(arch, [ground])
    print("UNSEEN", len(hidden), "of", len(arch.data.polygons), flush=True)
    back = part_hidden(arch, hidden)
    back.name = "Architecture_Unseen"
    unwrap(arch)
    onto_swatches(back, names)
    print("SHOWN AREA m2", round(sum(p.area for p in arch.data.polygons), 1), flush=True)

    scene.cycles.samples = 8 if PREVIEW else 32
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    img, px = bake(arch, 'DIFFUSE', ATLAS, "Architecture_Albedo", True)
    save(img, paint_swatches(arch, px, names), "Architecture_Albedo.png")

    scene.world.light_settings.distance = 7.0
    scene.cycles.samples = 24 if PREVIEW else 160
    img, px = bake(arch, 'AO', OCCLUSION, "Architecture_Occlusion", False)
    save(img, paint_swatches(arch, px, names, flat=0.5), "Architecture_Occlusion.png")
    arch = join([arch, back], "Architecture")
    arch.data.uv_layers.active = arch.data.uv_layers["Atlas"]

    # One plain material per kind of surface; Unity dresses them.
    me = arch.data
    kinds = {}
    for slot, material in enumerate(list(me.materials)):
        kind = KIND.get(material.name if material else "", "Wood")
        kinds.setdefault(kind, bpy.data.materials.new(kind))
        me.materials[slot] = kinds[kind]
    for name in [c.name for c in me.color_attributes]:
        me.color_attributes.remove(me.color_attributes[name])
    for name in [a.name for a in me.attributes if a.name in ("PaintVariation", "grain", "endcut")]:
        me.attributes.remove(me.attributes[name])

    # Four meshes, by where they stand.
    parts = []
    for index, name in enumerate(REGIONS):
        part = arch.copy()
        part.data = arch.data.copy()
        scene.collection.objects.link(part)
        bm = bmesh.new()
        bm.from_mesh(part.data)
        layer = bm.faces.layers.int["region"]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[layer] != index], context='FACES')
        bm.to_mesh(part.data)
        bm.free()
        part.data.attributes.remove(part.data.attributes["region"])
        part.name = part.data.name = name
        print("PART", name, "tris", sum(len(p.vertices) - 2 for p in part.data.polygons), flush=True)
        parts.append(part)
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    view.objects.active = parts[0]
    bpy.ops.export_scene.fbx(
        filepath=os.path.join(OUT, "Architecture.fbx"), use_selection=True, object_types={"MESH"},
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS", bake_space_transform=True,
        axis_forward="-Z", axis_up="Y", mesh_smooth_type="FACE", use_mesh_modifiers=True,
        add_leaf_bones=False, bake_anim=False)
    print("EXPORTED Architecture.fbx", flush=True)


main()
