# Inbox Zero VR in the browser (Kyoto v2)

The Kyoto v2 level of the Unity game, rebuilt on three.js and WebXR to see how
it looks and performs in a headset's browser. One level, the whole session:
home, round 1 (slash or keep), round 2 (reply, dictate, tomorrow), summary.

```bash
cd web && npm install && npm run dev
```

Then open http://localhost:5180. Keys are the Unity ones (Space, A, 1, 2, M, W).

## On a Quest

WebXR needs a secure page. Two ways:

- **USB:** `adb reverse tcp:5180 tcp:5180`, then open `http://localhost:5180/?stats=1`
  in the Quest browser and press **Enter VR**.
- **Wi-Fi:** `npm run dev:https` and open `https://<this-mac's-address>:5180/?stats=1`
  (accept the self-signed certificate once).

`?stats=1` hangs a small readout low on the left in the headset: frames a
second, draw calls, triangles. The katana is in the right hand; the left grabs
(grip or trigger, or a pinch with hand tracking). Point at the start button and
pull the trigger, or poke it.

## Address bar switches

| | |
| --- | --- |
| `?stats=1` | frame rate, script and GPU time, draws, triangles (P toggles it on a monitor) |
| `?at=0.4` | hold the evening at one point (0 the sun up, 0.28 round start, 0.5 round end, 1 night) |
| `?bloom=0` | no bloom chain on a monitor: what a headset draws |
| `?game=0` | the courtyard alone |
| `?ambience=0` | no wind, leaves, water, birds or crickets |
| `?emulate=1` | pretend to be a Quest 3 (IWER), to try the headset path at a desk |
| `?scale=1.2` | headset render scale |
| `?hz=90` | ask the headset for a refresh rate (default 72) |
| `?slow=0.2` | slow motion, to look at a cut |
| `?debug=1..4` | the baked sun, sky and lamp light, or the lighting without pictures |
| `?yaw=&pitch=&fov=` | turn the monitor view |

## How it is put together

- `src/kyoto/` is the courtyard: `courtyard.ts` loads it and is a port of
  `KyotoCourtyard.cs` (the sun sinking, sky, mist, lamps, wind, petals,
  fireflies); `shaders.ts` holds every material.
- `src/game/` is the game, a port of `InboxGame.cs` and its helpers. It works
  in Unity's own coordinates inside a group mirrored in z (see `src/api.ts`).
- `src/main.ts` is the page: renderer, the seat, the two draw paths, measuring.
- `src/post.ts` is the monitor's bloom and grade.

**The trick that makes it cheap.** Unity lights the courtyard per pixel: eleven
lamps, soft shadows, contact shadows, bloom. The exporter
(`unity/Assets/Editor/WebExport.cs`) merges every mesh by material and works
the still parts of that light out once per vertex: how much sky and sun each
corner sees (by casting rays), what the lamps give it, and the colour
gradients the Komorebi shaders compute. In the browser a pixel is then one
texture read, a multiply and the mist; what moves (the sun's colour, the
ambient, the lamps' flicker, the wind) is a handful of uniforms. About 57
draws and 386k triangles for the whole scene.

A headset draws one pass with the grade inside each shader and no bloom (the
halos and haze sheets carry the glow). A monitor draws the courtyard through
a bloom chain and the game's own things on top.

## Re-exporting from Unity

After changing the courtyard in Unity:

```bash
web/tools/export.sh <a copy of the unity project>
```

or, with the editor open, **Inbox Zero > Kyoto v2 > Export For Web** and then
`web/tools/export.sh --pack-only`. The sky panorama is converted separately by
`web/tools/sky.py`. Everything exported lands in `public/kyoto/`, which Git
ignores like the rest of the art.

## Known gaps against Unity

- No bloom or contact shadows in a headset; no live reflection picture (the
  sheen on the deck, tiles and wet stones is the sky's colours and the sun's
  glint, worked out per vertex).
- Shadows are baked for the start of a round; they do not swing as the sun sinks.
- Birds and butterflies are not in yet.
- Textures are plain WebP (about 2 MB to download, uncompressed on the GPU);
  the mesh file is 19 MB before the server's compression. KTX2 textures and
  quantised meshes are the next step if this route is kept.
