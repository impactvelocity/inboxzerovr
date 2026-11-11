# VR3 — Kyoto, after the rain

A separate IWSDK web VR atmosphere prototype: two matching 270° panoramas blended in one shader, with a little actual 3D motion in front. No Unity runtime, imported environment models, physics, shadows, or locomotion.

## Run

Use Node 24 (`nvm use` in this folder), then `npm install` and `npm run dev`. Open http://localhost:5183.

Drag or use arrow keys to look around. H hides controls. The demo evening fades from dusk to twilight over 20 seconds, then holds. The Transition selector also offers 60 seconds or the original relaxed 180 seconds. Scrubbing pauses the transition; Resume or Restart starts it again. Atmosphere exposes transition speed, depth strength, breeze, motion, and detail controls. Reduced-motion preference disables drifting and canopy animation by default.

For a headset on Wi-Fi, run `npm run dev:https`, open the network HTTPS URL printed by Vite, accept the local development certificate, then choose Enter VR. Alternatively use `adb reverse tcp:5183 tcp:5183` over USB and open http://localhost:5183 in the headset browser. HTTPS or localhost is required for immersive WebXR; the HTTP LAN address only supports desktop preview.

`npm run build` typechecks and produces `dist`. Deploy that folder to an HTTPS static host. `npm run preview` serves the build on port 4183.

## Scene

- A 45 m inward sphere wraps a purpose-built seated panorama across 270°. The whole courtyard occupies the center of the artwork, with continuous covered veranda at either side. A smooth horizontal remap brings the courtyard into the forward view without introducing a panel boundary. The rear gap and vertical poles fade into shelter color.
- The backdrop follows viewer translation; head rotation remains tracked. A softly weighted, head-translation-driven relief offset shifts the near veranda more than the distant sky. The displacement is clamped to 0.002 UV, with 18 cm of supported lean and a Depth strength control. It captures a fresh seated origin after VR entry and freezes with Motion off. This is subtle 2.5D relief, not reconstructed geometry or walkable space; no autonomous camera motion or change to the approved central framing.
- 72 instanced six-triangle cherry petals and 12 leaves tumble slowly. Light detail uses 32 petals and 5 leaves. These are tiny procedural meshes; external model packages are unnecessary.
- 120 dust points (48 on light detail), a hemisphere light, and a warm lantern light add atmosphere.
- 28 softly glowing, slowly drifting light motes (12 on light detail) add depth. Layered ground mist, two different speeds of drifting cloud haze plus masked movement of the painted sky, and warm lamp/reflection halos are calculated in the panorama shader, using no extra textures or fullscreen bloom buffers. Lantern illumination and halos share a gentle flicker. The Motion toggle also freezes these effects.
- Softly masked puddle distortion animates the open water and reflections with sideways-travelling shallow waves and analytic ripple-slope shading (a lightweight normal-map approximation). Both time-of-day images use the same sampling offset. It avoids the central stone path and veranda, responds to Breeze, freezes with Motion off, and adds no textures or draw calls.
- A tiny masked texture-coordinate distortion moves the cherry canopy. Both images receive identical distortion. This approximates wind; it is not an articulated tree.
- No floating HUD or player mesh in immersive mode. Set mood and motion using browser controls before entering.

## Verification and limits

Desktop Chromium: no page or shader errors; dusk/twilight render; slider reaches twilight and pauses; restart resets; detail and motion toggles work; mobile layout inspected. The base scene was measured at 4 draw calls, 4,472 triangles at full detail, 4,190 at light detail, and 2 textures. The added light-mote batch adds one draw call; shader fog and glows share the existing panorama pass. The panorama images are compressed WebP assets. These counts are not a headset frame-rate guarantee. Physical headset testing remains outstanding.

IWSDK 1.1.0-rc.2 has substantial framework overhead: an approximately 1.7 MB gzipped main framework chunk plus lazy SDK assets. Physics and spatial UI are disabled at runtime, but their optional support files still appear in the build.

The repository ignores media globally. Required local assets: `public/garden/dusk-v2.webp` and `public/garden/twilight-v2.webp`. Include them when transferring or deploying. Original PNGs and prompts remain in `../output/imagegen/kyoto-garden-v2`.

`src/garden.ts` owns backdrop, lighting and particles; `src/main.ts` owns IWSDK setup, timing, look controls and VR entry. `window.gardenDiagnostics()` reports blend and render counts. `checks/smoke.mjs` is the local browser smoke check, using the existing sibling Quest project's Playwright installation.

SDK reference: https://iwsdk.dev/guides/01b-minimal-scene.html


## Music

The user-provided 京都の静けさ track plays only during VR, loops, fades in gently, and pauses on exit or when the native XR session becomes hidden. Re-entry resumes from its previous position. Music and Volume controls are under Atmosphere. If native Quest autoplay is blocked, press a controller trigger once to retry with user activation.

Runtime asset: `public/audio/kyoto-serenity-aac.m4a` (232.8 seconds, stereo AAC at 44.1 kHz, approximately 4.5 MB). Converted from the supplied download, loudness-normalized to -20 LUFS with a -2 dB true-peak target, then played initially at 50% volume. The source in Downloads is unchanged. Playback streams through an HTMLAudioElement instead of decoding the complete track into Web Audio memory.

Music-only scope confirmed by the user: no generated or synthesized nature effects are included. Sound-effect generation through the connected service was plan-blocked, and no direct ElevenLabs API key was configured.

Browser verification: music reports playing on simulated VR entry; it pauses on exit; muting before VR entry keeps it off. Physical-device audio volume/autoplay should be confirmed by listening on the headset. Include the local AAC asset when deploying; audio media is ignored by Git.

## Sakura katana

`src/sword.ts` builds a lightweight Three.js katana from curved beveled blade geometry, crossed rose cloth ribbons over ivory rayskin, burgundy fittings, and an antique-brass blossom guard. Three 256px procedural textures and a small generated reflection environment supply surface detail without downloaded models or postprocessing. The design reference is `design/sword/reference-sheet.png`.

In VR the handle follows the right input source's native grip pose, with no artificial swing animation. The `hold` matrix at the top of `src/sword.ts` seats it in the fist: blade out of the thumb side, cutting edge towards the knuckles, the fist 6.5 cm under the guard, and an 18° forward lean (27° above where a Quest controller points). `HOLD_BELOW_GUARD` and `HOLD_FORWARD_TILT` are the two numbers to tune on the headset. Controller meshes are hidden. Loss of tracking hides the sword and clears the trail. A pooled, velocity-driven lavender ribbon fades over 180ms; discontinuous tracking and session changes reset it. Motion off disables the ribbon while retaining controller tracking. Desktop has a Preview sword swing button.

Verified: TypeScript check; production build; desktop swing ribbon and materials; stereo simulator right grip attachment, hidden controller meshes, and sword disappearance when the right controller disconnects. No browser console errors. Physical Quest grip comfort and frame rate remain to be assessed on-device.
