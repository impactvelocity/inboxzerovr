"""Painted distant landscape and a separately controllable 60-second dusk fade.

Only the distant landscape is a card. Courtyard objects remain real geometry.
The packed 2K panorama covers the seated forward view, not a full 360 HDRI.
"""
import math
from pathlib import Path
import bpy
import numpy as np
from .common import coll, empty, mesh_from, new_obj, node, link, finish_curves


def control(variant):
    obj=empty('Dusk_Control',coll('Atmosphere_Control'))
    obj['Night']=1.0 if variant=='night' else 0.0
    obj.id_properties_ui('Night').update(min=0.0,max=1.0,description='0 = soft twilight; 1 = blue hour. Animated in dusk scene.')
    obj['Notes']='60s scene: hold twilight 5s, fade to blue hour by 48s, hold 12s. Wind repeats every 12s.'
    if variant=='dusk':
        for f,v in ((1,0.0),(121,0.0),(1153,1.0),(1441,1.0)):
            obj['Night']=v
            obj.keyframe_insert(data_path='["Night"]',frame=f)
        finish_curves(obj,cyclic=False)
    return obj


def drive(owner,path,c,a,b,index=None):
    fc=owner.driver_add(path) if index is None else owner.driver_add(path,index)
    d=fc.driver
    d.type='SCRIPTED'
    v=d.variables.new(); v.name='night'; v.type='SINGLE_PROP'
    v.targets[0].id=c; v.targets[0].data_path='["Night"]'
    d.expression=f'{a:.8f} + ({b-a:.8f}) * night'


def night_mix(nt, c, a, b):
    """Colour `a` at dusk fading to colour `b` at night."""
    mx = node(nt, 'ShaderNodeMixRGB')
    mx.blend_type = 'MIX'
    drive(mx.inputs[0], 'default_value', c, 0.0, 1.0)
    link(nt, a, mx.inputs[1])
    link(nt, b, mx.inputs[2])
    return mx.outputs[0]


def night_value(nt, c):
    """A socket that runs 0..1 with the night."""
    v = node(nt, 'ShaderNodeValue')
    drive(v.outputs[0], 'default_value', c, 0.0, 1.0)
    return v.outputs[0]


BACKDROP_SATURATION = 1.12
BACKDROP_VALUE = 0.84          # a little deeper than painted, to sit with the reference's sky


def _linear(image):
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    rgb = px.reshape(h, w, 4)[..., :3]
    if not image.is_float:                       # byte images hand back sRGB values
        rgb = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return rgb.astype(np.float32)


def dusk_pixels(image):
    """The painted distance as the dusk scene shows it (scene-linear, h x w x 3)."""
    rgb = _linear(image)
    grey = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    return np.clip(grey[..., None] + (rgb - grey[..., None]) * BACKDROP_SATURATION, 0, None) * BACKDROP_VALUE


def night_pixels(image):
    """The same painting regraded for night: indigo sky, the mountains as
    purple silhouettes, the pink of the horizon turned to a red glow, stars."""
    rgb = _linear(image)
    h, w, _ = rgb.shape
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    warm = np.clip((rgb[..., 0] - rgb[..., 2]) / (rgb[..., 0] + rgb[..., 2] + 1e-4) * 2.4 + 0.15, 0, 1)
    warm = warm * warm * (3 - 2 * warm)
    sky = np.array([0.0075, 0.0025, 0.030], dtype=np.float32) * (0.25 + lum / 0.22)[..., None]
    glow = np.array([0.32, 0.026, 0.095], dtype=np.float32) * (lum / 0.42)[..., None]
    night = sky * (1 - warm[..., None]) + glow * warm[..., None]
    # Atmospheric violet separates the distant mountain layers at night.
    night += np.array([0.0045,0.0015,0.010],dtype=np.float32)*np.clip((0.25-lum)/0.25,0,1)[...,None]
    rng = np.random.default_rng(11)
    height = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    stars = (rng.random((h, w)) > 0.9991) & (height > 0.5) & (warm < 0.15) & (lum > 0.07)
    night[stars] += np.array([0.75, 0.7, 0.95], dtype=np.float32) * rng.uniform(0.25, 1.0, size=(int(stars.sum()), 1)).astype(np.float32)
    return night


def night_painting(image):
    """A packed image of night_pixels, for the scene's own material."""
    lin = night_pixels(image)
    h, w, _ = lin.shape
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 0, 1), 1 / 2.4) - 0.055)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = srgb
    out = bpy.data.images.new('Kyoto_Painted_Night', w, h, alpha=False)
    out.pixels.foreach_set(px.ravel())
    out.pack()
    return out


def backdrop(S,c):
    path=Path(__file__).resolve().parent.parent/'assets'/'kyoto_twilight_backdrop.png'
    image=bpy.data.images.load(str(path),check_existing=True)
    image.name='Kyoto_Painted_Twilight_2172px'; image.pack()
    radius,span,center=280.0,140.0,-12.0
    vs,fs,uvs=[],[],[]
    seg,rows=80,16
    for j in range(rows+1):
        el=math.radians(-6.25+39.2*j/rows)
        for i in range(seg+1):
            az=math.radians(center-span/2+span*i/seg)
            vs.append((radius*math.sin(az),radius*math.cos(az),radius*math.tan(el)))
            uvs.append((i/seg,j/rows))
    for j in range(rows):
        for i in range(seg):
            a=j*(seg+1)+i
            fs.append((a,a+1,a+seg+2,a+seg+1))
    me=mesh_from('Painted_Distant_Landscape',vs,fs,smooth=True)
    uv=me.uv_layers.new(name='UVMap')
    for lp in me.loops: uv.data[lp.index].uv=uvs[lp.vertex_index]
    m=bpy.data.materials.new('Painted_Dusk_to_Night'); m.use_nodes=True
    nt=m.node_tree; nt.nodes.clear()
    out=node(nt,'ShaderNodeOutputMaterial')
    tex=node(nt,'ShaderNodeTexImage',image=image,interpolation='Linear',extension='EXTEND')
    hs=node(nt,'ShaderNodeHueSaturation'); hs.name='Dusk_Saturation'
    hs.inputs['Saturation'].default_value=BACKDROP_SATURATION
    hs.inputs['Value'].default_value=BACKDROP_VALUE
    link(nt,tex.outputs['Color'],hs.inputs['Color'])
    night=node(nt,'ShaderNodeTexImage',image=night_painting(image),interpolation='Linear',extension='EXTEND')
    em=node(nt,'ShaderNodeEmission'); em.inputs[1].default_value=1.0
    link(nt,night_mix(nt,c,hs.outputs[0],night.outputs['Color']),em.inputs[0]); link(nt,em.outputs[0],out.inputs[0])
    me.materials.append(m)
    o=new_obj('Painted_Distant_Landscape',me,S)
    o.visible_diffuse=False; o.visible_shadow=False; o.visible_transmission=False
    o['Coverage']='140 degree forward panorama; fixed mountains, animated exposure/tint. Packed image.'
    return o
