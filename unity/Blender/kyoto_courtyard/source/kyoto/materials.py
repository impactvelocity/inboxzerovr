"""Palettes and surface materials. Sky, cloud and haze shaders live in sky.py."""
from .common import (hx, link, mat_new, math_node, mix_rgb, noise_tex, node,
                     ramp, set_in)

# One palette: the surfaces are the same at dusk and at night, and the light
# supplies the change. Colours lean warm and muted (mauve-grey stone and
# plaster, olive moss) the way the reference paintings do; blue belongs to the
# sky, the hills and the roof tiles.
PALETTES = {
    "dusk": dict(
        timber=("#3a2c32", "#5a444c"), deck=("#33252a", "#523d44"),
        facade=("#3c2c30", "#5a4246"),
        plaster=("#7c6c6c", "#907e7c", "#9e8c86"), wall_base=("#514a55", "#6b6470"),
        stone=("#514b5b", "#7c7083"), boulder=("#453e46", "#5e555e"), lantern_stone=("#756a6a", "#978b88"),
        ground=("#353444", "#484656"), puddle="#262839",
        moss=("#343d2c", "#626b3e"), bark=("#342c36", "#69515c"),
        blossom=("#d27fae", "#e895be", "#f6aecb", "#ffd0e0"), blossom_under="#a8608e",
        blossom_glow=0.08, petal="#e8a4c2",
        leaf=("#4a5638", "#667048", "#868c58"), reed=("#5a5f36", "#8a8a4c"),
        pine=("#263a30", "#3d5642"), tile=("#4a4f66", "#585e76", "#696f88"),
        paper="#e8935a", paper_dim="#9a5540", paper_lit_s=0.24, paper_dim_s=0.09,
        lantern="#ffa446", lantern_s=3.2,
        steel="#b9bccb", bevel="#d5d8e4", iron="#59452f", brass="#94703c",
        wrap="#1c1b28", cream="#e2d2a4", red="#9d3424",
    ),
}
PALETTES["night"] = dict(PALETTES["dusk"])

M = {}


def _vary(nt):
    """Per-object 0..1 random."""
    return node(nt, "ShaderNodeObjectInfo").outputs["Random"]


def mottle(nt, col, amount=0.12, scale=2.4):
    """Broad, soft patches a touch warmer and lighter or cooler and darker,
    as a brush leaves them; in world space, so it runs across joined pieces."""
    geo = node(nt, "ShaderNodeNewGeometry")
    n = noise_tex(nt, geo.outputs["Position"], scale=scale, detail=1.5, rough=0.5)
    cr = ramp(nt, [(0.28, (1 - amount, 1 - amount * 0.92, 1 - amount * 0.7)),
                   (0.72, (1 + amount, 1 + amount * 0.88, 1 + amount * 0.65))])
    link(nt, n.outputs["Factor"], cr.inputs[0])
    return mix_rgb(nt, 1.0, col, cr.outputs[0], 'MULTIPLY')


def timber(name, dark, light, rough, coat=0.0):
    m, nt, b = mat_new(name)
    attr = node(nt, "ShaderNodeAttribute", attribute_name="grain")
    rnd = _vary(nt)
    add = node(nt, "ShaderNodeVectorMath", operation='ADD')
    link(nt, attr.outputs["Vector"], add.inputs[0])
    link(nt, math_node(nt, 'MULTIPLY', rnd, 41.0), add.inputs[1])
    n = noise_tex(nt, add.outputs[0], scale=15.0, detail=2.0, rough=0.55)
    grain = ramp(nt, [(0.40, hx(dark)), (0.62, hx(light))])
    link(nt, n.outputs["Factor"], grain.inputs[0])
    tone = ramp(nt, [(0.0, (0.68, 0.68, 0.70)), (1.0, (1.18, 1.12, 1.10))])
    link(nt, rnd, tone.inputs[0])
    col = mix_rgb(nt, 1.0, grain.outputs[0], tone.outputs[0], 'MULTIPLY')
    cut = node(nt, "ShaderNodeAttribute", attribute_name="endcut")
    col = mottle(nt, mix_rgb(nt, cut.outputs["Fac"], col, (0.035, 0.026, 0.03)), 0.07)
    bump = node(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    link(nt, n.outputs["Factor"], bump.inputs["Height"])
    link(nt, bump.outputs[0], b.inputs["Normal"])
    r = node(nt, "ShaderNodeMapRange")
    r.inputs[3].default_value, r.inputs[4].default_value = rough - 0.07, rough + 0.08
    link(nt, n.outputs["Factor"], r.inputs[0])
    set_in(b, color=col, rough=r.outputs[0], coat=coat, coat_rough=0.25)
    M[name] = m
    return m


def two_tone(name, tones, rough, scale=1.2, coords="Object", vary=0.12,
             bump=0.0, wet=None):
    """Broad noise between two or three muted tones. wet=(mask_lo, mask_hi,
    rough_wet, darken, top_only) lowers roughness and value in patches."""
    m, nt, b = mat_new(name)
    tc = node(nt, "ShaderNodeTexCoord")
    rnd = _vary(nt)
    add = node(nt, "ShaderNodeVectorMath", operation='ADD')
    link(nt, tc.outputs[coords], add.inputs[0])
    link(nt, math_node(nt, 'MULTIPLY', rnd, 23.0), add.inputs[1])
    n = noise_tex(nt, add.outputs[0], scale=scale, detail=2.5, rough=0.55)
    cols = [hx(t) for t in tones]
    if len(cols) == 2:
        stops = [(0.33, cols[0]), (0.68, cols[1])]
    else:
        stops = [(0.30, cols[0]), (0.5, cols[1]), (0.72, cols[2])]
    cr = ramp(nt, stops)
    link(nt, n.outputs["Factor"], cr.inputs[0])
    col = cr.outputs[0]
    if vary:
        tone = ramp(nt, [(0.0, (1 - vary,) * 3), (1.0, (1 + vary,) * 3)])
        link(nt, rnd, tone.inputs[0])
        col = mix_rgb(nt, 1.0, col, tone.outputs[0], 'MULTIPLY')
    col = mottle(nt, col)
    rough_out = rough
    if wet:
        lo, hi, rough_wet, darken, top_only = wet
        n2 = noise_tex(nt, add.outputs[0], scale=scale * 0.55, detail=3.0, rough=0.6)
        mask = ramp(nt, [(lo, (0, 0, 0)), (hi, (1, 1, 1))])
        link(nt, n2.outputs["Factor"], mask.inputs[0])
        fac = mask.outputs[0]
        if top_only:
            geo = node(nt, "ShaderNodeNewGeometry")
            sep = node(nt, "ShaderNodeSeparateXYZ")
            link(nt, geo.outputs["Normal"], sep.inputs[0])
            up = ramp(nt, [(0.55, (0, 0, 0)), (0.9, (1, 1, 1))])
            link(nt, sep.outputs["Z"], up.inputs[0])
            fac = math_node(nt, 'MULTIPLY', fac, up.outputs[0])
        col = mix_rgb(nt, fac, col, mix_rgb(nt, 1.0, col, (darken,) * 3, 'MULTIPLY'))
        mr = node(nt, "ShaderNodeMapRange")
        mr.inputs[3].default_value, mr.inputs[4].default_value = rough, rough_wet
        link(nt, fac, mr.inputs[0])
        rough_out = mr.outputs[0]
    if bump:
        bp = node(nt, "ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        link(nt, n.outputs["Factor"], bp.inputs["Height"])
        link(nt, bp.outputs[0], b.inputs["Normal"])
    set_in(b, color=col, rough=rough_out)
    M[name] = m
    return m


def foliage(name, tones, under, rough=0.7, glow=0.0, island=True):
    """Matte colour that varies per cluster and per blob, darker underneath."""
    m, nt, b = mat_new(name)
    rnd = _vary(nt)
    geo = node(nt, "ShaderNodeNewGeometry")
    v = math_node(nt, 'MULTIPLY', rnd, 0.62)
    if island:
        v = math_node(nt, 'ADD', v, math_node(nt, 'MULTIPLY', geo.outputs["Random Per Island"], 0.38))
    cols = [hx(t) for t in tones]
    n = len(cols)
    # the last (palest) tone is kept for the top slice only
    stops = [(i / (n - 1) * 0.82 if i < n - 1 else 0.97, c) for i, c in enumerate(cols)]
    cr = ramp(nt, stops)
    link(nt, v, cr.inputs[0])
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, geo.outputs["Normal"], sep.inputs[0])
    up = ramp(nt, [(0.18, (0, 0, 0)), (0.75, (1, 1, 1))])
    link(nt, math_node(nt, 'MULTIPLY_ADD', sep.outputs["Z"], 0.5, 0.5), up.inputs[0])
    col = mix_rgb(nt, up.outputs[0], hx(under), cr.outputs[0])
    set_in(b, color=col, rough=rough, spec=0.25)
    if glow:
        set_in(b, emit=col, emit_s=glow)
    M[name] = m
    return m


def simple(name, color, rough, metal=0.0, emit=None, emit_s=0.0, spec=0.5):
    m, nt, b = mat_new(name)
    set_in(b, color=hx(color), rough=rough, metal=metal, spec=spec)
    if emit:
        set_in(b, emit=hx(emit), emit_s=emit_s)
    M[name] = m
    return m


def ground(pal):
    """Courtyard earth. The paintable `Wetness` colour attribute on the mesh
    darkens it and drops the roughness; fine noise breaks the edge up."""
    m, nt, b = mat_new("Ground_Wet")
    geo = node(nt, "ShaderNodeNewGeometry")
    n = noise_tex(nt, geo.outputs["Position"], scale=0.9, detail=3.0, rough=0.6)
    cr = ramp(nt, [(0.3, hx(pal["ground"][0])), (0.7, hx(pal["ground"][1]))])
    link(nt, n.outputs["Factor"], cr.inputs[0])
    wet = node(nt, "ShaderNodeAttribute", attribute_name="Wetness")
    n2 = noise_tex(nt, geo.outputs["Position"], scale=2.3, detail=3.0, rough=0.65)
    f = math_node(nt, 'ADD', wet.outputs["Fac"],
                  math_node(nt, 'MULTIPLY_ADD', n2.outputs["Factor"], 0.5, -0.02))
    mask = ramp(nt, [(0.45, (0, 0, 0)), (0.8, (1, 1, 1))])
    link(nt, f, mask.inputs[0])
    col = mix_rgb(nt, mask.outputs[0], cr.outputs[0],
                  mix_rgb(nt, 1.0, cr.outputs[0], (0.82, 0.82, 0.86), 'MULTIPLY'))
    mr = node(nt, "ShaderNodeMapRange")
    mr.inputs[3].default_value, mr.inputs[4].default_value = 0.82, 0.42
    link(nt, mask.outputs[0], mr.inputs[0])
    bp = node(nt, "ShaderNodeBump")
    n3 = noise_tex(nt, geo.outputs["Position"], scale=42.0, detail=2.0, rough=0.5)
    link(nt, n3.outputs["Factor"], bp.inputs["Height"])
    # gravel bump fades out where the ground is wet
    link(nt, math_node(nt, 'MULTIPLY_ADD', mask.outputs[0], -0.12, 0.14), bp.inputs["Strength"])
    link(nt, bp.outputs[0], b.inputs["Normal"])
    standing=node(nt,'ShaderNodeAttribute',attribute_name='StandingWater')
    col=mix_rgb(nt,standing.outputs['Fac'],col,hx(pal["puddle"]))
    # standing water reflects softly; the shore blends into the wet ground
    wr=node(nt,'ShaderNodeMix'); wr.data_type='FLOAT'
    link(nt,standing.outputs['Fac'],wr.inputs[0]); link(nt,mr.outputs[0],wr.inputs[2])
    wr.inputs[3].default_value=0.14       # a soft sheen of the sky, not a mirror
    water_rough=wr.outputs[0]
    moss=node(nt,'ShaderNodeAttribute',attribute_name='MossCoverage')
    mn=noise_tex(nt,geo.outputs['Position'],scale=5.0,detail=2.0,rough=0.65)
    mc=ramp(nt,[(0.2,hx(pal['moss'][0])),(0.8,hx(pal['moss'][1]))])
    link(nt,mn.outputs['Factor'],mc.inputs[0])
    col=mix_rgb(nt,moss.outputs['Fac'],col,mc.outputs[0])
    mr2=node(nt,'ShaderNodeMix'); mr2.data_type='FLOAT'
    link(nt,moss.outputs['Fac'],mr2.inputs[0]); link(nt,water_rough,mr2.inputs[2]); mr2.inputs[3].default_value=0.95
    set_in(b, color=col, rough=mr2.outputs[0], spec=0.4)
    # Continuous normals at the wet shore, with a very small animated surface drift.
    nt.links.remove(next(l for l in nt.links if l.to_socket==b.inputs['Normal']))
    water_noise=noise_tex(nt,geo.outputs['Position'],scale=2.8,detail=1.0,dims='4D')
    water_noise.name='Water_Drift'
    water_bump=node(nt,'ShaderNodeBump')
    water_bump.inputs['Distance'].default_value=0.002
    water_bump.inputs['Strength'].default_value=0.04
    bp.inputs['Distance'].default_value=0.015
    link(nt,math_node(nt,'MULTIPLY_ADD',standing.outputs['Fac'],-0.10,0.10),bp.inputs['Strength'])
    link(nt,bp.outputs[0],water_bump.inputs['Normal'])
    link(nt,math_node(nt,'MULTIPLY',standing.outputs['Fac'],0.04),water_bump.inputs['Strength'])
    link(nt,water_noise.outputs['Factor'],water_bump.inputs['Height'])
    link(nt,water_bump.outputs[0],b.inputs['Normal'])
    M["Ground_Wet"] = m
    return m


def puddle(name, pal, ripple=False):
    """Standing water. With ripple, concentric waves travel out from the
    object origin; animate.py keys the Wave phase for the loop."""
    m, nt, b = mat_new(name)
    set_in(b, color=hx(pal["puddle"]), rough=0.23, spec=0.50)
    tc = node(nt, "ShaderNodeTexCoord")
    bp = node(nt, "ShaderNodeBump")
    bp.inputs["Distance"].default_value = 0.004
    if ripple:
        w = node(nt, "ShaderNodeTexWave", wave_type='RINGS', rings_direction='SPHERICAL')
        w.name = "Ripple"
        w.inputs["Scale"].default_value = 2.0
        w.inputs["Distortion"].default_value = 0.6
        w.inputs["Detail"].default_value = 1.0
        link(nt, tc.outputs["Object"], w.inputs["Vector"])
        bp.inputs["Strength"].default_value = 0.008
        link(nt, w.outputs["Fac"] if "Fac" in w.outputs else w.outputs[1], bp.inputs["Height"])
    else:
        n = noise_tex(nt, tc.outputs["Object"], scale=3.0, detail=1.0)
        bp.inputs["Strength"].default_value = 0.005
        link(nt, n.outputs["Factor"], bp.inputs["Height"])
    link(nt, bp.outputs[0], b.inputs["Normal"])
    M[name] = m
    return m


def paper(name, color, strength):
    m, nt, b = mat_new(name)
    tc = node(nt, "ShaderNodeTexCoord")
    n = noise_tex(nt, tc.outputs["Object"], scale=1.4, detail=1.0)
    s = node(nt, "ShaderNodeMapRange")
    s.inputs[3].default_value, s.inputs[4].default_value = strength * 0.7, strength * 1.2
    link(nt, n.outputs["Factor"], s.inputs[0])
    set_in(b, color=hx(color), rough=0.85, emit=hx(color), emit_s=s.outputs[0])
    M[name] = m
    return m


def build(pal):
    M.clear()
    timber("Timber_Dark", *pal["timber"], rough=0.62)
    timber("Timber_Deck", *pal["deck"], rough=0.5, coat=0.12)
    timber("Timber_Facade", *pal["facade"], rough=0.68)
    two_tone("Plaster", pal["plaster"], rough=0.86, scale=0.7, vary=0.05)
    two_tone("Stone_Base", pal["wall_base"], rough=0.82, scale=1.5, vary=0.14)
    two_tone("Stone_Dry", pal["stone"], rough=0.84, scale=1.4, vary=0.08, bump=0.025)
    two_tone("Boulder", pal["boulder"], rough=0.86, scale=1.2, vary=0.1, bump=0.03)
    two_tone("Stone_Wet", pal["stone"], rough=0.8, scale=1.4, vary=0.12,
             wet=(0.30, 0.52, 0.3, 0.82, True))
    two_tone("Lantern_Stone", pal["lantern_stone"], rough=0.88, scale=3.0, vary=0.08, bump=0.04)
    two_tone("Moss", pal["moss"], rough=0.93, scale=2.2, vary=0.18, coords="Object", bump=0.045)
    two_tone("Bark", pal["bark"], rough=0.82, scale=1.1, vary=0.0, bump=0.035)
    two_tone("Reed", pal["reed"], rough=0.6, scale=0.8, vary=0.2)
    foliage("Blossom", pal["blossom"], pal["blossom_under"], rough=0.75, glow=pal["blossom_glow"])
    foliage("Leaf", pal["leaf"], "#2c3626", rough=0.6)
    foliage("Pine", pal["pine"] + (pal["pine"][1],), "#0e1a18", rough=0.75)
    simple("Petal", pal["petal"], 0.6, emit=pal["petal"], emit_s=pal["blossom_glow"] * 0.5)
    # roof tile: per-tile tone, glazed enough to hold a soft highlight
    m, nt, b = mat_new("Roof_Tile")
    cr = ramp(nt, [(0.0, hx(pal["tile"][0])), (0.5, hx(pal["tile"][1])), (1.0, hx(pal["tile"][2]))])
    link(nt, _vary(nt), cr.inputs[0])
    set_in(b, color=cr.outputs[0], rough=0.5, spec=0.4)
    M["Roof_Tile"] = m
    simple("Gutter_Metal", pal["tile"][0], 0.5, metal=0.7)
    ground(pal)
    two_tone("Ground_Outer", pal["ground"], rough=0.9, scale=0.05, vary=0.0, coords="Object")
    puddle("Puddle", pal)
    puddle("Puddle_Ripple", pal, ripple=True)
    paper("Paper_Lit", pal["paper"], pal["paper_lit_s"])
    paper("Paper_Dim", pal["paper_dim"], pal["paper_dim_s"])
    paper("Paper_Lantern", pal["lantern"], pal["lantern_s"])
    simple("Blade_Steel", pal["steel"], 0.45, metal=0.7)
    simple("Blade_Bevel", pal["bevel"], 0.36, metal=0.7)
    simple("Iron_Guard", pal["iron"], 0.5, metal=0.55)
    simple("Brass_Collar", pal["brass"], 0.4, metal=1.0)
    simple("Grip_Wrap", pal["wrap"], 0.78)
    simple("Grip_Cream", pal["cream"], 0.7)
    simple("Grip_Red", pal["red"], 0.72)
    # Broad mineral colour planes reinforce the chiselled silhouettes without
    # adding noisy bump or putting the same brush streak on every material.
    for name in ('Stone_Wet','Boulder'):
        nt=M[name].node_tree; bsdf=nt.nodes.get('Principled BSDF')
        source=bsdf.inputs['Base Color'].links[0].from_socket
        attr=node(nt,'ShaderNodeAttribute',attribute_name='StoneFacet')
        link(nt,mix_rgb(nt,1.0,source,attr.outputs['Fac'],'MULTIPLY'),bsdf.inputs['Base Color'])
    return M
