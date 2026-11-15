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
const ANTHEM_LEN = 18.6, ANTHEM_REL = .4 + 3 / FPS - 1.76, OUT_LEN = ANTHEM_REL + ANTHEM_LEN + .1;
const DUR = Math.round((CUES.cues.hero.end + OUT_HOLD + OUT_LEN) * FPS) / FPS;

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
const noteEls = NOTES.map(([from, subj]) => { const d = document.createElement('div'); d.className = 'note'; d.innerHTML = `<span class="ni">${MINI}</span><span class="nt"><div class="nf">${from}</div><div class="ns">${subj}</div></span><span class="nw">now</span>`; $('notes').appendChild(d); return d; });
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
const T_REALLY = C('really'), T_HERO = C('hero');
const T_OUT = E('hero') + OUT_HOLD, T_END = T_OUT + OUT_LEN;
const T_ANTHEM = T_OUT + ANTHEM_REL, SONG = s => T_ANTHEM + s;      // (song time to film time)
// the agent flow (v7)
const M_IN = T_PUSH + .12,      /* v31: the window rises right behind the lifting gameplay (was C('connect') - .3) */ T_CONNECT = W('connect', 'muse'), T_OPEN = W('link', 'quest') + .15, T_HOME = T_OPEN + .75;
// v32: after "Open" the How to Play clip rises over the agent window like a card (the 0:20 lift, in reverse)
const T_REVEAL = T_OPEN + .25;
const M2_IN = C('archives') - .15,      /* v43: later, so inbox zero gets a beat (was - .35) */ T_OKAY = W('okay', 'okay') + .05, M2_OUT = C('never') - .55;
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
  ['lvl-space', C('or'), C('iwsdk') - .02, C('or'), 1],      // v35: the user's level clip, whole, at real speed
  // v44: "its built with web vr - put this video as the background, the browser on top of it, and use it for under the
  // built for your chair": vr-video/10-new-take/webvr-chair.mp4 at real speed from its frame 75, behind both scenes
  ['webvr-chair', C('iwsdk') - .02, C('really') - .02, C('iwsdk') - .02, 110],      // (v46: from 3.7 s in, after the throw and courtyard used at 0:48)
  // v43: "use the inferno clips as background game" for try it yourself: inferno-long from its fight (frame 45), at 0.85x
  ['inferno-long', C('try') - .3, T_OUT + .4, C('try') - .3, 45, .85],
  ['kbd-outro', T_OUT + .4, T_END + .1, T_OUT + .4, 1],      // v41: the Keyboard Smash ending, whole
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
const B_A = C('iwsdk') - .02, T_CLICK = W('browser', 'browser'), T_GAME0 = T_CLICK + .3, T_EXP0 = E('nodl') - .2, T_FULL = T_EXP0 + .5;
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
const T_CLR0 = SEAT_B, T_CLR1 = M2_IN + .12, T_CLR_GO = W('really', 'does') - .15, T_ZERO = W('really', 'inbox') - .25;
const clearParts = []; for (let k = 0; k < 44; k++) { const i = document.createElement('i'); $('clear-parts').appendChild(i); clearParts.push(i); }
// pixel icons (a string per row, X = filled), drawn as crisp SVG rects
function pixSvg(rows, fill, cell) {
  let r = ''; rows.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c === 'o' ? '#ffffff' : fill}"/>`; }));
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" width="${rows[0].length * cell}" height="${rows.length * cell}" shape-rendering="crispEdges">${r}</svg>`;
}
$('ic-sdk').innerHTML = pixSvg(['..XXXXXXXXXX..', '.XXXXXXXXXXXX.', 'XXooXXXXXXooXX', 'XXooXXXXXXooXX', 'XXXXXX..XXXXXX', '.XXXX....XXXX.'], '#170d15', 3.4);
$('ic-nodl').innerHTML = pixSvg(['X.....XX.....X', '.X....XX....X.', '..X...XX...X..', '...X..XX..X...', '..XXX.XX.XXX..', '...XXXXXXXX...', '....XXXXXX....', '.....XXXX.....', 'XX....XX....XX', 'XXXXXXXXXXXXXX'], '#170d15', 3);
// the flow's packets (envelopes along the wires) and the close's embers
const packets = []; for (let k = 0; k < 9; k++) { const i = document.createElement('i'); i.innerHTML = ENV; $('packets').appendChild(i); packets.push(i); }
const embers = []; for (let k = 0; k < 46; k++) { const i = document.createElement('i'); i.className = 'ember'; $('close').insertBefore(i, $('end-logo')); embers.push(i); }
// the level cards: two rows, each with its name in the level's colour, as on the game's home screen
const LEVEL_NAMES = { kyoto: ['Kyoto Nights', '#ffc0d9'], office: ['Keyboard Smash', '#7dffc9'], castle: ['The Haunted Hall', '#c9b2ff'], lab: ['Toxic Danger', '#8dff6a'], space: ['Super Space', '#5ef0ff'], inferno: ['Inferno', '#ff9a52'], lumber: ['LumberHack', '#ffc440'] };
cards.forEach((c, i) => { const [n, col] = LEVEL_NAMES[LEVELS[i]]; c.innerHTML = `<span class="lc-b"><span class="lc-in"><img src="../work/assets/home/${LEVELS[i]}.webp" alt=""><span class="lname" style="color:${col}">${n}</span><i class="glint"></i></span></span>`; });

/* ---------- footage ---------- */
function keyOf(clip, key0) { return key0 === 'cut' ? CUTS[clip][0] : typeof key0 === 'string' ? FOOT[clip] + +key0.slice(3) : key0; }
let footSrc = '';
function footage(T) {
  const seg = SEG.find(s => T >= s[1] && T < s[2]);
  if (!seg) { $('foot').style.zIndex = ''; $('foot').style.borderRadius = ''; $('foot').style.boxShadow = ''; show($('foot'), false); return null; }
  const [clip, from, , at, key0, speed = 1] = seg, n = FOOT[clip];
  let f;
  if (Array.isArray(key0)) {      // (v44: [film time, clip seconds] pairs, straight lines between)
    let sec = key0[key0.length - 1][1];
    for (let k = 0; k < key0.length - 1; k++) if (T <= key0[k + 1][0]) { const [t0, s0] = key0[k], [t1, s1] = key0[k + 1]; sec = s0 + (s1 - s0) * clamp((T - t0) / (t1 - t0)); break; }
    f = clamp(Math.round(sec * FPS) + 1, 1, n);
  } else f = clamp(Math.round(keyOf(clip, key0) + (T - at) * FPS * speed), 1, n);
  const src = `../work/footage/${clip}/${String(f).padStart(4, '0')}.jpg`;
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
  const out = eio((T - (M2_IN - .1)) / .3);
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
  const dp = clamp((T - z - .1) / .4);      // the tick badge lands
  done.style.transform = `scale(${dp <= 0 ? 0 : eo(dp) + .22 * Math.sin(Math.PI * clamp(dp / .7))}) rotate(${-25 * (1 - eo(dp))}deg)`;
  // the icon: jiggles while it empties (calmer as it goes), then squashes and springs at zero
  const jig = T >= go && T < z ? 1.4 * (1 - runP) : 0, sq = clamp((T - z) / .5);
  const sx = 1 + .1 * Math.sin(Math.PI * sq) * Math.exp(-3 * sq) * (sq < .25 ? 1 : -1), sy = 1 - (sx - 1);
  icon.style.transform = `translateY(${-6 * Math.sin(T * 1.7)}px) rotate(${jig * Math.sin(T * 23)}deg) scale(${(lerp(.6, 1, pin) + over) * (1 + .03 * Math.max(0, 1 - since / .12))}) scale(${sx},${sy})`;
  const rp = clamp((T - z - .05) / .7);
  ring.style.opacity = rp > 0 && rp < 1 ? .9 * (1 - rp) : 0;
  ring.style.transform = `scale(${lerp(1, 1.75, eo(rp))})`; ring.style.borderWidth = `${lerp(10, 2, rp)}px`;
  icon.style.boxShadow = `0 34px 70px -28px #1650d077,inset 0 3px 0 #ffffff40,inset 0 -6px 14px #0b3ea833,0 0 ${80 * (1 - rp) * (rp > 0 ? 1 : 0)}px ${30 * (1 - rp) * (rp > 0 ? 1 : 0)}px #14b88a55`;
  const lz = T >= z + .1;
  if (lz && !label.querySelector('b')) label.innerHTML = 'Inbox <b>zero</b>'; else if (!lz && label.querySelector('b')) label.textContent = 'Inbox';
  const lp = clamp((T - z - .1) / .3);
  label.style.transform = `scale(${1 + .12 * Math.sin(Math.PI * lp)})`;
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
  const bq0 = T - z - .08;
  clearParts.forEach((e, k) => {
    const q = bq0 - rnd(k + 7) * .06;
    if (q < 0 || q > 1.1) { e.style.opacity = 0; return; }
    const ang = rnd(k) * Math.PI * 2, sp = 300 + 520 * rnd(k + 1), kind = rnd(k + 2);
    const x = ix + Math.cos(ang) * sp * eo(q / .9), y = iy + Math.sin(ang) * sp * .75 * eo(q / .9) + 520 * q * q;
    const sz = kind > .85 ? 9 : 12 + 12 * rnd(k + 3);
    e.style.width = sz + 'px'; e.style.height = sz + 'px';
    e.style.background = kind > .85 ? '#ffffff' : ['#14b88a', '#5ac8fa', '#1f8cff', '#ff2e93', '#7dffc9'][Math.floor(rnd(k + 4) * 5)];
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
  const hits = [[T_HERO + .02, .45, .35]];
  let o = 0; for (const [t, a, d] of hits) if (T >= t && T < t + d) o = Math.max(o, a * (1 - (T - t) / d));
  show(f, o > 0, o);
}

function slam(T) {
  // "Inbox Zero!": the logo lands on the night, then glides to where the home screen keeps it
  const L = $('logo-slam'), a = T_INBOX, g0 = C('hack'), g1 = g0 + .9;
  const night = $('night');
  const nightOn = T >= C('try') - .3;
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
  // [from, arrive, startX, startY, target (element id or point), clickAt]
  const moves = [
    [C('connect') + .15, T_CONNECT - .08, 1500, 900, 'c-btn', T_CONNECT],
    [W('link', 'opens') - .2, T_OPEN - .08, 1400, 880, 'm-open', T_OPEN],
    // (v32: the two level-select clicks are gone with the level select)
    [C('browser') - .6, T_CLICK - .07, 1520, 1010, 'b-play', T_CLICK],      // v43: on the site's own Play in browser button
    [C('sends') + .2, T_OKAY - .08, 1450, 900, 'm-ok', T_OKAY],
  ];
  const m = moves.find(m => T >= m[0] && T < m[5] + .45);
  if (!m) { show(c, false); show(r, false); return; }
  const to = typeof m[4] === 'string' ? mid(m[4]) : m[4];
  const p = eio((T - m[0]) / (m[1] - m[0]));
  const x = lerp(m[2], to[0], p), y = lerp(m[3], to[1], p);
  const press = T >= m[5] && T < m[5] + .14 ? .86 : 1;
  show(c, true, clamp((T - m[0]) / .2) * (1 - clamp((T - m[5] - .25) / .2)), `translate(${x}px,${y}px) scale(${press})`);
  const rp = (T - m[5]) / .4;
  if (rp >= 0 && rp < 1) { r.style.left = x + 5 + 'px'; r.style.top = y + 3 + 'px'; show(r, true, 1 - rp, `scale(${lerp(.3, 1.2, eo(rp))})`); } else show(r, false);
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
  // v43: "built for web ... make nicer": a bigger window; the address types itself and the site loads; Play in browser is
  // clicked on "browser" and the game's level select runs in the window; the two lines land as pixel stickers on its
  // edge; (v44: then the window drops away, over the webvr-chair take)
  const el = $('browser');
  if (T < B_A || T >= T_FULL + .06) return show(el, false);
  show(el, true, 1, '');
  // v44: over the webvr-chair take (the footage layer), softened while the window is up, then the window drops away
  // and the take comes into focus for the seated scene
  const win = $('win'), pin = eo((T - B_A) / .6), ex = eio((T - T_EXP0) / (T_FULL - T_EXP0));
  const drift = 1 + .015 * clamp((T - B_A - .6) / 4);
  const soft = 1 - ex;
  $('foot-img').style.filter = `blur(${3 * soft}px) brightness(${1 - .32 * soft})`;
  show(win, ex < 1, clamp((T - B_A) / .25) * (1 - eo(ex * 1.15)), `translateY(${70 * (1 - pin) + 140 * ex * ex}px) scale(${lerp(.93, 1, pin) * drift * (1 - .1 * ex)})`);
  // the address: typed, then "/play" after the click
  const host = 'inboxzerovr.com', ta = B_A + .2, typed = Math.round(host.length * clamp((T - ta) / .5));
  const extra = T >= T_CLICK + .04 ? '/play' : '';
  $('addr-t').textContent = host.slice(0, typed) + extra;
  $('addr-caret').style.opacity = T < ta + .5 + .2 && Math.floor(T * 4) % 2 === 0 ? 1 : T < ta + .5 ? 1 : 0;
  // loading bars across the top of the page: the site, then the game
  const ld = $('b-load'), l1 = clamp((T - (ta + .5)) / .35), l2 = clamp((T - (T_CLICK + .04)) / .26);
  const lp = T < T_CLICK ? l1 : l2, lon = (T < T_CLICK ? (l1 > 0 && l1 < 1.25) : (l2 > 0)) && T < T_GAME0 + .2;
  ld.style.opacity = lon ? 1 - clamp((T - (T < T_CLICK ? ta + .85 : T_GAME0)) / .2) : 0;
  ld.style.transform = `scaleX(${eo(lp)})`;
  // the site settles in, then gives way to the game
  const so = eo((T - (ta + .7)) / .35), go = eo((T - T_GAME0) / .3);
  const site = $('site-img'); site.style.opacity = so * (1 - go);
  site.style.transform = `translateY(${16 * (1 - so)}px) scale(${1.02 - .02 * so + .015 * clamp((T - ta - .7) / 4)})`;
  $('shot').style.background = T < T_GAME0 ? '#fff' : '#1a1426';
  const game = $('game-img');
  if (T >= T_GAME0 - .02) { const src = homeSrc(T); if (!game.src.endsWith(src.slice(2))) game.src = src; }
  game.style.opacity = go; game.style.transform = `scale(${lerp(1.06, 1, go)})`;
  // the button takes the click
  const bp = $('b-play'), press = T >= T_CLICK && T < T_CLICK + .16;
  bp.style.background = press ? '#ffffff59' : 'transparent'; bp.style.boxShadow = press ? '0 0 24px 6px #7dffc988' : 'none';
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
  show($('seat-img'), true, clamp((T - T_FULL + .05) / .25), `translateX(${-170 * (1 - pin)}px) scale(${lerp(1.04, 1.1, pin)})`);      // (a touch bigger, from its bottom left corner)
  // v44: behind the player is the webvr-chair take (the footage layer), a little darker where the player sits
  $('seat-bg').style.display = 'none';
  $('foot').style.opacity = 1 - eio((T - b) / .22);      // (the take fades out with the player, to the white of the clear)
  const foc = eio((T - T_FULL - .05) / .6);
  $('foot-img').style.filter = `brightness(${1 - .1 * foc})`;
  $('seat-shade').style.opacity = foc;
}

function flow(T) {
  // "The game never touches your inbox": inbox, agent, game, built out from the centre, mail moving along the wires;
  // a packet from the game heads for the inbox and is stopped at the cross; then the round is deleted.
  // v43: bigger, the nodes float, envelopes run the wires, and the round is stamped deleted where its chip shatters
  const a = C('never') - .25, b = C('try') - .58, el = $('flow');      // (v43: gone before the close's white)
  if (T < a || T >= b + .3) return show(el, false);
  const out = clamp((T - b) / .3);
  show(el, true, 1 - out, `translateY(${-24 * eo(out)}px)`);
  const NW = 460, STEP = 640, WY = 540;
  const pA = eo((T - a) / .5), pG = eo((T - W('never', 'game') + .1) / .5), pI = eo((T - W('never', 'touches') + .05) / .5);
  const width = NW + (pG + pI) * STEP, left = 960 - width / 2;
  const xI = left, xA = left + pI * STEP, xG = xA + STEP;
  const node = (id, x, p, k) => { const n = $(id); n.style.left = x + 'px'; show(n, p > 0, p, `translateY(${(1 - p) * 34 + 5 * Math.sin(T * 1.5 + k * 2.1)}px) scale(${lerp(.9, 1, p)})`); };
  node('n-inbox', xI, pI, 0); node('n-agent', xA, pA, 1); node('n-game', xG, pG, 2);
  const wire = (id, chip, x0, p, gone = 0) => {
    const w = $(id), c = $(chip), q = eo((p - .5) / .5);
    w.style.left = x0 + NW + 22 + 'px'; w.style.width = STEP - NW - 44 + 'px';
    show(w, q > 0, q * (1 - .7 * gone), `scaleX(${q})`); w.style.transformOrigin = '0 50%';
    c.style.left = x0 + NW + (STEP - NW) / 2 + 'px';
    show(c, q > 0 && gone < 1, q * (1 - clamp(gone * 5)), `translateX(-50%) translateY(${(1 - q) * 14}px)`);
    return q;
  };
  const tDel = W('deleted', 'deleted'), dp = clamp((T - tDel) / 1.0);
  const qIA = wire('w-ia', 'c-ia', xI, pI), qAG = wire('w-ag', 'c-ag', xA, pG, dp);
  // envelopes along the wires (three on each, staggered), the agent's to the game stopping when the round is deleted
  const PER = .95;
  const runWire = (x0, q, k0, t0, stopAt) => {
    for (let j = 0; j < 3; j++) {
      const e = packets[k0 + j], ph = (T - t0) / PER - j / 3, p = ph - Math.floor(ph), cyc = Math.floor(ph);
      const startT = t0 + (cyc + j / 3) * PER;
      if (q < 1 || ph < 0 || startT > stopAt) { e.style.opacity = 0; continue; }
      const x = lerp(x0 + NW + 30, x0 + STEP - 30, eio(p)) - 23, y = WY - 17 - 22 * Math.sin(Math.PI * p);
      e.style.opacity = clamp(p * 6) * clamp((1 - p) * 6);
      e.style.transform = `translate(${x}px,${y}px) scale(${.8 + .2 * Math.sin(Math.PI * p)})`;
    }
  };
  runWire(xI, qIA, 0, W('never', 'touches') + .45, b);
  runWire(xA, qAG, 3, W('never', 'game') + .45, tDel - .5);
  // no way from the game back to the inbox: a dashed path with a cross on it, and a packet that tries it and is stopped
  const xp = eo((T - W('never', 'inbox')) / .5), arc = $('arc');
  arc.setAttribute('d', `M${xG + NW / 2} ${392 + 296 + 10} C${xG + NW / 2} 935 ${xI + NW / 2} 935 ${xI + NW / 2} ${392 + 296 + 10}`);
  arc.style.opacity = .9 * xp;
  $('flow-arc').style.clipPath = `inset(0 0 0 ${(1 - xp) * 100}%)`;
  const L = arc.getTotalLength(), mid = arc.getPointAtLength(L / 2);
  const nox = $('nox'); nox.style.left = mid.x + 'px'; nox.style.top = mid.y + 'px';
  const tb = W('never', 'inbox') + .55, bonk = [tb, tb + 1.0].map(t => T - t - .5).filter(d => d >= 0 && d < .25)[0];
  const xo = eo((T - W('never', 'inbox') - .3) / .3);
  show(nox, xo > 0, xo, `scale(${lerp(.4, 1, xo) + .15 * Math.sin(Math.PI * clamp((T - W('never', 'inbox') - .3) / .3)) + (bonk !== undefined ? .25 * Math.sin(Math.PI * bonk / .25) : 0)})`);
  [tb, tb + 1.0].forEach((t, j) => {
    const e = packets[6 + j], p = (T - t) / .5;
    if (p < 0 || p > 1.5) { e.style.opacity = 0; return; }
    const pt = arc.getPointAtLength(L * .5 * eio(Math.min(p, 1))), hit = clamp((p - 1) / .5);
    e.style.opacity = clamp(p * 6) * (1 - hit);
    e.style.transform = `translate(${pt.x - 23 + (hit > 0 ? 10 * Math.sin(hit * 40) * (1 - hit) : 0)}px,${pt.y - 17 - 30 * hit}px) rotate(${hit * 30}deg) scale(${1 + .5 * hit})`;
    e.style.filter = hit > 0 ? 'grayscale(1) brightness(1.4)' : '';
  });
  packets[8].style.opacity = 0;
  // the round goes when the game is done: its chip breaks into pixels and a pixel stamp lands in its place
  const cx = xA + NW + (STEP - NW) / 2, cy = 477;
  const px = $('pixels');
  if (dp > 0 && dp < 1) {
    px.style.visibility = 'visible';
    const cw = 200, ch = 58, GX = 16, GY = 5;
    pixels.forEach(({ i }, k) => {
      if (k >= GX * GY) { i.style.opacity = 0; return; }
      const gx = k % GX, gy = Math.floor(k / GX), d = clamp((dp - rnd(k) * .3) / .7);
      i.style.width = cw / GX + 1 + 'px'; i.style.height = ch / GY + 1 + 'px';
      i.style.left = cx - cw / 2 + gx * cw / GX + 'px'; i.style.top = cy - ch / 2 + gy * ch / GY + 'px';
      i.style.opacity = 1 - eo(d);
      i.style.transform = `translate(${(rnd(k + 9) - .5) * 220 * eo(d)}px,${-180 * eo(d) * (.5 + rnd(k + 3)) + 260 * d * d}px) scale(${1 - .7 * d})`;
      i.style.background = rnd(k + 5) > .6 ? '#ff2e93' : rnd(k + 6) > .5 ? '#ff9ec8' : '#d9d3e3';
    });
  } else px.style.visibility = 'hidden';
  const st = $('delstamp'), sq = clamp((T - tDel - .18) / .22);
  st.style.left = cx + 'px'; st.style.top = cy + 'px';
  if (sq > 0) show(st, true, clamp(sq * 4), `translate(-50%,-50%) rotate(-5deg) scale(${lerp(1.8, 1, eo(sq)) - .06 * Math.sin(Math.PI * clamp((T - tDel - .4) / .2))})`); else show(st, false);
}

function closing(T) {
  // v43: "try it yourself - also make nicer, pixel fonts, use the inferno clips as background game for this, make levels
  // 2 rows, bigger": Inferno gameplay behind (the footage layer) under a dark shade and rising embers; the address as a
  // pixel button that types itself; the seven levels in two rows (4 and 3) with their names, a pink selector hopping
  // across them; the agent as a pixel chip; then the cards drop away, the logo slams in with a burst of pixel bits and
  // the address settles under it
  const a = C('try') - .3, el = $('close');
  if (T < a || T >= T_OUT + .4) { show(el, false); show($('petals'), false); return; }
  show(el, true, 1, '');
  const H = T_HERO, gone = 1 - eo((T - T_OUT) / .35), zoom = 1 + .1 * eio((T - T_OUT) / .35);
  $('close-white').style.opacity = 1 - eo((T - a) / .28);
  $('close-shade').style.opacity = 1 - .22 * eio((T - H) / .8);
  // embers rising from the furnace
  embers.forEach((m, k) => {
    const sp = 60 + 110 * rnd(k + 1), t = T - a + rnd(k + 2) * 14, life = (t * sp) % 1250;
    const x = 140 + rnd(k) * 1640 + 40 * Math.sin(t * (.8 + rnd(k + 3)) + k);
    const sz = 3 + 5 * rnd(k + 4);
    m.style.width = m.style.height = sz + 'px';
    m.style.opacity = (.35 + .55 * rnd(k + 5)) * clamp(life / 120) * (1 - clamp((life - 900) / 300)) * gone * clamp((T - a) / .5);
    m.style.transform = `translate(${x}px,${1110 - life}px)`;
    m.style.background = rnd(k + 6) > .5 ? '#ffb347' : '#ff6a2b';
  });
  // "try it yourself": big and centred, each word stamped in as it's said; it lifts away for the levels
  const up = eio((T - (W('seven', 'play') - .25)) / .5);
  const tl = $('try-line');
  const tOut = eio((T - (W('seven', 'play') - .3)) / .25);
  show(tl, tOut < 1, 1 - tOut, `translate(-50%,-50%) translateY(${430 - 90 * tOut}px) scale(${1 - .1 * tOut})`);
  [...tl.children].forEach((b, i) => {
    const at = W('try', ['try', 'it', 'yourself'][i]) - .06, p = clamp((T - at) / .18);
    b.style.display = T >= at ? 'inline-block' : 'none';
    b.style.opacity = clamp((T - at) / .05);
    b.style.transform = `translateY(${-18 * (1 - eo(p))}px) scale(${lerp(1.8, 1, eo(p)) - .06 * Math.sin(Math.PI * clamp((T - at - .16) / .18))})`;
  });
  // the address: pops in under it on "at", types itself, rises for the levels, then moves under the logo
  const url = 'inboxzerovr.com', t0 = W('try', 'inboxzerovrcom') - .12;
  $('url-t').textContent = url.slice(0, Math.round(url.length * clamp((T - t0) / .6)));
  $('caret').style.opacity = (T < t0 + .6 || Math.floor(T * 2.4) % 2 === 0) ? 1 : 0;
  const uq = clamp((T - (W('try', 'at') - .12)) / .4), hq = eio((T - H - .05) / .55);
  const uy = lerp(lerp(600, 190, up), 772, hq), us = (uq < .6 ? lerp(.5, 1.06, eo(uq / .6)) : lerp(1.06, 1, eo((uq - .6) / .4))) * lerp(1.12, 1, up) * lerp(1, .9, hq);
  const ty = 1 + .05 * Math.sin(Math.PI * clamp((T - t0 - .6) / .25));      // (a little bump when it's typed)
  const U = $('url'); U.style.top = uy + 'px';
  show(U, uq > 0, clamp(uq * 4) * gone, `translate(-50%,-50%) scale(${us * ty * zoom})`);
  // the levels: two rows, landing one after another on "play the demo in all seven levels"
  const CW = 360, CH = 203, GX = 34, GY = 30, Y1 = 330, ct = W('seven', 'demo') - .12;
  const exitAt = H - .2;
  cards.forEach((c, i) => {
    const row = i < 4 ? 0 : 1, col = row ? i - 4 : i, n = row ? 3 : 4;
    const x = 960 - (n * CW + (n - 1) * GX) / 2 + col * (CW + GX), y = Y1 + row * (CH + GY);
    const at = ct + i * .085, q = clamp((T - at) / .38);
    const xq = clamp((T - exitAt - (6 - i) * .03) / .4);      // (out from the last one)
    if (q <= 0 || xq >= 1) { c.style.visibility = 'hidden'; return; }
    c.style.visibility = 'visible'; c.style.left = x + 'px'; c.style.top = y + 'px';
    const sc = q < .6 ? lerp(.6, 1.05, eo(q / .6)) : lerp(1.05, 1, eo((q - .6) / .4));
    // the selector: hops across the cards on "all seven levels"; the card under it lifts
    const hop = Math.floor((T - (W('seven', 'all') - .05)) / .1), on = hop === i && T < W('seven', 'levels') + .55 ? 1 : 0;
    const lift = on ? 1 : 0;
    c.style.opacity = clamp(q * 4) * (1 - xq);
    c.style.transform = `translateY(${(1 - eo(q)) * 50 - 12 * lift + 340 * xq * xq}px) rotate(${(1 - eo(q)) * (i % 2 ? 4 : -4) + xq * (i % 2 ? 14 : -14)}deg) scale(${sc * (1 + .04 * lift) * (1 - .3 * xq)})`;
    const gl = c.querySelector('.glint'), gq = clamp((T - at - .15) / .4);
    gl.style.opacity = gq > 0 && gq < 1 ? 1 : 0; gl.style.left = lerp(-120, CW + 40, gq) + 'px';
    c.querySelector('.lc-b').style.background = on ? '#ff2e93' : '#ffffff66';
  });
  // the selector frame over the current card
  const pk = $('pick'), hop = Math.floor((T - (W('seven', 'all') - .05)) / .1);
  if (hop >= 0 && hop < 7 && T < W('seven', 'levels') + .55) {
    const row = hop < 4 ? 0 : 1, col = row ? hop - 4 : hop, n = row ? 3 : 4;
    pk.style.left = 960 - (n * CW + (n - 1) * GX) / 2 + col * (CW + GX) - 10 + 'px'; pk.style.top = Y1 + row * (CH + GY) - 22 + 'px';
    show(pk, true, 1, '');
  } else show(pk, false);
  // "or connect your agent": a pixel chip under the levels
  const chip = $('agent-chip'), aq = clamp((T - (W('agent', 'connect') - .15)) / .4), ax = clamp((T - exitAt) / .35);
  chip.style.top = '846px';
  const as = aq < .6 ? lerp(.6, 1.05, eo(aq / .6)) : lerp(1.05, 1, eo((aq - .6) / .4));
  const ab = 1 + .04 * Math.sin(Math.PI * clamp((T - W('agent', 'own') + .05) / .3));
  if (aq > 0 && ax < 1) show(chip, true, clamp(aq * 4) * (1 - ax), `translate(-50%,-50%) translateY(${200 * ax * ax}px) scale(${as * ab * (1 - .2 * ax)})`); else show(chip, false);
  // the hero: the logo slams in, punches on "hero", "inbox" and "zero"
  const lq = clamp((T - H - .02) / .3);
  const punch = ['hero', 'inbox', 'zero'].reduce((m, w) => { const d = T - W('hero', w) + .04; return d >= 0 && d < .25 ? Math.max(m, .05 * Math.sin(Math.PI * d / .25)) : m; }, 0);
  const shake = T > H + .2 && T < H + .45 ? 8 * Math.sin((T - H) * 90) * (1 - (T - H - .2) / .25) : 0;
  const ls = (lq < .7 ? lerp(1.45, .97, eo(lq / .7)) : lerp(.97, 1, eo((lq - .7) / .3))) + punch + .01 * Math.sin((T - H) * 2);
  if (lq > 0) show($('end-logo'), true, clamp(lq * 5) * gone, `translate(${shake}px,${400 + shake * .5}px) scale(${ls * zoom})`); else show($('end-logo'), false);
  // a burst of pixel bits on "hero", in the logo's colours and the furnace's
  const pt = T - W('hero', 'hero') + .06;
  if (pt > 0) {
    show($('petals'), true, gone, '');
    petals.forEach((p, k) => {
      const ang = rnd(k) * Math.PI * 2, sp = 520 + 900 * rnd(k + 1), life = clamp(pt / (2.2 + rnd(k + 2) * 1.4));
      const px = 960 + Math.cos(ang) * sp * eo(pt / 1.1), py = 520 + Math.sin(ang) * sp * .62 * eo(pt / 1.1) + 300 * pt * pt * .3;
      const sz = 8 + 14 * rnd(k + 4);
      p.style.width = sz + 'px'; p.style.height = sz + 'px';
      p.style.left = px + 'px'; p.style.top = py + 'px';
      p.style.opacity = 1 - life; p.style.transform = `rotate(${Math.round(pt * 6 * (rnd(k + 6) - .5)) * 90}deg)`;
      p.style.background = ['#ff2e93', '#ffb3d1', '#7dffc9', '#efe4c8', '#ff9a52', '#ffffff'][Math.floor(rnd(k + 7) * 6)];
      p.style.boxShadow = rnd(k + 8) > .7 ? '0 0 10px currentColor' : 'none';
    });
  } else show($('petals'), false);
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
  // the clean white world: the hook, connect, built, chair, AI
  const on = T < T_SPLIT || (T >= T_PUSH && T < T_REVEAL + PUSH_LEN + .15) || (T >= C('iwsdk') - .02 && T < C('try') - .3);
  show($('white'), on, 1, '');
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
  sfx(W('hero', 'hero') - .05, 'kyoto/stinger2.wav', .8);
  BADGE_AT.forEach((t, i) => sfx(t, i ? 'sort.wav' : 'kyoto/keep1.wav', .55));
}
const SOUND = false;      // v7: "remove all sound effects" (the old full set, kept off)
if (SOUND) buildSfx();
// v18: "add sound effects for sword, cut, fire, melt, and keyboard to add more umph" — hits only, each on its picture
function buildHits() {
  const h = (t, file, g = 1) => sfx(t, file, g);
  // v24: a keyboard hit with more punch: the swing, the crunch, and LumberHack's axe chop on the impact
  const kb = (t, g = 1) => { h(t - .1, 'lumber/slash1.flac', .5 * g); h(t, 'lumber/chop.flac', 1.1 * g); h(t, 'office/glass.flac', .7 * g); };
  // v30: a notification ping as each banner lands (ElevenLabs takes, work/audio/notify: a two-note knock and a single pop,
  // alternated so eight in six seconds don't machine-gun; the "reminder about reminders" one a touch louder)
  const PING = ['a', 'b', 'a', 'b', 'a', 'a', 'a', 'a'];
  // (no ping within a quarter second before another one, and none under the sword slash)
  NOTE_AT.forEach(([at], k) => { if (at < T_SWORD - .45 && !NOTE_AT.some(([o], j) => j !== k && o > at && o - at < .25)) SFX.push({ t: +(at + .1).toFixed(3), file: `../work/audio/notify/ping-${PING[k]}.wav`, gain: k === 6 ? .85 : k < 2 ? .8 : .7 }); });
  // the hook: the sword through the inbox, the slash clip, the flamethrower catching
  // v48: the user's ElevenLabs sword slash for "have you tried a sword" (its peak, 0.30 s in, on the split), in place of
  // the game's slash1 + slash2; the glass stays under it for weight
  SFX.push({ t: +(T_SPLIT - .30).toFixed(3), file: '../work/audio/sword/sword-slash.mp3', gain: 1.1 });
  h(T_SPLIT, 'office/glass.flac', .55);
  h(T_SPLIT + (24 - 10) / FPS - .03, 'kyoto/slash3.flac', .9);      // v26: the sword clip's own cut (frame 24)
  h(W('flame', 'flamethrower') + .03, 'inferno/flare.flac');
  // Slash, burn, and smash (the long smash's keyboard hits at its frames 13, 46, 78)
  h(C('slash') + (24 - 13) / FPS - .03, 'space/slash1.flac');      // v29: the saber's swing
  h(W('slash', 'burn') + .02, 'lab/melt1.flac');
  // v25: the smash-intro clip's impacts (its frames), from "smash" to the agent scene
  [[7, 1], [61, .85], [89, .8], [115, .8], [166, .85], [198, .85], [213, .7], [252, .9], [263, .8]].forEach(([fr, g]) => {
    const t = W('slash', 'smash') + (fr - 1) / FPS - .02, under = t > T_LOGO - .1 && t < E('round') + .5;      // v31: behind the overlay and her voice, the hits sit back
    if (t < T_PUSH + .2) kb(t, under ? g * .5 : g);
  });
  h(T_LOGO - .06, 'swoosh2.flac', .45);
  { const a = W('game', 'clear') - .05, b = W('round', 'time') + .1;      // v33: the icon's ten cuts
    for (let k = 0; k < 10; k++) h(lerp(a, b, k / 9) - .02, `office/slash${1 + k % 6}.flac`, .32);
    h(b + .02, 'office/glass.flac', .4); } h(T_PUSH - .02, 'swoosh1.flac', .6);      // v31: the logo's arrival, and the lift into the agent scene
  // the round: the keyboard smashes at the 7 s clip's frames 125 and 178

  // how it works: cut it up into tiny little pieces
  h(T_REVEAL + 219 / FPS - .03, 'kyoto/slash3.flac'); h(T_REVEAL + 220 / FPS, 'office/glass.flac', .45);      // v32: the slash through the How to Play panel
  // the levels and the gameplay outro: every cut in the long shots, the first loudest
  const HIT = { 'office2-long': 'office/glass.flac', 'castle-long': 'castle/slash2.flac', 'lab-long': 'lab/melt2.flac', 'inferno-long': 'inferno/flare.flac', 'kyoto-long': 'kyoto/slash4.flac', 'lumber-long': 'lumber/chop.flac', 'space-long': 'space/slash2.flac' };
  for (const [clip, from, to, at, key0] of SEG) {
    if (!HIT[clip] || !CUTS[clip] || (from >= C('try') - .5 && from < T_OUT)) continue;      // (v43: none under try it yourself)
    const key = keyOf(clip, key0), outro = from >= T_OUT;
    CUTS[clip].forEach((c, i) => { const t = at + (c - key) / FPS, g = outro ? .55 : i === 0 || c === key ? 1 : .6; if (t >= from && t < to - .05) clip === 'office2-long' ? kb(t - .03, g) : h(t - .03, HIT[clip], g); });
  }
  // v35: the user's level clips: a hit on each clip's biggest impacts (found by how much the picture changes), the first loudest
  const LV = {"lvl-keyboard": [7, 61, 89, 166, 198], "lvl-haunted": [53, 82, 112, 156], "lvl-toxic": [18, 82, 107, 163], "lvl-inferno": [63, 84, 107, 138, 168], "lvl-kyoto": [7, 29, 69, 118, 149], "lvl-lumber": [41, 76, 105, 140], "lvl-space": [97, 133, 173]};
  const LVS = { 'lvl-haunted': 'castle/slash1.flac', 'lvl-toxic': 'lab/melt1.flac', 'lvl-inferno': 'inferno/flare.flac', 'lvl-kyoto': 'kyoto/slash4.flac', 'lvl-lumber': 'lumber/chop.flac', 'lvl-space': 'space/slash2.flac' };
  for (const [clip, from, to] of SEG) {
    if (!LV[clip]) continue;
    const key = SEG.find(g => g[0] === clip)[4];      // (v42: a clip may start part way in)
    LV[clip].forEach((fr, i) => { const t = from + (fr - key) / FPS - .02; if (t >= from && t < to - .05) clip === 'lvl-keyboard' ? kb(t, i ? .7 : 1) : h(t, LVS[clip], i ? .65 : 1); });
  }
  // v41: the ending clip's monitor smashes, before the overlay comes in
  [[4, .9], [25, .7], [55, .8], [76, .7], [108, .8], [142, .7]].forEach(([fr, g]) => kb(T_OUT + .4 + (fr - 1) / FPS - .02, g * .8));
  // the seated player's three cuts (the take's 6.4, 7.5 and 12.0 s), through the same playback curve as the picture
  [6.4, 7.5].forEach((src, i) => { const t = seatAt(src); if (t !== null && t < SEAT_B + .2) h(t - .03, 'kyoto/slash5.flac', i ? .7 : 1); });
  // v43: the clear: a swish as the banners go, and a chime at zero
  h(T_CLR_GO + .02, 'swoosh1.flac', .35); h(T_ZERO + .02, 'kyoto/keep1.flac', .5);
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
