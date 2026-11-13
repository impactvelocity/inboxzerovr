# VR3 theme image tests

Open `index.html` in a browser for all four sets and start/end lighting sliders.

Each theme folder contains `start.png`, `end.png`, matching quality-94 sRGB WebP exports, `weapon-hero.png`, `weapon-angles.png`, and `prompts.md`. All eight panoramas are 2172 × 724 pixels. Generated with the built-in image_gen tool; the end scene uses its actual start scene as the edit target, and the multi-angle sheet uses its hero prop as reference. Original generated file paths are recorded in `sources.json`.

Themes: chemical / biohazard containment laboratory and fictional containment blaster; CRT office and CRT mallet; boxing gym and gloves; castle courtyard and arming sword.

Located previous Kyoto panoramas and katana modeling sheet. The earlier four-theme originals were not found in the repository or the local built-in generation archive, so these are new interpretations using Kyoto v2 as the panorama style and framing reference.

Validation: all delivered images were visually inspected; panorama dimensions and presence of all files were checked. These are concept test assets, not installed runtime levels or 3D models. Generative lighting edits may have small detail drift; inspect the dissolve slider and headset wrap before runtime integration. Multi-angle sheets guide art direction rather than guaranteeing exact orthographic geometry. No sky masks or scene-specific shader tuning are included.
