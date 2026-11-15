# Inbox Zero VR demo film, plan

## v42 (2026-11-14)

- Every level shot is 4 s (was 5); the pauses after the level lines are now 0.6 to 2.0 s. The film is 2:13.3.
- The Inferno clip starts 1 s in (its frame 31), where it gets interesting; its hits are re-timed to match.
- Music: the Keyboard Smash song (`office/music.m4a`) for the whole film, one continuous play, instead of Kyoto's. It starts 2:28 into the song so the song's real ending closes the film; held steady at about -31 LUFS under the voice (evened out), then lifted to about -23 for the ending clip, where the same song carries on unlevelled into its last hits and ring-out.
- Fix: the effects mix could stall at the end (ffmpeg waiting on a never-ending input); every effect track is now padded to the film's exact length before mixing.

## v41 (2026-11-14), a new ending

- Everything after the "Become a hero with inbox zero" card is gone: the 20 s gameplay montage and the six feature badges.
- After the card (held 1.6 s past the line, as before) comes `vr-video/02-keyboard/keyboard-outro.mp4`, 13 s, whole: the monitor smashed for 8 s.
- 8 s into it the dark overlay fades up, the Keyboard Smash logo and the pixel Meta mark with "Built for Meta VR Hackathon" come in and float a little (a slow bob and breathe), the overlay deepens to black under them over 1.4 s, and they fade out on the last frame.
- Music: the Kyoto song now ends on the hero card (its own ending, timed to land there). The Keyboard Smash song (`office/music.m4a`) comes in under the card's last moment and plays over the ending clip at about -23 LUFS (louder than the -31 bed: no voice there), from 4:27 into it, so its real last hits and ring-out close the film.
- Light keyboard hits on the ending clip's smashes before the overlay.
- The film is 2:20.3. The chapters lose "Gameplay and what's inside".

## v40 (2026-11-14)

- Every level shot is 5 s (was 7 for Keyboard Smash and 6 for the rest): `LEVEL_SHOT` in `tools/build_vo.py`, which solves each level's pause (now 1.6 to 3.0 s). Each clip plays its first 5 s. The film is 2:26 (146.9 s); everything after the levels is 8 s earlier.
- Each level's name sits top right in the pixel font and the level's own colour (on a small dark plate with stepped corners), popping in with the level's logo.
- The voice has no effect on it any more: the plain take (`VOICE_FX = False` in `tools/mix.py`).
- The sword split is half a second later, at 0:06.5; the sword clip now starts at its frame 10 so its own cut still lands on "sword". 160 pink petals, hot-pink sparks and white glints are flung off the cut line as the screen splits, and drift on over the sword shot.

## v39 (2026-11-14)

- "One round at a time" stamps in word by word: each word is on almost at once (0.05 s), drops in from 1.8x with a small bounce, and sprays keycaps out sideways as it lands (cream keys with a darker side, and a few mint pixels).
- No fade out any more. At 0:18.3 the Keyboard Smash icon swells and pops away in a last burst of pixels and paper, and every word of the headline hops and falls off the screen with a spin, the bottom line first, while the dark overlay clears behind them.

## v38 (2026-11-14)

- The opening's notification banners sit in four even rows (128 px apart) centred on the middle of the screen, where they used to start near the top. They form a gentle arc round the icon (the middle rows tucked 50 px closer to it than the top and bottom ones), with much less random scatter (a few pixels, and tilts of about 2 degrees, leaning in towards the icon), and they drop a shorter way into place.

## v37 (2026-11-14)

- 0:40.6 to 0:44.4 ("Every email you keep comes back with two short replies from your agent") is now a stretch of `vr-video/08-kyoto-hands/kyoto-hands.mp4` (a 67 s hands playthrough), its frames 1222 to 1335: the ROUND 2 / 1 TO ANSWER countdown, then REPLY! and the two reply boards appearing on "two short replies", the email floating in between them. It replaces my last desktop capture in this section.

## v36 (2026-11-14)

- "Built for Meta VR Hackathon" is in the pixel font, with a pixel-art Meta mark: the loop rasterised onto a 26 x 12 grid, two cells thick, in four hard steps of Meta blue (drawn by me, not Meta's file).
- The Keyboard Smash mail icon is pixel art to match its badge: stair-step corners, a fill in hard mint bands, and a 16 x 11 pixel envelope.
- The cut streaks are centred on the icon and sweep along their own line, so each crosses the icon (they used to swing below it), drawn on top.

## v35 (2026-11-14)

- The seven level shots are the user's own level clips from `vr-video/`, each played whole at real speed: Keyboard Smash 7 s (`02-keyboard/keyboard-level.mp4`), and 6 s each for The Haunted Hall, Toxic Danger, Inferno, Kyoto Nights, LumberHack and Super Space.
- Each level's pause after its line is now solved so the shot is exactly its clip's length (`LEVEL_SHOT` in `tools/build_vo.py`; pauses now 2.6 to 4.0 s instead of a flat 3.5 s). The film is 154.9 s; everything after the levels moved by up to -0.7 s, all re-timed from the cues.
- Hit sounds on each clip's biggest impacts (picked by how much the picture changes, so one or two may sit on a fast camera move): the keyboard's swing-chop-crunch, the castle sword, the lab's melt, Inferno's flare, the katana, the axe chop, the saber.
- Note: `keyboard-level.mp4` is the same recording as the first 7 s of `smash-intro.mp4` (used at 0:11 to 0:20), so those hits appear twice.
- The 20 s gameplay outro still uses my desktop captures.

## v34 (2026-11-14)

- "Clear your email inbox / one round at a time" is set in the pixel font (Silkscreen, 78 px), like the game's labels.
- The Keyboard Smash icon's badge is pixel art now: square with stair-step corners, a mint frame round a dark green screen, the number in the pixel font, a soft glow.
- Music at one steady level ("seems to go in and out"): no ducking any more. The song is evened out with a slow leveller (with a 20 s run-up so the opening isn't quieter) and held at about -31 LUFS, 13 dB under the voice, from start to end; measured every 10 s it stays between -30.2 and -32.0. `DUCKING = True` in `tools/mix.py` brings the ducking back.

## v33 (2026-11-14)

- The Keyboard Smash logo, the dark overlay and "Built for Meta VR Hackathon" now come in at 0:12.0 (on "…to Inbox Zero"), and leave at 0:15 as before.
- 0:15.2 to 0:18.5: the mail icon from the opening comes back in Keyboard Smash colours (a mint tile with a cream envelope; the badge styled like the level's green CRT screen, in the pixel font) and is cut ten times across "clear your inbox, one round at a time": each cut is a mint streak at alternating angles, a shake, the badge counting down one, and a burst of mint and green pixels with a few cream paper bits. It reaches 0 on "time", glows, and the badge pops away; everything fades with the overlay.
- The headline sits under the icon now (88 px, 69% down).
- Ten light keyboard-level swipe sounds on the cuts and a small crunch at zero, quiet under her voice.

## v32 (2026-11-14)

- 0:30.1 to 0:40.6: `vr-video/08-kyoto-hands/hands-slash.mp4` (the in-VR How to Play intro with real hands), at real speed. It rises up over the agent window like a card right after "Open" is clicked (the 0:20 lift in reverse). Its title plays under "Pick your level, and hit play", its two cards (Grab to read / Throw to keep, Grip to arm / Slash to clear) under "Grab an email… throw it to keep it", the katana slashes through the panel at 0:37.4 (on "take your right hand") and the shards fly through "cut it up into tiny little pieces"; the ROUND 1 countdown carries to "Every email you keep…".
- 0:44.4 "Hold it up to the one you like": `vr-video/01-kyoto/reply.mp4`, Reply A glowing on "up".
- 0:45.8 "pull it close to say your own": `vr-video/09-kyoto-v3-controller/recording.mp4`, the email at the mic and the LISTENING panel opening on "close".
- Removed in this stretch (the game's own UI now says it): the level-select screen and its two cursor clicks, the "Game 4821" chip, the hand illustrations, the "Grab to read / Throw to keep / Cut to archive" lines, and the mic bubble.
- The cut hit moved to the panel slash (a katana slash and a glass crunch).
- Placeholders still in this stretch: 0:40.6 to 0:44.4 ("Every email you keep comes back with two short replies") and 0:47.5 onward ("leave it for tomorrow", the end screen) are still my desktop captures.

## v31 (2026-11-14), polish pass on 0:00 to 0:20 only

Reviewed at three frames a second. Nothing after the agent window's arrival was touched.

- Hook: the sixth banner now lands at 3.05 s, filling a lull before Filters (it used to land 0.09 s before the "reminder" banner and had lost its ping); it has a ping now.
- The saber shot on "slash" no longer freezes on its last frame (frames 13 to 30).
- 0:13.5 to 0:18.5: the dark overlay is about 13% lighter once the logo has gone, so the smash still reads behind the headline; it clears 0.15 s sooner.
- The headline "Clear your email inbox" sits centred on its own, then opens up for "one round at a time" (it used to sit high, waiting).
- Keyboard hits are half as loud while the overlay is up and she is talking; full strength again at 0:19.4.
- A soft whoosh on the logo's arrival and on the lift into the agent scene.
- The join at 0:20 (was a hard cut from the smash to white): the overlay clears, the smash plays in the clear for about 0.6 s with one last hit, then the whole gameplay frame lifts up and off like a card (slightly smaller, rounded corners, a shadow) over half a second, and the agent window rises in underneath it. The window now starts 0.33 s earlier and from lower so the two move as one push; everything inside it is timed as before.

## v30 (2026-11-14)

- Notification pings in the hook, made with ElevenLabs (flow "jjoD9U8quf3MSenM0KyR", four takes; prompt: a soft, bright, wooden two-note knock-pop from a modern team chat app, not any real app's actual alert). Take 4 (two notes, 0.3 s apart) is the main ping, take 2 (a single pop) alternates with it; takes 1 and 3 were too quiet or just a click. Trimmed copies are `work/audio/notify/ping-a.wav` and `ping-b.wav`.
- One ping as each banner lands: 0.4, 0.8, 1.2, 1.65, 2.5 s, and the "Reminder: reminder about reminders" banner at 4.97 s (a touch louder). The banner 0.09 s before that one and the last banner under the sword slash get none.
- Levelled like the other hits, about 8 dB under the voice in the hook. Picture unchanged.

## v29 (2026-11-14)

- The "slash" cut at 0:09.7 is now `vr-video/05-space/slash-space-short.mp4` (Super Space's saber) instead of the Haunted Hall: frames 15 to 30, so the saber's swing lands at 10.0 s and the email shatters just before "burn". The hit is Super Space's saber slash.

## v28 (2026-11-14)

- The hook's app icon now starts in the centre of the screen. As Filters arrives (0:03.6) the row under it opens up over about half a second, so the icon glides up and the icon and its Filters / Reminders row stay centred together.

## v27 (2026-11-14)

- The dark overlay at 0:13.5 now stays on through "one round at a time" and fades out at 0:18.6, before "Here's how it works".
- The logo and "Built for Meta VR Hackathon" lift away at 0:15 (as "it's a game to clear your inbox" starts).
- Then, on the same overlay: "Clear your email inbox" (white) rises in once the logo has cleared, and "one round at a time" (mint, the Keyboard Smash green) builds from the centre word by word as it's said.

## v26 (2026-11-14)

- The sword shot after the 0:06 split is now `vr-video/09-kyoto-v3-controller/cut-0m13s.mp4` at real speed (frames 1 to 58 of 75), replacing the slow-motion version: an email floats up, the blade cuts it to pieces at 6.8 s (on "sword"), and the next email arrives before "Or a flamethrower?". A katana hit sits on that cut.

## v25 (2026-11-14)

- 0:11 to 0:20 is one continuous clip, `vr-video/02-keyboard/smash-intro.mp4` (12 s), from "smash" to the agent scene at normal speed (frames 1 to 272; its last 3 s, the monitor powering down, are left out). It replaces the long smash and the Round 1 clip.
- The logo moment at 0:13.5 (Keyboard Smash logo, dark shade, Meta mark and "Built for Meta VR Hackathon") stays, now over the continuing smash; with no cut to hide, the shade fades in with the logo again rather than darkening ahead of it.
- Keyboard hits (axe swing, chop, glass) moved onto the clip's nine biggest impacts.

## v24 (2026-11-14)

- The sword split now lands at 0:06 (`T_SWORD` 6.0 in `scenes/film.js`), on "But have you tried a…"; she says "sword" at 7.0 over the sword clip. The hook is 6 s.
- To fill the 1.9 s to the flamethrower, the 1 s sword clip plays at half speed with motion interpolation (`work/footage/sword-slow`, made with ffmpeg's minterpolate): a slow-motion slash, then its second swing lands on the next email just before "Or a flamethrower?". A 2 s sword clip would play at real speed instead.
- 0:13: the long smash now darkens almost to black over its last 0.6 s (the logo's shade comes in early and darker), the round starts under it, and the logo and "Built for Meta VR Hackathon" come up out of the dark.
- Keyboard hits have more punch: each is now LumberHack's axe swing (just before), its chop, and the glass crunch, on the long smash's three hits, the round's two smashes, and Keyboard Smash's level cuts.

## v23 (2026-11-14)

- Music: the Kyoto song (`vr3/play/public/audio/kyoto/music.m4a`, the user's own track) instead of Inferno's, with the same handling: no fade in, starting 2:23 in so the song's own ending closes the film, about 13 dB under the voice in the hook and about 15 dB under elsewhere, about -20 LUFS in the gameplay outro. Picture unchanged.

## v22 (2026-11-14)

- The Keyboard Smash logo at 0:13.5 now sits over a dark shade (a soft radial vignette) that fades in over 0.35 s and out over 0.5 s, so the logo is in focus and the round comes back gently.
- Under the logo: the Meta mark (drawn as an SVG, a blue gradient loop, not Meta's official file) and "Built for Meta VR Hackathon", sliding in just after the logo and out with it.
- The moment is 2.2 s (was 2.0) so the line has time to be read; the logo sits a little higher to make room.

## v21 (2026-11-14)

- Music "right away": no fade in, and it now starts 2:23 into the Inferno track, so the track's own ending closes the film and the opening is its loudest stretch. Under the 7 s hook it ducks less (`HOOK_DUCK_DB` -7), sitting about 13 dB under the voice so it's heard from the first frame; everywhere else it's as before (`DUCK_DB` -13).
- The 0:07 slash "split the screen and transition to game play footage quickly, more umph": the pink streak cuts across the whole screen at -14 degrees, the white screen splits along it and both halves are flung apart (accelerating, with a shake), the gameplay (the sword clip) shows through the opening gap and punches in from 122% as the halves clear; the streak flares wide in the seam. The white flash is gone. A heavier hit lands on the split (a katana slash and a glass crunch).
- The clips' own sound was never in the mix (only their pictures are used), so they are at 0% already.

## v20 (2026-11-14)

- The new 7 s `vr-video/02-keyboard/one-round.mp4` fills 0:13.5 to 0:20.1 on its own (frames 1 to 198 of 210): countdown 3-2-1 under the Keyboard Smash logo, FIGHT!, the cruise email out of the monitor, a smash at its frame 125 and another at 178. The long-smash filler from v19 is gone.
- Keyboard hits moved to the two smashes.

## v19 (2026-11-14)

- After the smash (0:13.5) the film now cuts straight into `vr-video/02-keyboard/one-round.mp4`, all 4 s of it from the countdown, replacing the level select. It plays to 0:17.5.
- The Keyboard Smash level's logo (`logos/office.webp`) pops into the centre as the round starts, holds, and lifts away, 2 s in all, gone by FIGHT!.
- The clip is 4 s and the stretch to the agent scene (0:20.1) is 6.6 s, so the last 2.6 s are more of `smash-long.mp4` (its frames 84 to 162, more keyboard hits). A ~7 s round clip would replace that.
- The cursor click on Clean Your Inbox and the dip through dark are gone with the level select. The keyboard hits moved with the picture (the round's smash at its frame 95, the long smash's frames 93, 126, 143).

## v18 (2026-11-14), sound back in

- Music: the Inferno level's track (`vr3/play/public/audio/inferno/music.m4a`) from 1:00 into it, faded in and out. It ducks 13 dB under the voice with a look-ahead, so it sits about 18 dB below the voice while she speaks (-35.7 LUFS against -17.5), comes up in the gaps, and plays at about -21 LUFS in the 20 s gameplay outro. Knobs: `DUCK_DB`, `BED_DB`, `END_DB`, `MUSIC_FROM` in `tools/mix.py`.
- Hits, the game's own sounds, each levelled to the same loudness first and then set about 10 dB under the voice (`SFX_DB`, `SFX_NORM`):
  - sword: the slash through the inbox, the sword clip, "slash" (Haunted Hall), "cut it up" and the level cuts (Kyoto, castle, space), the seated player's three cuts;
  - fire: the flamethrower catching, Inferno's cuts;
  - melt: "burn" (Toxic Danger) and the lab's cuts;
  - keyboard: the long smash's three hits, the Round 1 smash, Keyboard Smash's cuts;
  - LumberHack's chops; cuts in the level holds and the outro play quieter than the first.
- 63 hits in all (`buildHits()` in `scenes/film.js`). No blips, whooshes, room tones or stings: the old v1 set stays off.

## v17 (2026-11-14)

- "One round at a time" through "Here's how it works" (0:17.1 to 0:20.1, 3.0 s) now plays `vr-video/02-keyboard/one-round.mp4` from frame 18 (just after the "2" of the countdown): ROUND 1, 16 UNREAD EMAILS, "1", FIGHT!, the first email ("You WON a free cruise") out of the monitor, and the keyboard smashing it as the agent window comes in. It replaces my old Kyoto round intro.
- The level select stays on "Built for the Meta Start Hackathon, it's a game to clear your inbox" (0:13.5 to 0:17.1) with the cursor clicking Clean Your Inbox on "clear". If the clip should cover that line too, the window from the smash's fade to the agent scene is 6.6 s, so it would need about 7 s.

## v16 (2026-11-14)

- "smash" now uses `vr-video/02-keyboard/smash-long.mp4` (6 s) and keeps playing through "your way to Inbox Zero!" (2.4 s on screen, the monitor flashing SMASH and KEYBOARD), then fades out into a dark blur of the level select, which sharpens into the real home screen as "Built for the Meta Start Hackathon" starts (`T_SMASH_END` in `scenes/film.js`, 0.45 s after the line ends).
- The logo slam on "Inbox Zero" and its glide into the home screen are gone; the home screen's own logo carries it.

## v15 (2026-11-14)

- "Slash, burn, and smash" (0:09.7) now uses the user's own captures from `vr-video/`:
  - "slash" (0.58 s): `03-haunted/slash.mp4` frames 1 to 18, the blade mid-cut from the first frame.
  - "burn" (0.8 s): `04-toxic/melt.mp4` frames 33 to 57, the email at its heaviest melt.
  - "smash" (1.4 s): `02-keyboard/smash.mp4` frames 10 to 52, the keyboard hitting the monitor (frame 13) just after "smash", then the screen glitching.

## v14 (2026-11-14)

- The two shots after the hook are the user's own headset captures from `vr-video/`:
  - "But have you tried a sword?" (7.5 s, 0.43 s on screen): `09-kyoto-v3-controller/sword-slash.mp4`, its first 13 frames, opening mid-cut with the paper pieces flying.
  - "Or a flamethrower?" (7.9 s, 1.77 s): `06-inferno/flamethrower.mp4`, frames 8 to 60, so the email catches fire (frame 14) just after "flamethrower" and burns down to the next email.
- The "Slash, burn, and smash" cuts at 0:09.7 still use my desktop captures (all game footage is due to be redone).

## v13 (2026-11-14)

- "Make the filter and badge better - matching the vibe of the rest of it": Filters and Reminders are no longer white pills. Each is a small app icon in the same family as the main one (a purple tile with a funnel, an orange tile with a bell, the label underneath), sitting in a row under the Inbox icon and building from the centre.
- Filters pulses while it "works" (the count dips and comes back); Reminders rings its bell.
- The strike-through is gone. On "But have you tried a sword?" each icon gets a red cross badge, in the style of the count badge, and droops to grey, one after the other.
- I read "the filter and badge" as these two; the red count badge itself is unchanged.

## v12 (2026-11-14)

- "Make the intro 7 seconds - right before the slash": the lead-in before the voice is 0.4 s (was 1.0 s), so the slash lands at 7.0 s. Everything after is 0.6 s earlier; the film is 2:35 (155.6 s).
- "Make that more interesting and fun": the hook now piles up.
  - Little envelopes fly in from every edge and drop into the icon: a burst of 16 as the badge rolls to 181, then one for each later +1. The badge pops and the icon gives a small kick as each lands.
  - The badge swells as the number climbs, and the icon jiggles harder the fuller it gets (it holds still for the last 0.4 s before the sword).
  - Eight notification banners drop in either side and pile up, a little crooked, with the game's demo mail (Pizza Palace, Prince Adewale, Crypto Kevin…).
  - Filters visibly fails: the count dips from 183 to 176 as it arrives, then climbs straight back. Reminders rings its bell, and the next banner is Calendar Robot's "Reminder: reminder about reminders" (+3).
  - The sword cuts the whole pile in two: banners, icon, badge and chips.

## v11 (2026-11-14)

- The hook is now an iPhone-style app icon ("make that look like a iphone app icon and badge that is going up then the badges under it"): a blue rounded-square mail icon labelled "Inbox" (a generic envelope, not Apple's Mail icon) whose red badge rolls from 122 up to 181 on "181", pops as it lands, then keeps creeping (to 187 by the slash). The icon floats gently.
- "Filters" and "Reminders" now sit under the icon, larger, arriving on their words and building from the centre; they're struck through on "But have you tried a sword?".
- The sword slash still splits it: the icon and badge fly up, the base, label and chips fall.
- The end ("And it really does clear your inbox") still uses the inbox card, unchanged.

## v10 (2026-11-14)

- The voiceover now has the same sound as the game's How to Play lines ("make the voice over have the same robotic / game as the how to play sound", "for video"). `tools/voicefx.py` imports the chain straight from `vr3/play/tools/howtovoice.py`: an announcer EQ and hard compression, an 8-bit crushed copy mixed in at 35% (`DIGITAL`), a light two-voice chorus and a 70/140 ms slapback. If the game's chain is changed, running `python3 tools/voicefx.py && python3 tools/mix.py` brings the film along.
- It replaces v4 to v9's reverb, robot and grain layers (`STYLE = 'layers'` in `tools/voicefx.py` brings them back).
- Picture unchanged from v9.

## v9 (2026-11-13)

- The seated scene uses the new, more animated take, `vr-email-throw-transparent.mov` (14 s, ProRes 4444 with alpha; a copy is in `work/seated3/src/`). Same layout as v8: bottom left, over Kyoto at night with petals and motes.
- The take has two rounds: grab A (2.0 s), read it and throw it away to keep (3.8 s), cut B (6.4 s), a pink-trail slash (7.5 s), then A and B together, A read, and a last pink slash on B (12.0 s).
- To show it, the voice now pauses 3.5 s after "your weapons do the stretching" (`SEAT_HOLD` in `tools/build_vo.py`), so the scene runs about 8.6 s. The clip plays on a curve: the grab lands on "come to you" (a little slower than real), the read and throw go by fast, the first cut lands on "stretching", and the rest plays near real speed in the hold.
- Everything after it is 3.2 s later. The film is 2:36 (156.2 s).

## v8 (2026-11-13)

- The seated scene (1:43) uses the new transparent take, `vr-email-katana-transparent.mov` (ProRes 4444 with a real alpha channel, 5 s at 30 fps; a copy is in `work/seated2/src/`). No keying needed.
- "Smaller in bottom left corner so behind him can show kyoto night": the player is 65% size, anchored to the bottom left, over the game's Kyoto twilight painting (`vr3/play/public/garden/twilight-v2.webp`, cropped to the pavilion and cherry tree) with a slow push in, 30 drifting petals, 16 warm rising motes, and a soft dark shade behind the player.
- The take's own timing is kept and eased a little: the grab lands near "come to you", the slash on "stretching". It fades in from the white browser scene and out to the white inbox.
- The Higgsfield v6 clip and its key (`tools/seated_key.py`) are no longer used but are kept.

## v7 (2026-11-13), the agent (MCP) flow

- Voice: three re-read parts replace the Gmail-era lines: `how-it-works-iz.mp3` (how it works, through round two), `builtwith-iz.mp3` (how it's built, through "deleted once it's done") and `try-it-yourself-iz.mp3` (the close, with the sung end; the old end take is no longer used). The hook, intro and levels are still take 1. The four takes are levelled to each other. Short beats follow each agent step (0.7 s after "set up a game", 0.9 s after "Meta Quest", 0.9 s after "say okay").
- New scenes, the core of this pass:
  - **Setup** (0:20 to 0:31): a Muse window rebuilt from your screenshot (rail, New side chat, Billbo, message bar). "Add a connector" with inboxzerovr.com/mcp, a click on Connect on "Muse", "Inbox Zero VR connected"; "Set up an Inbox Zero game" typed and sent on "ask it"; "Reading your newest unread emails" counting to 10 of 10; "Inbox Zero VR, create_round"; "Your game is ready, open it on your Quest" with the link inboxzerovr.com/play?code=4821, clicked on "Quest".
  - **Pick and play** (0:31 to 0:34): the home screen with "Game 4821" top right; the cursor picks a level on "level" and hits the main button on "play".
  - **Approval** (1:51 to 1:55): the same window: "Round done, here's what you chose", Archive 6 emails, Send 2 replies, Leave 2 for tomorrow; Okay is clicked on "okay" and the rows tick green.
  - **Privacy** (1:56 to 2:00): Your inbox, Your agent, The game, built out from the centre with "your emails" and "round 4821" on the wires; a dashed path from the game to the inbox with a cross on it on "never touches your inbox"; the round chip breaks into pixels on "deleted".
  - **Close**: a "Connect your agent, inboxzerovr.com/mcp" chip under the level cards on "connect your agent".
- Gone: the Connect Gmail card, the AI tag-and-summary card, the "Saved as a Gmail draft" line.
- Outro badges changed to match: "Your agent sorts each email and sums it up in a line", "Free demo to play, or connect your agent to play your own inbox".
- All sound effects and level room tones are off (`SOUND = false` in `scenes/film.js`): the film is voice only, so the 20 s outro is silent. The voice still has its reverb and grain.
- The seated clip was re-timed for the new read ("stretching" comes 0.4 s sooner).
- Placeholders: the Muse window is my rebuild, not a recording; the code 4821, the tool name line, the 6/2/2 counts and the chat wording are illustrative; the home screen is the old capture (it now has Enter Code and Just Play), and all game footage is due to be redone.
- The film is 2:33 (153 s).

## v6 (2026-11-13)

- The chair drawing at 1:33 is replaced by the Higgsfield take (`work/seated/src/seated-take1.mp4`, 15 s, 1280x720, from `prompts/seated-player.md`).
- Its background is a dark teal gradient, not a true chroma green, so `tools/seated_key.py` keys it against a clean background plate built from the take itself. Anything lighter than the background (the figure, its glow, the paper, the pink slash and its glow) is treated as light, so on white the glow becomes a soft tint instead of a teal or brown halo. Darker parts (chair, sword, visor) get a normal key.
- Retimed from 15 s to 5.1 s on a smooth curve: the reach and grab land on "come to you", the reading and sword raise go by fast, and the slash lands on "stretching".
- Sounds: a blip on the grab, a draw and a katana slash on the cut.
- The "Play from your chair" line is gone: it sat on the player's legs, and the clip shows it.
- Placeholder: the clip is a 720p render scaled up to fill the frame, so it's a little soft next to the rest.

## v5 (2026-11-12)

- Level holds cut from 5 s to 3.5 s (`HOLD` in `tools/build_vo.py`).
- A 20 s outro after the end card ("let the video play on for 20 seconds… game play, just demo for now"): the end card holds 1.6 s and clears, then gameplay cycles through all seven levels (about 2.8 s each, the wide part of each long clip) with each level's own room tone and cut sounds.
- The game's features build up as badges on the left, one every 2.35 s, under the site logo, with inboxzerovr.com arriving last and a short fade to black at the end:
  - 7 levels
  - Each with its own art, logo, 3D weapon and effects
  - Original songs and a celebration anthem
  - Reply out loud, transcribed by ElevenLabs and tidied by AI
  - AI sorts every email and sums it up in a line
  - Free demo to play, or host it from GitHub with your own inbox
- Badge wording is mine, from your list; the GitHub line has no link on screen (the repo may be private).
- The film is now 2:17 (137.8 s).

## v4 (2026-11-12)

- Voice: "reverb a bit less, robot reduce, maybe just a bit of grain". Reverb is now 17 dB under the dry voice (was 13), the robot layer 21 dB under (was 14), and a new grain layer (a bit-crushed copy, only above 2.2 kHz) sits 20 dB under. The knobs are `ROOM_DB`, `ROBOT_DB`, `GRAIN_DB` in `tools/voicefx.py`.
- Levels, from 0:44: each level line is followed by 5 s with no voice, so more of the level is seen (`HOLD` in `tools/build_vo.py`). The film is now 2:09.6.
- Those shots are new, longer recordings: one cut on the word, then the camera's view slowly widens (46° to 66°) and drifts a little while more mail is cut, so the room around the email comes into view. Every later cut has its level's hit sound, and each level's own room tone from the game (office room, castle hall, lab bubbles, furnace, garden leaves, farm yard, space rush) plays under its shot.
- The level logo is smaller (330 px wide) and sits top left instead of top centre.
- Storyboard times below are v1's; everything from the keyboard line on is now later.

## v3 (2026-11-12)

- Video-game voice: "a bit of reverb, and a bit of robotic hints". The dry take stays on top, with two layers under it (`tools/voicefx.py`):
  - room reverb, a 1.3s mid-size hall with a short pre-delay, 13 dB under the dry voice
  - a robot layer, the voice ring-modulated at 55 Hz through two short comb echoes (6 and 9.5 ms) and kept to the mids, 14 dB under the dry voice
- More or less of either is one number each at the top of `tools/voicefx.py` (`ROOM_DB`, `ROBOT_DB`), then `python3 tools/voicefx.py && python3 tools/mix.py` and re-encode. The picture is v2's, unchanged.

## v2 (2026-11-12)

- Voice at normal speed (1×), not 1.25×: "it's already short enough at normal speed". The sung end take is at 1× too. The film is now 95.2s (92.6s of voice and a 2.6s end card, shortened from 3.4s since there is no music to carry it).
- No background music: the Kyoto bed and the end anthem are gone. The game's own sound effects stay, including the short level stings on each level logo.
- Every scene re-timed itself from the new cues. The level clips were re-captured with longer tails (3.4s after the cut, 4s for Super Space) so the longer shots don't freeze on their last frame.
- The Inferno shot now starts on "flamethrower", so the Kyoto cut before it is on screen long enough to read.
- Times in the storyboard below are still v1's (1.25×); multiply by about 1.25 for v2.

## v1 (2026-11-12), first draft for the vibe

- Voice: take 1 sped up 1.25× (pitch kept), with the sung "become a hero with inbox zero" swapped for `inboxzero-vo-end.mp3` (sped up only 1.1× so the singing stays loose). 75.2s of voice plus a 3.4s end card: 78.6s.
- Screens are real game footage: each level played in the browser and recorded frame by frame (the game stepped by hand, so every clip is a smooth 30fps). Everything outside the game (inbox, Gmail connect, browser, chair, AI card) is a quick layout for the vibe only.
- Sound: the user's own Kyoto track as the bed (muffled under the hook, opening up on the sword cut), the Kyoto end anthem on the end card, and the game's own sounds as effects (slashes, flame, glass, chop, saber, keep, reply, the level stingers on each level logo).

## What it is

A VR game that clears your real Gmail: unread mail flies at you and you slash, burn or smash the junk and keep what matters, one round at a time. Built for the Meta Start Hackathon with Meta's Immersive Web SDK, so it plays in the Quest browser.

- **For:** hackathon judges first, then the site's demo video slot and a social post.
- **Angle:** the boring inbox meets a katana. A clean white inbox UI stands for email as it is; the game's painted worlds stand for email as it could be.
- **Hook:** a real-looking inbox ticking up to 181 unread, "filters" and "reminders" crossed out, then a katana slash splits the inbox in two and drops you into Kyoto.
- **Tone:** default brag, playful, fast cuts on the words that name an action.

## Visual identity

- White world: `#ffffff`, ink `#17131f`, soft `#564e63`, pink `#e0127a` / hot `#ff2e93`, teal `#0a9a7a`, mint `#4ff3c8`, accent `#f6b3cc` (from `vr3/app/globals.css`).
- Night: `#0b0912` over the blurred Kyoto home screen.
- Email paper: `#efe4c8` (the game's letter card).
- Type: Geist for every word, Silkscreen only on the game's own pixel bits (the tag chip, the Connect Gmail button).
- Logos: the game's per-level INBOXZERØ skins (`vr3/play/public/logos`), the site logo on the end card.

## Storyboard

Times are the v1 render; every one of them comes from `work/cues.json`, so a new take re-times the film.

| Time | VO | On screen |
|---|---|---|
| 0.0–3.2 | Have you got 181 unread emails? | White. An inbox card, rows pouring in, the unread badge rolls up to 181 and keeps creeping |
| 3.4–4.8 | Tried filters, or reminders? | "Filters" and "Reminders" chips arrive on their words, building from the centre |
| 5.0–6.7 | But have you tried a sword? | Chips get struck through; on "sword" a pink slash cuts the inbox in half, the halves fall, flash |
| 6.7–7.8 | Or a flamethrower? | Real footage: a Kyoto cut, then Inferno's flamethrower on "flamethrower" |
| 8.6–11.2 | Slash, burn, and smash your way to Inbox Zero! | Cuts on each verb: Kyoto slash, Inferno burn, Keyboard Smash; "Inbox Zero" slams the Kyoto logo on the night with a stinger |
| 11.4–14.3 | Built for the Meta Start Hackathon, it's a game to clear your inbox, | The logo glides to where the real home screen keeps it, the home screen sharpens around it, a cursor clicks Clean Your Inbox on "clear" |
| 14.5–16.9 | one round at a time. Here's how it works | Real Round 1 intro: 10 unread emails, countdown |
| 17.1–19.8 | Connect your Gmail, and your latest unread emails become a game! | White. The game's Inbox dialog, cursor clicks Connect Gmail, it turns to Connected; four unread rows arrive and fly at the camera on "game" |
| 20.0–22.5 | Grab an email with your left hand to read it, throw it to keep it, | Footage: a letter arrives and is thrown to keep ("SAVED"); the site's left-hand art swaps grab, read, throw; "Grab to read", "Throw to keep" |
| 22.7–25.3 | or take your right hand and cut it up into tiny little pieces | Footage: the katana cuts a letter to pieces; right-hand slash art; "Cut to archive" |
| 25.5–30.6 | Every email you keep comes back with two short replies. Hold it up to the one you like, pull it close to say your own, | Real round two: the two reply boards, the reply glows and "SENT" lands on "pull"; "Saved as a Gmail draft"; a mic bubble types a dictated reply |
| 30.7–32.5 | or throw it away and leave it for tomorrow | Footage: a letter thrown, "LATER"; "Leave it for tomorrow" |
| 33.3–35.6 | Just a few minutes a day to clear your email anxiety, | Footage: the real end screen, INBOXZERØ, "Cleared 10 emails" (no line of mine over it: it collided with the game's own) |
| 35.7–38.1 | and you finally get to smash your monitor with your keyboard! | Keyboard Smash footage, the office logo skin |
| 38.3–48.2 | Defend your castle… Disinfect toxic spam… Torch your inbox… Slice your worries… Split your backlog with an axe! | One shot per level, each cut on its verb, the logo re-skinning per level: Haunted Hall, Toxic Danger, Inferno, Kyoto Nights, LumberHack |
| 48.3–50.9 | Or… slice through deep space with a laser sword! | Super Space, the saber cut on "slice" |
| 51.7–56.1 | It's built with Meta's Immersive Web SDK, so it runs right in the browser, with nothing to download | White. The real site in a browser window at inboxzerovr.com; "Meta Immersive Web SDK" chip; cursor clicks Play in Browser; "Nothing to download" |
| 56.3–60.1 | It's made to play from your chair. Emails come to you, and your weapons do the stretching! | A seated player diagram: emails float in to them, the blade grows on "stretching"; "Play from your chair" |
| 60.2–62.0 | And it really does clear your inbox | The hook's inbox again, rows archive away top first, the badge counts to 0, "Inbox zero" with a tick |
| 62.1–64.7 | AI tags each email and boils it down to a quick summary | A game email card: the Work tag pops on "tags", the body boils down to one typed line |
| 64.9–67.6 | The AI reads your mail, then forgets it, nothing is saved | The card breaks into pixels and drifts off on "forgets"; "Nothing is saved" |
| 68.5–72.6 | Try it yourself at InboxZeroVR.com and play the demo in all seven levels | Night. The address types itself; the seven level cards build from the centre |
| 72.7–78.6 | Become a hero with inbox zero! | The site logo lands, petals burst on "hero", the anthem's last chord, "Built for the Meta Start Hackathon" |

## Placeholders (mocked, not real)

- The hook inbox and the end "Inbox zero" card: a plain made-up inbox, using the game's own demo senders and subjects (Pizza Palace, Prince Adewale…). No real mail.
- The Connect Gmail card copies the game's Inbox dialog copy, restyled white; the real dialog is not shown.
- The seated-player diagram is a quick drawing.
- The AI card's summary line ("Kickoff Monday or Tuesday, which works?") is written by me, not the game's AI output.
- The dictated reply "Monday works, see you then" is illustrative.
- The site shown in the browser is a screenshot of the local site (localhost:3000) with the address bar reading inboxzerovr.com.
- Footage is the desktop build at a narrowed field of view (46°), not a headset recording. No hands-in-VR footage yet: the site's hand illustrations stand in for grab and throw.
- Word timings inside a sentence are estimated (no Whisper model here); sentence starts are measured from the take's silences.

## How to rebuild

```
python3 tools/build_vo.py           # voice + work/cues.json
FOV=46 node work/capture/capture.mjs <clip…>   # game footage (needs the game on :5183)
python3 tools/prep.py               # cues.js + footage.js for the page
node tools/render.mjs stills work/stills 12.5 40   # look at moments (+ text audit)
node tools/render.mjs frames work/frames            # all frames
node tools/render.mjs sfx work/sfx.json && python3 tools/mix.py   # soundtrack
```
