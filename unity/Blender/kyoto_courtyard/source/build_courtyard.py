"""Builds the Kyoto courtyard scene from nothing and saves it as a .blend.

    Blender --background --python build_courtyard.py -- [--variant dusk|night]
        [--still] [--alt] [--loop] [--draft]

--still   render the reference-matched frame      -> renders/<variant>_still.png
--alt     render the cutaway angle                -> renders/<variant>_alt.png
--loop    render a 12-second ambient excerpt      -> renders/<variant>_loop.mp4
--draft   quarter-resolution, low-sample renders for quick checks

The dusk file itself has a 60-second one-way lighting fade. Only the night
preset's 12-second excerpt is a seamless loop.
"""
import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from kyoto import animate, architecture, garden, katana, letter, materials, sky, tree  # noqa: E402
from kyoto.common import EYE, LENS, LOOP, P, SENSOR, TX, TZ, coll, new_obj     # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
VARIANT = args[args.index("--variant") + 1] if "--variant" in args else "dusk"
DRAFT = "--draft" in args
OUT = os.path.join(HERE, "../renders")
os.makedirs(OUT, exist_ok=True)


def render_setup(scene, look):
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.refresh_devices()
        for d in prefs.devices:
            d.use = d.type == 'METAL'
        scene.cycles.device = 'GPU'
    except Exception as exc:                      # no GPU: Cycles falls back to CPU
        print("GPU not available:", exc)
    cy = scene.cycles
    cy.samples = 128
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.015
    cy.use_denoising = True
    cy.preview_samples = 24
    cy.max_bounces = 6
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 4
    cy.transparent_max_bounces = 12
    cy.sample_clamp_indirect = 6.0
    cy.caustics_reflective = cy.caustics_refractive = False
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.render.film_transparent = False
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    vs = scene.view_settings
    vs.view_transform = 'AgX'
    try:
        vs.look = look["look"]
    except TypeError:
        print("look not found:", look["look"])
    vs.exposure = look["exposure"]


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = f"Kyoto_Courtyard_Polished_{VARIANT.title()}"
    M = materials.build(materials.PALETTES[VARIANT])
    architecture.build(M)
    _, _, stone_tops = garden.build(M)
    tr = tree.build(M, stone_tops)
    sword = katana.build(M)
    rot = katana.pose(sword, P(0.823, 0.655, 0.95), P(0.972, 0.04, 1.262), EYE, roll_deg=-16)
    for tag, local in (("guard", (0, 0, katana.GUARD_Z)), ("tip", katana.blade_axis(katana.BLADE_LEN)[0]),
                       ("pommel", (0, 0, -katana.GRIP_HALF - 0.02))):
        w = sword.location + rot @ Vector(local)
        print(f"katana {tag}: u={0.5 + w.x / (2 * TX * w.y):.3f} v={0.5 - (w.z - EYE.z) / (2 * TZ * w.y):.3f} depth={w.y:.2f}")
    sk = sky.build(VARIANT)
    # The blossoms' faint glow of their own goes out with the day, so at night
    # they take the violet of the light instead of staying pink.
    from kyoto import atmosphere
    for name in ("Blossom", "Petal"):
        glow = M[name].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
        atmosphere.drive(glow, "default_value", sk["control"], glow.default_value, glow.default_value * 0.15)
    sky.blade_reflector(VARIANT, rot, sword.location, katana.blade_axis(katana.BLADE_LEN * 0.5)[0])

    C = coll("Camera")
    cam = bpy.data.cameras.new("Camera_Seated")
    cam.lens, cam.sensor_width, cam.sensor_fit = LENS, SENSOR, 'HORIZONTAL'
    cam.clip_start, cam.clip_end = 0.05, 1500
    cam.dof.use_dof = False                      # deep focus: sword, tree and gate all sharp
    co = new_obj("Camera_Seated", cam, C, loc=EYE, rot=(math.pi / 2, 0, 0))
    scene.camera = co
    alt = bpy.data.cameras.new("Camera_Cutaway")
    alt.lens, alt.sensor_width, alt.clip_end = 24, SENSOR, 1500
    alt.lens = 21
    ao = new_obj("Camera_Cutaway", alt, C, loc=(-3.3, -1.5, 3.0))
    ao.rotation_euler = (Vector((0.6, 6.5, 0.75)) - ao.location).to_track_quat('-Z', 'Y').to_euler()

    render_setup(scene, sk["look"])
    animate.build(tr, sk, M)
    letter.add_to_scene(os.path.join(HERE, "..", "export"))
    for name in ("Sky", "Lighting", "Camera", "Katana", "Letter", "Water", "Tree", "Garden", "Architecture"):
        assert name in bpy.data.collections, name
    scene['Art_Direction']='Soft faceted Kyoto; matte bark and stone, dusty pink sakura, irregular shallow water, packed painted distance.'
    scene['Animation']='Dusk_Control > Night: 0–1. Dusk timeline is 60 seconds; wind and petals repeat every 12 seconds.'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.shading.type='RENDERED'
                area.spaces.active.overlay.show_overlays=False
    path = os.path.join(HERE, f"../kyoto_courtyard_{VARIANT}_polished.blend")
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print("saved", path, "objects:", len(bpy.data.objects))
    return scene, co, ao


def render(scene, camera, name, frame=1):
    scene.camera = camera
    scene.frame_set(frame)
    if DRAFT:
        scene.render.resolution_percentage = 50
        scene.cycles.samples = 48
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


def main():
    scene, cam, alt = build()
    if "--still" in args:
        render(scene, cam, f"{VARIANT}_still.png")
    if "--alt" in args:
        # cutaway: lift the veranda roof off so the deck and sword are visible
        bpy.data.collections["Veranda_Roof"].hide_render = True
        render(scene, alt, f"{VARIANT}_alt.png")
        bpy.data.collections["Veranda_Roof"].hide_render = False
    if "--loop" in args:
        scene.camera = cam
        scene.render.resolution_percentage = 50
        scene.cycles.samples = 40
        scene.cycles.adaptive_threshold = 0.05
        frames = os.path.join(OUT, f"{VARIANT}_loop_frames")
        os.makedirs(frames, exist_ok=True)
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = os.path.join(frames, "f_")
        scene.frame_start, scene.frame_end = 1, LOOP
        bpy.ops.render.render(animation=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", "24", "-i",
                        os.path.join(frames, "f_%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-crf", "17", os.path.join(OUT, f"{VARIANT}_loop.mp4")], check=False)


main()
