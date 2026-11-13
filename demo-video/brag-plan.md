# Inbox Zero VR demo film, plan

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
