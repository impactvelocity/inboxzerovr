"""Shared helpers for the Kyoto courtyard build: framing maths, collections,
mesh builders and node shortcuts.

World space: Z up, metres. The camera sits at EYE looking along +Y, so +X is
screen right and the courtyard runs away from the viewer in +Y.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

LENS = 28.0          # mm on a 36 mm sensor (started at 32, widened to match)
SENSOR = 36.0
DECK_Z = 0.35        # veranda floor above the courtyard ground
EYE = Vector((0.0, 0.0, DECK_Z + 1.2))
TX = (SENSOR / 2) / LENS
TZ = (SENSOR / 2) * 9 / 16 / LENS

FPS = 24
LOOP = 288           # frames 1..288 render, frame 289 repeats frame 1

R = random.Random(11)


def P(u, v, y):
    """World point that lands at frame position (u, v) (0..1, top-left
    origin) at depth y in front of the camera."""
    return Vector(((2 * u - 1) * TX * y, y, EYE.z + (1 - 2 * v) * TZ * y))


def PG(u, v, z=0.0):
    """World point on the horizontal plane at height z seen at (u, v)."""
    y = (EYE.z - z) / ((2 * v - 1) * TZ)
    return Vector(((2 * u - 1) * TX * y, y, z))


def hx(h, a=None):
    """sRGB hex -> linear RGB tuple (RGBA when a is given)."""
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out) if a is None else (*out, a)


# ---------------------------------------------------------------- collections
def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def new_obj(name, data, c, mat=None, loc=(0, 0, 0), rot=(0, 0, 0),
            scale=(1, 1, 1), parent=None):
    o = bpy.data.objects.new(name, data)
    o.location, o.rotation_euler, o.scale = loc, rot, scale
    c.objects.link(o)
    if mat is not None and data is not None and hasattr(data, "materials"):
        if not data.materials:
            data.materials.append(mat)
    if parent is not None:
        o.parent = parent
    return o


def empty(name, c, loc=(0, 0, 0), parent=None, size=0.3):
    o = new_obj(name, None, c, loc=loc, parent=parent)
    o.empty_display_size = size
    return o


# --------------------------------------------------------------------- meshes
def mesh_from(name, verts, faces, smooth=False, mats=None, face_mats=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    for m in mats or []:
        me.materials.append(m)
    if face_mats:
        for p, i in zip(me.polygons, face_mats):
            p.material_index = i
    return me


def bm_to_mesh(name, bm, smooth=False, mats=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    for m in mats or []:
        me.materials.append(m)
    return me


_box_cache = {}


def box_mesh(name, size, bevel=0.0, mat=None):
    """Bevelled box centred on its origin. Carries a `grain` vector (local
    position squashed along the long axis, so noise stretches into wood grain)
    and an `endcut` flag on the faces that cap the long axis."""
    key = (tuple(round(s, 4) for s in size), round(bevel, 4),
           mat.name if mat else None)
    if key in _box_cache:
        return _box_cache[key]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1,
                        affect='EDGES', profile=0.5)
    me = bm_to_mesh(name, bm, mats=[mat] if mat else None)
    ax = max(range(3), key=lambda i: size[i])
    g = me.attributes.new("grain", 'FLOAT_VECTOR', 'POINT')
    for i, v in enumerate(me.vertices):
        c = list(v.co)
        c[ax] *= 0.05
        g.data[i].vector = c
    e = me.attributes.new("endcut", 'FLOAT', 'FACE')
    for i, p in enumerate(me.polygons):
        e.data[i].value = 1.0 if abs(p.normal[ax]) > 0.9 else 0.0
    _box_cache[key] = me
    return me


def box(name, size, loc, c, mat, rot=(0, 0, 0), bevel=0.0, parent=None):
    return new_obj(name, box_mesh(name, size, bevel, mat), c, loc=loc,
                   rot=rot, parent=parent)


def span(name, a, b, w, h, c, mat, bevel=0.0, parent=None, roll=0.0):
    """Timber of section w x h running from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    me = box_mesh(name, (d.length, w, h), bevel, mat)
    o = new_obj(name, me, c, loc=(a + b) / 2, parent=parent)
    x = d.normalized()
    up = Vector((0, 0, 1)) if abs(x.z) < 0.99 else Vector((0, 1, 0))
    y = up.cross(x).normalized()
    z = x.cross(y)
    m = Matrix((x, y, z)).transposed()
    if roll:
        m = m @ Matrix.Rotation(roll, 3, 'X')
    o.rotation_euler = m.to_euler()
    return o


def prism(n, r0, r1, z0, z1, jitter=0.0, rnd=None, twist=0.0):
    """Verts/faces for an n-sided frustum (open ends)."""
    rnd = rnd or R
    vs, fs = [], []
    for k, (r, z) in enumerate(((r0, z0), (r1, z1))):
        for i in range(n):
            a = 2 * math.pi * i / n + twist * k
            rr = r * (1 + rnd.uniform(-jitter, jitter))
            vs.append((rr * math.cos(a), rr * math.sin(a), z))
    for i in range(n):
        j = (i + 1) % n
        fs.append((i, j, n + j, n + i))
    return vs, fs


def stack(n, rings, jitter=0.0, rnd=None, cap=True):
    """Lathe an n-gon through (radius, z) rings; returns verts, faces."""
    rnd = rnd or R
    vs, fs = [], []
    for r, z in rings:
        for i in range(n):
            a = 2 * math.pi * i / n + math.pi / n
            rr = r * (1 + rnd.uniform(-jitter, jitter))
            vs.append((rr * math.cos(a), rr * math.sin(a), z))
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            fs.append((k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i))
    if cap:
        fs.append(tuple(reversed(range(n))))
        top = (len(rings) - 1) * n
        fs.append(tuple(range(top, top + n)))
    return vs, fs


def blob_mesh(name, seed, count, spread, r_lo, r_hi, squash=1.0, mats=None,
              subdiv=1):
    """A clump of jittered low-poly icospheres (blossom cluster, shrub)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for _ in range(count):
        while True:
            c = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if c.length <= 1:
                break
        c = Vector((c.x * spread[0], c.y * spread[1], c.z * spread[2]))
        r = rnd.uniform(r_lo, r_hi)
        rot = Matrix.Rotation(rnd.uniform(0, 6.28), 4,
                              Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 1)).normalized())
        sc = Matrix.Diagonal((rnd.uniform(0.8, 1.25), rnd.uniform(0.8, 1.25),
                              squash * rnd.uniform(0.75, 1.1), 1))
        ret = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r,
                                         matrix=Matrix.Translation(c) @ rot @ sc)
        for v in ret['verts']:
            v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1),
                            rnd.uniform(-1, 1))) * r * 0.055
    return bm_to_mesh(name, bm, mats=mats)


def rock_mesh(name, seed, size, mats=None, subdiv=2, moss_cap=False):
    """Angular boulder: a displaced icosphere with a flattened base. With
    moss_cap the upward faces use the second material slot."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
    for v in bm.verts:
        n = noise.noise(v.co * 1.3 + off)
        v.co *= 1 + 0.38 * n + rnd.uniform(-0.07, 0.07)
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if v.co.z < -0.25 * size[2]:
            v.co.z = -0.25 * size[2]
    me = bm_to_mesh(name, bm, mats=mats)
    if moss_cap and mats and len(mats) > 1:
        for p in me.polygons:
            if p.normal.z > 0.62 and p.center.z > 0.15 * size[2]:
                p.material_index = 1
    return me


# ---------------------------------------------------------------------- nodes
def mat_new(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    if b is None:
        nt.nodes.clear()
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(b.outputs[0], out.inputs[0])
    return m, nt, b


def node(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def ramp(nt, stops, interp='LINEAR'):
    n = nt.nodes.new("ShaderNodeValToRGB")
    cr = n.color_ramp
    cr.interpolation = interp
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = (*stops[0][1][:3], 1)
    cr.elements[1].position = stops[-1][0]
    cr.elements[1].color = (*stops[-1][1][:3], 1)
    for p, c in stops[1:-1]:
        e = cr.elements.new(p)
        e.color = (*c[:3], 1)
    return n


def mix_rgb(nt, fac, a, b, blend='MIX'):
    """Colour mix; fac/a/b may be sockets or constants. Returns the output."""
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = 'RGBA'
    n.blend_type = blend
    for idx, val in ((0, fac), (6, a), (7, b)):
        if isinstance(val, bpy.types.NodeSocket):
            nt.links.new(val, n.inputs[idx])
        elif idx == 0:
            n.inputs[0].default_value = val
        else:
            n.inputs[idx].default_value = (*val[:3], 1)
    return n.outputs[2]


def math_node(nt, op, a, b=None, c=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for idx, val in ((0, a), (1, b), (2, c)):
        if val is None:
            continue
        if isinstance(val, bpy.types.NodeSocket):
            nt.links.new(val, n.inputs[idx])
        else:
            n.inputs[idx].default_value = val
    return n.outputs[0]


def noise_tex(nt, vector=None, scale=5.0, detail=2.0, rough=0.5, dims='3D'):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.noise_dimensions = dims
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    if vector is not None:
        nt.links.new(vector, n.inputs["Vector"])
    return n


def link(nt, a, b):
    nt.links.new(a, b)


def set_in(bsdf, **kw):
    names = {"color": "Base Color", "rough": "Roughness", "metal": "Metallic",
             "emit": "Emission Color", "emit_s": "Emission Strength",
             "alpha": "Alpha", "spec": "Specular IOR Level",
             "coat": "Coat Weight", "coat_rough": "Coat Roughness"}
    for k, v in kw.items():
        s = bsdf.inputs[names[k]]
        if isinstance(v, bpy.types.NodeSocket):
            bsdf.id_data.links.new(v, s)
        elif isinstance(v, (tuple, list)):
            s.default_value = (*v[:3], 1)
        else:
            s.default_value = v


# ------------------------------------------------------------------ animation
def fcurves_of(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    from bpy_extras import anim_utils
    cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
    return list(cb.fcurves) if cb else []


def finish_curves(idblock, interp='BEZIER', cyclic=True):
    """Set interpolation on every key and make the curves repeat."""
    for fc in fcurves_of(idblock):
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        fc.update()
        if cyclic and not any(m.type == 'CYCLES' for m in fc.modifiers):
            fc.modifiers.new('CYCLES')


def wave(frame, cycles, phase=0.0):
    """Sine that completes a whole number of cycles over the loop."""
    return math.sin(2 * math.pi * cycles * (frame - 1) / LOOP + phase)
