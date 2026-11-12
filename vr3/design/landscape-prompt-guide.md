# VR3 landscape prompt guide

Start with the [Kyoto dusk panorama](../../output/imagegen/kyoto-garden-v2/dusk.png) as the composition reference. It shows how much room to leave around the seated player and how to carry the scene into their peripheral vision. Use the [Kyoto twilight panorama](../../output/imagegen/kyoto-garden-v2/twilight.png) as a color reference for the second pass.

| Setting | Kyoto v2 specification |
| --- | --- |
| Canvas | **2172 × 724 px**, landscape **3:1**, full bleed. Use these dimensions for both exports. If your generator produces a larger 3:1 image, resize both versions to the same dimensions with the same framing. |
| Coverage | One continuous **270° horizontal × 90° vertical** panorama for the existing VR3 wrap. The remaining 90° behind the player fades to a dark fill. |
| Viewpoint | A single seated eye position, looking straight ahead from well back on the platform. Image center is straight ahead. Level eye line is about **52% down** from the top. Keep the horizon level and posts upright. |
| Composition | Use the **middle third** as the target area for the main landmarks. The full forward opening can extend into roughly the middle half. Carry the same floor, roof or shelter, and side scenery out to both edges. |
| Asset pair | Dusk and twilight on the same canvas, with matching projection, framing and silhouettes. Save PNG masters. VR3 uses **sRGB WebP** at quality **94** as the Kyoto starting point. |

## Pass 1 · Generate the dusk master

Attach Kyoto dusk as a layout and style reference, then replace the bracketed fields. For a level without a roof, use the upper band for sky or distant canopy and plan to retune the scene depth and sky mask.

```text
Create one continuous full-bleed 3:1 landscape panorama for a seated VR game.
Target export 2172 × 724 px. The horizontal sweep covers 270 degrees and the
vertical sweep covers 90 degrees. Use the attached Kyoto panorama as a reference
for camera placement, composition, and the painterly stylized game art.

New setting: [PLACE, SEASON, WEATHER]. The viewer is seated well back on
[FOREGROUND PLATFORM OR SHELTER], looking straight ahead from one fixed eye
position. Use a level eye line just below image center and keep uprights vertical.
Treat the entire image as one flattened panorama from that eye point.

At the center is [HERO LANDMARK]. Frame it with [LEFT LANDMARK] and
[RIGHT LANDMARK], mostly within the middle third. Show the complete silhouettes
of the main landmarks at a comfortable distance. Keep the center and lower center
quiet enough for floating gameplay objects to read against the background.

Give the bottom quarter to third to [FLOOR OR GROUND MATERIAL], continuous all
the way across. Frame the upper edge with [OVERHEAD STRUCTURE OR CANOPY, IF ANY].
Continue the same environment into the left and right thirds with [SIDE SCENERY].
Keep the edges subdued. Use clear near, middle and far layers, ending in
[DISTANT RIDGELINE, SEA HORIZON OR OTHER BACKDROP].

Paint simplified shapes, soft atmospheric perspective, and restrained faceted
detail. Early dusk lighting: [SKY COLORS] above cooler shadows, with warm light
from [FIXED LIGHT SOURCES]. Paint any reflections as part of the surfaces.
Keep silhouettes readable without heavy bloom. Leave open sky between foreground
silhouettes where appropriate.

One uninterrupted image. No panels, seams, borders, fisheye curvature, people,
characters, hands, weapons, gameplay objects, UI, text, or watermarks. Leave
floating petals, embers, fireflies, and stars for the runtime effects.
```

Example substitutions for a coastal level: a covered timber lookout above the coast, a distant lighthouse on the centerline, dark pines on the left, a warm keeper’s cottage on the right, headlands fading into sea mist, and a blue-gray sky with a narrow peach band. Keep the deck close and the lighthouse, pines, and cottage back together as a readable group.

## Pass 2 · Relight the approved image for twilight

Use the actual dusk image as the edit target. A second text-to-image generation can produce a convincing companion image that still jumps when blended.

```text
Edit the supplied dusk panorama in place. Deliver one twilight version with
the exact same canvas size, 3:1 aspect ratio, camera, projection, and crop.
Keep every structural edge, silhouette and detail at its original pixel position:
the horizon, foreground boards, posts, roof edges, plants, buildings, paths,
cloud shapes and reflection outlines. Preserve the original painting style.

Change lighting, exposure and color only. Move the sky toward [TWILIGHT COLORS],
cool and deepen the shadows, and retain readable foreground and distant shapes.
Keep warm lights and their reflections in the original locations. Let the scene
become darker without crushing the shadow detail. Preserve the original framing
all the way to the four edges. Add no moon, stars, new lights, objects or effects.
```

## Check before putting it in the headset

1. **Check the forward composition.** Cover the outer thirds in the flat image. The main subject should still read as a complete scene. Kyoto’s first pass felt too close and hid too much of the courtyard. Pulling the eye point back, leaving a broad foreground, and grouping landmarks near the center fixed the framing. Then preview the actual wrap at seated eye height and turn both ways to check the peripheral scene and the dark rear fade.
2. **Check the dissolve.** Stack the images at 100% and toggle between them. Scrub through a 50% mix. Inspect rooflines, vertical posts, the horizon and reflection edges for double contours. If the edit shifts geometry, grade the dusk master in an image editor with curves and local color masks. Resize both images the same way after the pair is approved.
3. **Match the effects to the new artwork.** The existing shader’s parallax, canopy movement, mist, water ripples, and lamp flicker are placed for Kyoto. Reposition or disable them for the new level. For animated clouds and stars, make a sky mask with white for open sky, black for everything in front, and slightly feathered edges. Kyoto uses **1086 × 362 px**, half the artwork size. Its mask script uses Kyoto-specific color rules and coordinates. [Sky mask script](../tools/skymask.py) · [Backdrop and depth](../src/garden.ts) · [Atmosphere effects](../src/atmosphere.ts)

Keep the PNG masters, prompts, exported WebPs and sky mask together for each level so you can relight or retune the same scene later.
