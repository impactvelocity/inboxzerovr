# Inbox Zero VR (Unity)

A Unity 6 port of the web demo in `../quest`: the home screen, round 1
(destroy or keep), round 2 (reply, dictate, tomorrow) and the summary.

Open this folder in Unity Hub (editor 6000.6.8f1), open `Assets/Scenes/Main.unity`
and press Play.

| Key | Does |
| --- | --- |
| Space | start, slash, skip a countdown |
| A | keep |
| 1, 2 | send that reply |
| M | dictate |
| W | leave for tomorrow |
| F1 or ` | dev view: the scene alone, no emails or buttons |

In the dev view the game stands still while the world keeps moving: hold
Space and move the mouse to look around (the arrow keys turn too), N switches
a Kyoto level between the two ends of its day (midday and twilight in the
garden, dusk and night in the v2 courtyard), H hides the hint line and F1
goes back. Pick the level on the home screen first.

The mouse clicks the home screen buttons. The keys for the current screen are
shown along the bottom of the window (not in a headset).

## Levels

Every level shares the same two rounds and the same hands. A level is its own
look, weapon and music, listed in `Assets/Scripts/Levels.cs` and chosen on the
home screen's picker. Slots that are not `ready` show as "coming soon".

### Retro Saber

The seat flies through open space (`Starfield.cs`): a dome of little square
stars with a denser band across it, faint purple and red clouds, stars that
drift toward and past the seat, and a shooting star every few seconds, its
tail cooling from yellow through red to purple. The palette runs from purple
to red (`Levels.cs`). The weapon is a light saber: a dark plain grip and a
white-hot blade that hums, sweeps up in pitch as it swings and leaves a smear
of light.

- **Two looks in one picture** (`RetroFx.cs`, `Retro.shader`, on the camera).
  The world goes to big pixels with bloom, a dithered palette and scanlines.
  Cards, text, buttons (layer 30) and the saber (layer 29) are drawn
  separately at full resolution so they stay crisp, with only a trace of the
  pixel grid; the saber also lights up the picture around it. A hit punches,
  shakes and splits the colours. All adjustable on the `Head` object. It is
  switched off in a headset.
- **Emails** (`CardArt.cs`) are laid out by type: people's emails lead with
  the subject, then who, then three lines of the message; newsletters and
  offers show a preview that scrolls by; receipts and bills put the amount
  first (bills with the due date); deliveries show how far the parcel has got;
  spam is smaller and quieter. Display text uses a pixel font (`PixelFont.cs`);
  email content uses a clean sans. `Checks/cards/` has one of each.
- **A cut** follows the blade: the email splits in two along the line of the
  swing, the halves tumble apart and burn up in square cells, pixels spray
  along the cut, and the world holds still for a few frames (`Juice.cs`).
- **An email's journey**: it comes out of the middle of the sky as a speck,
  settles in front of the player and drifts slowly closer. Left alone for
  five seconds it flies on past a shoulder and goes to the back of the line
  to come round again, undecided and with no penalty. The timings are
  `arriveSeconds`, `readSeconds`, `approach` and `passSeconds` on the `Game`
  object.
- **The round**: a short countdown, then "ROUND 1" with a square per email at
  the top; each square takes the colour of what happened to that email. No
  score; a run of good calls shows as a streak on the pop-up, and the summary
  gives a rank.
- Music: `Assets/Resources/Audio/RetroSaberMusic.mp3`, from the countdown to
  the summary. Nothing else plays at the start of a level.
- Sounds: `slash1`, `slash2`, `wrong`, `sort`, `arrive`, `blip` and `done` in the
  same folder were generated with ElevenLabs. Replace a file to change a
  sound; delete one and a synthesised sound is used. The saber's hum is
  synthesised in `Sfx.cs`.
- Home screen: the logo (`Assets/Resources/Logo.png`), a level picker, the big
  button (its words are `InboxGame.PlayWords`) and a settings gear, not built yet.

### Kyoto Dusk — Komorebi garden

A seated view from the Komorebi gazebo: cherry blossoms and a stone lantern
on the left, a mossy stone path leading to a torii, and a shrine beside a lily
pond on the right. Pines, distant cliffs, clouds and drifting petals complete
the garden. It is the second chip on the level picker.

- **Environment assets:** nested prefabs, materials, textures, sky, water and
  particles come from the purchased **Raygeas / Komorebi Nature** package.
  The sculpted Unity terrain uses its terrain layers and terrain material.
  No generated Blender courtyard meshes or baked atlases are used here.
- **Rendering:** URP 17.6 forward rendering in linear color space, soft directional shadows,
  4× MSAA, depth and opaque textures for the package water, restrained bloom
  and color grading. Original foliage shaders and LOD groups are retained.
  The package's painted textures supply the brush detail.
- **Time of day:** six seconds at midday, then a 70-second transition to
  lavender twilight during a round. Sun angle, sunlight, ambient colors,
  sky, fog and warm lantern spill change together. Home resets to midday.
- **Motion:** the package's wind shaders animate trees and grass; its
  particles supply falling blossoms, clouds and mist. Hits stir a brief gust
  and petal burst. The pond uses the
  package's animated water and water lilies.
- **Editing:** open `Assets/Scenes/KyotoGarden.unity` for the standalone art
  scene. `Assets/Resources/Komorebi/Garden.prefab` contains the editable garden. `KomorebiGarden.twilight` previews lighting from 0 to 1.
  `Assets/Editor/KomorebiBuilder.cs` contains the deterministic layout recipe;
  **Inbox Zero > Komorebi > Rebuild Garden** replaces the generated prefab,
  terrain and rendering profiles, so preserve hand edits in a prefab variant.
- **Gameplay:** the existing katana and paper letters remain. These are game
  props, separate from the Komorebi environment. RetroFx is disabled in Kyoto;
  the Retro Saber level keeps its existing renderer and effects.

### Kyoto v2 — the courtyard, replanted

The first Kyoto courtyard again, seen from its veranda, with the Komorebi
pack's plants and stones in it and live light on it. It is the third chip on
the level picker.

- **Old:** the veranda, machiya, walls and shut gate from the Blender scene
  (`Assets/KyotoV2/Architecture.fbx` with a colour atlas and an occlusion
  map), and its painted sky and mountains as the backdrop
  (`Assets/Resources/Kyoto/Backdrop_Dusk.png` and `Backdrop_Night.png`, drawn
  by `KyotoDuskSky.shader`). The katana and the paper letters are the same.
- **New, from Komorebi Nature:** the largest cherry tree, wide stepping
  stones, mossy rocks, the stone lanterns, a lily pond beside the machiya, a
  hanging lantern by the gate, and bamboo, bushes, ferns and flowers along
  the left so that wall hardly shows. Little stands beyond the walls: the
  painting is the background.
- **Light and time:** deep dusk, then a 70-second fade to night during a
  round (`KyotoCourtyard.cs`). Little light comes from the sky and it is
  cool, so the shade under the tree is blue and deep. The last sun comes low
  past the cherry tree, lights its blossom from behind, warms the machiya
  and sinks; the moon takes over from the same side; the painting fades to
  its night; the lamps and paper windows come up and flicker; fireflies
  gather. `KyotoCourtyard.night` previews it from 0 to 1.
- **Bloom and air:** a filmic (ACES) grade with wide bloom, warm highlights
  against blue shadow, deepening at night
  (`Assets/KyotoV2/Generated/Grade Dusk.asset` and `Grade Night.asset`).
  Shafts of light come down past the canopy while the sun or moon is up,
  haze lies in layers over the moss, the pond and the back wall, and every
  lamp has a soft halo (all `KyotoHalo.shader`). Petals fall. A small live
  reflection of the courtyard serves the pond, the wet stones and the deck.
- **Contact shadows:** on a monitor the level draws through its own renderer
  (`Assets/KyotoV2/Generated/Renderer.asset`, second in the shared
  pipeline's list), which adds URP's screen-space ambient occlusion. A
  headset uses the plain renderer to spare the cost.
- **Editing:** `Assets/Resources/KyotoV2/Courtyard.prefab` is the scene.
  `Assets/Editor/KyotoCourtyardBuilder.cs` is its recipe: **Inbox Zero >
  Kyoto v2 > Rebuild Courtyard** replaces the prefab and everything in
  `Assets/KyotoV2/Generated`, so keep hand edits in a prefab variant.
  **Capture Review** renders it from the seat to `Checks/v2-review`.
  To change the buildings, edit the Blender scene and rerun
  `Blender/kyoto_courtyard/source/export_v2.py`, then rebuild.
- **Shared with the garden:** the URP pipeline asset in
  `Assets/Resources/Komorebi`. Kyoto v2 raises its per-object light limit
  from 4 to 8 and adds its renderer to the list; the garden keeps the first.

A level is described in `Levels.cs` (`world`, `scene`, `weaponModel`, `paper`,
`retro`, `hum`, `trail`); `InboxGame.ApplyLevel` dresses the scene for the one
picked. Both Kyoto levels run through `KyotoWorld.cs`, which loads the prefab
named by `scene` and drives it through `IKyotoScene`.

## Where things are

- `Blender/build_models.py` models the saber and the platform and exports them
  to `Assets/Models`. Rerun it with
  `Blender --background --python Blender/build_models.py`.
- `Assets/Scripts/Session.cs` is the rules; `InboxGame.cs` is everything you
  see and touch. Tuning values are on the `Game` object in the scene.
- `CardArt.cs` draws the cards, buttons and labels through `Painter.cs`, a
  small 2D canvas that renders into textures.
- Menu **Inbox Zero**: Rebuild Scene, Run Playthrough Check (plays a whole
  session and saves screenshots to `Checks/`), Build Mac App.

## Quest

The project is set up for Meta Quest through OpenXR (Meta Quest Support, Touch
controller profiles, and hand tracking from the XR Hands package). Menu
**Inbox Zero > Build Quest APK** writes `Builds/InboxZero.apk`; install it with

    adb install -r Builds/InboxZero.apk

(`adb` ships with Unity under `PlaybackEngines/AndroidPlayer/SDK/platform-tools`.)

In the headset: poke the home buttons with a fingertip, or point a controller
and pull the trigger. Round 1: the weapon is in your right hand; pinch or make
a fist with the left to grab an email and throw it aside. Round 2: grab with
either hand. Controllers work too (grip or trigger closes the hand).

`Assets/XR` holds the XR settings Unity generated. **Configure For Quest**
rewrites them and the Android player settings if they drift.

## Art review and validation

**Inbox Zero > Kyoto > Preview Garden in Play Mode** opens the garden with
interface hidden. Press **N** to compare midday and twilight, **H** to hide
the hint, or **F1** to return to gameplay.

**Inbox Zero > Komorebi > Capture Midday and Twilight** renders the actual
prefab and shaders in an isolated preview scene at midday, twilight, two
side angles and behind the seat. It writes `Checks/komorebi-review/*.png`,
a shader/mesh report and an asset-source manifest. **Run Playthrough Check** exercises the game,
level switching, the katana, letters and dev-view controls.

The additional **Komorebi** quality entry includes URP in player builds; the
existing platform quality defaults remain selected. The garden switches its
renderer on entry and restores the previous renderer on exit.

**Inbox Zero > Komorebi > Validate Android Scripts** compiles player scripts
without making or installing an APK.

The implementation before the Komorebi replacement is archived in
`Backups/kyoto-before-komorebi/code-and-settings.zip`. Earlier Blender art
remains in the project as an unused environment archive.

Quest stereo output and device frame rate still need validation on hardware.
The desktop capture and simulated hand checks do not measure headset performance.
