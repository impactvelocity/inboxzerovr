"""Builds the Inbox Zero models and exports them as FBX for Unity.

Run:  Blender --background --python Blender/build_models.py

Everything is authored in Unity's space (Y up, metres) and converted on the
way in, so the numbers below match the game code. Weapons have the handle
along +Y with the origin in the middle of the grip. Each part is its own
object; Unity assigns materials by part name (Blade, Halo, Handle, ...).
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "Assets", "Models")

SWORD_BLADE_START = 0.11
SWORD_BLADE_END = 0.66

# Unity (x, y, z) -> Blender (x, -z, y): Y up becomes Z up.
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def finish(name, bm, smooth=False):
    """Bake a bmesh authored in Unity space into a Blender object."""
    bm.transform(TO_BLENDER)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box(name, size, at, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect="EDGES")
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return finish(name, bm)


def cylinder(name, r_bottom, r_top, height, at, segments=16):
    """A cylinder along Unity's +Y."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=segments,
        radius1=r_bottom, radius2=r_top, depth=height,
    )  # along Z here
    bmesh.ops.rotate(bm, cent=(0, 0, 0), verts=bm.verts,
                     matrix=Matrix.Rotation(-math.pi / 2, 3, "X"))  # Z -> Y
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return finish(name, bm, smooth=True)


def blade(name, thick, length, width, y0, tip=0.05):
    """A flat blade along +Y with a pointed tip, thin in X, wide in Z."""
    bm = bmesh.new()
    hx, hz = thick / 2, width / 2
    y1 = y0 + length - tip
    ring0 = [bm.verts.new(p) for p in ((-hx, y0, 0), (0, y0, -hz), (hx, y0, 0), (0, y0, hz))]
    ring1 = [bm.verts.new(p) for p in ((-hx, y1, 0), (0, y1, -hz), (hx, y1, 0), (0, y1, hz))]
    apex = bm.verts.new((0, y0 + length, 0))
    bm.faces.new(ring0)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
        bm.faces.new((ring1[i], ring1[j], apex))
    return finish(name, bm)


def disc(name, radius, y, segments=64):
    bm = bmesh.new()
    centre = bm.verts.new((0, y, 0))
    rim = [bm.verts.new((radius * math.cos(a), y, radius * math.sin(a)))
           for a in (2 * math.pi * i / segments for i in range(segments))]
    for i in range(segments):
        bm.faces.new((centre, rim[(i + 1) % segments], rim[i]))
    return finish(name, bm)


def flat_ring(name, inner, outer, y, segments=96):
    bm = bmesh.new()
    a = [bm.verts.new((inner * math.cos(t), y, inner * math.sin(t)))
         for t in (2 * math.pi * i / segments for i in range(segments))]
    b = [bm.verts.new((outer * math.cos(t), y, outer * math.sin(t)))
         for t in (2 * math.pi * i / segments for i in range(segments))]
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((a[i], a[j], b[j], b[i]))
    return finish(name, bm)


def export(filename):
    path = os.path.abspath(os.path.join(OUT, filename))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"MESH"},
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        bake_space_transform=True,
        axis_forward="-Z",
        axis_up="Y",
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
        bake_anim=False,
    )
    print("exported", path)


def rod(name, radius, y0, y1, segments=14, tip=None):
    """A round rod along Unity's +Y from y0 to y1, closing to a rounded tip."""
    tip = radius * 1.6 if tip is None else tip
    bm = bmesh.new()
    rings = [(y0, radius), (y1 - tip, radius), (y1 - tip * 0.45, radius * 0.8), (y1 - tip * 0.12, radius * 0.42)]
    loops = []
    for y, r in rings:
        loops.append([bm.verts.new((r * math.cos(a), y, r * math.sin(a)))
                      for a in (2 * math.pi * i / segments for i in range(segments))])
    bm.faces.new(loops[0])
    for lower, upper in zip(loops, loops[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    apex = bm.verts.new((0, y1, 0))
    for i in range(segments):
        bm.faces.new((loops[-1][i], loops[-1][(i + 1) % segments], apex))
    return finish(name, bm, smooth=True)


def build_sword():
    """A light saber: a plain, dark, slightly battered grip (eight-sided, no
    polish) and a blade of light, a white-hot core in two soft shells of glow."""
    reset()
    cylinder("Hilt", 0.0165, 0.0155, 0.17, (0, 0, 0), 8)
    cylinder("Shroud", 0.0185, 0.021, 0.032, (0, 0.094, 0), 8)
    cylinder("Pommel", 0.019, 0.0175, 0.024, (0, -0.096, 0), 8)
    for i, y in enumerate((-0.055, -0.035, -0.015, 0.005)):
        cylinder(f"Grip{i}", 0.0178, 0.0178, 0.008, (0, y, 0), 8)
    box("Switch", (0.012, 0.022, 0.008), (0, 0.045, 0.017), bevel=0.001)
    cylinder("Emitter0", 0.0168, 0.0168, 0.004, (0, 0.111, 0), 8)  # the lit lip the blade comes out of
    rod("Blade", 0.0058, SWORD_BLADE_START, SWORD_BLADE_END, tip=0.03)
    rod("Halo", 0.015, SWORD_BLADE_START - 0.004, SWORD_BLADE_END + 0.012, tip=0.05)
    rod("Halo2", 0.032, SWORD_BLADE_START - 0.01, SWORD_BLADE_END + 0.03, tip=0.09)
    export("Sword.fbx")


def build_arena():
    """A small platform under the seat, floating in the tunnel."""
    reset()
    disc("Floor", 2.4, 0.0)
    flat_ring("Ring0", 0.9 - 0.012, 0.9 + 0.012, 0.003)
    flat_ring("Ring1", 1.02 - 0.004, 1.02 + 0.004, 0.003)
    export("Arena.fbx")


os.makedirs(OUT, exist_ok=True)
build_sword()
build_arena()
bpy.ops.wm.read_factory_settings(use_empty=True)
