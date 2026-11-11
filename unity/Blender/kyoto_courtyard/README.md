# Kyoto courtyard — game art pass

Open `kyoto_courtyard_dusk_polished.blend` for the animated twilight-to-blue-hour scene, or `kyoto_courtyard_night_polished.blend` for the blue-hour lighting setup.

The scene is art-directed toward the two supplied dusk/night paintings:
faceted forms, full pink blossom masses, cooler shade and warm pools of light.
The saved Blender scenes and the Unity generator share this geometry and palette.
The game review images are in `unity/Checks/art-review`.

## Current art pass

- Fuller overlapping blossom clusters, rounded facets and visible supporting twigs.
- Irregular chipped stepping slabs with broad triangular crowns.
- Moss coverage baked into the terrain, with stone-following moss skins on boulders
  and the lantern roof; smaller, denser foreground leaves.
- More directional cool light and warm rim light, preserving the night transition.
- A seat at the original reference camera and a 42° desktop vertical field of view.
- Water reflections captured from a virtual eye below the water plane, while
  ordinary environment panoramas continue to light props and supply rough sheen.
- Wetness, standing water, moss and each object's palette variation survive joining
  and are preserved until the final material bake completes.
- Subtle stable surface brush texture and desktop bloom in Unity. XR uses world
  halos and its own projection.

## Timeline and controls

The dusk file runs at 24 fps for 60 seconds:

| Frame | Time | Lighting |
| --- | --- | --- |
| 1 | 0 s | Soft twilight |
| 121 | 5 s | Fade begins |
| 1153 | 48 s | Blue hour reached |
| 1440 | End | Blue-hour hold |

Select `Dusk_Control` and inspect the `Night` custom property: 0 is twilight and 1 is blue hour. It is animated in the dusk file and fixed at 1 in the night file. To use it as a manual slider in the dusk file, remove its keyframes first.

Tree wind, petal fall, lantern flicker and water normals repeat every 12 seconds. The trunk and roots remain pinned. Clouds advance one texture repeat every 12 seconds in both files. The lighting fade itself is one-way, so the full dusk sequence is not a seamless loop.

## Preview files

- `unity/Checks/art-review/dusk.png` and `night.png`: current Unity captures.
- `renders/final/dusk.png` and `renders/final/night.png`: earlier Cycles stills, retained for comparison.
- `renders/letter_sheet.png`: the paper letter on its own.
- The gameplay checks are in `unity/Checks` (`k1`..`k12`). The existing MP4 and paintings comparison predate this art pass.

## Rebuild

The `source` folder includes the complete revised generator and its backdrop image. On this Mac:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python source/build_courtyard.py -- --variant dusk --still
/Applications/Blender.app/Contents/MacOS/Blender --background --python source/build_courtyard.py -- --variant night --still
```

The `.blend` files contain packed image assets and do not depend on the original project folder. The build regenerates the same courtyard deterministically; it does not migrate later manual edits from another `.blend`.

## Into the game

`source/export_unity.py` turns the dusk scene into the Unity level's files
(`unity/Assets/Resources/Kyoto`), baking what Cycles renders at frame 1 and
frame 1153 and passing it through the view transform. The big surfaces go
into a 4096 atlas each (faces no seated player can see share a thin strip of
it); blossoms, leaves, moss and tiles are lit per vertex. It also renders
panoramas from the garden and from the seat for the game's reflections, and
exports the sky dome, the painted distance, the cloud layers, the katana and
the letter. `SEAT` in the script is where the game's seat goes. A full run uses Metal when available; `-- --preview` is a quick low-quality pass. For the game it also leaves out the door-head lintel and the wall
above it (a black band in a wide view), makes the room's walls plaster and
adds a warm lamp behind the seat.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background kyoto_courtyard_dusk_polished.blend --python source/export_unity.py
```

### Kyoto v2

`source/export_v2.py` sends only the buildings to the game, for the Kyoto v2
level, which Unity lights itself alongside the Komorebi Nature assets. The
veranda, machiya, walls and shut gate leave as four meshes in
`unity/Assets/KyotoV2/Architecture.fbx`, with one colour atlas (the
materials' own colour, no light) and one occlusion map (how much open sky a
surface sees). The tree, rocks, lantern and plants of this scene stay behind.
Then **Inbox Zero > Kyoto v2 > Rebuild Courtyard** in Unity.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background kyoto_courtyard_dusk_polished.blend --python source/export_v2.py
```

About two minutes; `-- --preview` is a quick low-quality pass.

`source/make_brush.py` paints the brush-stroke texture the game lays over
every surface (`Kyoto/Brush.png`).

`source/export_letter.py` builds the letter alone (`export/Letter.fbx`,
`renders/letter_sheet.png`).

## Validation and scope

Validated in Blender 5.3. The tree is one connected mesh with 3,391 vertices and 6,451 faces. Its evaluated pose repeats exactly at frames 1 and 289, the sampled trunk/root vertices remain stationary, and the sampled maximum branch movement is about 8.7 cm. The light values decrease through the transition. All four used file image assets are packed.

The painted panorama covers the forward 140-degree view; it is not a seamless 360-degree skybox. These are editable Blender scene drafts with Cycles materials and lights. Unity material baking and runtime animation are included in this pass. Quest hardware performance and stereo appearance still need a device check.
