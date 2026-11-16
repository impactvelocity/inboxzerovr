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

**Built 2026-11-14** (step 0 too), not yet played on the Quest. Your answers: a fist grabs and makes the weapon live (fist only: a pinch counted too until later the same day, "make it just fist only, not pinch"), more forgiving, the weapon always in the hand. In `src/controls/hand.ts`: hand tracking is on; a hand's closedness is its fist; a dropped hand is held for 0.2 s; the weapon grip is fitted from the wrist and knuckles to the drawn controller fist, lean included (a tracked hand's own grip pose pointed the katana back at the player in the emulator). The hand numbers are `handTune` in `letters.ts`, laid on only while that side is a hand. Weapon holds for hands were tuned on the headset for all seven levels (LumberHack's first try was made watching the built copy, which shows no live tweaks, so it was cleared and tuned again on 5183) (tune.html's Hands switch; saved as `<level>@hands` in `src/weapon-holds.json`, on top of the controller holds). Not built yet: the tick sound and rim flash in place of rumble, a Hands section in Settings, a hands switch in `tune.html`. The fist needs all four fingers curled (later the same day: "the fist is too senstive"), so a loose grip or a pointing hand does not count; it latches on and off and the grip is smoothed ("more jittery when hitting").

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

**Built 2026-11-15** in `src/controls/desktop.ts` and `src/controls/desktophands.ts`, as you laid it out after the click-to-slash version ("dont like the auto attack"):

- **Weapon:** hold the left button to make it live; it follows the cursor as it always does. No slash animation, nothing by itself: it cuts only where you sweep it while held. The sprayer sprays while held.
- **Grab:** the left hand stays still (the mouse never moves it). Hold Space and the letter in front, wherever the cursor is, comes to the middle of the view, 1.8 times bigger (`MOUSE_GROW`; 1.2, then 1.55, then "make the email a bit larger"), held up a little and leaning back a touch, floating gently (about a centimetre of drift and a slight rock: "not so static, subtle"); the drawn left hand lifts only a little from where it rests ("move a bit less") and closes to a fist ("more of a closed fist when grabbing"; then "model the hand twisting a bit to the left and make a fist better": it twists 30 degrees to the left, `__vr3.desktop.look.leftTwist`; a tighter fist with each joint bent further was taken out, "undo the hand fist, this looks really bad", so the fist is the SDK's own closed pose; then "use the same model for the hand open palm and close in the how to play card": the left hand is posed by How to Play's own `handPoser` in `src/handguide.ts`, an open palm at rest closing to the card's fist, little finger first), with the thread from its fingers to the letter ("show the line from hand"). Let go of Space and it is thrown away for later (round one: SAVED; round two: LATER). In round two, 1, 2 or M while holding it (or while it waits) answers it.
- **No round two on a screen** (browser or phone): "the choosing a reply, or recording is hard to do in this ... if playing game in browser / mobile it skips round 2". Round one ends the game (`twoRounds` in `letters.ts`), and on a screen every game starts with a card in place of How to Play (`#browser-intro`; your words: "a modal before game starts ... VR Game - desktop is only round 1 / then explain in text to space bar to grab email, mouse click to activate weapon and mouse to slash / this would replace the intro how to play in browser"). The game waits while it is open; Play or Enter starts it with the level's name, Esc goes home. In VR, How to Play is unchanged. (Before the card: a note at the top of the page, then "Only Round 1 In Browser" under How to Play's skip line; both are gone.) On a phone the card shows the same mouse words until step 3. Not done: the in-game How to Play still explains round two on a screen.
- The view never moves ("stationary view, head on"). The mouse is a normal cursor drawn as a ring, no pointer lock. Esc goes to the menu. `?mute=1` mutes a test tab.
- The weapon is held with the controller hold ("use the position setup from controller for now"): the fist low on the right, rolled so the back of the hand shows, the blade rising to the cursor. Its numbers can be tried live from the console: `__vr3.desktop.look`.

How it got here, in your words: "mouse to move head ..." (a head turned by the mouse), "stationary view, head on, dont move head, its bad experience", "for weapon, only move when left mouse down" (then "its not great, how about you do what you feel is the most game friendly default": click to slash, right button to grab and carry), "rotate the hand model so more of the top of the hand is visible, and make the grab a bit nicer better modelled", then the layout above.

**Every level's weapon** (2026-11-15, "do the same edits / review of all the other weapons, and make them feel good on desktop"): each is held the same way, with its own desktop numbers where it needed them (`HeldSpec.desktop.mouse`: depth, side, roll, upright; try others live in `__vr3.desktop.look.now`). The keyboard is turned so its keys face you and held further out (roll 180, depth 0.6); the axe gets a quarter turn so it stands up with its head at the top (its hit line runs to the toe of its edge, forward of the handle); the sprayer and flame thrower stay upright, nozzle to the cursor; the knight's sword and the saber needed nothing. Checked on all seven: three of three sweeps cut on each swung weapon, a sweep with the button up cut nothing, the sprayer and flame melted or burned the letter under the cursor and nothing when aimed away, and Space grabbed and kept on each. In the emulator the axe sits exactly where it did before today's work (the same numbers, to the millimetre).

Checked in the Browser pane on Kyoto: a plain click cuts nothing, a held sweep cuts, Space takes a letter with the cursor far from it and holds it in the middle 1.2 times bigger whatever the mouse does, letting go keeps it (round one) or leaves it for later (round two), and Space with 1 sends a reply. Other levels' weapons and the sprayer are not checked yet. Touch still drags to look until step 3.

The plan as first written, for reference:

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

**Built 2026-11-15**, in the same files as desktop (`src/controls/desktop.ts` reads a finger too). Your idea: "swipes are the weapon, and email touch and press is email grab"; your answers: on the sprayer and flame levels "Hold sprays, KEEP button", and "Landscape only".

- **Swipe** to slash: the weapon jumps to where the finger lands and follows it; once it has moved 12 px it is live. A tap does nothing.
- **The GRAB button**, low on the left in the level's colour, on every level, shown from the start of a game (the ready and the round's title too, so it is seen first: "show grab button on intro so they can see it") but not at the end ("hide grab button at end sequence"); holding it draws the thread from the button to the email: held, the email comes to the middle as Space does on a desktop; let go, it is thrown for later ("add a button lower left corner for grab, so that way it can grab (release to throw) or slash"). It replaced a first try at touch-and-hold on the email, and the KEEP button the spray levels had.
- **Toxic Danger and Inferno:** a finger down sprays at once, where it is.
- No left hand is drawn on a phone, no thread to a held email, and no hint line along the bottom ("on mobile - hide the left hand", "also remove the lower text").
- **Round one only**, with the browser card before every game, now headed "Browser Demo" over "Desktop (or Mobile) plays Round 1 only" and "Play for real on a Meta Quest" (2026-11-15; it was "VR Game - desktop is only round 1"), in the finger's words on a phone ( Swipe / the level's verb, Grab button / Grab email; on the spray levels Hold / Melt or Burn).
- **Upright only** (after a first try at sideways, which tested fine: "make it protrait only, not landscape"): turned sideways, the card shows only "Turn your phone upright to play" with Play greyed out; mid-game a "Turn your phone upright" screen covers it and everything waits, the letter in front too. Play asks for full screen and an upright lock where the browser allows it. On a narrow screen the weapon's and hands' sideways offsets come in to match (`narrow()` in desktop.ts), the held email is never wider than nine tenths of the screen, and the card's boxes stack.
- **The phone's home screen fits one screen** ("make the level select smaller on mobile", then "fit the 7 levels nicer, may different layout"): the first level a wide banner, the other six two by three, sized by the screen's height; checked at 375 by 812 and 375 by 560.
- **The phone's home screen is the demo only:** "on mobile should be only play demo - hiding how to play and center code, and mic". Just Play is the one big button; How to Play, Enter Code and the mic are hidden, and the mic is never asked for (round two is skipped there anyway). A phone is a finger and not a headset (`body.phone`).
- Nothing on the page is selected, called out or pulled down by a finger while playing.

Checked in the Browser pane's phone emulation (740 by 360 and 360 by 740): tap no cut, swipe cut, hold on the email grabs and lifting saves, hold off it nothing; on the lab a held finger melted the letter and KEEP grabbed and saved; upright the card and the cover screen show and the letter does not move. Desktop and VR re-checked unchanged. **Not tried on a real phone** (`npm run dev:https` over Wi-Fi), so not yet known: how swipes feel at a phone's frame rate, iPhone Safari's own gestures, and whether a phone needs lower quality settings (not changed).

The plan as first written, for reference:

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
