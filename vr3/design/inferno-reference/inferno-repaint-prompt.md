# Inferno repaint: Kyoto's perspective, a furnished hall, the great furnace as the focus

Attach the three images in this folder:
1. `1-kyoto-composition.png`: the camera and composition
2. `2-lab-hall-layout.png`: the layout (the Toxic Danger hall: deck, pillars, railings, furnished middle, clear centre)
3. `3-inferno-style.png`: the art style, materials and props

## Prompt 1: Stoked (start)

Ultra-wide 3:1 panoramic game background, 2000 x 667, stylized painterly 3D-render look. Use the same art style, materials and props as the attached furnace room (brick, riveted dark iron, copper pipes with brass gauges, caged amber lamps, heavy furnace doors glowing at their seams). Use the exact camera and composition of the attached Kyoto veranda and the attached lab hall.

Camera: a seated viewer at eye level (horizon 48% up from the bottom), curved cylindrical 270-degree wide-angle panorama, strict one-point perspective with a single vanishing point in the dead centre. Overhead iron girders, ducts and copper pipe runs, and below them the floor's flagstones and iron grates, all converge strongly toward that centre point, curving like the Kyoto roof beams and floorboards.

Layout: the viewer sits on a raised riveted-iron deck at the edge of a vast underground mail incinerator hall. Two thick brick-and-iron pillars, each with a caged amber lamp, stand left and right of centre and frame a big open centre view, like the two posts framing the Kyoto garden. Low iron railings with small amber lights run between the pillars along the deck's edge, with a gap in the middle.

The focus: beyond the railings, far off in the middle of the hall (about 10 metres), stands one huge central incinerator furnace, perfectly centred and the brightest thing in the picture. It has a great round riveted furnace mouth standing open, roaring orange-yellow fire inside, and heat shimmer and sparks rising from it. Above it, a hopper overflowing with envelopes is fed by a big chute from the ceiling. The fire mouth sits just below the horizon, so the mail can fly out of it toward the viewer. A painted hazard square on the floor around it and a grated channel in the floor lead straight from the deck to the mouth.

The main hall is furnished, not empty, but the centre lane stays clear. On each side of the central furnace, set back about 5 metres, stand rows of smaller furnaces with their doors shut and fire glowing round the seams, mail sorting tables and conveyor belts piled with letters and parcels, canvas mail carts, sacks of envelopes, coal and ember bins, valve wheels and pressure gauges. The far walls are lined with more furnace doors glowing in a row, shelves of mail boxes and copper pipework, softened by smoke and haze so the middle stays calm and readable.

Sides: long brick corridors on the left and right recede toward the centre. Near the viewer on each side is a workbench (wrenches, a red valve wheel, gauges) and a mail cart or recycling bin, like the lab's desks and trolleys. Further down are more furnaces, pipes and caged lamps, like the shoji rooms down the Kyoto sides. Keep the busy detail at the edges and in the mid-ground; the centre and the near floor stay open.

Foreground: the deck floor in front of the viewer is empty and clean, worn iron plates and flagstones catching the firelight. No bench or props in the near centre. The space between the viewer and the great furnace is open air.

Lighting: warm and working. The caged amber lamps are on, the great furnace throws a strong orange glow across the floor and up the pillars, and the smaller furnaces glow at their seams. Light smoke and drifting embers hang in the far hall.

No people, no text, no letters or UI, no characters, no vignette, no fisheye bulge at the top or bottom.

## Prompt 2: Lights out (end)

Use the Stoked result as the image to edit, so the layout is identical. Same camera, composition and every object in exactly the same place. Only the lighting changes: the caged lamps are dimmed to faint amber and the hall is dark, lit mostly by fire. The great furnace's mouth blazes brighter, the furnace door seams glow hot orange, and embers drift through deep plum and charcoal shadows. Orange reflections lie on the floor, and the smoke is darker and moodier in the far hall. Same art style, 3:1, 2000 x 667.

## Notes

- Make the start image first, then make the end image as an edit of it. If the two paintings don't line up, the game's crossfade between them will smear.
- Keep the furnace mouth dead centre, just under the horizon: emails fly out of it toward the viewer.
- When the pair is ready, the Inferno depth model, the spot the mail comes from and the fire and lamp glows (`vr3/play/src/levels/inferno.ts`) get re-measured to match.
