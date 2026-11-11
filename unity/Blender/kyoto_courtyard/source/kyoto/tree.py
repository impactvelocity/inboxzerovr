"""The cherry tree: trunk, limbs and roots in one skinned mesh, a small
armature for the wind, instanced blossom clusters and the petals."""
import math
import random

import bpy
import bmesh
from mathutils import Matrix, Vector

from .common import P, blob_mesh, coll, mesh_from, new_obj
from .garden import PUDDLES, gh, gh_dry

# Limbs are drawn in frame space so the silhouette matches the reference:
# name -> (parent, sides, blossom count, [(u, v, depth, radius), ...])
LIMBS = {
    "Trunk": (None, 9, 0, [(0.145,0.665,10.5,0.61),(0.125,0.54,10.4,0.49),
        (0.14,0.45,10.2,0.43),(0.192,0.365,10.0,0.38),(0.235,0.31,9.9,0.34),(0.246,0.25,9.8,0.28)]),
    "A": ("Trunk",7,9,[(0.192,0.365,10,0.26),(0.145,0.335,10.1,0.22),(0.115,0.28,10.2,0.16),(0.106,0.21,10.4,0.10),(0.10,0.16,10.5,0.035)]),
    "B": ("Trunk",7,11,[(0.235,0.31,9.9,0.29),(0.30,0.31,9.8,0.20),(0.36,0.29,9.4,0.145),(0.40,0.26,9.1,0.10),(0.46,0.24,8.8,0.055),(0.51,0.20,8.6,0.018)]),
    "C": ("Trunk",7,11,[(0.246,0.25,9.8,0.28),(0.234,0.19,9.8,0.20),(0.23,0.125,10,0.12),(0.215,0.07,10.2,0.035)]),
    "D": ("C",6,11,[(0.234,0.19,9.8,0.16),(0.29,0.18,9.8,0.12),(0.337,0.19,9.5,0.075),(0.38,0.205,9.2,0.05),(0.42,0.18,9,0.016)]),
    "E": ("B",6,6,[(0.36,0.29,9.4,0.09),(0.38,0.34,9.1,0.065),(0.405,0.37,8.8,0.04),(0.43,0.43,8.5,0.015)]),
    "F": ("B",5,6,[(0.40,0.26,9.1,0.07),(0.41,0.22,9.3,0.055),(0.44,0.18,9.5,0.035),(0.48,0.16,9.7,0.014)]),
    "G": ("A",5,8,[(0.115,0.28,10.2,0.08),(0.08,0.31,10.1,0.055),(0.03,0.30,10,0.016)]),
    "H": ("A",5,9,[(0.145,0.335,10.1,0.12),(0.16,0.25,10.6,0.085),(0.185,0.20,11,0.05),(0.19,0.13,11.4,0.015)]),
    "I": ("C",5,8,[(0.23,0.125,10,0.07),(0.25,0.095,10.2,0.045),(0.28,0.065,10.4,0.015)]),
    "J": ("A",5,8,[(0.106,0.21,10.4,0.08),(0.06,0.19,10.6,0.045),(0.015,0.17,10.9,0.015)]),
    "K": ("D",5,7,[(0.29,0.18,9.8,0.065),(0.31,0.135,10.2,0.04),(0.32,0.10,10.5,0.015)]),
    "L": ("B",5,4,[(0.30,0.31,9.8,0.08),(0.30,0.25,10.3,0.045),(0.32,0.23,10.6,0.015)]),
}

# (limb, t, limb, t, radius): pairs of limb points to bridge
FILLETS = [("B", 0.08, "D", 0.10, 0.21), ("B", 0.02, "C", 0.25, 0.25)]

RT = random.Random(31)


def catmull(pts, sub=2):
    """Subdivide control points [(Vector, radius)] -> [(Vector, radius, t)]."""
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = (pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)])
        for s in range(sub):
            t = s / sub
            a = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t * t
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t ** 3)
            out.append((a, p1[1] + (p2[1] - p1[1]) * t, (i + t) / (n - 1)))
    out.append((pts[-1][0], pts[-1][1], 1.0))
    return out


def tube(path, sides, rnd, vs, fs, groups, weight_fn, jitter=0.1):
    """Append a tapered, faceted tube along path [(pos, radius, t)]."""
    prev_n = None
    start = len(vs)
    for i, (p, r, t) in enumerate(path):
        a, b = path[max(i - 1, 0)][0], path[min(i + 1, len(path) - 1)][0]
        tan = (b - a).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((1, 0, 0))
            nrm = tan.cross(ref).normalized()
        else:
            nrm = (prev_n - tan * prev_n.dot(tan)).normalized()
        bi = tan.cross(nrm)
        prev_n = nrm
        for k in range(sides):
            ang = 2 * math.pi * k / sides + 0.065 * math.sin(t * 3.0)
            rr = r * (1 + jitter * math.sin(k * 3.7 + t * 1.4))
            vs.append(p + (nrm * math.cos(ang) + bi * math.sin(ang)) * rr)
            groups.append(weight_fn(t))
    for i in range(len(path) - 1):
        for k in range(sides):
            a = start + i * sides + k
            b = start + i * sides + (k + 1) % sides
            fs.append((a, b, b + sides, a + sides))
    end = start + (len(path) - 1) * sides
    fs.append(tuple(reversed(range(start,start+sides))))
    fs.append(tuple(range(end, end + sides)))


def sample(path, t):
    for i in range(len(path) - 1):
        if path[i + 1][2] >= t:
            a, b = path[i], path[i + 1]
            k = (t - a[2]) / max(1e-6, b[2] - a[2])
            return a[0].lerp(b[0], k)
    return path[-1][0].copy()


def build(M, stone_tops):
    T = coll("Tree")
    rnd = random.Random(4)
    paths = {}
    for name, (parent, sides, nblo, ctrl) in LIMBS.items():
        pts = []
        for i, (u, v, d, r) in enumerate(ctrl):
            p = P(u, v, d)
            if 0 < i < len(ctrl) - 1:
                p += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * r * 0.10
            pts.append((p, r))
        paths[name] = catmull(pts, 2)

    def bone_for(name, t):
        return name if name == "Trunk" else f"{name}_1" if t < 0.5 else f"{name}_2"

    # Twigs: short dark offshoots along every limb. They break up the outline
    # of the canopy and give the blossom something to sit on.
    twigs = []
    for name, path in paths.items():
        if name == "Trunk":
            continue
        for _ in range(3):
            t = rnd.uniform(0.3, 0.95)
            base = sample(path, t)
            along = (sample(path, min(1.0, t + 0.1)) - sample(path, max(0.0, t - 0.1))).normalized()
            side = along.cross(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1)))).normalized()
            way = (side + along * rnd.uniform(0.2, 0.7) + Vector((0, 0, rnd.uniform(0.1, 0.5)))).normalized()
            reach = rnd.uniform(0.45, 0.95) * (1.15 - 0.4 * t)
            kink = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.07
            ctrl = [(base, 0.048), (base + way * reach * 0.5 + kink, 0.036), (base + way * reach + kink * 1.6, 0.024)]
            twigs.append((name, t, catmull(ctrl, 2)))

    vs, fs, groups = [], [], []
    for name, (parent, sides, nblo, ctrl) in LIMBS.items():
        def wf(t, name=name, parent=parent):
            if parent and t <= 0.001:
                # the first ring is buried in the parent limb and moves with it
                tp = 1.0 if parent == "Trunk" else 0.4
                return bone_for(parent, tp)
            return bone_for(name, t)
        tube(paths[name], sides, rnd, vs, fs, groups, wf, jitter=0.10 if name == "Trunk" else 0.065)
    for name, t, tw in twigs:
        tube(tw, 5, rnd, vs, fs, groups, lambda _t, name=name, t=t: bone_for(name, t), jitter=0.05)
    # exposed roots
    base = paths["Trunk"][0][0]
    gz = gh(base.x, base.y)
    for i, (ang, reach) in enumerate([(-0.5, 2.1), (0.25, 1.6), (-1.3, 1.9), (2.2, 1.5), (3.3, 1.7), (-2.2, 1.4), (1.2, 1.3)]):
        d = Vector((math.cos(ang), math.sin(ang), 0))
        ctrl = []
        for k, (f, lift, r) in enumerate([(0.12, 0.62, 0.22), (0.45, 0.3, 0.17), (0.75, 0.12, 0.11), (1.0, -0.1, 0.05)]):
            p = Vector((base.x, base.y, 0)) + d * (reach * f) + Vector((-d.y, d.x, 0)) * rnd.uniform(-0.12, 0.12)
            p.z = gh(p.x, p.y) + lift * (0.8 if k else 1.0)
            ctrl.append((p, r))
        tube(catmull(ctrl, 2), 5, rnd, vs, fs, groups, lambda t: "Trunk", jitter=0.12)
    me = mesh_from("Cherry_Tree", vs, fs, mats=[M["Bark"]])
    bm=bmesh.new(); bm.from_mesh(me)
    # Webs between neighbouring limbs: spheres that the voxel remesh fuses into
    # the trunk, so a crotch reads as a smooth saddle instead of a bite.
    for la, ta, lb, tb, rad in FILLETS:
        pa, pb = sample(paths[la], ta), sample(paths[lb], tb)
        for k in (0.0, 0.25, 0.5, 0.75, 1.0):
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rad, matrix=Matrix.Translation(pa.lerp(pb, k)))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(me); bm.free()
    tree = new_obj("Cherry_Tree", me, T)
    # Fuse the intersecting limb tubes into a single branching surface.
    # Then reduce it to large facets and bind the new vertices to the skeleton.
    bpy.context.view_layer.objects.active = tree
    tree.select_set(True)
    remesh=tree.modifiers.new('Joined_Branch_Junctions','REMESH')
    remesh.mode='VOXEL'; remesh.voxel_size=0.03
    remesh.use_smooth_shade=False
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    sm=tree.modifiers.new('Soften_Junctions','SMOOTH'); sm.factor=0.7; sm.iterations=3
    bpy.ops.object.modifier_apply(modifier=sm.name)
    dec=tree.modifiers.new('Broad_Anatomical_Facets','DECIMATE')
    dec.ratio=min(1.0,3400/max(1,len(tree.data.polygons)))   # enough faces for the bark's planes to read
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Remove tiny detached slivers left at sub-voxel twig tips.
    bm=bmesh.new(); bm.from_mesh(tree.data)
    seen=set(); debris=[]
    for v in bm.verts:
        if v in seen: continue
        comp=[]; todo=[v]; seen.add(v)
        while todo:
            x=todo.pop(); comp.append(x)
            for e in x.link_edges:
                n=e.other_vert(x)
                if n not in seen: seen.add(n); todo.append(n)
        if len(comp)<12: debris.extend(comp)
    if debris: bmesh.ops.delete(bm,geom=debris,context='VERTS')
    bm.to_mesh(tree.data); bm.free()
    tree.select_set(False)
    segments=[]
    for name,path in paths.items():
        for i in range(len(path)-1):
            a,r,t=path[i]; b,r2,t2=path[i+1]
            segments.append((a,b,r,r2,bone_for(name,(t+t2)*0.5)))
    group_indices={}
    for v in tree.data.vertices:
        best=(1e9,'Trunk')
        for a,b,r,r2,g in segments:
            ab=b-a
            t=max(0,min(1,(v.co-a).dot(ab)/max(ab.length_squared,1e-8)))
            # Normalise by limb thickness so a twig cannot steal trunk weights.
            d=(v.co-a.lerp(b,t)).length/max(r+(r2-r)*t,0.025)
            if d<best[0]: best=(d,g)
        g='Trunk' if v.co.z < 0.78 else best[1]
        group_indices.setdefault(g,[]).append(v.index)
    for g,indices in group_indices.items():
        tree.vertex_groups.new(name=g).add(indices,1.0,'REPLACE')

    # armature: Trunk, then two bones per limb
    arm = bpy.data.armatures.new("Cherry_Rig")
    rig = new_obj("Cherry_Rig", arm, T)
    arm.display_type = 'STICK'
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    b = eb.new("Trunk")
    b.head, b.tail = paths["Trunk"][0][0], paths["Trunk"][-1][0]
    attach = {}
    for name, (parent, sides, nblo, ctrl) in LIMBS.items():
        if parent is None:
            continue
        path = paths[name]
        mid = sample(path, 0.5)
        b1 = eb.new(f"{name}_1")
        b1.head, b1.tail = path[0][0], mid
        b2 = eb.new(f"{name}_2")
        b2.head, b2.tail = mid, path[-1][0]
        b2.parent = b1
        b2.use_connect = True
        # which parent bone the limb leaves from
        if parent == "Trunk":
            attach[name] = "Trunk"
        else:
            idx = min(range(len(paths[parent])), key=lambda i: (paths[parent][i][0] - path[0][0]).length)
            attach[name] = bone_for(parent, paths[parent][idx][2])
    for name, pb in attach.items():
        eb[f"{name}_1"].parent = eb[pb]
    bpy.ops.object.mode_set(mode='OBJECT')
    tree.parent = rig
    mod = tree.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig

    # blossom clusters: six variants, instanced along the outer limbs
    B = coll("Blossoms", T)
    # Rounded five-to-twenty-plane blossom forms overlap into cloud-like masses.
    # Keep thin twigs visible beneath the canopy rather than flattening blooms
    # into randomly rotated shards.
    variants = [blob_mesh(f"Blossom_Cluster_{chr(65+i)}",200+i,n,sp,0.10,0.17,0.86,mats=[M["Blossom"]],subdiv=1)
                for i,(n,sp) in enumerate([(18,(0.58,0.46,0.21)),(17,(0.48,0.42,0.22)),(22,(0.67,0.44,0.26)),
                                          (14,(0.40,0.38,0.18)),(20,(0.60,0.45,0.24)),(17,(0.50,0.51,0.22))])]
    clusters = []
    for name, (parent, sides, nblo, ctrl) in LIMBS.items():
        path = paths[name]
        nblo = round(nblo * 1.65)
        for i in range(nblo):
            t = 0.40 + 0.66 * ((i + RT.random()) / nblo) ** 0.8
            p = sample(path, min(t, 1.0))
            if t > 1.0:
                p += (path[-1][0] - path[-2][0]).normalized() * (t - 1.0) * 1.5
            spread = 0.85 - 0.18 * min(t, 1.0)
            off = Vector((RT.uniform(-1, 1), RT.uniform(-1, 1) * 1.2, RT.uniform(-0.10, 1.0))) * spread
            s = RT.uniform(0.75, 1.25) * (1.05 - 0.2 * min(t, 1.0))
            o = new_obj(f"Blossom_{name}_{i:02d}", RT.choice(variants), B, loc=p + off,
                        rot=(RT.uniform(-0.4, 0.4), RT.uniform(-0.4, 0.4), RT.uniform(0, 6.28)), scale=(s, s, s * RT.uniform(0.9, 1.15)))
            bone = arm.bones[bone_for(name, min(t, 1.0))]
            o.parent = rig
            o.parent_type = 'BONE'
            o.parent_bone = bone.name
            o.matrix_parent_inverse = (rig.matrix_world @ bone.matrix_local
                                       @ Matrix.Translation((0, bone.length, 0))).inverted()
            clusters.append((o, min(t, 1.0), (p + off).copy()))
    # a small pad on the tip of most twigs
    for k, (name, t, tw) in enumerate(twigs):
        if RT.random() < 0.3:
            continue
        p = tw[-1][0] + Vector((RT.uniform(-0.1, 0.1), RT.uniform(-0.1, 0.1), RT.uniform(0.0, 0.12)))
        sc = RT.uniform(0.55, 0.85)
        o = new_obj(f"Blossom_Twig_{k:02d}", RT.choice(variants), B, loc=p,
                    rot=(RT.uniform(-0.4, 0.4), RT.uniform(-0.4, 0.4), RT.uniform(0, 6.28)), scale=(sc, sc, sc))
        bone = arm.bones[bone_for(name, t)]
        o.parent = rig
        o.parent_type = 'BONE'
        o.parent_bone = bone.name
        o.matrix_parent_inverse = (rig.matrix_world @ bone.matrix_local
                                   @ Matrix.Translation((0, bone.length, 0))).inverted()
        clusters.append((o, t, p.copy()))

    # petals
    pm = mesh_from("Petal", [(0, -0.04, 0), (-0.026, 0, 0.008), (0, 0.006, -0.004), (0.026, 0, 0.008), (0, 0.045, 0.002)],
                   [(0, 2, 1), (0, 3, 2), (1, 2, 4), (2, 3, 4)], mats=[M["Petal"]])
    Pc = coll("Petals", T)
    falling = []
    for i in range(12):
        _, _, src = RT.choice(clusters)
        start = src + Vector((RT.uniform(-0.3, 0.3), RT.uniform(-0.3, 0.3), -0.25))
        drift = Vector((RT.uniform(0.3, 1.5), RT.uniform(-1.2, 0.3), 0))
        end = start + drift
        end.z = gh(end.x, end.y) + 0.02
        o = new_obj(f"Petal_Falling_{i:02d}", pm, Pc, loc=start, scale=(1.15, 1.15, 1.15))
        falling.append((o, start.copy(), end.copy()))
    # fallen petals: one mesh scattered under the canopy, on stones and water
    vs, fs = [], []
    spots = []
    for _ in range(340):
        spots.append((RT.gauss(-3.3, 2.1), RT.gauss(9.4, 2.0)))
    for _ in range(90):
        spots.append((RT.uniform(-5.5, 3.2), RT.uniform(5.7, 15.5)))
    for x, y in spots:
        if not (-6.0 < x < 3.3 and 5.5 < y < 16.2):
            continue
        z = gh(x, y) + 0.01
        for px, py, pr, _ in PUDDLES:
            if math.hypot(x - px, y - py) < pr * 1.3:
                z = max(z, gh_dry(px, py) - 0.014)
        for sx, sy, sr, sz in stone_tops:
            if math.hypot(x - sx, y - sy) < sr * 0.8:
                z = sz + 0.006
        m = (Matrix.Translation((x, y, z)) @ Matrix.Rotation(RT.uniform(0, 6.28), 4, 'Z')
             @ Matrix.Rotation(RT.uniform(-0.15, 0.15), 4, 'X') @ Matrix.Diagonal((0.95, 0.95, 0.4, 1)))
        b0 = len(vs)
        vs += [m @ v.co for v in pm.vertices]
        fs += [tuple(b0 + i for i in p.vertices) for p in pm.polygons]
    new_obj("Petals_Fallen", mesh_from("Petals_Fallen", vs, fs, mats=[M["Petal"]]), Pc)
    return dict(rig=rig, tree=tree, clusters=clusters, falling=falling, limbs=list(attach.keys()))
