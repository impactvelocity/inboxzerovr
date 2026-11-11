"""Sky dome, drifting cloud layers, hills, haze, world and lights."""
import math
import random

import bpy
import numpy as np
from mathutils import Vector, noise

from .architecture import FACADE_X, FACADE_Y0, BAY, GATE
from .common import (EYE, coll, hx, link, mat_new, math_node, mesh_from, mix_rgb,
                     new_obj, node, noise_tex, ramp)
from . import atmosphere
from .garden import LANTERN, LANTERN_SCALE, gh, lantern_z

# Two ends of the session's fade, matched to the two reference paintings.
# Dusk is soft and low in contrast: a neutral lavender sky light, so plaster,
# stone and timber read as warm mauve-greys and only the sky and tiles are
# blue. Night is deep purple with a red horizon. The lights are driven from
# one set of values to the other; the lantern and the windows stay as they are.
LOOKS = {
    "dusk": dict(
        sky=[(0.0, "#e9a79a"), (0.09, "#dd9aa2"), (0.13, "#c592ac"), (0.17, "#9c88bc"),
             (0.22, "#7d7fc0"), (0.28, "#6a76ba"), (1.0, "#5a69b0")],
        sky_strength=1.0, glow="#f2a88c", glow_k=0.45, cool_horizon="#a08db4", stars=0.0,
        cloud_hi="#6f6aa6", cloud_lo="#d99aa6", cloud_opacity=0.5,
        gate_glow=("#f09a7a", "#d98a9a"), gate_glow_s=0.7, hills=[("#1b3440", "#2f5562")],
        world="#a09ab6", world_s=0.95,
        key="#bfc8f2", key_w=3400, rim="#ffaf96", rim_w=2400,
        gate_light="#ffb08a", gate_w=120, lantern="#ffa24a", lantern_w=30,
        window="#ff9a50", window_w=4, fill="#b4a5d6", fill_w=190,
        sword_key="#e6e2f4", sword_rim="#ffc0a0", reflector=("#a9a8d8", "#f2c0a8"), reflector_s=0.5,
        exposure=0.0, look="AgX - Base Contrast",
    ),
    "night": dict(
        sky=[(0.0, "#b0283c"), (0.07, "#8a1f48"), (0.12, "#521a5a"), (0.18, "#1c0c3c"),
             (0.28, "#0a0624"), (1.0, "#040314")],
        sky_strength=1.0, glow="#d8303c", glow_k=0.5, cool_horizon="#3c1858", stars=1.0,
        cloud_hi="#2a1c5c", cloud_lo="#7a2a58", cloud_opacity=0.5,
        gate_glow=("#ff5a48", "#b8306a"), gate_glow_s=1.2, hills=[("#1c1438", "#2a1d50")],
        world="#5a2cc8", world_s=0.36,
        key="#ae7cff", key_w=2300, rim="#ff3a65", rim_w=1700,
        gate_light="#ff4a44", gate_w=160, lantern="#ffa24a", lantern_w=30,
        window="#ff9a50", window_w=4, fill="#8f6fd8", fill_w=160,
        sword_key="#e2dcff", sword_rim="#ff6a5a", reflector=("#b6a0ff", "#ff5a50"), reflector_s=0.5,
        exposure=0.0, look="AgX - Base Contrast",
    ),
}


GLOW_AZ = math.radians(8.0)   # direction of the last daylight, right of +Y


def only_camera(o, glossy=True):
    o.visible_diffuse = False
    o.visible_glossy = glossy
    o.visible_transmission = False
    o.visible_volume_scatter = False
    o.visible_shadow = False


def emit_out(nt, color, strength, alpha=None):
    """Replace the default BSDF with emission (optionally mixed with transparent)."""
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    for n in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
        nt.nodes.remove(n)
    em = node(nt, "ShaderNodeEmission")
    if isinstance(color, bpy.types.NodeSocket):
        link(nt, color, em.inputs[0])
    else:
        em.inputs[0].default_value = (*color[:3], 1)
    if isinstance(strength, bpy.types.NodeSocket):
        link(nt, strength, em.inputs[1])
    else:
        em.inputs[1].default_value = strength
    if alpha is None:
        link(nt, em.outputs[0], out.inputs[0])
        return em
    tr = node(nt, "ShaderNodeBsdfTransparent")
    mx = node(nt, "ShaderNodeMixShader")
    link(nt, alpha, mx.inputs[0])
    link(nt, tr.outputs[0], mx.inputs[1])
    link(nt, em.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs[0])
    return em


def direction(nt):
    """Unit direction from the world origin, its height and its closeness
    (0..1) to the glow azimuth."""
    geo = node(nt, "ShaderNodeNewGeometry")
    nrm = node(nt, "ShaderNodeVectorMath", operation='NORMALIZE')
    link(nt, geo.outputs["Position"], nrm.inputs[0])
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, nrm.outputs[0], sep.inputs[0])
    flat = node(nt, "ShaderNodeCombineXYZ")
    link(nt, sep.outputs["X"], flat.inputs[0])
    link(nt, sep.outputs["Y"], flat.inputs[1])
    fn = node(nt, "ShaderNodeVectorMath", operation='NORMALIZE')
    link(nt, flat.outputs[0], fn.inputs[0])
    dot = node(nt, "ShaderNodeVectorMath", operation='DOT_PRODUCT')
    link(nt, fn.outputs[0], dot.inputs[0])
    dot.inputs[1].default_value = (math.sin(GLOW_AZ), math.cos(GLOW_AZ), 0)
    return nrm.outputs[0], sep.outputs["Z"], dot.outputs["Value"]


def sky_dome(S, L, LN, c):
    R = 600.0
    vs, fs = [], []
    seg, rings = 48, 14
    for j in range(rings + 1):
        el = math.radians(-4 + 94 * j / rings)
        for i in range(seg):
            az = 2 * math.pi * i / seg
            vs.append((R * math.cos(el) * math.sin(az), R * math.cos(el) * math.cos(az), R * math.sin(el)))
    for j in range(rings):
        for i in range(seg):
            a, b = j * seg + i, j * seg + (i + 1) % seg
            fs.append((a, a + seg, b + seg, b))
    m, nt, _ = mat_new("Sky_Gradient")
    d, z, glow = direction(nt)
    low = ramp(nt, [(0.08, (1, 1, 1)), (0.26, (0, 0, 0))])
    link(nt, z, low.inputs[0])
    near = ramp(nt, [(0.55, (0, 0, 0)), (1.0, (1, 1, 1))])
    link(nt, glow, near.inputs[0])
    far = ramp(nt, [(0.2, (1, 1, 1)), (0.8, (0, 0, 0))])
    link(nt, glow, far.inputs[0])

    def gradient(look):
        grad = ramp(nt, [(p, hx(col)) for p, col in look["sky"]])
        link(nt, z, grad.inputs[0])
        col = mix_rgb(nt, math_node(nt, 'MULTIPLY', low.outputs[0], far.outputs[0]), grad.outputs[0], hx(look["cool_horizon"]))
        return mix_rgb(nt, math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', low.outputs[0], near.outputs[0]), look["glow_k"]),
                       col, hx(look["glow"]))

    col = atmosphere.night_mix(nt, c, gradient(L), gradient(LN))
    # stars come out with the night
    scl = node(nt, "ShaderNodeVectorMath", operation='SCALE')
    link(nt, d, scl.inputs[0])
    scl.inputs[3].default_value = 130.0
    vor = node(nt, "ShaderNodeTexVoronoi", feature='F1')
    vor.inputs["Scale"].default_value = 1.0
    link(nt, scl.outputs[0], vor.inputs["Vector"])
    dots = ramp(nt, [(0.035, (1, 1, 1)), (0.085, (0, 0, 0))])
    link(nt, vor.outputs["Distance"], dots.inputs[0])
    tw = ramp(nt, [(0.45, (0, 0, 0)), (1.0, (1, 1, 1))])
    link(nt, vor.outputs["Color"], tw.inputs[0])
    high = ramp(nt, [(0.13, (0, 0, 0)), (0.24, (1, 1, 1))])
    link(nt, z, high.inputs[0])
    out_stars = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', dots.outputs[0], tw.outputs[0]), high.outputs[0])
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', out_stars, atmosphere.night_value(nt, c)), col, (2.4, 2.2, 3.2), 'ADD')
    emit_out(nt, col, L["sky_strength"])
    o = new_obj("Sky_Dome", mesh_from("Sky_Dome", vs, fs, smooth=True, mats=[m]), S)
    only_camera(o)
    return o


def cloud_tile(seed=3, w=1024, h=512):
    """Tileable streaky cloud texture built from filtered noise (wraps in
    both directions), packed into the .blend."""
    rng = np.random.default_rng(seed)
    spec = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None] * h
    kx = np.fft.fftfreq(w)[None, :] * w
    amp = (1 + (kx / 1.3) ** 2 + (ky / 9.0) ** 2) ** -1.25
    f = np.real(np.fft.ifft2(spec * amp))
    f = (f - f.min()) / (f.max() - f.min())
    img = bpy.data.images.new("Cloud_Tile", w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    px = np.empty((h, w, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = f
    px[..., 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def cloud_layer(S, L, LN, c, name, img, radius, period_deg, v_scale, lo, hi, opacity, seed):
    span_deg, e0, e1 = 230.0, 9.0, 47.0
    seg, rows = 72, 10
    vs, fs, uvs = [], [], []
    for j in range(rows + 1):
        el = math.radians(e0 + (e1 - e0) * j / rows)
        for i in range(seg + 1):
            az = math.radians(-span_deg / 2 + span_deg * i / seg)
            vs.append((radius * math.cos(el) * math.sin(az), radius * math.cos(el) * math.cos(az), radius * math.sin(el)))
            uvs.append((i / seg, j / rows))
    for j in range(rows):
        for i in range(seg):
            a = j * (seg + 1) + i
            fs.append((a, a + 1, a + seg + 2, a + seg + 1))
    me = mesh_from(name, vs, fs, smooth=True)
    uv = me.uv_layers.new(name="UVMap")
    for loop in me.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    m, nt, _ = mat_new(f"{name}_Mat")
    tc = node(nt, "ShaderNodeTexCoord")
    mp = node(nt, "ShaderNodeMapping")
    mp.name = "Drift"
    mp.inputs["Scale"].default_value = (span_deg / period_deg, v_scale, 1)
    link(nt, tc.outputs["UV"], mp.inputs["Vector"])
    tex = node(nt, "ShaderNodeTexImage", image=img, extension='REPEAT', interpolation='Cubic')
    link(nt, mp.outputs[0], tex.inputs[0])
    # a still, low-frequency mask shapes the banks; the streaks drift through it
    nz = noise_tex(nt, tc.outputs["Object"], scale=0.0042, detail=2.0, rough=0.5)
    off = node(nt, "ShaderNodeVectorMath", operation='ADD')
    link(nt, tc.outputs["Object"], off.inputs[0])
    off.inputs[1].default_value = (seed * 311.0, seed * 97.0, 0)
    link(nt, off.outputs[0], nz.inputs["Vector"])
    dens = math_node(nt, 'ADD', tex.outputs["Color"], math_node(nt, 'MULTIPLY_ADD', nz.outputs["Factor"], 0.9, -0.45))
    shape = ramp(nt, [(lo, (0, 0, 0)), (hi, (1, 1, 1))])
    link(nt, dens, shape.inputs[0])
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, tc.outputs["UV"], sep.inputs[0])
    fade_v = ramp(nt, [(0.0, (0, 0, 0)), (0.16, (1, 1, 1)), (0.7, (1, 1, 1)), (1.0, (0, 0, 0))])
    link(nt, sep.outputs["Y"], fade_v.inputs[0])
    fade_u = ramp(nt, [(0.0, (0, 0, 0)), (0.08, (1, 1, 1)), (0.92, (1, 1, 1)), (1.0, (0, 0, 0))])
    link(nt, sep.outputs["X"], fade_u.inputs[0])
    a = math_node(nt, 'MULTIPLY', shape.outputs[0], fade_v.outputs[0])
    a = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', a, fade_u.outputs[0]), opacity)
    tint = ramp(nt, [(0.03, hx(L["cloud_lo"])), (0.13, hx(L["cloud_hi"]))])
    link(nt, sep.outputs["Y"], tint.inputs[0])
    tint_n = ramp(nt, [(0.03, hx(LN["cloud_lo"])), (0.13, hx(LN["cloud_hi"]))])
    link(nt, sep.outputs["Y"], tint_n.inputs[0])
    emit_out(nt, atmosphere.night_mix(nt, c, tint.outputs[0], tint_n.outputs[0]), L["sky_strength"] * 0.95, alpha=a)
    me.materials.append(m)
    o = new_obj(name, me, S)
    only_camera(o)
    return mp


def hills(S, L):
    rnd = random.Random(12)
    specs = [  # name, distance, base height, bump, treeline jitter, peak (az deg, width, height)
        ("Hills_Trees", 46.0, 6.3, 1.8, 0.8, (-40.0, 25.0, 2.5)),
        ("Hills_Near", 85.0, 11.5, 5.0, 1.6, (-24.0, 20.0, 7.0)),
        ("Hills_Mid", 150.0, 20.0, 8.0, 1.6, (34.0, 18.0, 12.0)),
        ("Hills_Far", 300.0, 26.0, 12.0, 1.5, (1.5, 9.0, 40.0)),
    ]
    for k, (name, D, base, bump, jit, (paz, pw, ph)) in enumerate(specs):
        seg = 230 if k == 0 else 120
        vs, fs = [], []
        for i in range(seg + 1):
            az = -115 + 230 * i / seg
            a = math.radians(az)
            h = base + bump * noise.noise((az * 0.045 + k * 10, k * 3.1, 0.0)) \
                + bump * 0.4 * noise.noise((az * 0.16, k * 7.0, 2.0)) \
                + ph * math.exp(-((az - paz) / pw) ** 2) + rnd.uniform(-jit, jit)
            d = Vector((math.sin(a), math.cos(a), 0))
            for dist, hz in ((0.94, -3.0), (0.985, h * 0.5 + rnd.uniform(-jit, jit)), (1.0, h),
                             (1.07, h * 0.75)):
                p = d * (D * dist * (1 + rnd.uniform(-0.006, 0.006)))
                vs.append((p.x, p.y, hz))
        for i in range(seg):
            for r in range(3):
                a = i * 4 + r
                fs.append((a, a + 1, a + 5, a + 4))
        m, nt, _ = mat_new(f"{name}_Mat")
        geo = node(nt, "ShaderNodeNewGeometry")
        dot = node(nt, "ShaderNodeVectorMath", operation='DOT_PRODUCT')
        link(nt, geo.outputs["Normal"], dot.inputs[0])
        dot.inputs[1].default_value = Vector((-0.5, -0.4, 0.75)).normalized()
        hk = L["hills"][max(0, k - 1)]
        dark = 0.8 if k == 0 else 1.0
        lit = ramp(nt, [(0.1, tuple(v * dark for v in hx(hk[0]))), (0.85, tuple(v * dark for v in hx(hk[1])))])
        link(nt, dot.outputs["Value"], lit.inputs[0])
        emit_out(nt, lit.outputs[0], L["sky_strength"])
        o = new_obj(name, mesh_from(name, vs, fs, mats=[m]), S)
        only_camera(o)


def haze_band(S, L, name, radius, height, alpha, warm):
    seg = 48
    vs, fs, uvs = [], [], []
    for j, z in enumerate((-1.0, height)):
        for i in range(seg + 1):
            a = math.radians(-115 + 230 * i / seg)
            vs.append((radius * math.sin(a), radius * math.cos(a), z))
            uvs.append((i / seg, j))
    for i in range(seg):
        fs.append((i, i + 1, i + seg + 2, i + seg + 1))
    me = mesh_from(name, vs, fs, smooth=True)
    uv = me.uv_layers.new(name="UVMap")
    for loop in me.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    m, nt, _ = mat_new(f"{name}_Mat")
    tc = node(nt, "ShaderNodeTexCoord")
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, tc.outputs["UV"], sep.inputs[0])
    fall = ramp(nt, [(0.0, (alpha,) * 3), (1.0, (0, 0, 0))], interp='EASE')
    link(nt, sep.outputs["Y"], fall.inputs[0])
    _, _, glow = direction(nt)
    near = ramp(nt, [(0.5, (0, 0, 0)), (1.0, (1, 1, 1))])
    link(nt, glow, near.inputs[0])
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', near.outputs[0], warm), hx(L["haze"]), hx(L["haze_warm"]))
    emit_out(nt, col, L["sky_strength"] * 0.9, alpha=fall.outputs[0])
    me.materials.append(m)
    o = new_obj(name, me, S)
    only_camera(o)


def area(name, c, loc, target, size, power, color, size_y=None, camera=False):
    li = bpy.data.lights.new(name, 'AREA')
    li.energy, li.color = power, color
    li.shape = 'RECTANGLE' if size_y else 'SQUARE'
    li.size = size
    if size_y:
        li.size_y = size_y
    o = new_obj(name, li, c, loc=loc)
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    o.visible_camera = camera
    return o


def build(variant, blade_info=None):
    L, LN = LOOKS['dusk'], LOOKS['night']
    S = coll("Sky")
    Li = coll("Lighting")
    c = atmosphere.control(variant)
    sky_dome(S, L, LN, c)
    img = cloud_tile()
    drift = [cloud_layer(S, L, LN, c, "Clouds_Near", img, 230.0, 12.0, 1.5, 0.50, 0.66, L["cloud_opacity"], 1),
             cloud_layer(S, L, LN, c, "Clouds_Far", img, 250.0, 6.0, 2.4, 0.54, 0.70, L["cloud_opacity"] * 0.7, 2)]
    atmosphere.backdrop(S, c)
    # last daylight seen through the gate slats; at night, the red of the horizon
    m, nt, _ = mat_new("Gate_Glow_Mat")
    tc = node(nt, "ShaderNodeTexCoord")
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, tc.outputs["Generated"], sep.inputs[0])
    g = ramp(nt, [(0.0, hx(L["gate_glow"][0])), (0.55, hx(L["gate_glow"][1])), (1.0, hx(L["hills"][0][0]))])
    link(nt, sep.outputs["Z"], g.inputs[0])
    gn = ramp(nt, [(0.0, hx(LN["gate_glow"][0])), (0.55, hx(LN["gate_glow"][1])), (1.0, hx(LN["hills"][0][0]))])
    link(nt, sep.outputs["Z"], gn.inputs[0])
    emit_out(nt, atmosphere.night_mix(nt, c, g.outputs[0], gn.outputs[0]), L["gate_glow_s"])
    card = new_obj("Gate_Glow", mesh_from("Gate_Glow", [(-2.4, 0, -0.2), (2.4, 0, -0.2), (2.4, 0, 3.0), (-2.4, 0, 3.0)],
                                          [(0, 1, 2, 3)], mats=[m]), S, loc=(GATE.x, GATE.y + 2.6, 0))
    only_camera(card)

    # world: flat cool ambient, kept apart from how the dome looks on camera
    w = bpy.data.worlds.new("Dusk_To_Night")
    w.use_nodes = True
    wt = w.node_tree
    bg = wt.nodes.get("Background")
    bg.inputs[0].default_value = hx(L["world"], 1)
    # More light from overhead than from the horizon: tops of stones and
    # boulders are lit and their sides fall away, as in the paintings.
    wc = wt.nodes.new("ShaderNodeTexCoord")
    wsep = wt.nodes.new("ShaderNodeSeparateXYZ")
    wt.links.new(wc.outputs["Generated"], wsep.inputs[0])
    wr = wt.nodes.new("ShaderNodeMapRange")
    wr.inputs[1].default_value, wr.inputs[2].default_value = -0.1, 0.9
    wr.inputs[3].default_value, wr.inputs[4].default_value = 0.45, 1.6
    wt.links.new(wsep.outputs["Z"], wr.inputs[0])
    wv = wt.nodes.new("ShaderNodeValue")
    wv.name = "World_Strength"
    wv.outputs[0].default_value = L["world_s"]
    wm = wt.nodes.new("ShaderNodeMath")
    wm.operation = 'MULTIPLY'
    wt.links.new(wr.outputs[0], wm.inputs[0])
    wt.links.new(wv.outputs[0], wm.inputs[1])
    wt.links.new(wm.outputs[0], bg.inputs[1])
    bpy.context.scene.world = w

    area("Sky_Key", Li, (-8.0, 8.0, 15.0), (0.5, 9.5, 0.0), 7.0, L["key_w"], hx(L["key"]))
    area("Sunset_Rim", Li, (7.0, 27.0, 8.5), (0.0, 7.0, 0.0), 9.0, L["rim_w"], hx(L["rim"]), size_y=4.0)
    area("Veranda_Fill", Li, (-1.5, 3.6, 3.4), (-1.0, 10.0, 0.8), 5.0, L["fill_w"], hx(L["fill"]), size_y=2.0)
    area("Gate_Spill", Li, (GATE.x, GATE.y + 1.0, 1.3), (GATE.x - 0.6, 6.0, 0.0), 2.4, L["gate_w"], hx(L["gate_light"]), size_y=1.8)
    lz = gh(LANTERN.x, LANTERN.y) - 0.04 + lantern_z(1.19) * LANTERN_SCALE
    # a lamp in the room behind the seat: without it the veranda's timber is a black void
    lamp = bpy.data.lights.new("Room_Lamp", 'POINT')
    lamp.energy, lamp.color, lamp.shadow_soft_size = 105.0, (1.0, 0.62, 0.34), 0.5
    new_obj("Room_Lamp", lamp, Li, loc=(0.4, -0.7, 2.45))
    pl = bpy.data.lights.new("Lantern_Light", 'POINT')
    pl.energy, pl.color, pl.shadow_soft_size = L["lantern_w"], hx(L["lantern"]), 0.22
    new_obj("Lantern_Light", pl, Li, loc=(LANTERN.x, LANTERN.y, lz))
    for i in (0, 1):
        yc = FACADE_Y0 + (i + 0.5) * BAY
        area(f"Window_Spill_{i}", Li, (FACADE_X + 0.072, yc, 1.8), (FACADE_X - 2.0, yc, 0.9), 1.3,
             L["window_w"], hx(L["window"]), size_y=1.2)
    for name,k in (("Sky_Key","key"),("Sunset_Rim","rim"),("Veranda_Fill","fill"),("Gate_Spill","gate")):
        light=bpy.data.lights[name]
        wkey={"key":"key_w","rim":"rim_w","fill":"fill_w","gate":"gate_w"}[k]
        ckey="gate_light" if k=="gate" else k
        atmosphere.drive(light,"energy",c,LOOKS["dusk"][wkey],LOOKS["night"][wkey])
        for i,(a,b) in enumerate(zip(hx(LOOKS["dusk"][ckey]),hx(LOOKS["night"][ckey]))):
            atmosphere.drive(light,"color",c,a,b,index=i)
    atmosphere.drive(wv.outputs[0],"default_value",c,LOOKS["dusk"]["world_s"],LOOKS["night"]["world_s"])
    for i,(a,b) in enumerate(zip(hx(LOOKS["dusk"]["world"]),hx(LOOKS["night"]["world"]))):
        atmosphere.drive(bg.inputs[0],"default_value",c,a,b,index=i)
    for em in card.data.materials[0].node_tree.nodes:
        if em.type=='EMISSION':
            atmosphere.drive(em.inputs[1],"default_value",c,L["gate_glow_s"],LN["gate_glow_s"])
    return dict(look=L, drift=drift, lantern_light=pl, control=c, variant=variant)


def blade_reflector(variant, sword_rot, sword_loc, blade_mid_local):
    """Two soft cards that only reflections can see. Each sits where one blade
    plane mirrors the eye: a cool gradient for the broad face and a warm one
    for the bevel, so a clean highlight runs the length of the blade."""
    L = LOOKS['dusk']
    Li = coll("Lighting")
    mid = Vector(sword_loc) + sword_rot @ Vector(blade_mid_local)
    along = sword_rot @ Vector((0, 0, 1))
    view = (mid - EYE).normalized()
    out = []
    for name, n_local, col, size, strength in (
            ("Blade_Reflector_Cool", (1.0, -0.03, 0.0), L["reflector"][0], 2.2, L["reflector_s"]),
            ("Blade_Reflector_Warm", (0.965, 0.262, 0.0), L["reflector"][1], 1.3, L["reflector_s"] * 1.5)):
        n = (sword_rot @ Vector(n_local)).normalized()
        if n.dot(view) > 0:
            n = -n
        r = view - 2 * view.dot(n) * n
        # card X follows the blade, so the gradient travels along its length
        x = (along - r * along.dot(r)).normalized()
        y = r.cross(x)
        m, nt, _ = mat_new(f"{name}_Mat")
        tc = node(nt, "ShaderNodeTexCoord")
        sep = node(nt, "ShaderNodeSeparateXYZ")
        link(nt, tc.outputs["Generated"], sep.inputs[0])
        c = hx(col)
        g = ramp(nt, [(0.0, (0, 0, 0)), (0.3, tuple(v * 0.25 for v in c)), (0.58, c), (0.72, tuple(v * 1.6 for v in c)),
                      (0.86, tuple(v * 0.3 for v in c)), (1.0, (0, 0, 0))])
        link(nt, sep.outputs["X"], g.inputs[0])
        em=emit_out(nt, g.outputs[0], strength)
        atmosphere.drive(em.inputs[1],'default_value',bpy.data.objects['Dusk_Control'],strength,strength*0.65)
        o = new_obj(name, mesh_from(name, [(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)],
                                    [(0, 1, 2, 3)], mats=[m]), Li, loc=mid + r * 2.4)
        from mathutils import Matrix
        o.rotation_euler = Matrix((x, y, r)).transposed().to_euler()
        o.visible_camera = False
        o.visible_diffuse = False
        o.visible_shadow = False
        out.append(o)
    # two small lights that only the sword receives, so the grip and guard read
    K = bpy.data.collections["Katana"]
    grip = Vector(sword_loc)
    for name, loc, power, col, size in (("Katana_Key", EYE + Vector((-0.55, 0.05, 0.45)), 7.0, L["sword_key"], 0.7),
                                        ("Katana_Rim", grip + Vector((0.9, 0.9, 0.5)), 5.0, L["sword_rim"], 0.4)):
        lo = area(name, Li, loc, grip + along * 0.25, size, power, hx(col))
        lo.light_linking.receiver_collection = K
        atmosphere.drive(lo.data,'energy',bpy.data.objects['Dusk_Control'],power,power*0.65)
    return out
