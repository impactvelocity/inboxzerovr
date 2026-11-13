# Seated office v3

Open `index.html` to compare the furnished and empty desks in daylight, lavender twilight, and blue night lighting. The complete workstation is closer and lower in the panorama: monitor screen center is below the horizon and the tabletop occupies the lower foreground. Previous versions remain unchanged.

## Files

- `day.png`, `twilight.png`, `night.png`: furnished seated workstation.
- `empty-day.png`, `empty-twilight.png`, `empty-night.png`: same desk with all contents removed, including tower, mug and coaster. No baked-in CRT glow.
- Matching quality-94 sRGB WebP exports for all six panoramas.
- `props/`: CRT monitor, paper (single sheet and small stack), and stapler hero images and multi-angle modeling sheets.
- `prompts.json` and `sources.json`: built-in image_gen prompts and source paths.

All panoramas target 2172 × 724 pixels. Lighting variants are edits of the corrected daytime compositions. These images are modeling references and backdrop candidates, not mesh files. Multi-angle sheets may contain minor generative inconsistencies; select the hero view as the design authority. Check transition edge alignment and seated scale in the actual headset before integration. The empty desk is still part of the image; it is not a separate 3D desk.
