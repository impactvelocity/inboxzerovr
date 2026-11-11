"""Paint the brush-stroke texture the Kyoto shaders lay over every surface.

    Blender --background --python source/make_brush.py

Writes unity/Assets/Resources/Kyoto/Brush.png (512 x 512, tileable):
    red    long strokes, nearly level: each a flat dab a little lighter or darker
    green  broader strokes on a slant: where the paint runs warmer or cooler
    blue   the tooth of the paper
"""
import math
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "Assets", "Resources", "Kyoto", "Brush.png"))
N = 512


def strokes(rng, angle_deg, length, width, levels):
    """Noise drawn out along one direction, then cut into a few flat tones
    with soft edges, the way overlapping dabs of paint sit."""
    spec = np.fft.fft2(rng.standard_normal((N, N)))
    ky = np.fft.fftfreq(N)[:, None] * N
    kx = np.fft.fftfreq(N)[None, :] * N
    a = math.radians(angle_deg)
    along = kx * math.cos(a) + ky * math.sin(a)
    across = -kx * math.sin(a) + ky * math.cos(a)
    amp = np.exp(-(along * length / N) ** 2 - (across * width / N) ** 2)
    f = np.real(np.fft.ifft2(spec * amp))
    f = (f - f.mean()) / f.std()
    f = 0.5 + 0.5 * np.tanh(f * 0.9)
    step = f * levels
    whole = np.floor(step)
    part = step - whole
    soft = np.clip((part - 0.35) / 0.3, 0, 1)
    soft = soft * soft * (3 - 2 * soft)
    return (whole + soft) / levels


rng = np.random.default_rng(21)
red = strokes(rng, 8, 150, 22, 5)
green = strokes(rng, -34, 190, 44, 4)
grain = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((N, N))) * np.exp(-((np.fft.fftfreq(N)[:, None] * N) ** 2 + (np.fft.fftfreq(N)[None, :] * N) ** 2) / (2 * 90.0 ** 2))))
grain = 0.5 + 0.5 * np.tanh((grain - grain.mean()) / grain.std() * 0.8)
px = np.ones((N, N, 4), dtype=np.float32)
px[..., 0], px[..., 1], px[..., 2] = red, green, grain
img = bpy.data.images.new("Brush", N, N, alpha=False)
img.colorspace_settings.name = 'Non-Color'
img.pixels.foreach_set(px.ravel())
img.filepath_raw = OUT
img.file_format = 'PNG'
img.save()
print("BRUSH", OUT, [round(float(c.mean()), 3) for c in (red, green, grain)])
