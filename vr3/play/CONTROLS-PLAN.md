# Control setups: the plan

Written 2026-11-14 from the shared chat about phones, laptops and hand tracking. Nothing here is built yet.

**Rule one: the Quest controllers are dialed in.** Their numbers, holds and code path stay as they are. If anything about controller play changes after a step, that's a bug.

**Order:** controllers (done), then hands, then desktop, then mobile.

## How input works today

Seven places read the headset's `session.inputSources` directly:

| What | Where |
|---|---|
| Left hand grab: grip pose, trigger or squeeze (0.55 to close, 0.25 to stay closed), the reach line from the shoulder, the pointing ray | `src/letters.ts:1708` (`readHand`) |
| Right trigger makes the blade live (Trigger cuts) | `src/letters.ts:2573` |
| Rumble | `src/letters.ts:1766` (`buzz`), `src/howto.ts:307` |
| The katana on the right grip | `src/sword.ts:150` |
| Every other level's weapon on the right grip | `src/weapons/held.ts:202` |
| Sprayer and flame: right trigger | `src/main.ts:361` |
| Outline hands: the controller models swapped for hand models, the sword fist locked shut | `src/hands.ts`, `src/main.ts:380` |

On a monitor today: drag or the arrow keys look around, X or Space cuts the letter in front (no aiming), C keeps it, 1, 2 and M answer in round two, Esc leaves, H opens Settings. The weapon is staged in front of the camera and Space plays a canned swing (`held.ts:214`, `sword.ts:152`). Phones get the same flat mode with nothing made for touch.

Hand tracking is off: `features:{handTracking:false}` in `src/main.ts:95`.

**Trap:** Quest Browser gives a tracked hand a gamepad with the pinch on button 0 (IWER's `XRHandGamepadConfig` says so). If hand tracking were switched on as things are, a right pinch would make the sword live, a left pinch would grab, and every weapon would sit on the hand at offsets tuned for a controller's grip. So the step below comes before hand tracking is switched on.

## Step 0: one controls layer, with controllers unchanged

- A new `src/controls/` folder holds one state per side, read once a frame:
  - `kind`: controller, hand, mouse or touch
  - `grip`: where a held thing sits (a matrix)
  - `aim`: a ray (origin and direction)
  - `grab` (left) and `arm` (right), each 0 to 1, and `tracked`
  - smoothed velocity and the recent peak (the throw already uses a 0.12 s peak)
  - `buzz(strength, ms)`
- `controls/controller.ts` is the seven reads above moved into one file as they are: same thresholds, same smoothing, same order.
- `letters.ts`, `sword.ts`, `held.ts`, `main.ts` and `howto.ts` read the layer instead of `inputSources`.
- Numbers: `tune` in `letters.ts` stays as it is and becomes the controller set. Other modes get small override sets laid on top (`tuneFor(kind)`), so a controller number can't move by accident.
- Holds: `weapon-holds.json` and `SWORD_HOLD_DEFAULT` stay the controller holds. Hands get a hold of their own for each weapon, because a tracked hand's grip pose isn't a controller's.
- **Check:** a scripted controller run in the emulator, before and after (the same IWER poses: reach, grab, throw, trigger, sweep), must give the same numbers: hand position, blade tip, what was cut and kept. Then you play a round on the Quest with controllers before hands start.

## Step 1: hands

**Telling them apart:** for each side, `source.hand` means a tracked hand, otherwise it's a controller. Check again whenever the session fires `inputsourceschange`, since people put controllers down mid-game. One of each is fine. `?controls=hands` forces it for checks.

| Action | Controller (today) | Hands |
|---|---|---|
| Grab (left) | trigger or grip | fist (pinch too? open choice 1) |
| Throw | let go | open the hand; speed is the wrist's peak over about 0.15 s |
| Make the weapon live (right) | trigger | fist |
| Sprayer, flame | trigger | fist, aimed along the forearm |
| Choose in the VR menu | squeeze on a card | fist on a card (pinch also works, it's the system click) |
| Round two replies and mic | hold the letter there | the same |
| Skip How to Play | swing through it | the same |

- **Fist:** how curled the index, middle and ring fingers are (fingertip to wrist, divided by wrist to middle knuckle, so big and small hands match). It closes below one value and opens above a higher one, and must hold for 2 or 3 frames before it changes. How to Play's hands already show "close hand to activate", so this matches what players are taught.
- **Tracking drops on fast swings:** keep the hand moving at its last speed for up to about 0.2 s and keep the weapon live through it. If tracking returns inside that window, the gap counts as one sweep that can cut. Today `BladeTracker` throws away any jump over 0.5 m.
- **More forgiving hits in hand mode** (first guesses, tuned on the headset): blade `hitDepth` from 0.12 to about 0.16, a wider `swordWiden`, a slightly wider reach line, maybe a stronger throw.
- **No rumble:** each `buzz` becomes a short tick sound and a flash on the hand's rim instead (when the weapon goes live, when a card lights).
- **Drawn hands:** IWSDK's own tracked-hand visual (`visualAdapters.hand`), styled like the lit outline hands. What the weapon does while the right hand is open is open choice 2.
- **Tuning:** `tune.html` gets a Controller/Hands switch, so hand holds are tuned live on the headset the same way. Settings get a Hands section (fist sensitivity, the tracking grace, forgiveness).
- **Checks:** the wiring in the emulator (`__xrDevice.primaryInputMode = 'hand'`, IWER's fist and pinch poses). The feel only on the headset.
- **Unknowns, for the Quest:** which way the hand's grip pose faces in Quest Browser; how often a hard swing loses tracking on the 3S; whether a fist sets off any system gesture.

## Step 2: desktop (mouse and keyboard)

- **Camera:** fixed on the seated view (the letters already come down the middle), with a gentle sway of a few degrees toward the cursor. No drag-to-look while playing.
- **One pointer layer for mouse and touch** (pointer events), with numbers chosen by `pointerType`.
- **Right hand is the cursor.** The weapon follows it with a little spring, its blade pointing into the scene where the cursor is. Hits use the real blade, so cut lines, pieces and reach behave as they do in VR.
- **Press and drag** is a swing: the weapon is live while the button is held and the cursor moves fast enough, with trail, glow and hum. Speed is measured in the world at the letter's distance, so `cutSpeed` still applies. A mouse needs about twice a finger's threshold.
- **Grab:** hold the right mouse button on a letter (open choice 3). It comes to a held spot low on the left and follows the cursor. Let go while moving and it's thrown at the cursor's speed. In round two, drag it onto a reply or the mic and hold.
- **Sprayer levels:** hold to spray where the cursor points.
- **Keys stay as shortcuts:** X, C, Space, 1, 2, M, Esc, H.
- **Hints:** `(hover: hover) and (pointer: fine)` picks the hint words shown. Every input works at all times.
- **Checks:** the Browser pane on 5183 with scripted pointer events.

## Step 3: mobile (touch)

- **The same pointer layer:** swipe to slash; touch and hold (within 10 px for 0.35 s) to grab; lift to throw. A finger gets more hit room and a lower swipe speed.
- **Fixed camera, no gyro at first:** swiping and gyro look together feel chaotic.
- **Landscape,** since the levels are wide paintings, with a "turn your phone" card in portrait (open choice 4).
- **Page behaviour:** `touch-action: none` on the canvas, no pull-to-refresh, full screen on Start where the browser allows it (Android does, iPhone doesn't).
- **Phone settings:** low quality by default and a capped pixel ratio.
- **Vibration** on hits where the phone allows it (Android only).
- **Start on a phone** plays on the screen. Don't offer Enter VR just because `isSessionSupported` says yes, which Android Chrome can. Check that on a real Android phone.
- **Checks:** the Browser pane's mobile preset (touch), then a real phone (`npm run dev:https` over Wi-Fi).

## Later, not part of these steps

- The home screen's How to Play cards and the site's controls section show Quest hands only. Desktop and phone versions come once those modes feel right.

## Open choices, asked at the start of each step

1. Hands, left: fist only, or fist or pinch?
2. Hands, right: is the weapon always in the hand (cutting only while you make a fist, as the trigger does now), or does it only appear while the fist is closed?
3. Desktop grab: right mouse button, or press and hold (the same as the phone)?
4. Phone: landscape only?
