"""The floating paper letter that carries an email.

One blank, unfolded sheet of washi. It is authored upright: width along X,
height along Z, readable face toward -Y, origin at the centre of the sheet.
That is the pose the seated camera reads it in, and with the FBX settings in
build_models.py it arrives in Unity facing -Z like a Unity quad.

The size matches the game's email card (CardW x CardH in InboxGame.cs), so
the mesh can stand in for that quad: its front UVs are the same upright 0..1
rectangle. Only the outer margins bend; the middle 80% x 70% stays flat for
the text the engine draws.
"""
import math
import random
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

from .common import LOOP, coll, empty, finish_curves, fcurves_of, hx, link, mat_new, mesh_from, new_obj, node, set_in

W, H, T = 0.5, 0.3125, 0.0015          # metres; T is the sheet thickness
SAFE_W, SAFE_H = 0.8, 0.7              # flat share of the width and height
ANCHOR_GAP = 0.004                     # TextAnchor sits this far in front of the face
IVORY = "#f5ead3"

# grid lines as fractions of the half size; the safe area ends at 0.8 / 0.7
# the pair of lines beside each centre line holds the fold to a narrow groove
XS = [-1.0, -0.965, -0.91, -0.8, -0.42, -0.035, 0.0, 0.035, 0.42, 0.8, 0.91, 0.965, 1.0]
ZS = [-1.0, -0.945, -0.87, -0.7, -0.36, -0.055, 0.0, 0.055, 0.36, 0.7, 0.87, 0.945, 1.0]
# worn corners: (sign x, sign z) -> (rounding radius, curl toward the reader), metres
CORNERS = {(-1, 1): (0.036, 0.016), (1, 1): (0.021, 0.004), (-1, -1): (0.019, -0.003), (1, -1): (0.027, -0.009)}


def margin(fx, fz):
    """0 inside the flat text area, rising to 1 at the paper's edge."""
    mx = max(0.0, (abs(fx) - SAFE_W) / (1 - SAFE_W))
    mz = max(0.0, (abs(fz) - SAFE_H) / (1 - SAFE_H))
    return mx, mz


def relief(fx, fz, rnd):
    """How far a point of the sheet stands toward the reader, in metres."""
    mx, mz = margin(fx, fz)
    m = max(mx, mz)
    d = 0.0
    # the cross fold: barely there across the text, deeper as it reaches the edge
    if fx == 0.0:
        d -= 0.0007 + 0.0024 * mz
    if fz == 0.0:
        d -= 0.0007 + 0.0024 * mx
    # handled, slightly wavy margins
    d += m * (0.0024 * math.sin(fx * 5.1 + 1.3) * math.cos(fz * 4.2 + 0.4) + rnd.uniform(-0.0008, 0.0008))
    d += 0.0022 * mx * mx - 0.0012 * mz * mz * (1.0 if fz > 0 else -0.4)
    sx, sz = (1 if fx > 0 else -1), (1 if fz > 0 else -1)
    d += CORNERS[(sx, sz)][1] * (mx * mz) ** 0.8
    return d


def flutter(fx, fz):
    """Extra relief for the Flutter shape key: a slow wave along the margins."""
    mx, mz = margin(fx, fz)
    m = max(mx, mz)
    return m * 0.0065 * math.sin(fx * 2.6 + fz * 1.9 + 0.6) + 0.004 * mx * mz * (1 if fx * fz < 0 else -1)


def washi_image(folder=None, w=1024, h=640, seed=5):
    """Warm ivory paper with very faint fibres. Saved beside the FBX when a
    folder is given, and packed into the .blend either way."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), dtype=np.float32)
    for _ in range(620):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        ang, bend = rng.uniform(0, math.tau), rng.normal(0, 0.012)
        tone = rng.choice((1.0, 1.0, -0.8))
        for _ in range(int(rng.uniform(40, 150))):
            xi, yi = int(x) % w, int(y) % h
            acc[yi, xi] += tone
            ang += bend
            x += math.cos(ang) * 0.6
            y += math.sin(ang) * 0.6
    # soften the strokes with two small box blurs
    for _ in range(2):
        acc = (acc + np.roll(acc, 1, 0) + np.roll(acc, -1, 0) + np.roll(acc, 1, 1) + np.roll(acc, -1, 1)) / 5
    acc = np.clip(acc, -1.5, 1.5) / 1.5
    yy, xx = np.mgrid[0:h, 0:w]
    cloud = 0.5 * np.sin(xx / w * 5.3 + 1.0) * np.cos(yy / h * 4.1 + 0.3) + 0.5 * np.sin(xx / w * 9.7 + yy / h * 7.9)
    base = np.array(hx(IVORY), dtype=np.float32)
    value = 1.0 + 0.035 * acc + 0.008 * cloud
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = base[None, None, :] * value[..., None]
    # fibres lean slightly warm
    px[..., 2] *= 1.0 - 0.012 * np.clip(acc, 0, 1)
    # Blender wants display-referred values for an sRGB image buffer
    srgb = np.where(px[..., :3] <= 0.0031308, px[..., :3] * 12.92, 1.055 * np.power(np.clip(px[..., :3], 0, 1), 1 / 2.4) - 0.055)
    px[..., :3] = srgb
    img = bpy.data.images.new("Letter_Washi", w, h, alpha=False)
    img.pixels.foreach_set(px.ravel())
    if folder:
        Path(folder).mkdir(parents=True, exist_ok=True)
        img.filepath_raw = str(Path(folder) / "Letter_Washi.png")
        img.file_format = 'PNG'
        img.save()
    img.pack()
    return img


def washi_material(folder=None):
    m, nt, b = mat_new("Letter_Washi")
    tex = node(nt, "ShaderNodeTexImage", image=washi_image(folder), interpolation='Linear')
    set_in(b, color=tex.outputs["Color"], rough=0.93, spec=0.18)
    b.inputs["Sheen Weight"].default_value = 0.08
    return m


def letter_mesh(mat):
    rnd = random.Random(19)
    nx, nz = len(XS), len(ZS)
    front, uv = [], []
    fl = []
    for j, fz in enumerate(ZS):
        for i, fx in enumerate(XS):
            x, z = fx * W / 2, fz * H / 2
            edge_x, edge_z = abs(fx) == 1.0, abs(fz) == 1.0
            sx, sz = (1 if fx > 0 else -1), (1 if fz > 0 else -1)
            r = CORNERS[(sx, sz)][0]
            cx, cz = W / 2 - r, H / 2 - r
            if abs(x) > cx and abs(z) > cz:             # worn corner: pull onto the rounding
                dx, dz = abs(x) - cx, abs(z) - cz
                dist = math.hypot(dx, dz)
                if dist > r:
                    x, z = sx * (cx + dx / dist * r), sz * (cz + dz / dist * r)
            elif edge_x:                                # slightly uneven edge
                x += rnd.uniform(-0.0018, 0.0008) * sx
            elif edge_z:
                z += rnd.uniform(-0.0018, 0.0008) * sz
            elif max(margin(fx, fz)) > 0 and abs(fx) < 0.95 and abs(fz) < 0.93:
                x += rnd.uniform(-0.0025, 0.0025)       # margin points wander a little
                z += rnd.uniform(-0.0025, 0.0025)
            front.append(Vector((x, -relief(fx, fz, rnd), z)))
            uv.append(((fx + 1) / 2, (fz + 1) / 2))
            fl.append(flutter(fx, fz))
    n = nx * nz
    verts = front + [v + Vector((0, T, 0)) for v in front]
    faces, face_uv = [], []

    def tri(a, b, c, back=False):
        faces.append((a + n, c + n, b + n) if back else (a, b, c))
        ids = (a, c, b) if back else (a, b, c)
        face_uv.append([((1 - uv[k][0]) if back else uv[k][0], uv[k][1]) for k in ids])

    for j in range(nz - 1):
        for i in range(nx - 1):
            a, b = j * nx + i, j * nx + i + 1
            c, d = a + nx + 1, a + nx
            for back in (False, True):
                if (i + j) % 2 == 0:
                    tri(a, b, c, back)
                    tri(a, c, d, back)
                else:
                    tri(a, b, d, back)
                    tri(b, c, d, back)
    # the edge of the sheet
    ring = ([j * nx for j in range(nz)] + [(nz - 1) * nx + i for i in range(1, nx)]
            + [j * nx + nx - 1 for j in range(nz - 2, -1, -1)] + [i for i in range(nx - 2, 0, -1)])
    for k in range(len(ring)):
        a, b = ring[k], ring[(k + 1) % len(ring)]
        faces.append((b, a, a + n, b + n))
        face_uv.append([uv[b], uv[a], uv[a], uv[b]])
    me = mesh_from("Letter", verts, faces, mats=[mat])
    layer = me.uv_layers.new(name="UVMap")
    for poly, uvs in zip(me.polygons, face_uv):
        for li, t in zip(poly.loop_indices, uvs):
            layer.data[li].uv = t
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])   # closed sheet: every face ends up facing out
    bm.to_mesh(me)
    bm.free()
    return me, fl + fl


def build(c, folder=None, parent=None):
    """Letter mesh with a Flutter shape key and a TextAnchor child."""
    mat = washi_material(folder)
    me, fl = letter_mesh(mat)
    o = new_obj("Letter", me, c, parent=parent)
    o.shape_key_add(name="Basis")
    key = o.shape_key_add(name="Flutter")
    for i, d in enumerate(fl):
        key.data[i].co = me.vertices[i].co + Vector((0, -d, 0))
    anchor = empty("TextAnchor", c, loc=(0, -ANCHOR_GAP, 0), parent=o, size=0.05)
    anchor.empty_display_type = 'ARROWS'
    anchor["Safe_Area_m"] = (W * SAFE_W, H * SAFE_H)
    return o, anchor


# --------------------------------------------------------------- scene test
def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def add_to_scene(folder=None):
    """Put the letter in the courtyard and fly it through one email's journey
    every 12 seconds: in from the sky, a wait in front of the seat while it
    drifts closer, then away past the left shoulder."""
    c = coll("Letter")
    rig = empty("Letter_Flight", c, size=0.1)
    letter, anchor = build(c, folder, parent=rig)

    rest = Vector((0.0, 1.36, 1.49))               # the game holds its card about 1.3 m out
    far = Vector((1.4, 13.5, 4.3))
    past = Vector((-1.0, -0.5, 1.75))
    arrive, read, leave = 34, 204, 224             # frame at which each stage ends
    for f in range(1, LOOP + 2, 2):
        k = (f - 1) % LOOP
        bob = 0.006 * math.sin(math.tau * 3 * k / LOOP) + 0.003 * math.sin(math.tau * 7 * k / LOOP + 1.0)
        sway = math.sin(math.tau * 2 * k / LOOP + 0.5)
        if k < arrive:
            t = 1 - (1 - k / arrive) ** 3
            pos = far.lerp(rest + Vector((0, 0.12, 0)), t)
            pos.z += 0.5 * math.sin(math.pi * t) * (1 - t)
            rot = Euler((0.5 * (1 - t), 0.9 * (1 - t) ** 2, 1.4 * (1 - t) ** 2))
            size = ease(k / 6)
        elif k < read:
            t = (k - arrive) / (read - arrive)
            pos = rest + Vector((0.01 * sway, 0.12 * (1 - t), bob))
            rot = Euler((math.radians(1.6) * math.sin(math.tau * 3 * k / LOOP + 0.7), math.radians(1.2) * sway,
                         math.radians(2.2) * math.sin(math.tau * 2 * k / LOOP)))
            size = 1.0
        elif k < leave:
            t = ((k - read) / (leave - read)) ** 2
            pos = rest.lerp(past, t) + Vector((0, 0, bob * (1 - t)))
            rot = Euler((0.25 * t, -0.9 * t, -0.5 * t))
            size = 1.0
        else:
            pos, rot, size = far.copy(), Euler((0.5, 0.9, 1.4)), 0.0
        rig.location, rig.rotation_euler, rig.scale = pos, rot, (size,) * 3
        for path in ("location", "rotation_euler", "scale"):
            rig.keyframe_insert(path, frame=f)
        key = letter.data.shape_keys.key_blocks["Flutter"]
        key.value = 0.5 + 0.5 * math.sin(math.tau * 4 * k / LOOP) if arrive <= k < leave else 1.0
        key.keyframe_insert("value", frame=f)
    finish_curves(rig, interp='LINEAR', cyclic=True)
    finish_curves(letter.data.shape_keys, interp='LINEAR', cyclic=True)

    # a soft light that only the letter receives, so the page stays readable at dusk
    li = bpy.data.lights.new("Letter_Light", 'AREA')
    li.energy, li.color, li.size = 24.0, hx("#fff1e0"), 0.9
    lo = new_obj("Letter_Light", li, coll("Lighting"), loc=(-0.25, 0.25, 1.95))
    lo.rotation_euler = (rest - lo.location).to_track_quat('-Z', 'Y').to_euler()
    lo.visible_camera = False
    lo.light_linking.receiver_collection = c
    return letter
