# Reference-matched theme tests · v2

Open `index.html` to review the four themes with start/end lighting sliders and weapon references.

Art direction follows the four user-supplied reference images: a perimeter-lit midnight boxing arena, a haunted Gothic castle hallway, a bright liminal office with a beige CRT, and a pale tiled biohazard lab. The office weapon is a beige keyboard; the lab tool is an off-white and teal disinfectant sprayer. All props use faceted low-poly 3D forms matching the references.

Each folder contains start/end PNG panoramas, quality-94 sRGB WebP exports, a weapon hero PNG, a multi-angle reference PNG, and prompts. `sources.json` records generation paths. Built-in image_gen was used. End images are lighting edits of the corresponding start image; angle sheets use the generated hero prop as reference.

Backgrounds intentionally omit held weapons, hands, floating mail, and UI for separate runtime rendering. These are visual test assets rather than installed levels or 3D models. Check generative detail drift during dissolves and validate the panorama in the headset before integration. Earlier v1 artwork remains available alongside this set.
