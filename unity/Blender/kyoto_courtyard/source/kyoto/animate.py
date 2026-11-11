"""Gentle 12-second wind, petal, lantern and water cycles.

Clouds advance one tile repeat every 12 seconds: five repeats across the
one-way 60-second dusk fade, and a seamless cycle in the night preset. Local motion repeats at frame LOOP + 1.
"""
import math
import random

import bpy
from mathutils import Euler, Vector

from .common import LOOP, fcurves_of, finish_curves, wave

RA = random.Random(77)
STEP = 12


def linear_keys(idblock):
    for fc in fcurves_of(idblock):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
        fc.update()


def tree_wind(tree):
    rig = tree["rig"]
    deg = math.radians
    params = {}
    for pb in rig.pose.bones:
        if pb.name == "Trunk":
            continue          # trunk and roots stay pinned
        pb.rotation_mode = 'XYZ'
        tip = pb.name.endswith("_2")
        x = rig.data.bones[pb.name].head_local.x
        # the gust crosses the canopy left to right; tips lag their branch
        ph = -0.45 * x + (0.7 if tip else 0.0) + RA.uniform(-0.4, 0.4)
        amp = deg(RA.uniform(0.7, 1.05) if tip else RA.uniform(0.3, 0.55))
        params[pb.name] = (ph, amp, RA.uniform(0.3, 0.5), RA.uniform(0, 6.28))
    for f in range(1, LOOP + 2, STEP):
        for pb in rig.pose.bones:
            if pb.name not in params:
                continue
            ph, amp, k2, ph2 = params[pb.name]
            pb.rotation_euler = Euler((amp * (wave(f, 1, ph) + k2 * wave(f, 3, ph2)), 0.0,
                                       amp * 0.7 * (wave(f, 2, ph + 1.3) + k2 * wave(f, 1, ph2))))
            pb.keyframe_insert("rotation_euler", frame=f)
    finish_curves(rig)
    # blossom clusters follow a little farther and a little later
    for o, t, pos in tree["clusters"]:
        base = o.rotation_euler.copy()
        ph = -0.45 * pos.x + 1.2 + RA.uniform(-0.5, 0.5)
        amp = deg(RA.uniform(1.0, 2.2)) * (0.6 + 0.6 * t)
        ph2 = RA.uniform(0, 6.28)
        for f in range(1, LOOP + 2, STEP):
            o.rotation_euler = Euler((base.x + amp * wave(f, 1, ph) + 0.4 * amp * wave(f, 4, ph2),
                                      base.y + 0.8 * amp * wave(f, 2, ph + 0.9),
                                      base.z + 0.5 * amp * wave(f, 3, ph2)))
            o.keyframe_insert("rotation_euler", frame=f)
        o.rotation_euler = base
        finish_curves(o)


def petals(tree):
    """Each petal falls once per loop on its own offset, shrinking to nothing
    before it is carried back to the canopy."""
    for o, start, end in tree["falling"]:
        offset = RA.randrange(0, LOOP)
        side = Vector((RA.uniform(-1, 1), RA.uniform(-1, 1), 0)).normalized()
        sway, turns = RA.uniform(0.12, 0.3), RA.choice((2, 3, 4))
        spin = Vector((RA.uniform(2, 5), RA.uniform(1, 4), RA.uniform(1, 3)))
        ph = RA.uniform(0, 6.28)
        size = o.scale.x
        for f in range(1, LOOP + 2, 4):
            tau = ((f - 1 - offset) % LOOP) / LOOP
            s = min(1.0, max(0.0, (tau - 0.03) / 0.87))
            p = start.lerp(end, s)
            p.z = start.z + (end.z - start.z) * (0.85 * s + 0.15 * s * s)
            p += side * sway * math.sin(2 * math.pi * turns * s + ph) * (1 - 0.5 * s)
            p.z += 0.05 * math.cos(4 * math.pi * turns * s + ph) * (1 - s)
            vis = min(1.0, max(0.0, (tau - 0.03) / 0.04)) * min(1.0, max(0.0, (0.9 - tau) / 0.03))
            o.location = p
            o.rotation_euler = Euler((ph + spin.x * 2 * math.pi * s * 0.5 + 0.6 * math.sin(2 * math.pi * turns * s),
                                      spin.y * 2 * math.pi * s * 0.4, ph + spin.z * 2 * math.pi * s * 0.3))
            o.scale = (size * vis,) * 3
            for path in ("location", "rotation_euler", "scale"):
                o.keyframe_insert(path, frame=f)
        linear_keys(o)


def clouds(sky):
    """One tile repeat per 12 seconds; cyclic in the night preset."""
    for mp in sky["drift"]:
        nt = mp.id_data
        loc = mp.inputs["Location"]
        if sky['variant']=='night':
            for f in range(1,LOOP+2,12):
                loc.default_value=(-(f-1)/LOOP,0,0)
                loc.keyframe_insert('default_value',index=0,frame=f)
            finish_curves(nt,interp='LINEAR',cyclic=True)
            continue
        loc.default_value = (0, 0, 0)
        loc.keyframe_insert("default_value", index=0, frame=1)
        loc.default_value = (-5.0, 0, 0)
        loc.keyframe_insert("default_value", index=0, frame=1441)
        linear_keys(nt)


def lantern(sky, M):
    light = sky["lantern_light"]
    base = light.energy
    mat = M["Paper_Lantern"]
    rng = next(n for n in mat.node_tree.nodes if n.type == 'MAP_RANGE')
    lo, hi = rng.inputs[3].default_value, rng.inputs[4].default_value
    for f in range(1, LOOP + 2, 6):
        k = 1 + 0.035 * wave(f, 3, 0.4) + 0.02 * wave(f, 7, 2.0)
        light.energy = base * k
        light.keyframe_insert("energy", frame=f)
        rng.inputs[3].default_value = lo * k
        rng.inputs[4].default_value = hi * k
        rng.inputs[3].keyframe_insert("default_value", frame=f)
        rng.inputs[4].keyframe_insert("default_value", frame=f)
    light.energy = base
    finish_curves(light)
    finish_curves(mat.node_tree)


def ripples(M):
    w = M["Puddle_Ripple"].node_tree.nodes["Ripple"]
    ph = w.inputs["Phase Offset"]
    ph.default_value = 0.0
    ph.keyframe_insert("default_value", frame=1)
    ph.default_value = -2 * math.pi * 3
    ph.keyframe_insert("default_value", frame=LOOP + 1)
    linear_keys(M["Puddle_Ripple"].node_tree)
    # Standing water uses the ground surface, so its normals remain continuous.
    nt=M['Ground_Wet'].node_tree
    water=nt.nodes['Water_Drift'].inputs['W']
    for f in range(1,LOOP+2,12):
        water.default_value=0.10*wave(f,1,0.0)
        water.keyframe_insert('default_value',frame=f)
    finish_curves(nt,cyclic=True)


def build(tree, sky, M):
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, LOOP
    sc.render.fps = 24
    tree_wind(tree)
    petals(tree)
    clouds(sky)
    lantern(sky, M)
    ripples(M)
    if sky['variant']=='dusk':
        sc.frame_end=1440
        for name,f in (("TWILIGHT",1),("FADE BEGINS",121),("BLUE HOUR",1153),("HOLD",1440)):
            sc.timeline_markers.new(name,frame=f)
    else:
        sc.timeline_markers.new("BLUE HOUR · 12s AMBIENT LOOP",frame=1)
    # Falling petals repeat with their own invisible return interval.
    for o,_,_ in tree['falling']:
        finish_curves(o,interp='LINEAR',cyclic=True)
    for name in ('Puddle_Ripple',):
        finish_curves(M[name].node_tree,interp='LINEAR',cyclic=True)
    sc.frame_set(1)
