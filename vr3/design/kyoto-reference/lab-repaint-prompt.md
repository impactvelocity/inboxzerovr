# Toxic Danger repaint: Kyoto's perspective and focus

Attach `kyoto-day-dusk.png` as the composition reference (and the current `vr3/play/public/levels/lab/start.webp` for the lab's style and props).

## Prompt 1: Lights on (start)

Ultra-wide 3:1 panoramic game background, 2172 x 724, stylized painterly 3D-render look, the same art style, palette and props as the attached lab image, but using the exact composition and camera of the attached Kyoto veranda image.

Camera: a seated viewer at eye level (horizon 48% up from the bottom), curved cylindrical 270-degree wide-angle panorama, strict one-point perspective with a single vanishing point in the dead centre. Ceiling beams, pipes and cable trays overhead, and floor tile lines and grates below, all converge strongly toward that centre point, curving like the Kyoto roof beams and floorboards.

Layout: the viewer sits on a raised observation deck inside a biohazard containment lab. Two thick teal-and-white support pillars stand left and right of centre, framing a big open centre view, like the two wooden posts framing the Kyoto garden. Through that opening, far away (about 10 metres), in a large, deep, open containment hall, stands the containment machine: a glass dome full of glowing green envelopes, an amber warning beacon on top, and a dark hatch in its front, small and perfectly centred, the hatch just below the horizon. Behind it, the far wall is soft, hazy and lower in contrast.

Foreground: the deck floor in front of the viewer is empty and clean, polished tiles reflecting the lights. No table, bench or props in the near centre. The space between the viewer and the machine is open air.

Sides: long corridors on the left and right recede toward the centre, lined with lab windows, glowing green specimen tanks, shelves of jars, a fume hood and small amber wall lamps, like the shoji rooms down the Kyoto sides. Keep the busy detail at the edges. The centre stays calm and readable.

Lighting: bright clinical lab lights on, cool teal and white, with toxic green glows from the tanks and the machine, and warm amber accents from the lamps. The centre opening is the brightest, most inviting area, with soft atmospheric haze in the far hall.

No people, no text, no letters or UI, no characters, no vignette, no fisheye bulge at the top or bottom.

## Prompt 2: Blackout (end)

Use the Lights on result as the image to edit, so the layout is identical. Same camera, composition and every object in exactly the same place. Only the lighting changes: the ceiling lights are off and the hall is dark. The scene is lit only by toxic green glows from the tanks, the machine's dome and the hatch, the amber wall lamps and the amber beacon, with deep teal shadows, green reflections on the wet floor, and darker, moodier haze in the far hall. Same art style, 3:1, 2172 x 724.

## Notes

- Make the start image first, then make the end image as an edit of it. If the two paintings don't line up, the game's crossfade between them will smear.
- Keep the machine's hatch dead centre, just under the horizon: emails fly out of it toward the viewer.
- When the new pair is ready, drop them in and the game's depth model for the lab (`inverseDepthAt` in `vr3/play/src/levels/lab.ts`, the hatch position and the bench) needs re-measuring to match.
