"""The katana. Blade along local +Z, cutting edge toward +Y, flats facing +/-X,
origin at the middle of the grip (the same convention as build_models.py), so
the Katana collection can be exported on its own or parented to a controller."""
import math

import bmesh
from mathutils import Matrix, Vector

from .common import bm_to_mesh, box, coll, empty, mesh_from, new_obj, stack

GRIP_HALF = 0.125
GUARD_Z = 0.146
BLADE_Z = 0.150
BLADE_LEN = 0.72
BEND = 0.30               # radians of arc over the blade; stylised sori


def blade_axis(s):
    """Centre point and edge-ward axis of the blade at arc length s."""
    R = BLADE_LEN / BEND
    phi = BEND * s / BLADE_LEN
    c = Vector((0, -R * (1 - math.cos(phi)), BLADE_Z + R * math.sin(phi)))
    return c, Vector((0, math.cos(phi), math.sin(phi)))


def blade_mesh(M):
    L = BLADE_LEN
    tip0 = L - 0.06
    stations = [L * i / 18 for i in range(18) if L * i / 18 < tip0] + [tip0]
    stations += [tip0 + 0.06 * k for k in (0.35, 0.65, 0.88)]
    rows = []
    for s in stations:
        c, A = blade_axis(s)
        f = s / L
        w = 0.043 - 0.012 * f
        tm, ts = 0.0066 * (1 - 0.3 * f), 0.0084 * (1 - 0.3 * f)
        ye = w / 2
        if s > tip0:
            k = (s - tip0) / 0.06
            ye = -w / 2 + w * math.sqrt(max(0.0, 1 - k * k))
            tm *= 1 - 0.5 * k
            ts *= 1 - 0.6 * k
        yr = min(-w / 2 + 0.62 * w, ye - 0.3 * (ye + w / 2))
        prof = [(0, -w / 2 - 0.0012), (tm / 2, -w / 2 + 0.0015), (ts / 2, yr), (0, ye),
                (-ts / 2, yr), (-tm / 2, -w / 2 + 0.0015)]
        rows.append([c + Vector((px, 0, 0)) + A * py for px, py in prof])
    tip, _ = blade_axis(L)
    tip += Vector((0, -0.012, 0))
    # every strip owns its vertices, so smooth shading runs along the blade
    # while the ridge lines between strips stay crisp
    vs, fs, fm = [], [], []
    for k in range(6):
        j = (k + 1) % 6
        base = len(vs)
        for row in rows:
            vs += [row[k], row[j]]
        vs.append(tip)
        for i in range(len(rows) - 1):
            fs.append((base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2))
            fm.append(1 if k in (2, 3) else 0)
        n = len(rows) - 1
        fs.append((base + 2 * n, base + 2 * n + 1, base + 2 * n + 2))
        fm.append(1 if k in (2, 3) else 0)
    b = len(vs)
    vs += rows[0]
    fs.append(tuple(range(b, b + 6)))
    fm.append(0)
    me = mesh_from("Katana_Blade", vs, fs, smooth=True,
                   mats=[M["Blade_Steel"], M["Blade_Bevel"]], face_mats=fm)
    return me


def stadium(rx, ry, fy, k=1.0):
    return [(rx * k, -fy * k), (rx * k, fy * k), (rx * 0.5 * k, ry * k), (-rx * 0.5 * k, ry * k),
            (-rx * k, fy * k), (-rx * k, -fy * k), (-rx * 0.5 * k, -ry * k), (rx * 0.5 * k, -ry * k)]


def sleeve(name, rings, mat, rx=0.016, ry=0.0235, fy=0.0125):
    """Grip-shaped sleeve through (z, scale) rings."""
    vs, fs = [], []
    n = 8
    for z, k in rings:
        vs += [(x, y, z) for x, y in stadium(rx, ry, fy, k)]
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            fs.append((r * n + i, r * n + j, (r + 1) * n + j, (r + 1) * n + i))
    fs.append(tuple(reversed(range(n))))
    top = (len(rings) - 1) * n
    fs.append(tuple(range(top, top + n)))
    return mesh_from(name, vs, fs, mats=[mat])


def build(M):
    c = coll("Katana")
    root = empty("Katana", c, size=0.1)

    def add(name, me):
        return new_obj(name, me, c, parent=root)

    add("Katana_Blade", blade_mesh(M))
    # collar, guard, ferrule, pommel
    hc, hA = blade_axis(0.014)
    vs = []
    for z, kx, ky in ((BLADE_Z - 0.002, 1.0, 1.0), (BLADE_Z + 0.026, 0.86, 0.95)):
        for x, y in ((0.0062, -0.0232), (0.007, 0.007), (0.0018, 0.0232), (-0.0018, 0.0232),
                     (-0.007, 0.007), (-0.0062, -0.0232)):
            vs.append((x * kx, y * ky - (0.0004 if z > BLADE_Z else 0), z))
    fs = [(i, (i + 1) % 6, 6 + (i + 1) % 6, 6 + i) for i in range(6)] + [tuple(range(6, 12)), tuple(reversed(range(6)))]
    add("Katana_Collar", mesh_from("Katana_Collar", vs, fs, mats=[M["Brass_Collar"]]))
    gv, gf = stack(16, [(0.039, -0.0055), (0.0465, -0.0034), (0.0465, 0.0034), (0.039, 0.0055)])
    guard = add("Katana_Guard", mesh_from("Katana_Guard", gv, gf, mats=[M["Iron_Guard"]]))
    guard.location.z = GUARD_Z
    guard.scale = (0.94, 1.06, 1.0)
    add("Katana_Ferrule", sleeve("Katana_Ferrule", [(GRIP_HALF, 1.09), (GUARD_Z - 0.004, 1.09)], M["Iron_Guard"]))
    add("Katana_Pommel", sleeve("Katana_Pommel", [(-GRIP_HALF - 0.02, 0.82), (-GRIP_HALF - 0.012, 1.1),
                                                 (-GRIP_HALF, 1.1)], M["Iron_Guard"]))
    add("Katana_Grip", sleeve("Katana_Grip", [(-GRIP_HALF, 1.0), (-0.02, 0.95), (GRIP_HALF, 1.0)], M["Grip_Wrap"]))
    # rust-red binding below the guard
    rings = []
    z = 0.072
    while z < GRIP_HALF - 0.001:
        rings += [(z, 1.05), (z + 0.006, 1.11), (z + 0.012, 1.05)]
        z += 0.0125
    add("Katana_Wrap_Accent", sleeve("Katana_Wrap_Accent", rings, M["Grip_Red"]))
    # cream diamonds showing through the wrap, and the crossing braid over them
    rx = 0.016
    dia_v, dia_f, bm = [], [], bmesh.new()
    zs = [-0.103 + i * 0.028 for i in range(7)]
    for sx in (-1, 1):
        for zc in zs:
            k = 0.95 + 0.05 * abs(zc + 0.02) / 0.1
            x = sx * (rx * k + 0.0005)
            b = len(dia_v)
            dia_v += [(x, 0, zc - 0.0105), (x, 0.009, zc), (x, 0, zc + 0.0105), (x, -0.009, zc)]
            dia_f.append((b, b + 1, b + 2, b + 3) if sx > 0 else (b, b + 3, b + 2, b + 1))
        for zc in zs[:-1]:
            for tilt in (-1, 1):
                ang = tilt * math.atan2(0.028, 0.025)
                m = (Matrix.Translation((sx * (rx * 0.97 + 0.0006), 0, zc + 0.014))
                     @ Matrix.Rotation(ang, 4, 'X') @ Matrix.Diagonal((0.0024, 0.031, 0.0075, 1)))
                bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    add("Katana_Grip_Diamonds", mesh_from("Katana_Grip_Diamonds", dia_v, dia_f, mats=[M["Grip_Cream"]]))
    add("Katana_Grip_Braid", bm_to_mesh("Katana_Grip_Braid", bm, mats=[M["Grip_Wrap"]]))
    return root


def pose(root, guard_pos, tip_pos, eye, roll_deg=0.0):
    """Stand the sword so its guard and tip land on two world points, with a
    flat turned toward the eye and the edge to screen left."""
    tip_local = blade_axis(BLADE_LEN)[0]
    guard_local = Vector((0, 0, GUARD_Z))
    chord = (tip_local - guard_local)
    want = Vector(tip_pos) - Vector(guard_pos)
    z = want.normalized()
    view = (Vector(guard_pos) - Vector(eye)).normalized()
    y = view.cross(z).normalized()
    if y.x > 0:
        y = -y
    x = y.cross(z).normalized()
    base = Matrix((x, y, z)).transposed()
    # tilt so the blade chord, not the grip axis, runs guard -> tip
    tilt = math.atan2(-chord.y, chord.z)
    rot = base @ Matrix.Rotation(math.radians(roll_deg), 3, 'Z') @ Matrix.Rotation(-tilt, 3, 'X')
    root.rotation_euler = rot.to_euler()
    root.location = Vector(guard_pos) - rot @ guard_local
    return rot
