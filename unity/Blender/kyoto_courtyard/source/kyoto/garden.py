"""Ground, puddles, stepping stones, moss, boulders, plants and the lantern."""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

from .architecture import bars_mesh
from .common import (blob_mesh, bm_to_mesh, box, coll, empty, mesh_from, new_obj,
                     rock_mesh, span, stack)

LANTERN = Vector((-2.9, 8.5, 0.0))
LANTERN_SCALE = 1.15

def lantern_z(z):
    """Short, broad pedestal; preserve the chamber and roof proportions."""
    if z <= 0.37:
        return z * 0.76
    if z < 0.87:
        return 0.2812 + (z - 0.37) * 0.3976
    return z - 0.39

# (x, y, sigma, height)
MOUNDS = [(-4.4, 10.5, 1.7, 0.55), (-3.5, 6.9, 1.25, 0.2), (-2.4, 14.8, 1.7, 0.28),
          (3.0, 10.2, 0.9, 0.12), (-5.4, 7.6, 1.0, 0.2)]
# (x, y, radius, ripple)
PUDDLES = [(1.65, 8.4, 1.05, True), (1.8, 6.3, 0.8, False), (-1.25, 9.0, 0.72, False),
           (2.0, 12.1, 1.0, True), (0.6, 14.5, 0.72, False), (-1.2, 6.8, 0.55, False)]
# (x, y, radius)
# (x, y, half width): broad slabs laid as a walking path from the veranda to the gate
STONES = [(-0.3, 5.9, 1.05), (0.35, 7.35, 0.96), (0.2, 8.8, 1.0), (0.75, 10.2, 0.92),
          (0.6, 11.6, 0.92), (1.15, 12.95, 0.86), (1.5, 14.2, 0.82), (2.05, 15.4, 0.8)]
STONE_DEPTH = 0.48          # front-to-back, as a share of the width

MOSS_BEDS = [(-4.4, 10.4, 2.5, 0.07), (-3.4, 7.2, 1.5, 0.05), (-2.9, 9.6, 1.1, 0.04), (2.75, 10.5, 1.1, 0.05),
               (2.9, 13.6, 0.9, 0.04), (0.3, 15.7, 0.8, 0.04), (-1.3, 14.4, 1.3, 0.05), (-2.6, 12.3, 1.0, 0.04),
               (-5.3, 7.9, 1.2, 0.05), (-1.1, 11.6, 0.55, 0.03), (1.6, 10.6, 0.5, 0.03), (-4.6, 14.9, 1.4, 0.05),
               (1.3, 16.0, 0.4, 0.03), (3.0, 6.9, 0.45, 0.03), (-1.4, 5.6, 0.6, 0.03)]

RG = random.Random(23)


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def gh_dry(x, y):
    h = 0.028 * noise.noise((x * 0.33, y * 0.33, 0.0)) + 0.01 * noise.noise((x * 1.2, y * 1.2, 4.0))
    for mx, my, s, a in MOUNDS:
        h += a * math.exp(-((x - mx) ** 2 + (y - my) ** 2) / (2 * s * s))
    return h


def gh(x, y):
    """Shallow depressions share their exact contour with each water sheet."""
    h = gh_dry(x, y)
    for k, (px, py, pr, _) in enumerate(PUDDLES):
        d = puddle_distance(x, y, k)
        if d < 1.18:
            level = gh_dry(px, py) - 0.010
            h = h * smooth(0.78, 1.18, d) + level * (1-smooth(0.78, 1.18, d))
    return h


def shoreline(a, k):
    return 1 + 0.14 * math.sin(3*a + k*1.2) + 0.08 * math.cos(5*a-k) + 0.045*math.sin(9*a+k)


def puddle_distance(x, y, k):
    px, py, pr, _ = PUDDLES[k]
    dx, dy = (x-px)/0.78, (y-py)/1.35
    return math.hypot(dx,dy) / (pr * shoreline(math.atan2(dy,dx), k))


def ground(G, W, M):
    x0, x1, y0, y1, st = -6.6, 10.4, 4.25, 17.0, 0.14
    nx, ny = int((x1 - x0) / st) + 1, int((y1 - y0) / st) + 1
    vs, fs, wet, standing, moss = [], [], [], [], []
    for j in range(ny):
        for i in range(nx):
            x, y = x0 + i * st, y0 + j * st
            vs.append((x, y, gh(x, y)))
            w = 0.0
            for px, py, pr, _ in PUDDLES:
                w = max(w, 1 - smooth(0.9, 2.1, math.hypot(x - px, y - py) / pr))
            for sx, sy, sr in STONES:
                w = max(w, 0.55 * (1 - smooth(0.8, 2.4, math.hypot(x - sx, y - sy) / sr)))
            for mx, my, s, a in MOUNDS:
                w *= smooth(0.5, 1.6, math.hypot(x - mx, y - my) / s) if a > 0.15 else 1.0
            # Moss grows continuously out of damp earth; no separate raised discs.
            field = 0.0
            for mx, my, radius, _ in MOSS_BEDS:
                dist = math.hypot(x-mx, y-my) / radius
                edge = noise.noise((x*3.1, y*3.1, 7.0))*0.18 + noise.noise((x*11, y*11, 2.0))*0.07
                field = max(field, 1-smooth(0.69, 1.04, dist+edge))
            for sx, sy, sr in STONES:
                field *= smooth(0.75, 1.15, math.hypot((x-sx)/sr, (y-sy)/(sr*STONE_DEPTH)))
            moss.append(field)
            wet.append(w * (1-field))
            standing.append(max(1-smooth(0.72,1.15,puddle_distance(x,y,k)) for k in range(len(PUDDLES))))
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            fs.append((a, a + 1, a + nx + 1, a + nx))
    me = mesh_from("Ground", vs, fs, smooth=True, mats=[M["Ground_Wet"]])
    ca = me.color_attributes.new("Wetness", 'FLOAT_COLOR', 'POINT')
    for i, w in enumerate(wet):
        ca.data[i].color = (w, w, w, 1)
    pa=me.color_attributes.new('StandingWater','FLOAT_COLOR','POINT')
    for i,v in enumerate(standing): pa.data[i].color=(v,v,v,1)
    ma = me.color_attributes.new('MossCoverage', 'FLOAT_COLOR', 'POINT')
    for i, v in enumerate(moss): ma.data[i].color = (v, v, v, 1)
    new_obj("Ground", me, G)
    # land beyond the walls
    vs, fs = stack(24, [(420.0, -0.06)], cap=False)
    new_obj("Ground_Outer", mesh_from("Ground_Outer", vs, [tuple(range(24))], mats=[M["Ground_Outer"]]), G)
    # Water is shaded directly on the flattened terrain, avoiding detached rims.
    # Keep the named layout guides editable in Water, but out of renders.
    for k, (px, py, pr, rip) in enumerate(PUDDLES):
        n = 64
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            r = pr * shoreline(a, k) * 1.03
            pts.append((0.78 * r * math.cos(a), 1.35 * r * math.sin(a), 0.0))
        vs = [(0, 0, 0)] + pts
        fs = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
        me = mesh_from(f"Puddle_{k}", vs, fs, smooth=True,
                       mats=[M["Puddle_Ripple"] if rip else M["Puddle"]])
        guide=new_obj(f"Puddle_Layout_{k}", me, W, loc=(px, py, gh_dry(px, py) - 0.010))
        guide.hide_render=True; guide.hide_viewport=True


def stepping_stones(G, M):
    """Broad, low slabs with a chamfered rim and a top broken into a few
    shallow planes: worn stone, not a disc."""
    c = coll("Stepping_Stones", G)
    tops = []
    for k, (x, y, r) in enumerate(STONES):
        rnd = random.Random(100 + k)
        n = rnd.choice((7, 8, 9))
        h = rnd.uniform(0.13, 0.19)
        rx, ry = r, r * STONE_DEPTH * rnd.uniform(0.95, 1.1)
        outline = []
        for i in range(n):
            a = 2 * math.pi * (i + rnd.uniform(-0.30, 0.30)) / n
            ca, sa = math.cos(a), math.sin(a)
            square = (abs(ca) ** 3 + abs(sa) ** 3) ** (-1 / 3)       # a rounded slab, not an ellipse
            rr = square * rnd.uniform(0.84, 1.1)
            outline.append((rx * rr * ca, ry * rr * sa))
        # Three chipped rings and an off-centre crown: large broken planes,
        # not concentric bevels. The top fan is deliberately triangulated.
        vs, fs = [], []
        for kr, kz, wob in ((1.01, -0.07, 0.015), (1.0, h*0.72, 0.035), (0.88, h, 0.025)):
            for px, py in outline:
                vs.append((px*kr, py*kr, kz+rnd.uniform(-wob,wob)))
        for ring in range(2):
            for i in range(n):
                j=(i+1)%n
                a0,b0,c0,d0=ring*n+i,ring*n+j,(ring+1)*n+j,(ring+1)*n+i
                fs.extend(((a0,b0,c0),(a0,c0,d0)))
        vs.append((rx*rnd.uniform(-0.22,0.22), ry*rnd.uniform(-0.22,0.22), h+0.03))
        for i in range(n): fs.append((3*n,2*n+i,2*n+(i+1)%n))
        me=mesh_from(f"Stepping_Stone_{k}",vs,fs,mats=[M["Stone_Wet"]])
        facet=me.attributes.new('StoneFacet','FLOAT','FACE')
        for value in facet.data: value.value=rnd.uniform(0.84,1.18)
        z = gh_dry(x, y) - 0.015
        o = new_obj(f"Stepping_Stone_{k}", me, c, loc=(x, y, z), rot=(0, 0, rnd.uniform(-0.22, 0.22)))
        o.rotation_euler.x = math.radians(rnd.uniform(-0.8, 0.8))
        tops.append((x, y, r * 0.62, z + h))
    return tops


def moss_patch(name, x, y, r, bulge, c, mat, seed):
    rnd = random.Random(seed)
    seg, rings = 48, 7
    rad = [r * (0.91 + 0.12*math.sin(i*math.tau/seg*3+seed) + 0.08*math.sin(i*math.tau/seg*7)) for i in range(seg)]
    vs = [(0, 0, gh(x, y) + 0.03 + bulge)]
    for k in range(1, rings + 1):
        t = k / rings
        for i in range(seg):
            a = 2 * math.pi * i / seg
            px, py = rad[i] * t * math.cos(a), rad[i] * t * math.sin(a)
            lift = bulge * 0.4 * (1 - t * t) + (0.018 if k < rings else -0.012)
            vs.append((px, py, gh(x + px, y + py) + lift + rnd.uniform(-0.006, 0.006)))
    fs = [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)]
    for k in range(rings - 1):
        for i in range(seg):
            j = (i + 1) % seg
            a, b = 1 + k * seg, 1 + (k + 1) * seg
            fs.append((a + i, b + i, b + j, a + j))
    new_obj(name, mesh_from(name, vs, fs, mats=[mat]), c, loc=(x, y, 0))
    return name


def leaf_bush(name, seed, n, radius, height, leaf_len, mat):
    """Broad pointed leaves on an egg-shaped shell; each leaf is a folded diamond."""
    rnd = random.Random(seed)
    vs, fs = [], []
    stems = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0.25, 0.75)) for _ in range(7)]
    for sa, lean in stems:
        tip = Vector((radius * lean * math.cos(sa), radius * lean * math.sin(sa), height * rnd.uniform(0.8, 1.0)))
        side = Vector((-math.sin(sa), math.cos(sa), 0)) * 0.012
        b = len(vs)
        vs += [Vector((0.03 * math.cos(sa), 0.03 * math.sin(sa), 0)) - side, Vector((0.03 * math.cos(sa), 0.03 * math.sin(sa), 0)) + side,
               tip * 0.55 + Vector((0, 0, 0.1)) + side, tip * 0.55 + Vector((0, 0, 0.1)) - side, tip]
        fs += [(b, b + 1, b + 2, b + 3), (b + 3, b + 2, b + 4)]
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        t = rnd.uniform(0.32, 1.0)
        rr = radius * math.sin(t * math.pi * 0.9) * rnd.uniform(0.5, 1.0)
        base = Vector((rr * math.cos(a), rr * math.sin(a), height * t))
        L = leaf_len * rnd.uniform(0.7, 1.2)
        w = L * rnd.uniform(0.3, 0.4)
        droop = math.radians(rnd.uniform(-25, 45))
        m = (Matrix.Translation(base) @ Matrix.Rotation(a + rnd.uniform(-0.5, 0.5) - math.pi / 2, 4, 'Z')
             @ Matrix.Rotation(droop, 4, 'X') @ Matrix.Rotation(rnd.uniform(-0.5, 0.5), 4, 'Y'))
        pts = [(0, 0, 0), (-w, L * 0.42, 0.05 * L), (0, L * 0.45, -0.06 * L), (w, L * 0.42, 0.05 * L), (0, L, -0.08 * L)]
        b = len(vs)
        vs += [m @ Vector(p) for p in pts]
        fs += [(b, b + 2, b + 1), (b, b + 3, b + 2), (b + 1, b + 2, b + 4), (b + 2, b + 3, b + 4)]
    return mesh_from(name, vs, fs, mats=[mat])


def reed_clump(name, seed, n, radius, height, mat):
    rnd = random.Random(seed)
    vs, fs = [], []
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        r0 = radius * math.sqrt(rnd.random())
        base = Vector((r0 * math.cos(a), r0 * math.sin(a), 0))
        h = height * rnd.uniform(0.55, 1.1)
        lean = rnd.uniform(0.05, 0.5) * (0.4 + r0 / radius)
        out = Vector((math.cos(a + rnd.uniform(-0.6, 0.6)), math.sin(a + rnd.uniform(-0.6, 0.6)), 0))
        side = Vector((-out.y, out.x, 0))
        w = rnd.uniform(0.02, 0.034)
        seg = 4
        b = len(vs)
        for k in range(seg + 1):
            t = k / seg
            p = base + Vector((0, 0, h * t * (1 - 0.25 * lean * t))) + out * (lean * h * t * t)
            ww = w * (1 - t) ** 0.8
            if k < seg:
                vs += [p - side * ww, p + side * ww]
            else:
                vs.append(p)
        for k in range(seg - 1):
            fs.append((b + 2 * k, b + 2 * k + 1, b + 2 * k + 3, b + 2 * k + 2))
        fs.append((b + 2 * (seg - 1), b + 2 * (seg - 1) + 1, b + 2 * seg))
    return mesh_from(name, vs, fs, mats=[mat])


def lantern(G, M):
    c = coll("Stone_Lantern", G)
    S = M["Lantern_Stone"]
    root = empty("Stone_Lantern", c, loc=(LANTERN.x, LANTERN.y, gh(LANTERN.x, LANTERN.y) - 0.04))
    root.scale = (LANTERN_SCALE,) * 3
    root.rotation_euler.z = math.radians(12)
    rnd = random.Random(8)

    def part(name, n, rings, mat=S, jitter=0.03):
        vs, fs = stack(n, [(r,lantern_z(z)) for r,z in rings], jitter=jitter, rnd=rnd)
        return new_obj(name, mesh_from(name, vs, fs, mats=[mat]), c, parent=root)

    part("Lantern_Base", 6, [(0.40, 0.0), (0.41, 0.11), (0.31, 0.17)])
    part("Lantern_Pedestal", 6, [(0.27, 0.17), (0.21, 0.31), (0.15, 0.37)])
    part("Lantern_Stem", 6, [(0.24, 0.37), (0.19, 0.62), (0.17, 0.87)])
    part("Lantern_Platform", 6, [(0.16, 0.87), (0.34, 0.97), (0.34, 1.03)])
    bars = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            bars.append(((sx * 0.155, sy * 0.155, 1.19), (0.055, 0.055, 0.32)))
    for z in (1.05, 1.33):
        bars.append(((0, 0, z), (0.37, 0.37, 0.04)))
    for s in (-1, 1):
        bars.append(((s * 0.16, 0, 1.19), (0.022, 0.03, 0.3)))
        bars.append(((s * 0.16, 0, 1.19), (0.022, 0.29, 0.028)))
        bars.append(((0, s * 0.16, 1.19), (0.03, 0.022, 0.3)))
        bars.append(((0, s * 0.16, 1.19), (0.29, 0.022, 0.028)))
    bars = [((x,y,lantern_z(z)), size) for (x,y,z),size in bars]
    new_obj("Lantern_Cage", bars_mesh("Lantern_Cage", bars, S), c, parent=root)
    insert=box("Lantern_Light_Insert", (0.27, 0.27, 0.27), (0, 0, lantern_z(1.19)), c, M["Paper_Lantern"], parent=root)
    insert.visible_shadow=False
    roof = part("Lantern_Roof", 6, [(0.55, 1.37), (0.5, 1.42), (0.17, 1.62), (0.11, 1.65)], jitter=0.02)
    part("Lantern_Finial", 6, [(0.07, 1.65), (0.115, 1.73), (0.08, 1.81), (0.015, 1.88)], jitter=0.02)
    # Continuous clipped moss along the actual roof planes. Only the outer
    # edge recedes; inset triangles used to leave a conspicuous white grid.
    verts, faces = [], []
    def edge(v):
        return v.z-lantern_z(1.45)-0.025*math.sin(v.x*15+v.y*11)-0.014*math.sin(v.y*27)
    for polygon in roof.data.polygons:
        if polygon.normal.z < 0.2: continue
        pts=[roof.data.vertices[v].co.copy() for v in polygon.vertices]
        clipped=[]
        for i,a in enumerate(pts):
            b=pts[(i+1)%len(pts)]; fa,fb=edge(a),edge(b)
            if fa>=0: clipped.append(a)
            if (fa>=0)!=(fb>=0): clipped.append(a.lerp(b,fa/(fa-fb)))
        if len(clipped)<3: continue
        start=len(verts)
        verts.extend(v+Vector((0,0,0.006)) for v in clipped)
        faces.append(tuple(range(start,len(verts))))
    new_obj("Lantern_Moss_Cap",mesh_from("Lantern_Moss_Cap",verts,faces,mats=[M["Moss"]]),c,parent=root)
    return root


def garden_rock(name, seed, size, materials):
    """A boulder cut by a few dozen random planes: broad faces of different
    sizes with small chamfers where they meet, and a wide flattish top."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    planes = []
    for _ in range(rnd.randint(26, 34)):
        while True:
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0.2 < n.length <= 1:
                break
        planes.append((n.normalized(), rnd.uniform(0.74, 1.0)))
    planes.append((Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12), 1)).normalized(), rnd.uniform(0.62, 0.76)))
    planes.append((Vector((rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45), 1)).normalized(), rnd.uniform(0.7, 0.84)))
    for v in bm.verts:
        d = v.co.normalized()
        r = 1.25
        for n, h in planes:
            k = n.dot(d)
            if k > 0.05:
                r = min(r, h / k)
        v.co = Vector((d.x * r * size[0], d.y * r * size[1], max(d.z * r, -0.22) * size[2]))
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(3.5), verts=bm.verts[:], edges=bm.edges[:])
    me=bm_to_mesh(name,bm,mats=materials)
    facet=me.attributes.new('StoneFacet','FLOAT','FACE')
    for value in facet.data: value.value=rnd.uniform(0.91,1.09)
    return me


def moss_on_rock(rock, size, c, material, seed):
    """A thin, clipped shell follows the boulder's actual top surfaces."""
    vs,fs=[],[]
    def field(v):
        border = size[2]*(0.32 + 0.13*math.sin(v.x*8+seed) + 0.10*math.sin(v.y*10-seed))
        return v.z-border
    for poly in rock.data.polygons:
        if poly.normal.z < 0.18:
            continue
        pts = [rock.data.vertices[i].co.copy() for i in poly.vertices]
        out=[]
        for i,a in enumerate(pts):
            b=pts[(i+1)%len(pts)]; fa,fb=field(a),field(b)
            if fa>=0: out.append(a)
            if (fa>=0)!=(fb>=0): out.append(a.lerp(b,fa/(fa-fb)))
        if len(out)<3: continue
        start=len(vs)
        vs.extend(v+poly.normal*0.006 for v in out)
        fs.append(tuple(range(start,len(vs))))
    obj=new_obj(rock.name+'_Moss',mesh_from(rock.name+'_Moss',vs,fs,mats=[material]),c)
    obj.parent=rock
    return obj


def build(M):
    G = coll("Garden")
    W = coll("Water")
    ground(G, W, M)
    tops = stepping_stones(G, M)
    # boulders: (x, y, (sx, sy, sz), seed, moss)
    cB = coll("Boulders", G)
    rocks = [(-3.5, 7.1, (0.8, 0.62, 0.76), 1, True), (-2.45, 6.8, (0.64, 0.44, 0.30), 2, False),
             (-2.45, 9.3, (0.34, 0.3, 0.25), 3, False), (3.05, 8.5, (0.44, 0.36, 0.25), 4, False),
             (-1.0, 14.2, (0.55, 0.45, 0.32), 5, True), (-5.3, 8.7, (0.62, 0.52, 0.48), 6, True),
             (-3.75, 9.0, (0.42, 0.36, 0.3), 7, True), (-4.7, 6.3, (0.45, 0.4, 0.3), 9, False),
             (2.85, 12.0, (0.3, 0.26, 0.2), 10, False), (-1.55, 7.3, (0.2, 0.18, 0.13), 12, False),
             (3.1, 14.9, (0.5, 0.42, 0.36), 13, True), (-5.6, 14.0, (0.5, 0.45, 0.4), 14, True)]
    for i, (x, y, s, seed, moss) in enumerate(rocks):
        me = garden_rock(f"Boulder_{i}", seed, s, [M["Boulder"]])
        o = new_obj(f"Boulder_{i}", me, cB, loc=(x, y, gh(x, y) + 0.18 * s[2]), rot=(0, 0, seed * 0.9))
        if moss:
            moss_on_rock(o,s,cB,M["Moss"],seed)
    cM = coll("Moss", G)
    # Moss beds are now part of the terrain material.
    # plants
    cP = coll("Plants", G)
    bushes = [leaf_bush("Leaf_Bush_A", 1, 100, 0.56, 0.95, 0.25, M["Leaf"]),
              leaf_bush("Leaf_Bush_B", 2, 75, 0.46, 0.65, 0.23, M["Leaf"])]
    for i, (x, y, v, s, rz) in enumerate([(-3.75, 5.55, 0, 1.1, 0.3), (-4.45, 6.0, 0, 1.0, 2.0), (-2.9, 5.5, 1, 0.9, 1.0),
                                          (-5.5, 6.9, 0, 1.05, 4.0), (-5.7, 9.8, 1, 1.1, 2.5),
                                          (-5.7, 12.3, 0, 0.9, 5.0), (0.5, 16.0, 1, 0.6, 1.4)]):
        new_obj(f"Leaf_Bush_{i}", bushes[v], cP, loc=(x, y, gh(x, y)), rot=(0, 0, rz), scale=(s, s, s))
    shrubs = [blob_mesh(f"Shrub_{t}", 60 + k, n, sp, 0.2, 0.36, 0.85, mats=[M["Leaf"]])
              for k, (t, n, sp) in enumerate([("A", 12, (0.6, 0.55, 0.38)), ("B", 9, (0.45, 0.5, 0.3)), ("C", 15, (0.75, 0.6, 0.45))])]
    for i, (x, y, v, s, rz) in enumerate([(-4.7, 15.4, 2, 1.0, 0), (-3.2, 15.6, 0, 1.15, 1), (-1.8, 15.7, 1, 1.0, 2),
                                          (-0.5, 15.8, 0, 0.8, 3), (-5.5, 13.2, 1, 1.1, 4), (-2.3, 14.6, 2, 0.9, 5),
                                          (4.6, 15.2, 2, 1.2, 1), (6.4, 14.6, 0, 1.3, 2), (3.3, 15.9, 1, 0.7, 4),
                                          (-5.7, 11.0, 1, 0.8, 2)]):
        new_obj(f"Shrub_{i}", shrubs[v], cP, loc=(x, y, gh(x, y) + 0.32 * s), rot=(0, 0, rz), scale=(s, s, s))
    # a dark pine behind the lantern and tree masses beyond the wall
    pad = blob_mesh("Pine_Pad", 71, 25, (0.95, 0.8, 0.24), 0.16, 0.27, 0.72, mats=[M["Pine"]], subdiv=2)
    for i, (dx, dy, z, s, rz) in enumerate([(0.3, 0.0, 1.45, 1.0, 0.0), (-0.45, 0.2, 2.0, 0.85, 1.4), (0.25, -0.1, 2.55, 0.7, 2.6),
                                            (-0.1, 0.1, 3.05, 0.5, 4.0), (-0.75, -0.2, 1.2, 0.6, 5.0)]):
        new_obj(f"Pine_Pad_{i}", pad, cP, loc=(-3.6 + dx, 13.7 + dy, z*0.83), rot=(0, 0, rz), scale=(s, s, s))
    span("Pine_Trunk_Lower", (-3.7, 13.7, 0.1), (-3.5, 13.7, 1.25), 0.15, 0.15, cP, M["Bark"], bevel=0.03)
    span("Pine_Trunk_Upper", (-3.5, 13.7, 1.2), (-3.68, 13.75, 2.45), 0.1, 0.1, cP, M["Bark"], bevel=0.02)
    reeds = [reed_clump("Reeds_A", 1, 52, 0.38, 1.8, M["Reed"]), reed_clump("Reeds_B", 2, 30, 0.27, 1.15, M["Reed"])]
    for i, (x, y, v, rz) in enumerate([(3.0, 10.35, 0, 0), (2.7, 11.15, 1, 1), (3.2, 9.5, 1, 2), (-5.75, 11.9, 0, 3),
                                       (3.25, 13.0, 1, 4)]):
        new_obj(f"Reeds_{i}", reeds[v], cP, loc=(x, y, gh(x, y) - 0.02), rot=(0, 0, rz))
    lantern(G, M)
    return G, W, tops
