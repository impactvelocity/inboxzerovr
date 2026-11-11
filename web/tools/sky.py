# Blender's Python: read the Meadow panorama (Radiance HDR) and write it as
# c / (1 + c), gamma encoded, eight bits a channel. Then pack it:
#
#   Blender -b --factory-startup --python web/tools/sky.py -- <T_Skybox_Summer_01.HDR> /tmp/Sky.png
#   cwebp -q 93 /tmp/Sky.png -o web/public/kyoto/tex/Sky.webp
import bpy, sys, numpy as np
src, dst = sys.argv[sys.argv.index("--") + 1:]
img = bpy.data.images.load(src)
w, h = img.size
px = np.empty(w * h * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(h, w, 4)[:, :, :3]
print("size", w, h, "max", px.max(), "mean", px.mean(axis=(0, 1)))
iy, ix = np.unravel_index(np.argmax(px.sum(axis=2)), (h, w))
print("brightest at u", ix / w, "v", iy / h, px[iy, ix])
if w > 4096:
    f = w // 4096
    px = px.reshape(h // f, f, w // f, f, 3).mean(axis=(1, 3)); h, w = px.shape[:2]
soft = px / (1 + px)
enc = np.where(soft <= 0.0031308, soft * 12.92, 1.055 * np.power(np.maximum(soft, 1e-8), 1 / 2.4) - 0.055)
out = bpy.data.images.new("out", w, h, alpha=False)
rgba = np.ones((h, w, 4), dtype=np.float32); rgba[:, :, :3] = enc
out.colorspace_settings.name = "Non-Color"
out.pixels.foreach_set(rgba.ravel())
out.filepath_raw = dst; out.file_format = "PNG"
scene = bpy.context.scene
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGB"; scene.render.image_settings.color_depth = "8"
out.save()
print("wrote", dst)
