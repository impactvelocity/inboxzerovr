// Inbox Zero VR demo film, v1. Every frame is a pure function of time: renderAt(T).
// All times come from the voice (work/cues.json via cues.js): C(id) is a sentence's start, W(id, word) a word.
'use strict';
const FPS = 30;
const $ = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eo = t => 1 - Math.pow(1 - clamp(t), 3);
const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const C = id => CUES.cues[id].start, E = id => CUES.cues[id].end;
const W = (id, word, n = 0) => { const w = CUES.words.filter(x => x.s === id && x.w === word)[n]; if (!w) throw new Error(`no word ${id}/${word}`); return w.t; };
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// v5: the voice ends, the end card holds a moment, then 20 s of gameplay with the game's features
// v41: after the hero card, the Keyboard Smash ending clip (13 s, keyboard-outro.mp4) instead of the 20 s gameplay and badges
const OUT_HOLD = 1.6, END_CLIP = 13.0;
// v43: the ending plays Keyboard Smash's end anthem whole (vr3/play/public/audio/office/anthem.m4a, 18.6 s): its first
// "Smash" (1.76 s in, vr3/play/src/levels/lyrics.ts) lands on the ending clip's first monitor hit (its frame 4), and the
// film runs on to the song's own last note. ANTHEM_REL is where the song starts, after T_OUT.
// v62: "use longer-outro.mp4 for the try it yourself and song - make sync and be nice": the longer ending (18 s: the last
// emails smashed at the desk, then the monitor smashed to bits from its 5.5 s, then the empty office) starts as try it
// yourself comes in, at real speed; the anthem starts under the card so its first "Smash" lands on the clip's first monitor
// hit (frame 175), and the film still ends on the song's last note
const ANTHEM_LEN = 18.6, OUTRO_AT = CUES.cues.try.start - .3, OUTRO_HIT = 174 / FPS;
const ANTHEM_REL = OUTRO_AT + OUTRO_HIT - 1.76 - (CUES.cues.try.end + OUT_HOLD), OUT_LEN = ANTHEM_REL + ANTHEM_LEN + .1;
const DUR = Math.round((CUES.cues.try.end + OUT_HOLD + OUT_LEN) * FPS) / FPS;      // (v57: the voice ends on the address)

// in at a, out at b: {o, y} or null when gone (slide up and fade in, lift and fade out)
function vis(T, a, b, { y = 32, din = .5, dout = .3, lift = -26 } = {}) {
  if (T < a || T > b + dout) return null;
  const pi = eo((T - a) / din), po = clamp((T - b) / dout);
  return { o: pi * (1 - po), y: (1 - pi) * y + eo(po) * lift, pi, po };
}
function show(el, on, o = 1, transform = '') {
  el.style.visibility = on ? 'visible' : 'hidden';
  if (on) { el.style.opacity = o; el.style.transform = transform; } else el.style.opacity = 0;      // (opacity too: a child set visible would still show)
}
function place(el, v, extra = '') { if (!v) return show(el, false); show(el, true, v.o, `translateY(${v.y}px) ${extra}`); }

/* ---------- data ---------- */
const MAIL = [
  ['Pizza Palace', 'Buy 9 pizzas, get 1 free'], ['All Staff', 'RE: RE: RE: Please stop replying all'], ['SockDrawer Deals', '70% OFF ends at MIDNIGHT!!!'],
  ['Prince Adewale', 'URGENT business proposal'], ['Webinar Wizard', 'Last chance: 10x your synergy'], ['ParcelPost', 'Your package is out for delivery'],
  ['LinkUp', '14 people viewed your profile'], ['Calendar Robot', 'Reminder: reminder about reminders'], ['Old Gym Buddy', 'FWD: FWD: funny cat video'],
  ['Biggest Client', 'Contract signed!'], ['Crypto Kevin', 'This coin is going to the MOON'], ['Horoscope Hub', 'Mercury is in your inbox'],
  ['Sales Bot 3000', 'Bumping this to the top'], ['Free Cruise Center', 'You WON a free cruise'], ['Mattress Planet', 'Still thinking it over?'],
  ['Team Fun Committee', 'Mandatory fun this Friday'],
];
const TIMES = ['9:41 am', '9:38 am', '9:30 am', '9:12 am', '8:57 am', '8:40 am', '8:31 am', '8:02 am', '7:55 am', '7:17 am', '7:02 am', '6:48 am', '6:30 am', '6:11 am', '5:59 am', '5:40 am'];
const ROW_H = 76;
const rows = MAIL.map(([from, subj], i) => {
  const r = document.createElement('div'); r.className = 'row';
  r.innerHTML = `<span class="dot"></span><span class="from">${from}</span><span class="subj">${subj}</span><span class="time">${TIMES[i]}</span>`;
  $('rows').appendChild(r); return r;
});
const LEVELS = ['kyoto', 'office', 'castle', 'lab', 'space', 'inferno', 'lumber'];
const cards = LEVELS.map(id => { const d = document.createElement('div'); d.className = 'lc'; d.innerHTML = `<img src="../work/assets/home/${id}.webp" alt="">`; $('cards').appendChild(d); return d; });
const pixels = []; for (let y = 0; y < 9; y++) for (let x = 0; x < 14; x++) { const i = document.createElement('i'); $('pixels').appendChild(i); pixels.push({ i, x, y }); }
const petals = []; for (let k = 0; k < 70; k++) { const i = document.createElement('i'); $('petals').appendChild(i); petals.push(i); }

/* ---------- the hook's pile-up (v12) ---------- */
const ENV = '<svg viewBox="0 0 50 36"><rect x="2" y="2" width="46" height="32" rx="6" fill="#fff" stroke="#1f8cff" stroke-width="3"/><path d="M5 7l20 14 20-14" fill="none" stroke="#1f8cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MINI = '<svg viewBox="0 0 120 120"><rect x="14" y="28" width="92" height="64" rx="10" fill="#fff"/><path d="M18 34l42 30 42-30" fill="none" stroke="#7cc4ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NOTES = [
  ['Pizza Palace', 'Buy 9 pizzas, get 1 free'], ['All Staff', 'RE: RE: RE: Please stop replying all'], ['SockDrawer Deals', '70% OFF ends at MIDNIGHT!!!'],
  ['Prince Adewale', 'URGENT business proposal'], ['Crypto Kevin', 'This coin is going to the MOON'], ['Sales Bot 3000', 'Bumping this to the top'],
  ['Calendar Robot', 'Reminder: reminder about reminders'], ['Free Cruise Center', 'You WON a free cruise'],
];
// v56: "make variation of email avatar badge colors - make some match different levels - pink, purples, reds, etc"
const NOTE_COL = [['#ffb3d1', '#ff5fa2', '#e0127a'], ['#d9c6ff', '#9a6cff', '#5a2fd6'], ['#ffb36b', '#ff5a2b', '#d42a12'], ['#5ac8fa', '#1f8cff', '#1668f0'], ['#c4ff9a', '#62d94a', '#2b9f2e'], ['#a8ffe0', '#46dcae', '#119c79'], ['#ffd76b', '#ffad2e', '#e07a12'], ['#f5a3ff', '#c04dff', '#8a1fd6']];
const noteEls = NOTES.map(([from, subj], k) => { const d = document.createElement('div'); d.className = 'note'; d.innerHTML = `<span class="ni">${MINI}</span><span class="nt"><div class="nf">${from}</div><div class="ns">${subj}</div></span><span class="nw">now</span>`; const c = NOTE_COL[k % NOTE_COL.length]; d.querySelector('.ni').style.background = `linear-gradient(180deg,${c[0]} 0%,${c[1]} 55%,${c[2]} 100%)`; $('notes').appendChild(d); return d; });
const flyEls = []; for (let k = 0; k < 30; k++) { const d = document.createElement('div'); d.className = 'fly'; d.innerHTML = ENV; $('flies').appendChild(d); flyEls.push(d); }

/* ---------- v33: the Keyboard Smash icon's cuts ---------- */
const KS_N = 10, KS_PER = 10;      // (v46: "a bit less particles", was 14)
const ksParts = []; for (let k = 0; k < (KS_N + 2) * KS_PER; k++) {      // (v39: +2 groups for the exit burst)
  const i = document.createElement('i'); $('ks-parts').appendChild(i); ksParts.push(i); }

const KC_PER = 8, kcParts = []; for (let k = 0; k < 5 * KC_PER; k++) { const i = document.createElement('i'); i.className = k % KC_PER < 5 ? 'key' : 'px';      // (v46: fewer, was 12 with 8 keys)
  $('kcs').appendChild(i); kcParts.push(i); }

const SP_N = 160, spParts = []; for (let k = 0; k < SP_N; k++) { const i = document.createElement('i'); $('split-parts').appendChild(i); spParts.push(i); }

/* ---------- the timeline ---------- */
const T_SWORD = 6.5, T_SPLIT = T_SWORD + .02, T_GAME = T_SWORD + .34;      // v24: the split at 0:06 ("have tried sword - do that at 0:06"); she says "sword" at 7.0 over the sword clip
// the cut through the screen: -14 degrees through the centre (left edge at 72% down, right edge at 28%)
const CUT_DEG = -14, CUT_L = 50 + 50 * Math.tan(14 * Math.PI / 180) * 1920 / 1080, CUT_R = 100 - CUT_L;
const T_INBOX = W('slash', 'inbox');
const T_SMASH_END = E('slash') + .45;      // the long smash plays through "Inbox Zero!"
// v19: then the Round 1 clip from its countdown (replacing the level select), then more of the long smash to the agent scene
const T_R2 = T_SMASH_END + 119 / FPS, T_LOGO = 12.0;      // v33: the logo and the Meta line come in at 0:12 (on "…to Inbox Zero")
// v31: the push into the agent scene: the gameplay lifts off over half a second, ending as the window settles
const T_PUSH = C('connect') - .75, PUSH_LEN = .55;
const T_REALLY = C('really');
const T_OUT = E('try') + OUT_HOLD, T_END = T_OUT + OUT_LEN;
const T_ANTHEM = T_OUT + ANTHEM_REL, SONG = s => T_ANTHEM + s;      // (song time to film time)
// the agent flow (v7)
const M_IN = T_PUSH + .12,      /* v31: the window rises right behind the lifting gameplay (was C('connect') - .3) */ T_CONNECT = W('connect', 'muse'), T_OPEN = W('link', 'quest') + .15, T_HOME = T_OPEN + .75;
// v32: after "Open" the How to Play clip rises over the agent window like a card (the 0:20 lift, in reverse)
const T_REVEAL = T_OPEN + .25;
const M2_IN = C('archives') + .05,      /* v60: on "your agent", so inbox zero clears before the dark comes up (v43: - .15) */      /* v43: later, so inbox zero gets a beat (was - .35) */ T_OKAY = W('okay', 'okay') + .05, M2_OUT = C('never') - .55;
// the hook's clock: the badge rolls up to 181 as it's said, then creeps; Filters knocks a few off and they come straight back,
// Reminders adds its own reminder
const T_ROLL0 = .25, T_181 = W('unread', '181') + .35, T_FIL = W('tried', 'filters'), T_REM = W('tried', 'reminders'), CREEP = 1.2;
function hookCount(T) {
  if (T < T_ROLL0) return 122;
  let n = lerp(122, 181, eo((T - T_ROLL0) / (T_181 - T_ROLL0))) + Math.floor(Math.max(0, T - T_181) * CREEP);
  n -= 7 * Math.sin(Math.PI * clamp((T - T_FIL - .1) / .9));      // filters: down a little, then right back
  if (T >= T_REM + .35) n += 3;                                    // reminders: one more notification, about reminders
  return Math.round(n);
}
const HOOK_COUNT = hookCount(T_SWORD);
// when each little envelope lands in the icon: a burst as the count rolls up, then one for every later +1
const FLY_AT = [];
for (let k = 0; k < 16; k++) FLY_AT.push(lerp(T_ROLL0 + .25, T_181, k / 15));
for (let k = 1; FLY_AT.length < flyEls.length; k++) { const t = T_181 + k / CREEP; if (t > T_SWORD - .15) break; FLY_AT.push(t); }
// banners: [arrives, side (-1 left, 1 right), row]
const NOTE_AT = [[.3, -1, 0], [.7, 1, 0], [1.1, -1, 1], [1.55, 1, 1], [2.4, -1, 2], [3.05, 1, 2], [T_REM + .3, -1, 3], [C('sword') + .35, 1, 3]];

// footage: [clip, from, to, at, key] — clip frame `key` is shown at time `at`
const GAP_RATE = ((12.9 - 7.25) + (3.2 - .67)) / (C('monitor') - (W('pull', 'say') + .05)), T_THROW = W('pull', 'say') + .05 + (12.9 - 7.25) / GAP_RATE;      // (v47)
const SEG = [
  // v14: the user's own headset captures (vr-video/): the slash opens mid-cut with the pieces flying,
  // and the flamethrower's email catches fire (frame 14) just after "flamethrower"
  ['sword-cut', T_SPLIT, W('flame', 'flamethrower') - .1, T_SPLIT, 10],      // (v40: from frame 10, so its cut, frame 24, still lands on "sword")      // v26: cut-0m13s.mp4 at real speed; its cut (frame 24) lands on "sword"
  ['flame-v2', W('flame', 'flamethrower') - .1, C('slash'), W('flame', 'flamethrower') + .1, 14],
  // v15: the user's own captures. Slash: the Haunted Hall blade mid-cut from the first frame. Burn: Toxic Danger's
  // email at its heaviest melt. Smash: the keyboard hits the monitor (frame 13) just after "smash".
  ['slash-space', C('slash'), W('slash', 'burn'), C('slash'), 13],      // v29: Super Space's saber, its swing (frame 24) at 10.0 and the shatter
  ['melt-v3', W('slash', 'burn'), W('slash', 'smash'), W('slash', 'burn'), 33],
  // v25: one continuous clip, smash-intro.mp4 (12 s), from "smash" to the agent scene; the logo moment sits over it at 0:13.5
  ['smash-intro', W('slash', 'smash'), T_PUSH + PUSH_LEN, W('slash', 'smash'), 1],
  // v32: the user's hands How to Play intro (cards, then a slash through the panel at frame 220 on "take your right hand"),
  // then the ROUND 1 countdown, at real speed from the card's rise to "Every email you keep"
  ['hands-slash', T_REVEAL, C('replies'), T_REVEAL, 1],
  // v44: "new video for 0:40 to 0:53": vr-video/10-new-take/reply-short.mp4 (14 s), one take from the ROUND 2 countdown to
  // Send it / Redo. Real speed, with its reply boards on "two" and Reply A lit through "hold it up to the one you like";
  // the stretch round SENT runs 1.5x so the email is at the mic on "say your own" (a map of [film time, clip seconds])
  // v47: "make the speed fit that 6 second gap, it doesnt need to line up with voice over": from the email at the mic to
  // 0:53 is one steady speed (about 1.2x) across the recording (to Send it) and the throw (through LATER and the slice)
  ['reply-short', C('replies'), T_THROW, 0, [[C('replies'), .33], [W('hold', 'like') - .2, 5.0], [W('pull', 'say') + .05, 7.25], [T_THROW, 12.9]]],
  ['webvr-chair', T_THROW, C('monitor'), 0, [[T_THROW, .67], [C('monitor'), 3.2]]],
  // v4: the long level shots (one cut on the word, then the view opens up while more mail is cut), each held 5 s past its line
  ['lvl-keyboard', C('monitor'), C('castle'), C('monitor'), 1],      // v35: the user's level clip, whole, at real speed
  ['lvl-haunted', C('castle'), C('lab'), C('castle'), 1],      // v35: the user's level clip, whole, at real speed
  ['lvl-toxic', C('lab'), C('inferno'), C('lab'), 1],      // v35: the user's level clip, whole, at real speed
  ['lvl-inferno', C('inferno'), C('kyoto'), C('inferno'), 31],      // v42: from 1 s in ("the clip is more interesting after 1 second")      // v35: the user's level clip, whole, at real speed
  ['lvl-kyoto', C('kyoto'), C('axe'), C('kyoto'), 1],      // v35: the user's level clip, whole, at real speed
  ['lvl-lumber', C('axe'), C('or'), C('axe'), 1],      // v35: the user's level clip, whole, at real speed
  // v52: "use this for the superspace level background, and keep playing it during the web vr and seated, so its the same
  // scene behind the whole time from 1:17 to 1:32": vr-video/05-space/superspace-longer.mp4 (15 s), whole, at real speed,
  // from the Super Space line through built for web (softened behind the browser) and seated (it fades out with the player)
  ['superspace', C('or'), C('really') - .02, C('or'), 1],
  // v43: "use the inferno clips as background game" for try it yourself: inferno-long from its fight (frame 45), at 0.85x
  // (v57: no Inferno behind try it yourself: it's on white now)
  // v60: "the try it yourself - instead of white background, fade the end video and the text over the screen (like one
  // round at a time)": the Keyboard Smash ending starts under try it yourself, its opening slowed (0.26x) under a dark
  // shade, then real speed as the card clears, so its frame 55 (a monitor hit) still lands on the anthem's first "Smash"
  ['kbd-outro2', OUTRO_AT, T_END + .1, OUTRO_AT, 1],      // (v62: vr-video/02-keyboard/longer-outro.mp4, whole, at real speed)
];
// level logos over the footage
const LOGOS = [
  ['office', C('monitor')], ['castle', C('castle')], ['lab', C('lab')], ['inferno', C('inferno')], ['kyoto', C('kyoto')], ['lumber', C('axe')], ['space', C('or')],
];
const LOGO_END = C('iwsdk') - .3;
// short lines on the footage: [text, from, to, style]
const PHRASES = [
  // (v32: "Grab to read" removed: the game's own How to Play cards say it)
  // (v32: "Throw to keep" removed: the game's own How to Play cards say it)
  // (v32: "Cut to archive" removed: the game's own How to Play cards say it)
  // (v7: no "Saved as a Gmail draft": the agent sends replies now, after you say okay, and the approval scene shows it)
  // (v44: "Leave it for tomorrow" removed: the new reply take is recording there, not throwing it away)
  // (no line over the end screen: the game's own "Cleared 10 emails" sits there)
  // (no "Play from your chair" line since v6: the generated clip shows it, and the line sat on the player's legs)
];
const phraseEls = PHRASES.map(([t, , , cls]) => { const d = document.createElement('div'); d.className = 'phrase' + (cls ? ' ' + cls : ''); d.textContent = t; $('phrases').appendChild(d); return d; });

// sound effects, from the game's own sounds (the mix script reads this list)
const A = '../../vr3/play/public/audio/';
const SFX = [], AMB = [];
const sfx = (t, file, gain = 1) => SFX.push({ t: +t.toFixed(3), file: A + file, gain });

/* ---------- the features ---------- */
const BADGES = [
  ['7', '#e0127a', '7 levels'],
  ['<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z"/></svg>', '#7a4dff', 'Each with its own art, logo, 3D weapon and effects'],
  ['<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>', '#ff8a3d', 'Original songs and a celebration anthem'],
  ['<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>', '#ff2e93', 'Reply out loud, transcribed by ElevenLabs and tidied by AI'],
  ['<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>', '#0a9a7a', 'Your agent sorts each email and sums it up in a line'],
  ['<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>', '#3b4df0', 'Free demo to play, or connect your agent to play your own inbox'],
];
const badgeEls = BADGES.map(([ic, col, text]) => { const d = document.createElement('div'); d.className = 'badge-row'; d.innerHTML = `<span class="ic" style="background:${col}">${ic}</span><span class="bt">${text}</span>`; $('badges').appendChild(d); return d; });
const BADGE_AT = BADGES.map((b, i) => T_OUT + 1.1 + i * 2.35);

/* ---------- v43: built for web, seated, clear inbox ---------- */
const B_A = C('iwsdk') - .02, T_CLICK = W('browser', 'browser'), T_CLICK2 = W('nodl', 'nothing') + .08, T_GAME0 = T_CLICK2 + .22, T_EXP0 = E('nodl') - .2, T_FULL = T_EXP0 + .5;
// the level select in the browser and behind the seated player is one clip on one clock, slowed (120 frames for ~7 s)
const HOME_RATE = .55, homeFrame = T => clamp(1 + Math.floor((T - T_GAME0) * FPS * HOME_RATE), 1, FOOT.home);
const homeSrc = T => `../work/footage/home/${String(homeFrame(T)).padStart(4, '0')}.jpg`;
// the seated take (work/footage/seated3, the user's 14 s cut): its grab, read and throw, then the cut on "stretching",
// sped up a third so the action fills the line with no hold after it (v43: "speed up animation, and remove any delay")
const SEAT_A = C('chair') - .05, SEAT_B = C('really') - .3, SEAT_SLASH = W('come', 'stretching') - SEAT_A, SEAT_END = SEAT_B + .3 - SEAT_A;
const SEAT_RATE = (6.4 - .9) / SEAT_SLASH;
const SEAT_MAP = [[0, .9], [SEAT_SLASH, 6.4], [SEAT_END, 6.4 + (SEAT_END - SEAT_SLASH) * SEAT_RATE]];
function seatSrc(u) { for (let k = 0; k < SEAT_MAP.length - 1; k++) { const [u0, s0] = SEAT_MAP[k], [u1, s1] = SEAT_MAP[k + 1]; if (u <= u1 || k === SEAT_MAP.length - 2) return s0 + (s1 - s0) * clamp((u - u0) / (u1 - u0)); } }
function seatAt(src) { for (let k = 0; k < SEAT_MAP.length - 1; k++) { const [u0, s0] = SEAT_MAP[k], [u1, s1] = SEAT_MAP[k + 1]; if (src <= s1) return SEAT_A + u0 + (u1 - u0) * (src - s0) / (s1 - s0); } return null; }
// "and it really does clear your inbox": the intro's app icon again, its banners swiped away and the badge run down to zero
const T_CLR0 = SEAT_B, T_CLR1 = M2_IN + .12, T_CLR_GO = W('really', 'does') - .15, T_ZERO = W('really', 'your') - .05;      // (v56: zero on "your", was on "inbox", so the slash has room)
const clearParts = []; for (let k = 0; k < 44; k++) { const i = document.createElement('i'); $('clear-parts').appendChild(i); clearParts.push(i); }
// pixel icons (a string per row, X = filled), drawn as crisp SVG rects
function pixSvg(rows, fill, cell) {
  let r = ''; rows.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c === 'o' ? '#ffffff' : fill}"/>`; }));
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" width="${rows[0].length * cell}" height="${rows.length * cell}" shape-rendering="crispEdges">${r}</svg>`;
}
$('ic-sdk').innerHTML = pixSvg(['..XXXXXXXXXX..', '.XXXXXXXXXXXX.', 'XXooXXXXXXooXX', 'XXooXXXXXXooXX', 'XXXXXX..XXXXXX', '.XXXX....XXXX.'], '#170d15', 3.4);
$('ic-nodl').innerHTML = pixSvg(['X.....XX.....X', '.X....XX....X.', '..X...XX...X..', '...X..XX..X...', '..XXX.XX.XXX..', '...XXXXXXXX...', '....XXXXXX....', '.....XXXX.....', 'XX....XX....XX', 'XXXXXXXXXXXXXX'], '#170d15', 3);
// the flow's packets (envelopes along the wires) and the close's embers
// v55: the privacy diagram's packets: envelopes from your inbox to your agent, short summaries from your agent to the game
const envPk = [], sumPk = [];
const PXENV = (() => { const rows = ['DDDDDDDDDDDDDD', 'DcccccccccccccD'.slice(0, 14), 'DdcccccccccccdD'.slice(0, 14), 'DcdccccccccdcD', 'DccdccccccdccD', 'DcccdccccdcccD', 'DccccddddccccD', 'DccccccccccccD', 'DccccccccccccD', 'DDDDDDDDDDDDDD']; const C = { D: '#2a2118', c: '#efe4c8', d: '#b8a98a' }; let r = ''; rows.forEach((row, y) => [...row].forEach((ch, x) => { if (C[ch]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${C[ch]}"/>`; })); return `<svg viewBox="0 0 14 10" width="56" height="40" shape-rendering="crispEdges">${r}</svg>`; })();      // (v60: a pixel email, as the game's)
for (let k = 0; k < 4; k++) { const i = document.createElement('i'); i.className = 'env'; i.innerHTML = PXENV; $('packets').appendChild(i); envPk.push(i); }
for (let k = 0; k < 11; k++) { const i = document.createElement('i'); i.className = 'sum'; $('packets').appendChild(i); sumPk.push(i); }
$('fg-icon').innerHTML = pixSvg(['..XXXXXXXXXX..', '.XXXXXXXXXXXX.', 'XXooXXXXXXooXX', 'XXooXXXXXXooXX', 'XXXXXX..XXXXXX', '.XXXX....XXXX.'], '#7dffc9', 9);
const embers = []; for (let k = 0; k < 46; k++) { const i = document.createElement('i'); i.className = 'ember'; $('close').insertBefore(i, $('end-logo')); embers.push(i); }
// the level cards: two rows, each with its name in the level's colour, as on the game's home screen
const LEVEL_NAMES = { kyoto: ['Kyoto Nights', '#ffc0d9'], office: ['Keyboard Smash', '#7dffc9'], castle: ['The Haunted Hall', '#c9b2ff'], lab: ['Toxic Danger', '#8dff6a'], space: ['Super Space', '#5ef0ff'], inferno: ['Inferno', '#ff9a52'], lumber: ['LumberHack', '#ffc440'] };
cards.forEach((c, i) => { const [n, col] = LEVEL_NAMES[LEVELS[i]]; c.innerHTML = `<span class="lc-b"><span class="lc-in"><img src="../work/assets/home/${LEVELS[i]}.webp" alt=""><span class="lname" style="color:${col}">${n}</span><i class="glint"></i></span></span>`; });

const dust = []; for (let k = 0; k < 40; k++) { const i = document.createElement('i'); const sz = rnd(k + 9) > .8 ? 6 : 4; i.style.width = i.style.height = sz + 'px'; i.style.background = ['#ff2e93', '#3df5c2', '#8f84ff', '#ffffff'][k % 4]; $('retro-dust').appendChild(i); dust.push(i); }
// v60: the diagram's inbox as pixel art (a banded blue tile is the CSS; this is the envelope on it)
{ const rows = ['XXXXXXXXXXXXXX', 'XoXXXXXXXXXXoX', 'XXoXXXXXXXXoXX', 'XXXoXXXXXXoXXX', 'XXXXoXXXXoXXXX', 'XXXXXooooXXXXX', 'XXXXXXXXXXXXXX', 'XXXXXXXXXXXXXX', 'XXXXXXXXXXXXXX', 'XXXXXXXXXXXXXX'];
  let r = ''; rows.forEach((row, y) => [...row].forEach((c, x) => { r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c === 'o' ? '#7cc4ff' : '#ffffff'}"/>`; }));
  document.querySelector('#n-inbox .fi-inbox').innerHTML = `<svg viewBox="0 0 14 10" width="126" height="90" shape-rendering="crispEdges">${r}</svg>`; }

/* ---------- footage ---------- */
function segSrc(seg, T) {
  const [clip, , , at, key0, speed = 1] = seg, n = FOOT[clip];
  let f;
  if (Array.isArray(key0)) {      // (v44: [film time, clip seconds] pairs, straight lines between)
    let sec = key0[key0.length - 1][1];
    for (let k = 0; k < key0.length - 1; k++) if (T <= key0[k + 1][0]) { const [t0, s0] = key0[k], [t1, s1] = key0[k + 1]; sec = s0 + (s1 - s0) * clamp((T - t0) / (t1 - t0)); break; }
    f = clamp(Math.round(sec * FPS) + 1, 1, n);
  } else f = clamp(Math.round(keyOf(clip, key0) + (T - at) * FPS * speed), 1, n);
  return `../work/footage/${clip}/${String(f).padStart(4, '0')}.jpg`;
}
// v49: "0:41 transition, made a quick fade, so not as abrupt": cuts that crossfade instead (film times where a clip starts)
const XFADE = [C('replies')], XF_LEN = .4;
function keyOf(clip, key0) { return key0 === 'cut' ? CUTS[clip][0] : typeof key0 === 'string' ? FOOT[clip] + +key0.slice(3) : key0; }
let footSrc = '';
function footage(T) {
  const seg = SEG.find(s => T >= s[1] && T < s[2]);
  if (!seg) { $('foot').style.zIndex = ''; $('foot').style.borderRadius = ''; $('foot').style.boxShadow = ''; show($('foot'), false); return null; }
  const [clip, from] = seg, src = segSrc(seg, T);
  // v49: a quick crossfade at the cuts listed in XFADE: the clip before carries on, fading out over the new one
  const xf = XFADE.find(x => T >= x && T < x + XF_LEN), prev = xf !== undefined && SEG.find(g => g[2] === xf && g[1] < xf), pv = $('foot-prev');
  if (prev) { const ps = segSrc(prev, T); if (!pv.src.endsWith(ps.slice(2))) pv.src = ps; pv.style.opacity = 1 - eio((T - xf) / XF_LEN); pv.style.visibility = 'visible'; }
  else pv.style.visibility = 'hidden';
  if (src !== footSrc) { $('foot-img').src = src; footSrc = src; }
  $('foot-img').style.filter = '';      // (scenes over the footage may soften it: browser, seated)
  // a slow push in through each shot, so nothing sits still
  $('foot-img').style.transform = clip === 'sword-cut'
    ? `scale(${1.22 - .2 * eo((T - from) / .4)}) translate(${10 * (1 - clamp((T - from) / .3)) * Math.sin((T - from) * 80)}px,0)`      // v21: a punch in as the screen splits
    : `scale(${1 + .035 * clamp((T - from) / 4)})`;
  // v31: at the end of the smash the whole frame lifts up and off (a little smaller, corners rounded), white under it
  // v32: and the How to Play clip rises up over the agent window the same way (off > 0 is below the frame)
  const off = clip === 'smash-intro' ? -eio((T - T_PUSH) / PUSH_LEN) : clip === 'hands-slash' ? 1 - eio((T - from) / PUSH_LEN) : 0, push = Math.abs(off);
  $('foot').style.borderRadius = push > 0 ? `${36 * Math.min(1, push * 4)}px` : '';
  $('foot').style.overflow = 'hidden'; $('foot').style.boxShadow = push > 0 ? '0 40px 80px -30px #16101f66' : '';
  $('foot').style.zIndex = push > 0 ? 5 : '';      // (above the agent window while it lifts, so the window is uncovered, not faded over it)
  show($('foot'), true, 1, push > 0 ? `translateY(${1150 * off}px) scale(${1 - .07 * Math.min(1, push * 2.5)})` : '');
  return seg;
}

/* ---------- scenes ---------- */
function inbox(T) {
  const wrap = $('inbox-wrap');
  const hookOn = T < T_GAME, endOn = T >= T_CLR0 && T < T_CLR1;      // (v43: the end is the app icon again, clearInbox)
  if (!hookOn && !endOn) { show(wrap, false); show($('half-a'), false); show($('half-b'), false); return; }
  show(wrap, true, 1, '');
  if (endOn) return clearInbox(T);
  $('appicon').style.opacity = 1; show($('ch-a'), false); show($('ch-b'), false); $('clr-tick').style.transform = 'scale(0)'; $('clr-ring').style.opacity = 0; $('clr-streak').style.opacity = 0;
  $('appdone').style.transform = 'scale(0)'; $('appring').style.opacity = 0; $('applabel').textContent = 'Inbox'; $('app').style.transform = ''; $('app').style.opacity = 1;
  let A, count;
  if (hookOn) {
    // mail keeps arriving: 6 rows, then a flood up to "181", then a slow creep
    const t181 = W('unread', '181') + .35;
    A = 6 + 8 * eo((T - .8) / (t181 - .8)) + Math.max(0, T - t181) * .35;
    count = hookCount(T);
    if (T < .8) A = 6;
  } else {
    // the same inbox at the end: everything archives away, row by row
    A = 14 + .35 * (C('really') - W('unread', '181'));
    count = 0;
  }
  A = Math.min(A, rows.length);
  const k = Math.floor(A);
  rows.forEach((r, j) => {
    let top = (A - 1 - j) * ROW_H, o = clamp(A - j), x = 0;
    if (endOn) {
      const order = k - 1 - j, t0 = T_REALLY + .25 + order * .085;   // top row first
      const p = eo((T - t0) / .32); x = -140 * p; o *= 1 - p;
    }
    r.style.transform = `translate(${x}px,${top}px)`; r.style.opacity = j < k + 1 ? o : 0;
  });
  if (endOn) count = Math.max(0, HOOK_COUNT - Math.round(HOOK_COUNT * eo((T - T_REALLY - .2) / .75)));
  $('count').textContent = count;
  // v11, the hook: an app icon whose badge counts up, the chips under it; the card is only for the end
  $('app').style.display = hookOn ? 'flex' : 'none';
  $('inbox').style.display = hookOn ? 'none' : 'block';
  $('notes').style.display = $('flies').style.display = hookOn ? 'block' : 'none';
  if (hookOn) {
    const badge = $('appbadge'), icon = $('appicon');
    badge.textContent = count;
    // the badge swells as the number climbs and pops whenever it changes; the icon jiggles harder the fuller it gets,
    // and holds its breath just before the sword
    const full = clamp((count - 122) / 66), calm = 1 - clamp((T - (T_SWORD - .4)) / .25);
    const since = Math.min(...FLY_AT.filter(t => t <= T).map(t => T - t), 9);
    const pop = .2 * Math.max(0, 1 - since / .16) + .16 * Math.sin(Math.PI * clamp((T - T_181 + .05) / .3)) * (T > T_181 - .05 && T < T_181 + .25 ? 1 : 0);
    badge.style.transform = `scale(${1 + .16 * full + pop})`;
    const dip = Math.sin(Math.PI * clamp((T - T_FIL - .1) / .9));       // (it settles for a moment while Filters "works")
    const jig = (.5 + 1.9 * full) * (1 - .8 * dip) * calm;
    icon.style.transform = `translateY(${-6 * Math.sin(T * 1.7)}px) rotate(${jig * Math.sin(T * 23)}deg) scale(${1 + .03 * Math.max(0, 1 - since / .14)})`;
    // little envelopes fly in from the edges and drop into the icon
    const ir = icon.getBoundingClientRect(), ix = ir.left + ir.width / 2, iy = ir.top + ir.height / 2;
    flyEls.forEach((el, k) => {
      const land = FLY_AT[k], dur = .62;
      if (land === undefined || T < land - dur || T > land) { el.style.opacity = 0; return; }
      const p = (T - (land - dur)) / dur, e = eio(p), ang = rnd(k + 20) * Math.PI * 2;
      const sx = 960 + Math.cos(ang) * 1250, sy = 540 + Math.sin(ang) * 760, arc = (rnd(k + 31) - .5) * 360 * Math.sin(Math.PI * e);
      const x = lerp(sx, ix, e) - Math.sin(ang) * arc, y = lerp(sy, iy, e) + Math.cos(ang) * arc;
      el.style.opacity = clamp(p * 8) * (1 - clamp((p - .9) / .1));
      el.style.transform = `translate(${x - 25}px,${y - 18}px) rotate(${lerp((rnd(k + 5) - .5) * 80, 0, e)}deg) scale(${lerp(1.5, .5, e)})`;
    });
    // banners drop in and pile up either side of the icon.
    // v38: centred on the middle of the screen in four even rows, in a gentle arc round the icon (the middle rows tucked
    // in closer, the outer ones further out), each only slightly crooked, and each drops a shorter way into its place
    const ROW_GAP = 128, NOTE_H = 94, top0 = 540 - (3 * ROW_GAP + NOTE_H) / 2, ARC = [64, 14, 14, 64];
    noteEls.forEach((el, k) => {
      const [at, side, row] = NOTE_AT[k];
      if (T < at) { el.style.opacity = 0; return; }
      const p = eo((T - at) / .45), tilt = side * (row < 2 ? -1.6 : 1.6) + (rnd(k + 40) - .5) * 2.4;
      el.style.left = (side < 0 ? 196 - ARC[row] : 1244 + ARC[row]) + (rnd(k + 50) - .5) * 14 + 'px';
      el.style.top = top0 + row * ROW_GAP + (rnd(k + 60) - .5) * 8 + 'px';
      el.style.opacity = clamp((T - at) / .15);
      el.style.transform = `translateY(${(1 - p) * -56}px) rotate(${tilt + (1 - p) * side * 6}deg) scale(${lerp(.92, 1, p)})`;
    });
    // the bell rings when Reminders arrives
    const ring = clamp((T - T_REM) / .8);
    const bell = $('chip-rem').querySelector('.mi > svg');
    bell.style.transform = `rotate(${ring > 0 && ring < 1 ? 24 * Math.sin(ring * 26) * (1 - ring) : 0}deg)`; bell.style.transformOrigin = '50% 12%';
  }
  // the empty state
  const ep = eo((T - (T_REALLY + .95)) / .45);
  $('empty').style.opacity = endOn ? ep : 0;
  $('empty').querySelector('.tick').style.transform = `scale(${endOn ? lerp(.4, 1, ep) + .12 * Math.sin(Math.PI * clamp((T - T_REALLY - .95) / .45)) : 1})`;
  // the card's own entrance / exit
  let cy = 0, co = 1;
  if (endOn) { const v = vis(T, T_REALLY - .05, C('archives') - .75); cy = v ? v.y : 0; co = v ? v.o : 0; }
  // chips: tried things
  const tried = $('tried');
  tried.style.visibility = hookOn ? 'visible' : 'hidden';
  tried.style.display = hookOn ? 'flex' : 'none';
  // v28: the icon starts in the centre of the screen; the row under it opens up as Filters arrives, so the icon glides up
  // and the pair stays centred together
  if (hookOn) {
    const open = eio((T - (W('tried', 'filters') - .25)) / .55), ROW = $('chip-filters').offsetHeight || 168;
    tried.style.margin = `${52 * open}px 0 0`; tried.style.height = `${ROW * open}px`; tried.style.overflow = 'visible';
  }
  if (hookOn) {
    const tf = W('tried', 'filters'), tr = W('tried', 'reminders');
    const f = vis(T, tf - .05, 99), r = vis(T, tr - .05, 99);
    place($('chip-filters'), f); place($('chip-rem'), r);
    const slot = $('slot-rem'), GAP = 72, w = $('chip-rem').offsetWidth + GAP;
    slot.style.width = (r ? w * eo((T - tr + .05) / .45) : 0) + 'px'; slot.style.paddingLeft = slot.style.width === '0px' ? '0' : GAP + 'px';
    // v13: each is a small app icon. Filters pulses while it "works" (the count dips), Reminders rings its bell;
    // on "But have you tried a sword?" each gets a red cross badge and droops to grey: tried, didn't work
    const work = Math.sin(Math.PI * clamp((T - T_FIL - .1) / .9));
    [['chip-filters', 0, -1], ['chip-rem', .14, 1]].forEach(([id, lag, dir]) => {
      const tile = $(id).querySelector('.mi'), fail = eo((T - (C('sword') - .1) - lag) / .4);
      const pulse = id === 'chip-filters' ? .09 * work * Math.abs(Math.sin(T * 14)) : 0;
      tile.style.transform = `translateY(${10 * fail}px) rotate(${dir * 7 * fail}deg) scale(${1 + pulse - .06 * fail})`;
      tile.style.filter = `grayscale(${.85 * fail}) brightness(${1 + .12 * fail})`;
      const xp = clamp((T - (C('sword') - .1) - lag - .08) / .28);
      $(id).querySelector('.nope').style.transform = `translate(${dir * 6 * fail}px,${10 * fail}px) scale(${xp <= 0 ? 0 : eo(xp) + .25 * Math.sin(Math.PI * xp)})`;
      $(id).querySelector('.ml').style.color = fail > .5 ? '#8b8397' : '';
    });
  }
  // the slash across the card, then it splits
  const sl = $('slash');
  // v21: a fast streak along the cut, then it flares wide in the opening seam and fades
  const sp = clamp((T - (T_SWORD - .1)) / .12), fl = clamp((T - T_SPLIT) / .22);
  sl.style.opacity = hookOn && T > T_SWORD - .1 ? 1 - eo(fl) : 0;
  sl.style.transform = `rotate(${CUT_DEG}deg) translateX(${lerp(-1500, 0, eo(sp))}px) scaleY(${1 + 7 * eo(fl)})`;
  const card = $('inbox');
  if (hookOn && T >= T_SPLIT) {
    const p = eo((T - T_SPLIT) / .32);
    card.style.visibility = 'hidden'; tried.style.visibility = 'hidden'; tried.style.opacity = 0; $('app').style.visibility = 'hidden';
    const q = clamp((T - T_SPLIT) / .34), go = q * q * (1.6 - .6 * q);      // accelerating, so they're flung
    const shake = 16 * (1 - clamp((T - T_SPLIT) / .28)) * Math.sin((T - T_SPLIT) * 95);
    const r = CUT_DEG * Math.PI / 180, nx = Math.sin(r), ny = -Math.cos(r), tx = Math.cos(r), ty = Math.sin(r);   // (normal up, and along the cut)
    for (const [id, sgn] of [['half-a', 1], ['half-b', -1]]) {
      const h = $(id); if (!h.firstChild) { const c = wrap.cloneNode(true); c.removeAttribute('id'); c.style.position = 'absolute'; c.style.inset = '0'; c.querySelector('.slash')?.remove(); for (const k of c.querySelectorAll('.card,.chips,.app,#notes,#flies')) { k.style.visibility = 'visible'; k.style.opacity = 1; } h.appendChild(c); }
      h.style.background = '#fff';      // (the white world goes with them, so the game shows through the gap)
      h.style.clipPath = sgn > 0 ? `polygon(0 0,100% 0,100% ${CUT_R}%,0 ${CUT_L}%)` : `polygon(0 ${CUT_L}%,100% ${CUT_R}%,100% 100%,0 100%)`;
      h.style.visibility = 'visible'; h.style.opacity = 1;
      const d = 1150 * go, slide = 260 * go;
      h.style.transform = `translate(${sgn * (nx * d + tx * slide) + shake}px,${sgn * (ny * d + ty * slide) + shake * .6}px) rotate(${sgn * -6 * go}deg)`;
      h.firstChild.style.visibility = 'visible';
      h.firstChild.querySelector('#tried, .chips') && (h.firstChild.querySelector('.chips').style.visibility = 'visible');
    }
    $('notes').style.visibility = $('flies').style.visibility = 'hidden';
  } else {
    card.style.visibility = 'visible'; $('app').style.visibility = 'visible'; tried.style.opacity = 1; $('notes').style.visibility = $('flies').style.visibility = 'visible'; show($('half-a'), false); show($('half-b'), false);
    card.style.opacity = co; card.style.transform = `translateY(${cy}px)`;
  }
}

function clearInbox(T) {
  // v43: "clear inbox nicer, look more like a real app - more like the intro": the hook's icon and its banners come back,
  // the banners are swiped off either side and the mail flies out of the icon as the badge runs down; at zero the badge
  // pops off for a green tick, the icon bounces, a ring goes out and a burst of bits, and the label reads "Inbox zero"
  $('app').style.display = 'flex'; $('app').style.visibility = 'visible'; $('inbox').style.display = 'none';
  $('tried').style.display = 'none'; $('slash').style.opacity = 0; show($('half-a'), false); show($('half-b'), false);
  $('notes').style.display = $('flies').style.display = 'block'; $('notes').style.visibility = $('flies').style.visibility = 'visible';
  const icon = $('appicon'), badge = $('appbadge'), done = $('appdone'), ring = $('appring'), label = $('applabel');
  const t0 = T_CLR0 + .1, go = T_CLR_GO, z = T_ZERO;
  // in: the icon pops up as the seated scene fades; out: it lifts away as the agent's window rises
  const pin = eo((T - t0 - .08) / .4), over = .07 * Math.sin(Math.PI * clamp((T - t0 - .3) / .3));
  const out = eio((T - (M2_IN - .32)) / .27);      // (v60: gone before the retro backdrop comes up)
  $('app').style.opacity = clamp((T - t0) / .15) * (1 - out);
  $('app').style.transform = `translateY(${-60 * out}px)`;
  // the count: from where the hook left it down to zero, eased, with a pop on each envelope that leaves
  const runP = clamp((T - go) / (z - go)), n = T < go ? HOOK_COUNT : Math.round(HOOK_COUNT * (1 - eio(runP)));
  badge.textContent = n;
  const OUT_N = 18, outAt = Array.from({ length: OUT_N }, (_, k) => lerp(go, z - .12, k / (OUT_N - 1)));
  const since = Math.min(...outAt.filter(t => t <= T).map(t => T - t), 9), pop = .14 * Math.max(0, 1 - since / .14);
  const zp = clamp((T - z) / .22);      // the red badge swells and is gone
  badge.style.transform = `scale(${T < z ? 1 + pop : (1 + .25 * Math.sin(Math.PI * zp * .5)) * (1 - eo((zp - .3) / .7))})`;
  badge.style.opacity = T < z + .2 ? 1 : 0;
  done.style.transform = 'scale(0)'; ring.style.opacity = 0;
  // v56: "when the inbox gets to 0 slash it away - similar effect to the green inbox icon earlier": a streak across the
  // icon, which splits along it into two halves that fly apart and fall, with a burst of bits off the cut; then a big
  // green tick lands where it was, a ring goes out, and the label reads "Inbox zero"
  const tc = z + .12, cq = clamp((T - tc) / .62), cut = T >= tc;
  const jig = T >= go && T < z ? 1.4 * (1 - runP) : 0, shk = T >= z && T < tc ? 7 * Math.sin((T - z) * 90) : 0;
  icon.style.transform = `translateY(${-6 * Math.sin(T * 1.7)}px) translateX(${shk}px) rotate(${jig * Math.sin(T * 23)}deg) scale(${(lerp(.6, 1, pin) + over) * (1 + .03 * Math.max(0, 1 - since / .12))})`;
  icon.style.opacity = cut ? 0 : 1;
  icon.style.boxShadow = '';
  const CUT = -14 * Math.PI / 180, dx = Math.cos(CUT), dy = Math.sin(CUT), nx = Math.sin(CUT), ny = -Math.cos(CUT);
  [['ch-a', 1], ['ch-b', -1]].forEach(([id, sg]) => {
    const h = $(id);
    if (!cut || cq >= 1) return show(h, false);
    const d = 150 * eo(cq), sl = 70 * eo(cq);
    show(h, true, 1 - clamp((cq - .55) / .45), `translate(${sg * (nx * d + dx * sl)}px,${sg * (ny * d + dy * sl) + 520 * cq * cq}px) rotate(${sg * -18 * cq}deg)`);
  });
  const st = $('clr-streak'), sp = clamp((T - (tc - .1)) / .12);
  st.style.opacity = T >= tc - .1 && T < tc + .2 ? 1 - clamp((T - tc - .04) / .16) : 0;
  st.style.transform = `rotate(${-14}deg) translateX(${lerp(-420, 0, eo(sp))}px) scaleY(${1 + 3 * clamp((T - tc) / .15)})`;
  const tk = $('clr-tick'), tq = clamp((T - tc - .2) / .4);
  tk.style.transform = `scale(${tq <= 0 ? 0 : tq < .55 ? lerp(.2, 1.15, eo(tq / .55)) : lerp(1.15, 1, eo((tq - .55) / .45))}) rotate(${-30 * (1 - eo(tq))}deg)`;
  const rr = $('clr-ring'), rq = clamp((T - tc - .3) / .7);
  rr.style.opacity = rq > 0 && rq < 1 ? .85 * (1 - rq) : 0; rr.style.transform = `scale(${lerp(.9, 1.9, eo(rq))})`; rr.style.borderWidth = `${lerp(12, 2, rq)}px`;
  const lz = T >= tc + .25;
  if (lz && !label.querySelector('b')) label.innerHTML = 'Inbox <b>zero</b>'; else if (!lz && label.querySelector('b')) label.textContent = 'Inbox';
  const lp = clamp((T - tc - .25) / .3);
  label.style.transform = `scale(${1 + .14 * Math.sin(Math.PI * lp)})`;
  // the banners: back in their places from the intro, then swiped off to their own side, one after another
  const ROW_GAP = 128, NOTE_H = 94, top0 = 540 - (3 * ROW_GAP + NOTE_H) / 2, ARC = [64, 14, 14, 64];
  const ORDER = [6, 7, 4, 5, 2, 3, 0, 1];      // (the bottom rows first)
  noteEls.forEach((el, k) => {
    const [, side, row] = NOTE_AT[k], at = t0 + .05 + k * .04, sw = go + ORDER.indexOf(k) * .075;
    if (T < at) { el.style.opacity = 0; return; }
    const p = eo((T - at) / .35), tilt = side * (row < 2 ? -1.6 : 1.6) + (rnd(k + 40) - .5) * 2.4;
    const q = clamp((T - sw) / .38), fly = q * q;
    el.style.left = (side < 0 ? 196 - ARC[row] : 1244 + ARC[row]) + (rnd(k + 50) - .5) * 14 + 'px';
    el.style.top = top0 + row * ROW_GAP + (rnd(k + 60) - .5) * 8 + 'px';
    el.style.opacity = clamp((T - at) / .12) * (1 - clamp((q - .55) / .45));
    el.style.transform = `translateX(${side * 980 * fly}px) translateY(${(1 - p) * -40 - 30 * fly}px) rotate(${tilt + side * 14 * fly}deg) scale(${lerp(.92, 1, p)})`;
  });
  // envelopes fly out of the icon to the edges (the intro's, the other way)
  const ir = icon.getBoundingClientRect(), ix = ir.left + ir.width / 2, iy = ir.top + ir.height / 2;
  flyEls.forEach((el, k) => {
    const launch = outAt[k], dur = .6;
    if (launch === undefined || T < launch || T > launch + dur) { el.style.opacity = 0; return; }
    const p = (T - launch) / dur, e = eio(p), ang = rnd(k + 120) * Math.PI * 2;
    const ex = 960 + Math.cos(ang) * 1250, ey = 540 + Math.sin(ang) * 760, arc = (rnd(k + 131) - .5) * 300 * Math.sin(Math.PI * e);
    const x = lerp(ix, ex, e) - Math.sin(ang) * arc, y = lerp(iy, ey, e) + Math.cos(ang) * arc;
    el.style.opacity = clamp(p * 10) * (1 - clamp((p - .85) / .15));
    el.style.transform = `translate(${x - 25}px,${y - 18}px) rotate(${lerp(0, (rnd(k + 105) - .5) * 120, e)}deg) scale(${lerp(.5, 1.5, e)})`;
  });
  // the burst at zero: teal, blue and pink bits and white glints, flung out and falling
  const bq0 = T - (z + .12), CR = -14 * Math.PI / 180;
  clearParts.forEach((e, k) => {
    const q = bq0 - rnd(k + 7) * .05;
    if (q < 0 || q > 1.1) { e.style.opacity = 0; return; }
    const along = (rnd(k + 9) - .5) * 300, side = k % 2 ? 1 : -1, sp = 220 + 520 * rnd(k + 1), kind = rnd(k + 2);
    const ox = ix + Math.cos(CR) * along, oy = iy + Math.sin(CR) * along;
    const vx = Math.sin(CR) * side * .9 + Math.cos(CR) * (rnd(k + 4) - .5), vy = -Math.cos(CR) * side * .9 + Math.sin(CR) * (rnd(k + 4) - .5);
    const x = ox + vx * sp * eo(q / .9), y = oy + vy * sp * eo(q / .9) + 520 * q * q;
    const sz = kind > .85 ? 9 : 12 + 12 * rnd(k + 3);
    e.style.width = sz + 'px'; e.style.height = sz + 'px';
    e.style.background = kind > .85 ? '#ffffff' : ['#5ac8fa', '#1f8cff', '#1668f0', '#ffffff', '#ff2e93', '#efe4c8'][Math.floor(rnd(k + 4) * 6)];
    e.style.boxShadow = kind > .85 ? '0 0 12px #fff' : 'none';
    e.style.opacity = 1 - clamp((q - .7) / .4);
    e.style.transform = `translate(${x - sz / 2}px,${y - sz / 2}px) rotate(${(rnd(k + 5) - .5) * 720 * q}deg)`;
  });
}

function splitParts(T) {
  // v40: pink petals, hot-pink sparks and white glints flung off the cut as the screen splits, for more punch
  const q0 = T - T_SPLIT, el = $('split-parts');
  if (q0 < 0 || q0 > 1.2) return show(el, false);
  show(el, true, 1, '');
  const r = CUT_DEG * Math.PI / 180, tx = Math.cos(r), ty = Math.sin(r), nx = Math.sin(r), ny = -Math.cos(r);
  spParts.forEach((e, k) => {
    const delay = rnd(k + 3) * .08, q = q0 - delay;
    if (q < 0 || q > 1.0) { e.style.opacity = 0; return; }
    const along = (rnd(k) - .5) * 2200, side = k % 2 ? 1 : -1, sp = 220 + 680 * rnd(k + 1), kind = rnd(k + 2);
    const ox = 960 + tx * along, oy = 540 + ty * along;
    const dx = (nx * side * .9 + tx * (rnd(k + 4) - .5) * .9) * sp, dy = (ny * side * .9 + ty * (rnd(k + 4) - .5) * .9) * sp;
    const x = ox + dx * eo(q / .9), y = oy + dy * eo(q / .9) + 380 * q * q;
    const petal = kind < .55, glint = kind > .85, sz = petal ? 20 + 18 * rnd(k + 5) : glint ? 8 + 6 * rnd(k + 5) : 11 + 10 * rnd(k + 5);
    e.style.width = sz + 'px'; e.style.height = (petal ? sz * .7 : sz) + 'px';
    e.style.borderRadius = petal ? '60% 0 60% 0' : '0';
    e.style.background = petal ? (rnd(k + 6) > .5 ? '#ffb3d1' : '#ff8cc0') : glint ? '#ffffff' : '#ff2e93';
    e.style.boxShadow = petal ? 'none' : `0 0 ${glint ? 14 : 12}px ${glint ? '#ffffffcc' : '#ff2e93cc'}`;
    e.style.opacity = 1 - clamp((q - .7) / .3);
    e.style.transform = `translate(${x}px,${y}px) rotate(${(rnd(k + 7) - .5) * 900 * q}deg)`;
  });
}

function flash(T) {
  const f = $('flash');
  const hits = [];      // (v57: no hero flash)
  let o = 0; for (const [t, a, d] of hits) if (T >= t && T < t + d) o = Math.max(o, a * (1 - (T - t) / d));
  show(f, o > 0, o);
}

function slam(T) {
  // "Inbox Zero!": the logo lands on the night, then glides to where the home screen keeps it
  const L = $('logo-slam'), a = T_INBOX, g0 = C('hack'), g1 = g0 + .9;
  const night = $('night');
  const nightOn = false;      // (v57: try it yourself is on white)
  if (nightOn) {
    show(night, true, T >= C('try') - .3 ? eo((T - C('try') + .3) / .3) : 1, '');
    $('night-img').style.filter = false ? `blur(${lerp(22, 0, eio((T - g0) / .9))}px) brightness(${lerp(.42, 1, eio((T - g0) / .9))}) saturate(1.2)` : 'blur(22px) brightness(.42) saturate(1.2)';
  } else show(night, false);
  // v41: 8 s into the ending clip the dark overlay comes back with the logo and the Meta line, floating a little;
  // then the overlay goes to black under them, and they fade out last
  const T_E8 = SONG(9.25), eb = $('end-black');      // v43: on the anthem's "No more email tonight" (was 8 s into the clip)
  if (T >= T_E8) {
    const e = T - T_E8, sh = $('logo-shade'), cr = $('logo-credit'), left = T_END - T;
    show(sh, true, eo(e / .8), '');
    show(eb, true, eio((e - 3.6) / 1.2), '');      // (black before the clip runs out)
    if (!L.src.endsWith('logos/office.webp')) L.src = '../work/assets/logos/office.webp';
    L.style.width = '940px';
    // (v43: it punches on the song's "Inbox zero" and "We won!", and fades with the song's last note)
    const pin = eo((e - .3) / .6), fade = 1 - eio((T - SONG(16.9)) / 1.6), bob = Math.sin(e * 1.4) * 9, breathe = 1 + .012 * Math.sin(e * 1.1);
    const beat = [[11.6, .05], [12.42, .07], [15.82, .06], [16.04, .1]].reduce((m, [st, g]) => { const d = T - SONG(st) + .03; return d >= 0 && d < .3 ? Math.max(m, g * Math.sin(Math.PI * d / .3)) : m; }, 0);
    show(L, e > .3, pin * fade, `translate(-50%,-50%) translateY(${-70 + bob + (1 - pin) * 30}px) scale(${(lerp(1.12, 1, pin) + beat) * breathe})`);
    const cp = eo((e - .75) / .5);
    show(cr, e > .75, cp * fade, `translate(-50%,-50%) translateY(${92 + bob * .8 + (1 - cp) * 20}px)`);
    show($('round-line'), false); show($('ks-cut'), false);
    return;
  } else show(eb, false);
  // v19: the Keyboard Smash level's logo pops into the centre as the round starts, then gets out of the way.
  // v22: over a dark shade that fades in and out with it, and "Built for Meta VR Hackathon" with the Meta mark under it.
  // v27: the shade stays on through "one round at a time"; the logo and the Meta line leave at 0:15 and the line
  // "Clear your email inbox / one round at a time" takes their place, its second half arriving word by word as it's said
  const u = T - T_LOGO, shade = $('logo-shade'), credit = $('logo-credit'), line = $('round-line');
  const T_OUT1 = C('game') - .15, T_SHADE_OUT = E('round') + .3;
  if (u < 0 || T > T_SHADE_OUT + .6) { show(shade, false); show(credit, false); show(line, false); show($('ks-cut'), false); return show(L, false); }
  show(shade, true, eo(u / .35) * (1 - .1 * eo((u - .15) / .5)) * (1 - .13 * eio((T - T_OUT1) / .6)) * (1 - eio((T - T_SHADE_OUT) / .5)), '');      // (v31: lighter under the headline, so the smash still reads)
  // the logo and the Meta line: in, then lifted away at 0:15
  if (T < T_OUT1 + .45) {
    if (!L.src.endsWith('logos/office.webp')) L.src = '../work/assets/logos/office.webp';
    L.style.width = '940px';
    const pin = eo(u / .28), pout = eio((T - T_OUT1) / .4);
    const sc = lerp(1.35, 1, pin) + .04 * Math.sin(Math.PI * clamp((u - .2) / .25)) - .08 * pout;
    show(L, true, clamp(u / .12) * (1 - pout), `translate(-50%,-50%) translateY(${-70 - 90 * pout}px) scale(${sc})`);
    const cv = vis(T, T_LOGO + .3, T_OUT1 - .05, { y: 24, din: .4, dout: .35, lift: -60 });
    if (cv) show(credit, true, cv.o, `translate(-50%,-50%) translateY(${92 + cv.y}px)`); else show(credit, false);
  } else { show(L, false); show(credit, false); }
  // v33: the mail icon, in Keyboard Smash colours, pops in as the logo leaves and is cut ten times down to zero across
  // "clear your inbox, one round at a time": a mint streak, a shake, the badge counting down, a burst of green pixels and paper
  const ks = $('ks-cut'), KS_IN = T_OUT1 + .2, KS_CUT = Array.from({ length: KS_N }, (_, k) => lerp(W('game', 'clear') - .05, W('round', 'time') + .1, k / (KS_N - 1)));
  // v39: no fade out: at TX the icon swells, then pops away in one last burst, and the words fall off
  const TX = E('round') + .12, xe = clamp((T - TX) / .42);
  const kv = T >= KS_IN && T < TX + .5 ? { o: 1 } : null;
  if (!kv) show(ks, false);
  else {
    show(ks, true, 1, '');
    const done = KS_CUT.filter(t => T >= t).length, last = done ? KS_CUT[done - 1] : -9, since = T - last;
    const hit = Math.max(0, 1 - since / .2), side = done % 2 ? 1 : -1;
    const pin = eo((T - KS_IN) / .35), over = .12 * Math.sin(Math.PI * clamp((T - KS_IN - .15) / .3));
    const zero = done === KS_N ? eo((T - KS_CUT[KS_N - 1] - .05) / .4) : 0;
    const pop = xe <= 0 ? 1 : xe < .25 ? 1 + .18 * eo(xe / .25) : 1.18 * (1 - eio((xe - .25) / .75));
    $('ks-icon').style.transform = `scale(${(lerp(.55, 1, pin) + over - .07 * hit + .05 * zero) * pop}) rotate(${side * 7 * hit + 28 * eio(xe)}deg) translateX(${side * 10 * hit}px)`;
    $('ks-icon').style.filter = `drop-shadow(0 18px 0 #0b091299) drop-shadow(0 0 ${36 * zero}px #4ff3c8${Math.round(200 * zero).toString(16).padStart(2, '0')})`;
    const b = $('ks-badge'); $('ks-num').textContent = KS_N - done;
    const gone = done === KS_N ? eio((T - KS_CUT[KS_N - 1] - .45) / .3) : 0;
    b.style.transform = `scale(${(1 + .3 * hit) * (1 - gone)})`; b.style.opacity = 1 - gone;
    // the streak: a quick swipe across the icon at alternating angles
    const st = $('ks-streak'), sp = clamp(since / .14);
    st.style.opacity = since < .2 ? 1 - clamp((since - .08) / .12) : 0;
    // (v36: centred on the icon and sweeping along its own line, so it crosses the icon, not below it)
    st.style.transformOrigin = '50% 50%';
    st.style.transform = `rotate(${side * (18 + 10 * rnd(done))}deg) translateX(${-side * 300 * (1 - eo(sp))}px) scaleX(${.35 + .65 * eo(sp)})`;
    // the bursts: mint and green pixels, and a few cream paper bits, flung off the icon, falling
    ksParts.forEach((e, n) => {
      const k = Math.floor(n / KS_PER), exitB = k >= KS_N, q = T - (exitB ? TX + .1 : KS_CUT[k]);
      if (q < 0 || q > .8) { e.style.opacity = 0; return; }
      const ang = exitB ? rnd(n) * Math.PI * 2 : (k % 2 ? -.35 : .35) + (rnd(n) - .5) * 2.4 + (rnd(n + 7) > .5 ? Math.PI : 0), sp2 = (exitB ? 520 : 380) + 520 * rnd(n + 1), paper = rnd(n + 2) > .78;
      const x = Math.cos(ang) * sp2 * eo(q / .8) * .9, y = Math.sin(ang) * sp2 * eo(q / .8) * .6 + 420 * q * q;
      const sz = paper ? 16 + 10 * rnd(n + 4) : 7 + 9 * rnd(n + 4);
      e.style.width = sz + 'px'; e.style.height = (paper ? sz * .7 : sz) + 'px';
      e.style.background = paper ? '#efe4c8' : rnd(n + 5) > .5 ? '#7dffc9' : rnd(n + 6) > .5 ? '#2bbf93' : '#d6fff0';
      e.style.boxShadow = paper ? 'none' : '0 0 10px #4ff3c8aa';
      e.style.opacity = 1 - clamp((q - .45) / .35);
      e.style.transform = `translate(${x}px,${y}px) rotate(${(rnd(n + 8) - .5) * 720 * q}deg)`;
    });
  }
  // the line: first half in as the logo leaves, then "one round at a time" word by word; out with the shade
  const lv = vis(T, T_OUT1 + .4, 999, { y: 34, din: .5 });      // (after the logo has cleared: no crossfade; v39: it leaves by falling, not fading)
  if (!lv || T > TX + 1.1) return show(line, false);
  show(line, true, lv.o, `translateY(calc(-50% + ${lv.y}px))`);
  const second = ['one', 'round', 'at', 'a', 'time'], at = second.map(w => W('round', w) - .06);
  line.querySelector('.rl2').style.height = 1.06 * eio((T - (W('round', 'one') - .35)) / .4) + 'em';      // (v31: the first line sits centred until the second opens under it)
  const words = [...line.querySelectorAll('.rl1 b'), ...line.querySelectorAll('.rl2 b')];
  words.forEach((b, i) => {
    const k = i - 4;      // (the second line's words are 4 to 8)
    let sc = 1, ty = 0, op = 1;
    if (k >= 0) {
      // v39: each word stamps in: on almost at once, down from 1.8x with a small bounce
      const p = clamp((T - at[k]) / .18);
      b.style.display = T >= at[k] ? 'inline-block' : 'none';      // (only words already said take space, so the line builds from the centre)
      op = clamp((T - at[k]) / .05);
      sc = lerp(1.8, 1, eo(p)) - .06 * Math.sin(Math.PI * clamp((T - at[k] - .16) / .18));
      ty = -18 * (1 - eo(p));
    }
    // the fall: a little hop, then down with a spin, one word after the other
    const order = k >= 0 ? k : 5 + i;      // (the bottom line goes first, so the two lines never cross)
    const q = clamp((T - (TX + order * .04)) / .65), x = (rnd(i + 70) - .5) * 220 * q, y = 1150 * q * q - 55 * q, r = (rnd(i + 71) - .5) * 80 * q;
    b.style.opacity = op * (1 - clamp((q - .8) / .2));
    b.style.transform = `translate(${x}px,${ty + y}px) rotate(${r}deg) scale(${sc})`;
  });
  // keycaps burst from each word of "one round at a time" as it lands (from where the word was when it landed: words
  // said later push the line left by half their width, so that is added back)
  const rl2 = [...line.querySelectorAll('.rl2 b')], gap = parseFloat(getComputedStyle(line.querySelector('.rl2')).columnGap) || 20;
  kcParts.forEach((e, n) => {
    const k = Math.floor(n / KC_PER), q = T - (at[k] + .1);
    if (q < 0 || q > .7 || rl2[k].style.display === 'none') { e.style.opacity = 0; return; }
    const b = rl2[k], later = rl2.slice(k + 1).filter(w => w.style.display !== 'none').reduce((a, w) => a + (w.offsetWidth + gap) / 2, 0);
    const ox = b.offsetLeft + b.offsetWidth / 2 + later, oy = b.parentElement.offsetTop + b.offsetHeight / 2;
    // (sprayed out sideways from the word and a little up, so they don't cover the line above)
    const key = e.className === 'key', left = rnd(n + 9) > .5, ang = (left ? Math.PI : 0) + (left ? 1 : -1) * (.12 + .62 * rnd(n)), sp = 260 + 300 * rnd(n + 1);
    const x = ox + Math.cos(ang) * sp * eo(q / .7), y = oy + Math.sin(ang) * sp * eo(q / .7) * .8 + 760 * q * q;
    const sz = key ? 26 + 12 * rnd(n + 2) : 9 + 6 * rnd(n + 2);
    e.style.width = sz + 'px'; e.style.height = sz + 'px';
    e.style.opacity = 1 - clamp((q - .45) / .25);
    e.style.transform = `translate(${x - sz / 2}px,${y - sz / 2}px) rotate(${(rnd(n + 3) - .5) * 540 * q}deg)`;
  });
}

function homeScreen(T) {
  // the real home screen: under the logo glide, and again when the agent's link opens on the Quest
  const wins = [];      // (v32: no level select; the How to Play clip covers "pick your level, and hit play")
  const w = wins.find(w => T >= w[0] && T < w[1]);
  const code = $('home-code');
  if (!w) { show(code, false); return false; }
  const f = clamp(Math.round((T - w[0]) * FPS) + 1, 1, FOOT.home);
  const src = `../work/footage/home/${String(f).padStart(4, '0')}.jpg`;
  if (src !== footSrc) { $('foot-img').src = src; footSrc = src; }
  $('foot-img').style.transform = '';
  show($('foot'), true, eio((T - w[0] - w[2]) / w[3]), '');
  // the round's code, where the game shows it
  place(code, w[0] === T_HOME ? vis(T, T_HOME + .35, w[1] - .3, { y: -16, din: .4 }) : null);
  return true;
}

function cursor(T) {
  const c = $('cursor'), r = $('ripple');
  const mid = id => { const q = $(id).getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2 + 6]; };
  // [from, arrive, startX (or an element id to start from), startY, target (element id or point), clickAt, chain?]
  // chain: the move hands straight on to the next one (no fade out), or comes straight from the last (no fade in)
  const moves = [
    [C('connect') + .15, T_CONNECT - .08, 1500, 900, 'c-btn', T_CONNECT],
    [W('link', 'opens') - .2, T_OPEN - .08, 1400, 880, 'm-open', T_OPEN],
    // v54: on the level select in the browser: Super Space on "browser", then Clean your inbox
    [C('browser') - .6, T_CLICK - .07, 1520, 1010, 'b-play', T_CLICK, { until: T_CLICK + .2, noOut: true }],
    [T_CLICK + .2, T_CLICK2 - .07, 'b-play', 0, 'b-go', T_CLICK2, { noIn: true }],
    [C('sends') + .2, T_OKAY - .08, 1450, 900, 'm-ok', T_OKAY],
  ];
  const m = moves.find(m => T >= m[0] && T < (m[6]?.until ?? m[5] + .45));
  if (!m) { show(c, false); show(r, false); return; }
  const to = typeof m[4] === 'string' ? mid(m[4]) : m[4], from = typeof m[2] === 'string' ? mid(m[2]) : [m[2], m[3]];
  const p = eio((T - m[0]) / (m[1] - m[0]));
  const x = lerp(from[0], to[0], p), y = lerp(from[1], to[1], p);
  const press = T >= m[5] && T < m[5] + .14 ? .86 : 1;
  show(c, true, (m[6]?.noIn ? 1 : clamp((T - m[0]) / .2)) * (m[6]?.noOut ? 1 : 1 - clamp((T - m[5] - .25) / .2)), `translate(${x}px,${y}px) scale(${press})`);
  const cm = moves.find(q => T >= q[5] && T < q[5] + .4);
  if (cm) { const [rx, ry] = typeof cm[4] === 'string' ? mid(cm[4]) : cm[4], rp = (T - cm[5]) / .4; r.style.left = rx + 5 + 'px'; r.style.top = ry + 3 + 'px'; show(r, true, 1 - rp, `scale(${lerp(.3, 1.2, eo(rp))})`); } else show(r, false);
}

// A message in the agent's chat: it takes its place in the column when it arrives, then slides up into it.
function msg(id, T, at, flex = 'block') {
  const el = $(id);
  if (T < at) { el.style.display = 'none'; return 0; }
  const p = eo((T - at) / .4);
  el.style.display = flex; el.style.opacity = p; el.style.transform = `translateY(${(1 - p) * 22}px)`;
  return p;
}
function muse(T) {
  // v7, the core of the film: the player's own agent (Muse) sets the game up over our MCP, and later acts on the results
  const el = $('muse'), win = $('mwin');
  const setup = T >= M_IN && T < T_REVEAL + PUSH_LEN - .05, done = T >= M2_IN && T < M2_OUT + .35;
  if (!setup && !done) return show(el, false);
  show(el, true, 1, '');
  $('mchat').classList.toggle('done', done);
  place(win, setup ? vis(T, M_IN, T_REVEAL + PUSH_LEN - .14, { y: 260, din: .62, dout: .06 }) : vis(T, M2_IN, M2_OUT, { y: 50, din: .55 }));
  const ids = ['m-ask', 'm-read', 'm-round', 'm-ready', 'm-done'];
  if (setup) {
    // 1. add our MCP as a connector
    place($('mconnect'), vis(T, C('connect') - .05, T_CONNECT + .45, { y: 26, din: .4 }));
    const on = T >= T_CONNECT + .1, btn = $('c-btn');
    btn.textContent = on ? 'Connected' : 'Connect'; btn.classList.toggle('ok', on);
    btn.style.transform = `scale(${T >= T_CONNECT && T < T_CONNECT + .12 ? .93 : 1})`;
    place($('mconn'), vis(T, T_CONNECT + .6, 999, { y: 12, din: .35 }));
    // 2. ask it for a game: typed in the message bar, then sent
    const ask = 'Set up an Inbox Zero game', t0 = C('ask'), t1 = E('ask') - .3, sent = E('ask') - .08;
    const n = T >= sent ? 0 : Math.round(ask.length * clamp((T - t0) / (t1 - t0)));
    $('mtext').textContent = n ? ask.slice(0, n) : 'Message'; $('mtext').classList.toggle('typed', n > 0);
    $('msend').classList.toggle('live', n > 0);
    $('msend').style.transform = `scale(${T >= sent && T < sent + .14 ? .88 : 1})`;
    msg('m-ask', T, sent);
    // 3. it reads the newest unread mail, 4. makes a round, 5. hands back a link for the Quest
    msg('m-read', T, C('reads') - .15, 'flex');
    const cnt = Math.round(10 * clamp((T - C('reads')) / (E('reads') - .25 - C('reads'))));
    $('m-count').textContent = T >= C('reads') ? ` ${cnt} of 10` : '';
    $('t-read').classList.toggle('done', cnt >= 10);
    msg('m-round', T, C('link') - .1, 'flex');
    $('t-round').classList.toggle('done', T >= C('link') + .45);
    msg('m-ready', T, W('link', 'special') - .1);
    $('m-link').style.transform = `scale(${T >= T_OPEN && T < T_OPEN + .14 ? .97 : 1})`;
    $('m-done').style.display = 'none';
  } else {
    // the round is over: the agent shows what you chose and waits for a yes before it touches anything
    for (const id of ids.slice(0, 4)) $(id).style.display = 'none';
    show($('mconnect'), false); show($('mconn'), true, 1, '');
    $('mtext').textContent = 'Message'; $('mtext').classList.remove('typed'); $('msend').classList.remove('live'); $('msend').style.transform = '';
    // v43: the message is there as the window rises (no empty window); its results card fills in row by row as each is
    // said, each with its own icon; after Okay each row is done in turn and the card reads "all done"
    msg('m-done', T, M2_IN - .4);
    const rows = [['r-arch', W('archives', 'archives') - .12], ['r-send', W('sends', 'sends') - .12], ['r-later', E('sends') - .25]];
    rows.forEach(([id, at], i) => {
      const r = $(id), q = eo((T - at) / .35);
      r.style.visibility = 'visible'; r.style.display = T >= at ? 'flex' : 'none';
      r.style.opacity = q; r.style.transform = `translateY(${(1 - q) * 18}px)`;
      const ic = r.querySelector('.ric'), iq = clamp((T - at) / .35);
      ic.style.transform = `scale(${iq <= 0 ? .4 : lerp(.4, 1, eo(iq)) + .18 * Math.sin(Math.PI * clamp(iq / .8))})`;
      const fd = T_OKAY + .18 + i * .2, fq = clamp((T - fd) / .32);
      r.querySelector('.rfill').style.transform = `scaleX(${eio(fq)})`;
      const tk = r.querySelector('.tk'); tk.classList.toggle('done', fq >= 1);
      tk.style.transform = `scale(${fq >= 1 ? 1 + .3 * Math.sin(Math.PI * clamp((T - fd - .32) / .2)) : 1})`;
    });
    const allDone = T >= T_OKAY + .18 + 2 * .2 + .32;
    $('rstate').classList.toggle('done', allDone); $('rstate-t').textContent = allDone ? 'all done' : '10 emails';
    place($('m-ok').parentElement, vis(T, C('okay') - .2, 999, { y: 18, din: .35 }));
    const ok = T >= T_OKAY + .1, b = $('m-ok');
    b.textContent = ok ? 'Done' : 'Okay'; b.classList.toggle('ok', ok);
    b.style.transform = `scale(${T >= T_OKAY && T < T_OKAY + .12 ? .93 : 1})`;
    $('m-edit').style.opacity = ok ? 0 : 1;
  }
}

function overlays(T, seg) {
  // level logos
  const L = $('level-logo');
  const cur = [...LOGOS].reverse().find(l => T >= l[1]);
  if (cur && T < LOGO_END + .3) {
    const src = `../work/assets/logos/${cur[0]}.webp`;
    if (!L.src.endsWith(src.slice(2))) L.src = src;
    const p = eo((T - cur[1]) / .35), out = clamp((T - LOGO_END) / .3);
    show(L, true, p * (1 - out), `translateY(${(1 - p) * -24 + out * -20}px) scale(${lerp(.86, 1, p)})`);
    // v40: the level's name, top right, in its own colour
    const NAMES = { office: ['Keyboard Smash', '#7dffc9'], castle: ['The Haunted Hall', '#c9b2ff'], lab: ['Toxic Danger', '#8dff6a'], inferno: ['Inferno', '#ff9a52'], kyoto: ['Kyoto Nights', '#ffc0d9'], lumber: ['LumberHack', '#ffc440'], space: ['Super Space', '#5ef0ff'] };
    const nm = $('level-name'), [txt, col] = NAMES[cur[0]];
    if (nm.textContent !== txt) nm.textContent = txt;
    nm.style.color = col;
    const np = eo((T - cur[1] - .08) / .3);
    show(nm, true, np * (1 - out), `translateX(${(1 - np) * 30}px) scale(${lerp(.9, 1, np) + .05 * Math.sin(Math.PI * clamp((T - cur[1] - .1) / .25))})`);
  } else { show(L, false); show($('level-name'), false); }
  // hands
  const hl = $('hand-l'), hr = $('hand-r');
  const lv = null;      // (v32: no hand illustrations; the clip has the real hands)
  if (lv) {
    const img = T >= W('throw', 'throw') ? 'left-throw' : T >= W('grab', 'read') ? 'left-read' : 'left-grab';
    if (!hl.src.includes(img)) hl.src = `../work/assets/hands/${img}.png`;
    const pop = T - Math.max(W('throw', 'throw'), 0) >= 0 && T - W('throw', 'throw') < .25 ? 1 + .08 * Math.sin(Math.PI * (T - W('throw', 'throw')) / .25) : 1;
    show(hl, true, lv.o, `translate(${(1 - lv.pi) * -200}px,${lv.y}px) scale(${pop})`);
  } else show(hl, false);
  const rv = null;
  if (rv) {
    const img = T >= W('cut', 'pieces') - .1 ? 'right-destroy' : 'right-slash';
    if (!hr.src.includes(img)) hr.src = `../work/assets/hands/${img}.png`;
    show(hr, true, rv.o, `translate(${(1 - rv.pi) * 200}px,${rv.y}px)`);
  } else show(hr, false);
  // phrases: each rises in as the last lifts out
  PHRASES.forEach(([, a, b], i) => { const v = vis(T, a, b, { y: 28, din: .45, dout: .25, lift: -22 }); place(phraseEls[i], v, 'translateX(-50%)'); if (v) phraseEls[i].style.transform = `translateX(-50%) translateY(${v.y}px)`; });
  // dictation bubble
  const mv = null;      // (v32: no mic bubble; recording.mp4 shows the real recording panel)
  if (mv) {
    const words = 'Monday works, see you then', t0 = W('pull', 'say');
    const n = Math.round(words.length * clamp((T - t0) / .9));
    $('mic-t').textContent = words.slice(0, n) || '…';
    const m = $('mic'); show(m, true, mv.o, `translateX(-50%) translateY(${mv.y}px) scale(${lerp(.9, 1, mv.pi)})`);
    m.querySelector('.micdot').style.transform = `scale(${1 + .08 * Math.sin(T * 14)})`;
  } else show($('mic'), false);
}

function browser(T) {
  // v43: a bigger window, the address typing itself, the two lines as pixel stickers on its edge. v54: "instead of showing
  // the site, show the level selector - maybe clicking a level": the game's level select loads in the window; on "browser"
  // the cursor picks Super Space (the selection moves off Kyoto), then Clean your inbox; Super Space loads in the window on
  // the same frame as the take behind it, and the window grows to fill the screen, straight into the seated scene
  const el = $('browser');
  if (T < B_A || T >= T_FULL + .06) return show(el, false);
  show(el, true, 1, '');
  const win = $('win'), pin = eo((T - B_A) / .6), ex = eio((T - T_EXP0) / (T_FULL - T_EXP0)), S = 1920 / 1360;
  const drift = 1 + .015 * clamp((T - B_A - .6) / 4) * (1 - ex);
  $('foot-img').style.filter = `blur(${3 * (1 - ex)}px) brightness(${1 - .32 * (1 - ex)})`;
  win.style.borderRadius = `${20 * (1 - ex)}px`;
  win.style.background = 'transparent'; win.querySelector('.bar').style.opacity = 1 - clamp(ex / .22);      // (v58: the browser chrome fades as the window grows, not slides off the top)
  show(win, true, clamp((T - B_A) / .25), `translateY(${lerp(70 * (1 - pin), -18.5, ex)}px) scale(${lerp(lerp(.93, 1, pin) * drift, S, ex)})`);
  // the address: typed, then "/play" once the game starts
  const host = 'inboxzerovr.com/play', ta = B_A + .2, typed = Math.round(host.length * clamp((T - ta) / .6));
  $('addr-t').textContent = host.slice(0, typed) + (T >= T_CLICK2 + .04 ? '?level=space' : '');
  $('addr-caret').style.opacity = T < ta + .6 || (T < ta + 1.2 && Math.floor(T * 4) % 2 === 0) ? 1 : 0;
  // loading bars: the level select, then the level
  const ld = $('b-load'), l1 = clamp((T - (ta + .6)) / .65), l2 = clamp((T - (T_CLICK2 + .04)) / .2);
  const lp = T < T_CLICK2 ? l1 : l2, lon = T < T_CLICK2 ? l1 > 0 && T < ta + 1.45 : T < T_GAME0 + .2;
  ld.style.opacity = lon ? 1 - clamp((T - (T < T_CLICK2 ? ta + 1.25 : T_GAME0)) / .2) : 0;
  ld.style.transform = `scaleX(${eo(lp)})`;
  // the level select settles in (on the same slowed clock as before)
  const so = eo((T - (ta + 1.3)) / .35), go = eo((T - T_GAME0) / .25);
  $('site-img').style.opacity = 0;
  $('shot').style.background = '#0b0820';
  // v58: "dont do a white background - do a mock loading with the logo and dark background - see real loading screen": the
  // game's own loading screen (vr3/play/index.html #loading), drawn larger for the window: the logo floating on dark indigo
  // lit pink and mint, a pixel bar sweeping pink to mint in steps, "loading" blinking; the level select fades in over it
  const bl = $('b-loading'); bl.style.opacity = 1 - so; bl.style.visibility = so >= 1 ? 'hidden' : 'visible';
  const lin = clamp((T - B_A - .1) / .8), lfl = Math.sin((T - B_A) * 2 * Math.PI / 5.2);
  $('bl-logo').style.opacity = clamp(lin * 3);
  $('bl-logo').style.transform = `translateY(${-7 * lfl}px) rotate(${.4 * lfl}deg) scale(${lin < .6 ? lerp(.92, 1.03, eo(lin / .6)) : lerp(1.03, 1, eo((lin - .6) / .4))})`;
  const swp = (T - B_A) % 1.3 / 1.3, stp = Math.floor(swp * 14) / 14;
  $('bl-sweep').style.transform = `translateX(${lerp(-100, 340, stp)}%)`;
  $('bl-text').style.opacity = Math.floor((T - B_A) / .55) % 2 ? .45 : 1;
  const menu = $('game-img'), msrc = homeSrc(T + 1.6);
  if (!menu.src.endsWith(msrc.slice(2))) menu.src = msrc;
  menu.style.opacity = so; menu.style.transform = `translateY(${16 * (1 - so)}px) scale(${1.02 - .02 * so})`;
  // the pick: Kyoto's pink ring and tick are covered with nearby bits of the same frame, and a pink ring and tick land on
  // Super Space (frame coordinates scaled to the window: 1360 / 1920)
  const K = 1360 / 1920, picked = T >= T_CLICK + .03, url = `url(${menu.src})`;
  const patch = (id, x, y, w, h, dx, dy) => { const e = $(id); Object.assign(e.style, { left: x * K + 'px', top: y * K + 'px', width: w * K + 'px', height: h * K + 'px', backgroundImage: url, backgroundSize: '1360px 765px', backgroundPosition: `${-(x + dx) * K}px ${-(y + dy) * K}px`, opacity: picked ? so : 0 }); };
  patch('b-k1', 432, 405, 268, 13, 0, -14); patch('b-k2', 432, 569, 268, 12, 0, 14); patch('b-k3', 430, 405, 12, 176, -12, 0); patch('b-k4', 677, 405, 14, 176, 13, 0);
  patch('b-k5', 636, 422, 50, 44, -60, 0);
  const pk = $('b-pick'), pq = clamp((T - T_CLICK - .03) / .25);
  Object.assign(pk.style, { left: 566 * K + 'px', top: 588 * K + 'px', width: 259 * K + 'px', height: 167 * K + 'px' });
  pk.style.opacity = picked ? so * (1 - go) : 0; pk.style.transform = `scale(${pq < .6 ? lerp(1.15, .97, eo(pq / .6)) : lerp(.97, 1, eo((pq - .6) / .4))})`;
  // the buttons take their clicks
  const bp = $('b-play'), p1 = T >= T_CLICK && T < T_CLICK + .16;
  Object.assign(bp.style, { left: 573 * K + 'px', top: 595 * K + 'px', width: 245 * K + 'px', height: 153 * K + 'px' });
  bp.style.background = p1 ? '#ffffff40' : 'transparent';
  const bg2 = $('b-go'), p2 = T >= T_CLICK2 && T < T_CLICK2 + .16;
  Object.assign(bg2.style, { left: 803 * K + 'px', top: 785 * K + 'px', width: 314 * K + 'px', height: 55 * K + 'px' });
  bg2.style.background = p2 ? '#ffffff59' : 'transparent'; bg2.style.boxShadow = p2 ? '0 0 24px 6px #ffb3d188' : 'none';
  // Super Space in the window, on the same frame as the take behind
  const lvl = $('level-img'), seg = SEG.find(g => g[0] === 'superspace'), lsrc = segSrc(seg, T);
  if (T >= T_GAME0 - .02 && !lvl.src.endsWith(lsrc.slice(2))) lvl.src = lsrc;
  lvl.style.opacity = go; lvl.style.transform = `scale(${lerp(1.05, 1, go)})`;
  // the stickers: they slap onto the window's bottom edge; the first slides over when the second arrives; both drop away
  const s1 = $('st-sdk'), s2 = $('st-nodl'), t1 = W('iwsdk', 'immersive') - .1, t2 = W('nodl', 'nothing') - .12;
  const w1 = s1.offsetWidth, w2 = s2.offsetWidth, GAP = 40, both = eio((T - t2) / .4);
  const x1 = lerp(960 - w1 / 2, 960 - (w1 + GAP + w2) / 2, both), x2 = 960 - (w1 + GAP + w2) / 2 + w1 + GAP;
  const edge = 941 + 70 * (1 - pin) - s1.offsetHeight / 2, drop = eio((T - T_EXP0) / .35);
  [[s1, t1, x1, -3], [s2, t2, x2, 2.5]].forEach(([st, at, x, rot]) => {
    const q = clamp((T - at) / .32);
    if (q <= 0 || drop >= 1) return show(st, false);
    const sc2 = q < .55 ? lerp(1.7, .92, eo(q / .55)) : lerp(.92, 1, eo((q - .55) / .45));
    st.style.left = x + 'px'; st.style.top = edge + 'px';
    show(st, true, clamp(q * 5) * (1 - drop), `translateY(${260 * drop * drop}px) rotate(${rot + (1 - eo(q)) * rot * -4 + drop * rot * 4}deg) scale(${sc2})`);
  });
}

// petals and warm motes for the Kyoto backdrop (fixed seeds, so every frame is a pure function of time)
const seatMotes = [];
for (let k = 0; k < 46; k++) { const i = document.createElement('i'); i.className = k < 30 ? 'petal' : 'mote'; $('seat-motes').appendChild(i); seatMotes.push(i); }

function seated(T) {
  // v8: the transparent take (the user's own cut) in the bottom left. v43: the player slides in from the left; the take
  // plays a third faster and the scene ends as the line does. v44: over the webvr-chair take (was the level select)
  const a = SEAT_A, b = SEAT_B, el = $('seated');
  if (T < T_FULL - .02 || T >= b + .3) return show(el, false);
  show(el, true, 1 - eio((T - b) / .22), '');
  const u = T - a, s = seatSrc(u);
  const f = clamp(Math.round(s * 30) + 1, 1, FOOT.seated3);
  const src = `../work/footage/seated3/${String(f).padStart(4, '0')}.png`;
  if (!$('seat-img').src.endsWith(src.slice(2))) $('seat-img').src = src;
  const pin = eo((T - T_FULL + .05) / .5);
  show($('seat-img'), true, clamp((T - T_FULL + .05) / .25), `translateX(${380 - 170 * (1 - pin)}px) scale(${lerp(1.04, 1.1, pin)})`);      // (v54: just left of centre, was at the left edge)      // (a touch bigger, from its bottom left corner)
  // v44: behind the player is the webvr-chair take (the footage layer), a little darker where the player sits
  $('seat-bg').style.display = 'none';
  $('foot').style.opacity = 1 - eio((T - b) / .22);      // (the take fades out with the player, to the white of the clear)
  const foc = eio((T - T_FULL - .05) / .6);
  $('foot-img').style.filter = `brightness(${1 - .1 * foc})`;
  $('seat-shade').style.opacity = foc;
}

function flow(T) {
  // v55: "completely redesign this part - have the agent muse in center and inbox and game on either side, showing their
  // agent accesses your email (privacy) and only what is needed is sent to make a game, and deleted after - never reads,
  // stores, or has access to email - just summary". Your agent in the middle; it and your inbox share a private zone,
  // envelopes running between them; only short summaries cross to the game; the game has no way back to your email (a
  // dashed path, crossed, and a summary that tries it is stopped); on "deleted" the game's summaries burst into pixels
  const a = C('never') - .25, b = C('try') - .58, el = $('flow');
  if (T < a || T >= b + .3) return show(el, false);
  const out = clamp((T - b) / .3);
  show(el, true, 1 - out, `translateY(${-24 * eo(out)}px)`);
  const XI = 400, XA = 960, XG = 1520, Y = 430;
  const tA = a, tG = W('never', 'game') - .1, tI = W('never', 'touches') - .1, tArc = W('never', 'your') - .05, tX = W('never', 'inbox') + .1;
  const tSum = W('deleted', 'and') - .2, tDel = W('deleted', 'deleted');
  const pop = q => q <= 0 ? 0 : q < .6 ? lerp(.55, 1.07, eo(q / .6)) : lerp(1.07, 1, eo((q - .6) / .4));
  const del = clamp((T - tDel) / .35), shake = T > tDel && T < tDel + .3 ? 9 * Math.sin((T - tDel) * 80) * (1 - (T - tDel) / .3) : 0;
  [['n-inbox', XI, tI, 0, 105], ['n-agent', XA, tA, 1, 115], ['n-game', XG, tG, 2, 105]].forEach(([id, x, at, k, half]) => {
    const n = $(id), q = clamp((T - at) / .4);
    n.style.left = x + (id === 'n-game' ? shake : 0) + 'px'; n.style.top = Y - half + 'px';
    show(n, q > 0, clamp(q * 4), `translateY(${4 * Math.sin(T * 1.5 + k * 2.1)}px) scale(${pop(q)})`);
  });
  const ring = $('n-agent').querySelector('.fring'), rp = ((T - tA) % 1.6) / 1.6;
  ring.style.transform = `scale(${1 + .06 * rp})`; ring.style.opacity = .35 * (1 - rp);
  // the private zone: your inbox and your agent
  const zq = clamp((T - tI - .25) / .45), pz = $('pz');
  show(pz, zq > 0, clamp(zq * 3), `scale(${lerp(.96, 1, eo(zq))})`);
  $('pz-tag').style.transform = `translateX(-50%) scale(${pop(clamp((T - tI - .45) / .4))})`;
  // the wires
  const wire = (id, x0, x1, at, dim = 0) => { const w = $(id), q = eo((T - at) / .4); w.style.left = x0 + 'px'; w.style.top = Y + 'px'; w.style.width = x1 - x0 + 'px'; show(w, q > 0, q * (1 - .65 * dim), `scaleX(${q})`); return q; };
  const qIA = wire('w-ia', XI + 125, XA - 140, tI + .2), qAG = wire('w-ag', XA + 140, XG - 125, tG + .3, del);
  // envelopes: your inbox to your agent, all the way through
  envPk.forEach((e, j) => {
    const PER = 1.0, ph = (T - (tI + .6)) / PER - j / 4, p = ph - Math.floor(ph);
    if (qIA < 1 || ph < 0) { e.style.opacity = 0; return; }
    const x = lerp(XI + 135, XA - 150, eio(p)) - 28, y = Y - 20 - 16 * Math.sin(Math.PI * p);
    e.style.opacity = clamp(p * 6) * clamp((1 - p) * 6); e.style.transform = `translate(${x}px,${y}px) scale(${.85 + .2 * Math.sin(Math.PI * p)})`;
  });
  // short summaries: your agent to the game, ten of them, counted in on the game's badge
  const N = 10, launch = k => tSum + k * .085, TRAVEL = .5;
  let arrived = 0;
  for (let k = 0; k < N; k++) {
    const e = sumPk[k], p = (T - launch(k)) / TRAVEL;
    if (p >= 1) arrived++;
    if (p < 0 || p >= 1) { e.style.opacity = 0; continue; }
    const x = lerp(XA + 150, XG - 20, eio(p)) - 46, y = Y - 26 - 34 * Math.sin(Math.PI * p);
    e.style.opacity = clamp(p * 6) * (1 - clamp((p - .8) / .2)); e.style.transform = `translate(${x}px,${y}px) scale(${lerp(1, .55, clamp((p - .6) / .4))}) rotate(${(rnd(k) - .5) * 14}deg)`;
  }
  const chip = $('c-ag'), cq = clamp((T - tSum + .15) / .35);
  chip.style.left = (XA + XG) / 2 + 'px'; chip.style.top = Y - 118 + 'px';
  if (cq > 0) show(chip, true, clamp(cq * 4), `translate(-50%,-50%) scale(${pop(cq)})`); else show(chip, false);
  const gb = $('fg-badge'), last = Math.max(...Array.from({ length: N }, (_, k) => launch(k) + TRAVEL).filter(t => t <= T), -9);
  gb.textContent = arrived;
  gb.style.transform = `scale(${arrived === 0 ? 0 : (1 + .25 * Math.max(0, 1 - (T - last) / .15)) * (1 - eo(del))})`;
  // no way back: the dashed path from the game to your inbox, crossed; a summary tries it and is stopped
  const xp = eo((T - tArc) / .5), arc = $('arc');
  arc.setAttribute('d', `M${XG} ${Y + 210} C${XG} ${Y + 470} ${XI} ${Y + 470} ${XI} ${Y + 210}`);
  arc.style.opacity = .95 * xp; $('flow-arc').style.clipPath = `inset(0 0 0 ${(1 - xp) * 100}%)`;
  const L = arc.getTotalLength(), mid = arc.getPointAtLength(L / 2);
  const nox = $('nox'); nox.style.left = mid.x + 'px'; nox.style.top = mid.y + 'px';
  const tb = tX + .35, bk = T - tb - .5, xo = clamp((T - tX) / .3);
  show(nox, xo > 0, clamp(xo * 4), `scale(${pop(xo) + (bk >= 0 && bk < .25 ? .25 * Math.sin(Math.PI * bk / .25) : 0)})`);
  const nv = $('fnever'), nq = clamp((T - tX - .12) / .35); nv.style.top = mid.y + 54 + 'px';
  if (nq > 0) show(nv, true, clamp(nq * 3), `translateX(-50%) translateY(${(1 - eo(nq)) * 14}px)`); else show(nv, false);
  { const e = sumPk[10], p = (T - tb) / .5;
    if (p < 0 || p > 1.5) e.style.opacity = 0;
    else { const pt = arc.getPointAtLength(L * .5 * eio(Math.min(p, 1))), hit = clamp((p - 1) / .5);
      e.style.opacity = clamp(p * 6) * (1 - hit);
      e.style.transform = `translate(${pt.x - 46 + (hit > 0 ? 10 * Math.sin(hit * 40) * (1 - hit) : 0)}px,${pt.y - 26 - 30 * hit}px) rotate(${hit * 30}deg) scale(${.8 + .4 * hit})`;
      e.style.filter = hit > 0 ? 'grayscale(1)' : ''; } }
  // deleted: the game's summaries burst into pixels and the round is stamped deleted
  const px = $('pixels');
  if (T >= tDel && T < tDel + 1.1) {
    px.style.visibility = 'visible';
    pixels.forEach(({ i }, k) => {
      const q = (T - tDel - rnd(k + 2) * .08) / 1.0;
      if (q < 0 || q > 1) { i.style.opacity = 0; return; }
      const ang = rnd(k) * Math.PI * 2, sp = 160 + 360 * rnd(k + 1), sz = 10 + 12 * rnd(k + 3);
      i.style.width = i.style.height = sz + 'px'; i.style.left = XG - sz / 2 + 'px'; i.style.top = Y - sz / 2 + 'px';
      i.style.opacity = 1 - clamp((q - .6) / .4);
      i.style.transform = `translate(${Math.cos(ang) * sp * eo(q)}px,${Math.sin(ang) * sp * .8 * eo(q) + 300 * q * q}px) rotate(${Math.round(q * 4) * 90}deg)`;
      i.style.background = ['#ff2e93', '#ffb3d1', '#7dffc9', '#ffffff', '#d9d3e3'][Math.floor(rnd(k + 5) * 5)];
    });
  } else px.style.visibility = 'hidden';
  const st = $('delstamp'), sq = clamp((T - tDel - .2) / .22);
  st.style.left = XG + 'px'; st.style.top = Y + 'px';
  if (sq > 0) show(st, true, clamp(sq * 4), `translate(-50%,-50%) rotate(-6deg) scale(${lerp(1.8, 1, eo(sq)) - .06 * Math.sin(Math.PI * clamp((T - tDel - .42) / .2))})`); else show(st, false);
}

function closing(T) {
  // v60: try it yourself over the Keyboard Smash ending, like "one round at a time": the clip (slowed) under a dark shade,
  // "try it yourself" stamped in white pixel letters word by word, the address as the pink pixel button typing itself;
  // as the card clears the words hop and fall away, the button drops, and the shade lifts off the clip at full speed
  const a = C('try') - .3, el = $('close');
  if (T < a || T >= T_OUT + 1.2) { show(el, false); show($('petals'), false); return; }
  show(el, true, 1, ''); show($('petals'), false);
  const sh = $('close-shade'); sh.style.display = 'block';
  sh.style.opacity = (1 - .14 * eo((T - a) / .6)) * (1 - eio((T - T_OUT - .15) / .55));
  $('close-white').style.opacity = 0;
  embers.forEach(m => { m.style.opacity = 0; });
  cards.forEach(c => { c.style.visibility = 'hidden'; });
  show($('pick'), false); show($('agent-chip'), false); show($('end-logo'), false);
  const tl = $('try-line');
  show(tl, true, 1, `translate(-50%,-50%) translateY(455px)`);
  [...tl.children].forEach((b, i) => {
    const at = W('try', ['try', 'it', 'yourself'][i]) - .06, p = clamp((T - at) / .18);
    b.style.display = T >= at ? 'inline-block' : 'none';
    const q = clamp((T - (T_OUT + (2 - i) * .05)) / .65), x = (rnd(i + 80) - .5) * 220 * q, y = 1150 * q * q - 55 * q, r = (rnd(i + 81) - .5) * 80 * q;
    b.style.opacity = clamp((T - at) / .05) * (1 - clamp((q - .8) / .2));
    b.style.transform = `translate(${x}px,${-18 * (1 - eo(p)) + y}px) rotate(${r}deg) scale(${lerp(1.8, 1, eo(p)) - .06 * Math.sin(Math.PI * clamp((T - at - .16) / .18))})`;
  });
  const url = 'inboxzerovr.com', t0 = W('try', 'inboxzerovrcom') - .12;
  $('url-t').textContent = url.slice(0, Math.round(url.length * clamp((T - t0) / .6)));
  $('caret').style.opacity = (T < t0 + .6 || Math.floor(T * 2.4) % 2 === 0) ? 1 : 0;
  const uq = clamp((T - (W('try', 'at') - .12)) / .4), dq = clamp((T - T_OUT - .12) / .6);
  const us = (uq < .6 ? lerp(.5, 1.06, eo(uq / .6)) : lerp(1.06, 1, eo((uq - .6) / .4))) * 1.12;
  const bump = 1 + .05 * Math.sin(Math.PI * clamp((T - t0 - .6) / .25));
  const U = $('url'); U.style.top = '615px';
  show(U, uq > 0 && dq < 1, clamp(uq * 4) * (1 - clamp((dq - .8) / .2)), `translate(-50%,-50%) translate(${40 * dq}px,${1100 * dq * dq - 40 * dq}px) rotate(${10 * dq}deg) scale(${us * bump})`);
}

function outro(T) {
  return show($('outro'), false);      // (v41: the gameplay montage and feature badges are gone)
  const el = $('outro');
  if (T < T_OUT - .05) return show(el, false);
  show(el, true, 1, '');
  $('outro').querySelector('.shade').style.opacity = eo((T - T_OUT) / .6);
  place($('out-logo'), vis(T, T_OUT + .15, 999, { y: 24 }));
  // badges stack down from the top, each one sliding up into its row
  let y = 0;
  badgeEls.forEach((b, i) => {
    const v = vis(T, BADGE_AT[i], 999, { y: 30, din: .5 });
    if (!v) { b.style.visibility = 'hidden'; return; }
    const pop = 1 + .04 * Math.sin(Math.PI * clamp((T - BADGE_AT[i]) / .35));
    b.style.top = y + 'px'; show(b, true, v.o, `translateY(${v.y}px) scale(${pop})`);
    y += b.offsetHeight + 16;
  });
  place($('out-url'), vis(T, BADGE_AT[BADGES.length - 1] + 2.4, 999, { y: 24 }));
  // a quick fade to black on the last half second
  const f = $('flash'); const end = clamp((T - (T_END - .6)) / .6);
  if (end > 0) { f.style.background = '#000'; show(f, true, end, ''); } else f.style.background = '#fff';
}

function white(T) {
  // the clean white world: the hook, and the clear inbox that mirrors it (v60: the agent scenes are retro now, below;
  // built for web and seated are over footage)
  const on = T < T_SPLIT || (T >= C('iwsdk') - .02 && T < M2_IN + .3);
  show($('white'), on, 1, '');
  // v60: "make the Agent scenes ... look more retro, pixel font, and match the style": dark indigo lit pink and mint (the
  // game's loading screen), a faint pixel grid, slow drifting pixel dust; it comes up under the agent's window
  const r1 = T >= T_PUSH && T < T_REVEAL + PUSH_LEN + .15, r2 = T >= M2_IN - .12 && T < C('try') + .2;
  const ro = r2 && T < M2_IN + .3 ? eo((T - (M2_IN - .12)) / .3) : 1;
  show($('retro'), r1 || r2, ro, '');
  if (r1 || r2) dust.forEach((d, k) => {
    const sp = 8 + 18 * rnd(k + 1), t = T + rnd(k + 2) * 40, y = ((rnd(k + 3) * 1200 - t * sp) % 1200 + 1200) % 1200 - 60;
    d.style.transform = `translate(${rnd(k) * 1920 + 14 * Math.sin(t * .4 + k)}px,${y}px)`;
    d.style.opacity = (.25 + .5 * rnd(k + 4)) * (.6 + .4 * Math.sin(t * 1.3 + k));
  });
}

/* ---------- sound ---------- */
function buildSfx() {
  // hook
  for (let t = .85; t < W('unread', '181') + .3; t += .16) sfx(t, 'blip.wav', .22);
  sfx(W('tried', 'filters'), 'sort.wav', .5); sfx(W('tried', 'reminders'), 'sort.wav', .5);
  sfx(T_SWORD - .14, 'kyoto/slash1.wav', 1); sfx(T_SPLIT + .05, 'office/glass.wav', .45);
  // footage cuts: each lands when the clip's key frame shows
  const hit = { 'kyoto-cut': ['kyoto/slash2.wav', 'kyoto/slash3.wav', 'kyoto/slash4.wav'], inferno: ['inferno/flare.wav'], office2: ['office/glass.wav'], castle: ['castle/slash1.wav'], lab: ['lab/melt1.wav'], lumber: ['lumber/chop.wav'], space: ['space/slash1.wav'], 'kyoto-cut2': ['kyoto/slash5.wav'] };
  let n = 0;
  for (const [clip, from, to, at] of SEG) { const f = hit[clip]; if (f && at >= from && at < to) sfx(at - .03, f[n++ % f.length], clip === 'inferno' ? .8 : .9); }
  const HIT = { 'office2-long': 'office/glass.wav', 'castle-long': 'castle/slash2.wav', 'lab-long': 'lab/melt2.wav', 'inferno-long': 'inferno/flare.wav', 'kyoto-long': 'kyoto/slash1.wav', 'lumber-long': 'lumber/chop.wav', 'space-long': 'space/slash2.wav' };
  const ROOM = { 'office2-long': ['office/room.mp3', 1.2], 'castle-long': ['castle/hall.mp3', 1.2], 'lab-long': ['lab/bubbles.mp3', 1.9], 'inferno-long': ['inferno/furnace.mp3', 1.2], 'kyoto-long': ['ambience/leaves.mp3', 1.3], 'lumber-long': ['lumber/yard.mp3', 1.2], 'space-long': ['space/rush.mp3', 1.5] };
  for (const [clip, from, to, at, key0] of SEG) {
    if (!CUTS[clip]) continue;
    const key = keyOf(clip, key0);
    const first = { 'office2-long': 'office/glass.wav', 'castle-long': 'castle/slash1.wav', 'lab-long': 'lab/melt1.wav', 'inferno-long': 'inferno/flare.wav', 'kyoto-long': 'kyoto/slash3.wav', 'lumber-long': 'lumber/chop.wav', 'space-long': 'space/slash1.wav' }[clip];
    CUTS[clip].forEach((c, i) => { const t = at + (c - key) / FPS; if (t >= from && t < to) sfx(t - .03, i ? HIT[clip] : first, i ? .6 : .9); });
    const [room, g] = ROOM[clip]; AMB.push({ t: +from.toFixed(3), dur: +(to - from).toFixed(3), file: A + room, gain: g });
  }
  sfx(W('flame', 'flamethrower'), 'inferno/arm.wav', .6);
  sfx(T_INBOX - .02, 'stingers/kyoto.m4a', .85);
  sfx(W('game', 'clear'), 'blip.wav', .7);
  sfx(C('round') - .05, 'arrive.wav', .5);
  sfx(T_CONNECT, 'blip.wav', .7); sfx(T_CONNECT + .2, 'kyoto/keep1.wav', .45); sfx(T_OPEN, 'blip.wav', .7); sfx(T_HOME, 'arrive.wav', .6);
  sfx(W('throw', 'throw') + .1, 'kyoto/keep2.wav', .8);
  sfx(W('pull', 'pull') + .05, 'reply.wav', .6);
  sfx(W('later', 'throw') + .15, 'kyoto/keep3.wav', .7);
  for (const [lvl, t] of LOGOS) sfx(t, `stingers/${lvl}.m4a`, .35);
  sfx(W('browser', 'browser'), 'blip.wav', .7);
  // the seated clip: the left hand takes the email at 2.5 s into the scene, the katana cuts at 4.45 s
  sfx(C('chair') - .05 + 2.45, 'blip.wav', .7);
  sfx(C('chair') - .05 + 3.7, 'kyoto/arm1.wav', .5);
  sfx(C('chair') - .05 + 4.42, 'kyoto/slash2.wav', 1);
  for (let i = 0; i < 6; i++) sfx(T_REALLY + .25 + i * .085, 'sort.wav', .28);
  sfx(T_REALLY + .95, 'kyoto/keep1.wav', .6);
  sfx(T_OKAY, 'blip.wav', .7); sfx(W('deleted', 'deleted'), 'space/ping.wav', .45);
  for (let i = 0; i < 7; i++) sfx(C("seven") + .25 + i * .11, 'blip.wav', .3);
  
  BADGE_AT.forEach((t, i) => sfx(t, i ? 'sort.wav' : 'kyoto/keep1.wav', .55));
}
const SOUND = false;      // v7: "remove all sound effects" (the old full set, kept off)
if (SOUND) buildSfx();
// v18: "add sound effects for sword, cut, fire, melt, and keyboard to add more umph" — hits only, each on its picture
function buildHits() {
  const h = (t, file, g = 1) => sfx(t, file, g);
  // v61: the user's ElevenLabs hits (work/audio/v), each placed so its loudest moment lands on the hit in the picture
  // (VPEAK: seconds into each file to its peak, measured), and rotated through variants so repeats don't sound the same
  const VPEAK = {"v-fireburst": 0.3, "v-fireimpact": 0.095, "v-glasshit": 0.33, "v-heavy-hit": 0.105, "v-katana-alt": 0.13, "v-melt": 0.12, "v-punch": 0.11, "v-reveal": 0.075, "v-saber-power": 0.47, "v-slash-1": 0.215, "v-slash-2": 0.175, "v-slash-metal": 0.275, "v-woodstrike-2": 0.035, "v-woodstrike": 0.305};
  // (per-file trims, measured in the mix: the saber swing is mostly hum, so levelling pulls its swing down; the reveal and the
  // melt are peaky)
  const VGAIN = { 'v-saber-power': 2.8, 'v-reveal': .55, 'v-melt': .75 };
  const v = (t, name, g = 1) => SFX.push({ t: +(t - VPEAK[name]).toFixed(3), file: `../work/audio/v/${name}.mp3`, gain: +(g * (VGAIN[name] || 1)).toFixed(3) });
  const rot = (names, i) => names[i % names.length];
  // a keyboard smash: three mixes of the heavy hit, the glass and the punch, taken in turn
  let kbN = 0;
  const kb = (t, g = 1) => { const k = kbN++ % 3;
    if (k === 0) { v(t, 'v-heavy-hit', 1.0 * g); v(t, 'v-glasshit', .55 * g); }
    else if (k === 1) { v(t, 'v-punch', .95 * g); v(t, 'v-heavy-hit', .6 * g); }
    else { v(t, 'v-glasshit', .9 * g); v(t, 'v-heavy-hit', .75 * g); v(t, 'v-punch', .4 * g); } };
  const SLASH = ['v-katana-alt', 'v-slash-1', 'v-slash-2'];
  // the notification clicks as each banner lands (kept: v53)
  NOTE_AT.forEach(([at], k) => { if (at < T_SWORD - .45 && !NOTE_AT.some(([o], j) => j !== k && o > at && o - at < .25)) SFX.push({ t: +(at + .1).toFixed(3), file: `../work/audio/notify/ping-new.mp3`, gain: k === 6 ? .85 : k < 2 ? .8 : .7 }); });
  // the hook (kept: the user's sword slash and grunt on the split, the glass under it, the flamethrower)
  SFX.push({ t: +(T_SPLIT - .30).toFixed(3), file: '../work/audio/sword/sword-slash.mp3', gain: 1.6 });
  SFX.push({ t: +(T_SPLIT - .08).toFixed(3), file: '../work/audio/sword/grunt.mp3', gain: 1.0 });
  h(T_SPLIT, 'office/glass.flac', .55);
  v(T_SPLIT + (24 - 10) / FPS, 'v-katana-alt', .9);      // (the sword clip's own cut, its frame 24)
  SFX.push({ t: +(W('flame', 'flamethrower') - .08).toFixed(3), file: '../work/audio/sword/flame.wav', gain: 1.4 });
  // slash, burn and smash
  v(C('slash') + (24 - 13) / FPS, 'v-saber-power', .9);      // (the saber's swing, its frame 24)
  v(W('slash', 'burn') + .05, 'v-melt', 1.1); v(W('slash', 'burn') + .1, 'v-fireimpact', .5);
  [[7, 1], [61, .85], [89, .8], [115, .8], [166, .85], [198, .85], [213, .7], [252, .9], [263, .8]].forEach(([fr, g]) => {
    const t = W('slash', 'smash') + (fr - 1) / FPS, under = t > T_LOGO - .1 && t < E('round') + .5;      // (behind the logo and the headline, the hits sit back)
    if (t < T_PUSH + .2) kb(t, under ? g * .5 : g);
  });
  v(T_LOGO + .02, 'v-reveal', .9);      // (the Keyboard Smash logo landing at 0:12)
  // "one round at a time": the icon's ten cuts (kept)
  { const a = W('game', 'clear') - .05, b = W('round', 'time') + .1;
    for (let k = 0; k < 10; k++) h(lerp(a, b, k / 9) - .02, `office/slash${1 + k % 6}.flac`, .32);
    h(b + .02, 'office/glass.flac', .4); }
  h(T_PUSH - .02, 'swoosh1.flac', .6);      // (the lift into the agent scene)
  // how it works: the slash through the How to Play panel
  v(T_REVEAL + 220 / FPS, 'v-slash-1', 1.0); v(T_REVEAL + 220 / FPS, 'v-glasshit', .45);
  // 0:48, the throw: the email thrown up, then sliced (webvr-chair.mp4's frames 38 and 55, through its playback line)
  { const at = sec => T_THROW + (sec - .67) * (C('monitor') - T_THROW) / (3.2 - .67);
    v(at(37 / FPS), 'v-slash-2', .45); v(at(54 / FPS), 'v-katana-alt', .85); }
  // the levels: each clip's biggest impacts (found by how much the picture changes), the first loudest, in its own sounds
  const LV = {"lvl-keyboard": [7, 61, 89, 166, 198], "lvl-haunted": [53, 82, 112, 156], "lvl-toxic": [18, 82, 107, 163], "lvl-inferno": [63, 84, 107, 138, 168], "lvl-kyoto": [7, 29, 69, 118, 149], "lvl-lumber": [41, 76, 105, 140], "superspace": [47, 67, 103]};
  const LVS = { 'lvl-haunted': ['v-slash-metal', 'v-slash-2'], 'lvl-toxic': ['v-melt'], 'lvl-inferno': ['v-fireimpact', 'v-fireburst'], 'lvl-kyoto': SLASH, 'lvl-lumber': ['v-woodstrike', 'v-woodstrike-2'], 'superspace': ['v-saber-power', 'v-slash-2', 'v-saber-power'] };
  for (const [clip, from, to] of SEG) {
    if (!LV[clip]) continue;
    const key = SEG.find(g => g[0] === clip)[4];
    LV[clip].forEach((fr, i) => { const t = from + (fr - key) / FPS; if (t < from || t >= to - .05) return;
      if (clip === 'lvl-keyboard') return kb(t, i ? .7 : 1);
      v(t, rot(LVS[clip], i), i ? .85 : 1.2);
      if (clip === 'lvl-toxic' && i % 2) v(t, 'v-fireburst', .3);      // (a little hiss under every other melt)
      if (clip === 'lvl-haunted' && i === 0) v(t, 'v-heavy-hit', .35); });
  }
  // Super Space's saber lighting (kept)
  h(C('or') + 31 / FPS - .08, 'space/arm.flac', 2.0);
  // the seated player's two cuts, through the same playback curve as the picture
  [6.4, 7.5].forEach((src, i) => { const t = seatAt(src); if (t !== null && t < SEAT_B + .2) v(t, i ? 'v-slash-2' : 'v-katana-alt', i ? .75 : 1); });
  // the clear: the confirm ticks as the count runs down (kept), the icon slashed at zero, the tick landing
  for (let k = 0; k < 5; k++) h(lerp(T_CLR_GO + .02, T_ZERO - .1, k / 4), 'ui/confirm.flac', k === 4 ? .6 : .5);
  v(T_ZERO + .12, 'v-slash-1', 1.0); v(T_ZERO + .12, 'v-glasshit', .35); v(T_ZERO + .34, 'v-reveal', .7);
  // the ending clip's monitor smashes (on its curve: real speed once the try card clears)
  // v62: the longer ending's hits (its frames, found by how much the picture changes): soft ones on the last emails once the
  // voice has finished, then the monitor being smashed, louder, through the anthem's chorus
  [[108, .45], [121, .4], [149, .5]].forEach(([fr, g]) => kb(OUTRO_AT + (fr - 1) / FPS, g));
  [[175, 1.0], [205, .75], [226, .85], [258, .9], [273, .7], [312, .85], [323, .95], [353, .95], [375, .85], [407, .8]].forEach(([fr, g]) => kb(OUTRO_AT + (fr - 1) / FPS, g));
  // the end card's logo landing, on "No more email tonight"
  v(SONG(9.25) + .35, 'v-reveal', .8);
}
buildHits();

/* ---------- render ---------- */
async function renderAt(T) {
  white(T);
  const seg = footage(T);
  homeScreen(T);
  slam(T);
  inbox(T);
  muse(T);
  overlays(T, seg);
  browser(T);
  seated(T);
  flow(T);
  closing(T);
  flash(T);
  splitParts(T);
  outro(T);
  cursor(T);
  const imgs = [...document.images].filter(i => i.style.visibility !== 'hidden' && !i.complete);
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  if (!$('foot-img').complete) await $('foot-img').decode().catch(() => {});
}
Object.assign(window, { renderAt, SFX, AMB, DUR, FPS, ANTHEM_AT: T_ANTHEM });
document.fonts.ready.then(() => { window.READY = true; });
