"""Veranda, machiya facade, gate, courtyard walls and the instanced roof tiles."""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

from .common import (DECK_Z, bm_to_mesh, box, box_mesh, coll, empty, mesh_from,
                     new_obj, rock_mesh, span)

GATE = Vector((2.33, 16.5, 0.0))
WALL_X = -6.2
FACADE_X = 3.8
BAY = 1.8
FACADE_Y0 = 4.6
N_BAYS = 4

RT = random.Random(5)
TILE_W, TILE_EXP, TILE_L = 0.30, 0.34, 0.43


# ----------------------------------------------------------------- roof tiles
def tile_mesh(name, mat, h=0.07, cap=False, chip=False):
    """Pan-and-rib tile lying in XY, rib along Y, exposed end at +Y."""
    w, L, t = TILE_W, TILE_L, 0.028
    prof = [(-0.5, 0.0), (-0.3, 0.06), (-0.19, 0.62), (0.0, 1.0),
            (0.19, 0.62), (0.3, 0.06), (0.5, 0.0)]
    vs, fs = [], []
    n = len(prof)
    for y, k in ((0.0, 0.86), (L, 1.0)):
        for px, pz in prof:
            vs.append((px * w * (0.97 if y == 0 else 1.0), y, pz * h * k))
    for y in (0.0, L):
        vs.append((-0.5 * w, y, -t))
        vs.append((0.5 * w, y, -t))
    b0, b1 = 2 * n, 2 * n + 2
    for i in range(n - 1):
        fs.append((i, n + i, n + i + 1, i + 1))
    fs.append(tuple(range(n, 2 * n)) + (b1 + 1, b1))            # front
    fs.append(tuple(reversed(range(0, n))) + (b0, b0 + 1))      # back
    fs.append((0, b0, b1, n))
    fs.append((n - 1, 2 * n - 1, b1 + 1, b0 + 1))
    fs.append((b0, b0 + 1, b1 + 1, b1))
    if chip:
        vs[n] = (vs[n][0] + 0.02, vs[n][1] - 0.03, vs[n][2])
    me = mesh_from(name, vs, fs, mats=[mat])
    if cap:
        bm = bmesh.new()
        bm.from_mesh(me)
        m = Matrix.Translation((0, L + 0.012, h * 0.42)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=h * 0.78,
                              radius2=h * 0.78, depth=0.035, matrix=m)
        bm.to_mesh(me)
        bm.free()
    return me


def ridge_mesh(name, mat):
    """Half-round ridge tile running along X."""
    vs, fs = [], []
    r, L, seg = 0.085, 0.40, 5
    for x, k in ((-L / 2, 1.0), (L / 2 - 0.03, 1.0), (L / 2 - 0.03, 1.14), (L / 2, 1.14)):
        for i in range(seg + 1):
            a = math.pi * i / seg
            vs.append((x, math.cos(a) * r * k, math.sin(a) * r * k))
    n = seg + 1
    for s in range(3):
        for i in range(seg):
            fs.append((s * n + i, (s + 1) * n + i, (s + 1) * n + i + 1, s * n + i + 1))
    fs.append(tuple(range(n)))
    fs.append(tuple(reversed(range(3 * n, 4 * n))))
    return mesh_from(name, vs, fs, mats=[mat])


class Tiles:
    def __init__(self, parent_coll, M):
        self.c = coll("Roof_Tiles", parent_coll)
        src = coll("Roof_Tile_Variants", parent_coll)
        mat = M["Roof_Tile"]
        self.var = [tile_mesh("Tile_A", mat), tile_mesh("Tile_B", mat, h=0.08),
                    tile_mesh("Tile_C", mat, h=0.064, chip=True)]
        self.eave = tile_mesh("Tile_Eave", mat, cap=True)
        self.ridge = ridge_mesh("Tile_Ridge", mat)
        # editable originals, parked off to the side and kept out of renders
        for i, me in enumerate(self.var + [self.eave, self.ridge]):
            o = new_obj(me.name + "_Source", me, src, loc=(-12 + i * 0.5, -6, 0))
            o.hide_render = True

    def field(self, name, parent, origin, xdir, sdir, cols, rows, w=TILE_W,
              exposed=TILE_EXP, eave=True, c=None):
        """Rows of instanced tiles. origin is the middle of the top row; xdir
        runs along the eave and sdir points down the slope (parent space)."""
        X, Y = Vector(xdir).normalized(), Vector(sdir).normalized()
        if X.cross(Y).z < 0:
            X = -X
        Z = X.cross(Y)
        base = Matrix((X, Y, Z)).transposed().to_4x4()
        c = c or self.c
        root = empty(name, c, parent=parent, size=0.2)
        for r in range(rows):
            for cidx in range(cols):
                last = eave and r == rows - 1
                me = self.eave if last else RT.choices(self.var, weights=(6, 3, 1.4))[0]
                pos = (Vector(origin) + X * ((cidx - (cols - 1) / 2) * w)
                       + Y * (r * exposed) + Z * 0.012)
                m = (Matrix.Translation(pos) @ base
                     @ Matrix.Rotation(math.radians(3.5 + RT.uniform(-1.2, 1.2)), 4, 'X')
                     @ Matrix.Rotation(math.radians(RT.uniform(-1.6, 1.6)), 4, 'Z')
                     @ Matrix.Diagonal((w / TILE_W, exposed / TILE_EXP, 1, 1)))
                o = new_obj(f"{name}_{r:02d}_{cidx:02d}", me, c, parent=root)
                o.matrix_local = m
        return root

    def ridge_row(self, name, parent, a, b):
        a, b = Vector(a), Vector(b)
        d = b - a
        n = max(1, round(d.length / 0.37))
        X = d.normalized()
        Yv = Vector((0, 0, 1)).cross(X).normalized()
        base = Matrix((X, Yv, X.cross(Yv))).transposed().to_4x4()
        root = empty(name, self.c, parent=parent, size=0.2)
        for i in range(n):
            o = new_obj(f"{name}_{i:02d}", self.ridge, self.c, parent=root)
            o.matrix_local = (Matrix.Translation(a + d * ((i + 0.5) / n)) @ base
                              @ Matrix.Rotation(math.radians(RT.uniform(-2, 2)), 4, 'X'))
        return root


# --------------------------------------------------------------------- pieces
def bars_mesh(name, bars, mat):
    """One mesh from a list of (centre, size) boxes: a lattice section."""
    bm = bmesh.new()
    for c, s in bars:
        bmesh.ops.create_cube(bm, size=1.0,
                              matrix=Matrix.Translation(c) @ Matrix.Diagonal((*s, 1)))
    return bm_to_mesh(name, bm, mats=[mat])


def veranda(A, M, tiles):
    c = coll("Veranda", A)
    T, D = M["Timber_Dark"], M["Timber_Deck"]
    x0, x1, y0, y1 = -5.0, 3.62, -2.2, 4.22
    pitch = 0.265
    n = int((x1 - x0) / pitch)
    for i in range(n):
        x = x0 + (i + 0.5) * pitch
        o = box(f"Deck_Board_{i:02d}", (pitch - 0.006, y1 - y0, 0.045),
                (x, (y0 + y1) / 2, DECK_Z - 0.0225 + RT.uniform(-0.003, 0.002)), c, D, bevel=0.005)
        o.rotation_euler.y = math.radians(RT.uniform(-0.25, 0.25))
    seg = (x1 - x0) / 3
    for i in range(3):
        box(f"Deck_Edge_{i}", (seg - 0.006, 0.3, 0.055),
            (x0 + (i + 0.5) * seg, y1 + 0.155, DECK_Z - 0.026), c, D, bevel=0.007)
    box("Deck_Fascia", (x1 - x0, 0.06, 0.2), ((x0 + x1) / 2, y1 + 0.26, DECK_Z - 0.16), c, T, bevel=0.006)
    foot = rock_mesh("Deck_Foot_Stone", 3, (0.2, 0.2, 0.1), mats=[M["Stone_Dry"]], subdiv=1)
    for i in range(6):
        x = x0 + 0.3 + i * (x1 - x0 - 0.6) / 5
        box(f"Deck_Stump_{i}", (0.12, 0.12, 0.2), (x, y1 + 0.12, 0.17), c, T, bevel=0.006)
        new_obj(f"Deck_Foot_{i}", foot, c, loc=(x, y1 + 0.12, 0.03), rot=(0, 0, i * 1.3))
    # posts and the beam that frames the top of the view
    for i, x in enumerate((-5.0, -2.65, 3.5)):
        box(f"Veranda_Post_{i}", (0.15, 0.15, 2.7), (x, 4.3, DECK_Z + 1.35), c, T, bevel=0.012)
    # everything overhead lives in Veranda_Roof, so one click lifts the lid off
    roof = coll("Veranda_Roof", c)
    span("Veranda_Beam", (-5.2, 4.3, 3.21), (3.75, 4.3, 3.21), 0.17, 0.24, roof, T, bevel=0.012)
    # door-head lintel close to the eye: the dark band along the top of the view
    span("Veranda_Lintel", (-5.1, 2.0, 2.275), (3.7, 2.0, 2.275), 0.12, 0.15, roof, T, bevel=0.01)
    box("Veranda_Transom", (8.8, 0.04, 1.6), (-0.7, 2.0, 3.15), roof, T)
    slope = 0.39
    rh = 0.13

    def zr(y):
        return 3.33 + rh / 2 - (y - 4.3) * slope

    k = 0
    x = -4.9
    while x <= 3.62:
        span(f"Veranda_Rafter_{k:02d}", (x, -2.3, zr(-2.3)), (x, 5.15, zr(5.15)), 0.16, rh, roof, T, bevel=0.01)
        x += 0.7
        k += 1
    span("Veranda_Roof_Boards", (-0.7, -2.4, zr(-2.4) + rh / 2 + 0.03), (-0.7, 5.25, zr(5.25) + rh / 2 + 0.03),
         8.95, 0.05, roof, T)
    sd = Vector((0, 1, -slope)).normalized()
    tiles.field("Veranda_Eave_Tiles", None, Vector((-0.7, 5.25, zr(5.25) + rh / 2 + 0.07)) - sd * (3 * TILE_EXP + TILE_L - 0.06),
                (1, 0, 0), sd, 29, 4, c=roof)
    # the room behind the viewer: dark walls that keep the sky light out
    box("Room_Back_Wall", (9.0, 0.1, 6.0), (-0.7, -2.35, DECK_Z + 3.0), roof, M["Plaster"])
    box("Room_Left_Wall", (0.1, 6.6, 6.0), (-5.12, 0.95, DECK_Z + 3.0), roof, M["Plaster"])
    box("Room_Right_Wall", (0.1, 6.6, 6.0), (3.72, 0.95, DECK_Z + 3.0), roof, M["Plaster"])


def machiya(A, M, tiles):
    c = coll("Machiya", A)
    T, F = M["Timber_Dark"], M["Timber_Facade"]
    y0, y1 = FACADE_Y0, FACADE_Y0 + N_BAYS * BAY
    xf = FACADE_X
    # cut-stone kerb
    nb = 12
    L = (y1 - y0 + 0.3) / nb
    for i in range(nb):
        box(f"Kerb_Stone_{i:02d}", (0.5 + RT.uniform(-0.02, 0.02), L - 0.012, 0.3 + RT.uniform(-0.012, 0.012)),
            (xf - 0.26, y0 - 0.1 + (i + 0.5) * L, 0.15), c, M["Stone_Dry"], bevel=0.022)
    span("Facade_Sill", (xf + 0.07, y0, 0.36), (xf + 0.07, y1, 0.36), 0.13, 0.12, c, T, bevel=0.008)
    span("Facade_Mid_Rail", (xf + 0.06, y0, 1.08), (xf + 0.06, y1, 1.08), 0.09, 0.08, c, T, bevel=0.006)
    span("Facade_Top_Rail", (xf + 0.06, y0, 2.56), (xf + 0.06, y1, 2.56), 0.11, 0.12, c, T, bevel=0.008)
    # both run up into the roof boards so no sky shows between wall and eave
    box("Facade_Upper_Wall", (0.06, y1 - y0, 0.76), (xf + 0.1, (y0 + y1) / 2, 3.0), c, F)
    box("Facade_Core", (0.25, y1 - y0, 3.12), (xf + 0.32, (y0 + y1) / 2, 1.86), c, F)
    for i in range(N_BAYS + 1):
        box(f"Facade_Post_{i}", (0.14, 0.14, 2.74), (xf + 0.07, y0 + i * BAY, 1.67), c, T, bevel=0.012)
    # one lattice section mesh, instanced per bay
    w, zlo, zhi = BAY - 0.14, 1.12, 2.5
    bars = []
    nv, nh = 8, 4
    for i in range(nv + 1):
        bars.append(((0, -w / 2 + i * w / nv, (zlo + zhi) / 2), (0.032, 0.034 if 0 < i < nv else 0.05, zhi - zlo)))
    for j in range(nh + 1):
        bars.append(((0.004, 0, zlo + j * (zhi - zlo) / nh), (0.026, w, 0.03 if 0 < j < nh else 0.05)))
    lattice = bars_mesh("Lattice_Section", bars, T)
    lit = (True, True, False, False)
    for i in range(N_BAYS):
        yc = y0 + (i + 0.5) * BAY
        new_obj(f"Lattice_{i}", lattice, c, loc=(xf + 0.045, yc, 0))
        box(f"Window_Insert_{i}", (0.012, w, zhi - zlo), (xf + 0.085, yc, (zlo + zhi) / 2), c,
            M["Paper_Lit"] if lit[i] else M["Paper_Dim"])
        nbrd = 8
        for k in range(nbrd):
            box(f"Facade_Board_{i}_{k}", (0.022, w / nbrd - 0.006, 0.6),
                (xf + 0.07, yc - w / 2 + (k + 0.5) * w / nbrd, 0.73), c, F, bevel=0.004)
    # roof: eave over the courtyard, ridge behind the facade
    ex, ez, rx = 3.1, 2.98, 6.9
    ang = math.radians(27)
    rz = ez + (rx - ex) * math.tan(ang)
    yc, ylen = (y0 + y1) / 2 - 0.05, y1 - y0 + 0.9
    span("Machiya_Roof_Boards", (rx, yc, rz), (ex, yc, ez), ylen, 0.05, c, T)
    span("Machiya_Roof_Back", (rx, yc, rz), (rx + 3.6, yc, rz - 3.6 * math.tan(ang)), ylen, 0.05, c, M["Gutter_Metal"])
    k = 0
    y = y0 - 0.3
    while y <= y1 + 0.3:
        span(f"Machiya_Rafter_{k:02d}", (rx, y, rz - 0.07), (ex - 0.02, y, ez - 0.07), 0.07, 0.09, c, T, bevel=0.006)
        y += 0.45
        k += 1
    span("Machiya_Eave_Fascia", (ex - 0.03, yc - ylen / 2, ez - 0.05), (ex - 0.03, yc + ylen / 2, ez - 0.05),
         0.03, 0.12, c, T, bevel=0.004)
    sd = Vector((ex - rx, 0, ez - rz)).normalized()
    slope_len = (Vector((ex, 0, ez)) - Vector((rx, 0, rz))).length
    rows = int(slope_len / TILE_EXP)
    cols = int(ylen / 0.36)
    tiles.field("Machiya_Tiles", None, Vector((rx, yc, rz + 0.03)) + sd * (slope_len - (rows - 1) * TILE_EXP - 0.37),
                (0, 1, 0), sd, cols, rows, w=ylen / cols)
    tiles.ridge_row("Machiya_Ridge", None, (rx, yc - ylen / 2, rz + 0.08), (rx, yc + ylen / 2, rz + 0.08))
    # gutter and the downpipe on the far corner
    G = M["Gutter_Metal"]
    span("Gutter", (ex - 0.1, yc - ylen / 2, ez - 0.1), (ex - 0.1, yc + ylen / 2, ez - 0.1), 0.1, 0.08, c, G, bevel=0.02)
    py = y1 + 0.16
    span("Downpipe_Elbow", (ex - 0.1, py, ez - 0.14), (xf - 0.05, py, 2.6), 0.07, 0.07, c, G, bevel=0.018)
    span("Downpipe", (xf - 0.05, py, 2.62), (xf - 0.05, py, 0.3), 0.075, 0.075, c, G, bevel=0.02)
    for z in (0.8, 1.9):
        box(f"Downpipe_Bracket_{z}", (0.11, 0.11, 0.03), (xf - 0.05, py, z), c, G)
    # far end wall and gable so the wing holds up from the courtyard side
    box("Machiya_End_Wall", (6.4, 0.2, 2.7), (xf + 3.3, y1 + 0.02, 1.65), c, M["Plaster"])
    for i in range(4):
        box(f"Machiya_End_Post_{i}", (0.13, 0.24, 2.7), (xf + 0.07 + i * 2.05, y1 + 0.02, 1.65), c, T, bevel=0.01)
    gz = 3.0
    for tag, yy in (("N", y1 + 0.02), ("S", y0 - 0.3)):
        t = math.tan(ang)
        vs = [(xf + 0.1, yy, gz), (rx + 3.6, yy, gz), (rx + 3.6, yy, rz - 3.6 * t - 0.03), (rx, yy, rz - 0.03),
              (xf + 0.1, yy, ez + (xf + 0.1 - ex) * t - 0.03)]
        new_obj(f"Machiya_Gable_{tag}", mesh_from(f"Machiya_Gable_{tag}", vs, [(0, 1, 2, 3, 4)], mats=[M["Plaster"]]), c)
    box("Machiya_South_Wall", (6.4, 0.2, 2.7), (xf + 3.3, y0 - 0.3, 1.65), c, M["Plaster"])
    box("Machiya_Back_Wall", (0.2, y1 - y0 + 0.3, 2.7), (xf + 6.4, (y0 + y1) / 2 - 0.15, 1.65), c, M["Plaster"])


def gate(A, M, tiles):
    c = coll("Gate", A)
    T = M["Timber_Dark"]
    root = empty("Gate", c, loc=GATE)
    hw = 1.42

    def b(name, size, loc, bevel=0.01):
        return box(name, size, loc, c, T, bevel=bevel, parent=root)

    for s, tag in ((-1, "L"), (1, "R")):
        b(f"Gate_Post_{tag}", (0.22, 0.22, 2.75), (s * hw, 0, 1.375), 0.016)
        b(f"Gate_Brace_Post_{tag}", (0.14, 0.14, 2.3), (s * hw, 1.0, 1.15), 0.01)
        o = span(f"Gate_Brace_{tag}", (s * hw, 0.05, 2.25), (s * hw, 1.0, 2.25), 0.1, 0.12, c, T, bevel=0.008)
        o.parent = root
    b("Gate_Lintel", (3.5, 0.2, 0.22), (0, 0, 2.6), 0.014)
    b("Gate_Tie_Beam", (3.7, 0.16, 0.14), (0, 0, 2.86), 0.01)
    b("Gate_Threshold", (2.62, 0.22, 0.1), (0, 0, 0.05), 0.012)
    # doors: a frame and a slat screen per leaf
    lw, zlo, zhi = 1.29, 0.12, 2.46
    frame, slats = [], []
    for x in (-lw / 2 + 0.045, lw / 2 - 0.045):
        frame.append(((x, 0, (zlo + zhi) / 2), (0.09, 0.07, zhi - zlo)))
    split = 1.5
    for z in (zlo + 0.05, split, zhi - 0.05):
        frame.append(((0, 0, z), (lw - 0.18, 0.06, 0.1)))
    nb = 6
    for i in range(nb):
        x = -lw / 2 + 0.09 + (i + 0.5) * (lw - 0.18) / nb
        frame.append(((x, 0, (zlo + split) / 2), ((lw - 0.18) / nb - 0.008, 0.035, split - zlo - 0.1)))
    ns = 11
    for i in range(ns):
        x = -lw / 2 + 0.09 + (i + 0.5) * (lw - 0.18) / ns
        slats.append(((x, 0, (split + zhi) / 2), (0.05, 0.03, zhi - split - 0.1)))
    slats.append(((0, 0, (split + zhi) / 2), (lw - 0.18, 0.024, 0.04)))
    fm = bars_mesh("Gate_Door_Frame", frame, T)
    sm = bars_mesh("Gate_Door_Slats", slats, T)
    for s, tag in ((-1, "L"), (1, "R")):
        new_obj(f"Gate_Door_{tag}", fm, c, loc=(s * (lw / 2 + 0.01), 0, 0), parent=root)
        new_obj(f"Gate_Slats_{tag}", sm, c, loc=(s * (lw / 2 + 0.01), 0, 0), parent=root)
    # roof
    ridge_z, eave_z, run, half_w = 3.62, 2.86, 1.32, 1.98
    for s, tag in ((-1, "Front"), (1, "Back")):
        o = span(f"Gate_Roof_Boards_{tag}", (0, 0, ridge_z), (0, s * run, eave_z), half_w * 2, 0.05, c, T)
        o.parent = root
        for i in range(8):
            x = -half_w + 0.12 + i * (2 * half_w - 0.24) / 7
            r = span(f"Gate_Rafter_{tag}_{i}", (x, 0, ridge_z - 0.07), (x, s * (run + 0.02), eave_z - 0.07),
                     0.07, 0.09, c, T, bevel=0.006)
            r.parent = root
        sd = Vector((0, s * run, eave_z - ridge_z)).normalized()
        sl = math.hypot(run, ridge_z - eave_z)
        rows = 4
        tiles.field(f"Gate_Tiles_{tag}", root, Vector((0, 0, ridge_z + 0.03)) + sd * (sl - (rows - 1) * TILE_EXP - 0.37),
                    (1, 0, 0), sd, 13, rows, w=2 * half_w / 13)
    tiles.ridge_row("Gate_Ridge", root, (-half_w, 0, ridge_z + 0.1), (half_w, 0, ridge_z + 0.1))
    b("Gate_Ridge_Beam", (2 * half_w, 0.12, 0.14), (0, 0, ridge_z - 0.1), 0.008)
    for s, tag in ((-1, "L"), (1, "R")):
        vs = [(s * (half_w - 0.06), -run * 0.82, eave_z + 0.1), (s * (half_w - 0.06), run * 0.82, eave_z + 0.1),
              (s * (half_w - 0.06), 0, ridge_z - 0.06)]
        new_obj(f"Gate_Gable_{tag}", mesh_from(f"Gate_Gable_{tag}", vs, [(0, 1, 2)], mats=[T]), c, parent=root)
        b(f"Gate_Purlin_{tag}", (0.12, 2 * run * 0.8, 0.12), (s * hw, 0, 2.99), 0.008)


def wall(name, p0, p1, c, M, tiles):
    """Plaster courtyard wall with a stone base, posts and a tiled cap."""
    p0, p1 = Vector((*p0, 0)), Vector((*p1, 0))
    d = p1 - p0
    L = d.length
    root = empty(name, c, loc=p0)
    root.rotation_euler.z = math.atan2(d.y, d.x)
    T = M["Timber_Dark"]
    n = max(1, round(L / 0.95))
    for i in range(n):
        box(f"{name}_Base_{i:02d}", (L / n - 0.012, 0.36 + RT.uniform(-0.015, 0.015), 0.42),
            ((i + 0.5) * L / n, 0, 0.21), c, M["Stone_Base"], bevel=0.022, parent=root)
    m = max(1, round(L / 1.8))
    for i in range(m):
        box(f"{name}_Panel_{i:02d}", (L / m, 0.2, 1.6), ((i + 0.5) * L / m, 0, 1.22), c, M["Plaster"], parent=root)
    for i in range(m + 1):
        box(f"{name}_Post_{i:02d}", (0.11, 0.25, 1.6), (i * L / m, 0, 1.22), c, T, bevel=0.008, parent=root)
    box(f"{name}_Plate", (L + 0.1, 0.3, 0.1), (L / 2, 0, 2.07), c, T, bevel=0.008, parent=root)
    ang = math.radians(24)
    run, ridge_z = 0.42, 2.34
    for s, tag in ((-1, "A"), (1, "B")):
        o = span(f"{name}_Cap_{tag}", (0, 0, ridge_z), (0, s * run, ridge_z - run * math.tan(ang)),
                 L + 0.2, 0.04, c, T, parent=root)
        o.location.x = L / 2
        sd = Vector((0, s * run, -run * math.tan(ang))).normalized()
        cols = max(1, int((L + 0.2) / 0.36))
        tiles.field(f"{name}_Tiles_{tag}", root, Vector((L / 2, 0, ridge_z + 0.03)) + sd * 0.04,
                    (1, 0, 0), sd, cols, 1, w=(L + 0.2) / cols, exposed=0.36)
    tiles.ridge_row(f"{name}_Ridge", root, (-0.1, 0, ridge_z + 0.07), (L + 0.1, 0, ridge_z + 0.07))


def build(M):
    A = coll("Architecture")
    tiles = Tiles(A, M)
    veranda(A, M, tiles)
    machiya(A, M, tiles)
    gate(A, M, tiles)
    W = coll("Walls", A)
    wall("Wall_Back_L", (WALL_X - 0.1, GATE.y), (GATE.x - 1.55, GATE.y), W, M, tiles)
    wall("Wall_Back_R", (GATE.x + 1.55, GATE.y), (10.2, GATE.y), W, M, tiles)
    wall("Wall_Left", (WALL_X, 4.5), (WALL_X, GATE.y + 0.1), W, M, tiles)
    return A
