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
const OUT_HOLD = 1.6, OUT_LEN = 20;
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

/* ---------- the timeline ---------- */
const T_SWORD = W('sword', 'sword'), T_SPLIT = T_SWORD + .02, T_GAME = T_SWORD + .34;
const T_INBOX = W('slash', 'inbox');
const T_REALLY = C('really'), T_HERO = C('hero');
const T_OUT = E('hero') + OUT_HOLD, T_END = T_OUT + OUT_LEN;
// the agent flow (v7)
const M_IN = C('connect') - .3, T_CONNECT = W('connect', 'muse'), T_OPEN = W('link', 'quest') + .15, T_HOME = T_OPEN + .75;
const M2_IN = C('archives') - .35, T_OKAY = W('okay', 'okay') + .05, M2_OUT = C('never') - .55;
const HOOK_COUNT = 181 + Math.floor(Math.max(0, T_SWORD - W('unread', '181') - .35) * 1.2);

// footage: [clip, from, to, at, key] — clip frame `key` is shown at time `at`
const SEG = [
  ['kyoto-cut', T_GAME, W('flame', 'flamethrower') - .1, T_GAME + .12, 39],
  ['inferno', W('flame', 'flamethrower') - .1, C('slash'), W('flame', 'flamethrower') + .25, 36],
  ['kyoto-cut', C('slash'), W('slash', 'burn'), C('slash') + .15, 39],
  ['inferno', W('slash', 'burn'), W('slash', 'smash'), W('slash', 'burn') + .12, 36],
  ['office2', W('slash', 'smash'), T_INBOX, W('slash', 'smash') + .12, 39],
  ['kyoto-intro', C('round'), C('connect') - .25, C('round'), 1],
  ['kyoto-keep2', C('grab') - .1, C('cut'), W('throw', 'throw') + .12, 78],
  ['kyoto-cut2', C('cut'), C('replies'), W('cut', 'cut') + .12, 66],
  ['kyoto-round2b', C('replies'), C('later'), W('pull', 'pull') + .05, 180],      // "SENT" lands as she says pull
  ['kyoto-round2b', C('later'), C('minutes'), W('later', 'throw') + .15, 249],
  ['kyoto-round2b', C('minutes'), C('monitor'), C('minutes'), 'end-90'],
  // v4: the long level shots (one cut on the word, then the view opens up while more mail is cut), each held 5 s past its line
  ['office2-long', C('monitor'), C('castle'), W('monitor', 'smash') + .12, 'cut'],
  ['castle-long', C('castle'), C('lab'), W('castle', 'defend') + .25, 'cut'],
  ['lab-long', C('lab'), C('inferno'), W('lab', 'disinfect') + .3, 'cut'],
  ['inferno-long', C('inferno'), C('kyoto'), W('inferno', 'torch') + .2, 'cut'],
  ['kyoto-long', C('kyoto'), C('axe'), W('kyoto', 'slice') + .2, 'cut'],
  ['lumber-long', C('axe'), C('or'), W('axe', 'split') + .2, 'cut'],
  ['space-long', C('or'), C('iwsdk') - .02, W('space', 'slice') + .15, 'cut'],
  ...['kyoto-long', 'castle-long', 'lab-long', 'space-long', 'inferno-long', 'lumber-long', 'office2-long'].map((clip, i, all) => {
    const d = (OUT_LEN - .4) / all.length, from = T_OUT + .4 + i * d;      // (after the end card has cleared: no crossfade)
    return [clip, from, from + d + (i === all.length - 1 ? 1 : 0), from, 150];
  }),
];
// level logos over the footage
const LOGOS = [
  ['office', C('monitor')], ['castle', C('castle')], ['lab', C('lab')], ['inferno', C('inferno')], ['kyoto', C('kyoto')], ['lumber', C('axe')], ['space', C('or')],
];
const LOGO_END = C('iwsdk') - .3;
// short lines on the footage: [text, from, to, style]
const PHRASES = [
  ['Grab to read', C('grab'), C('throw') - .05],
  ['Throw to keep', C('throw'), C('cut') - .05],
  ['Cut to archive', C('cut'), E('cut') + .1],
  // (v7: no "Saved as a Gmail draft": the agent sends replies now, after you say okay, and the approval scene shows it)
  ['Leave it for tomorrow', W('later', 'leave') - .1, E('later') + .3],
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

/* ---------- footage ---------- */
function keyOf(clip, key0) { return key0 === 'cut' ? CUTS[clip][0] : typeof key0 === 'string' ? FOOT[clip] + +key0.slice(3) : key0; }
let footSrc = '';
function footage(T) {
  const seg = SEG.find(s => T >= s[1] && T < s[2]);
  if (!seg) { show($('foot'), false); return null; }
  const [clip, from, , at, key0] = seg, n = FOOT[clip];
  const key = keyOf(clip, key0);
  const f = clamp(Math.round(key + (T - at) * FPS), 1, n);
  const src = `../work/footage/${clip}/${String(f).padStart(4, '0')}.jpg`;
  if (src !== footSrc) { $('foot-img').src = src; footSrc = src; }
  // a slow push in through each shot, so nothing sits still
  $('foot-img').style.transform = `scale(${1 + .035 * clamp((T - from) / 4)})`;
  show($('foot'), true, 1, '');
  return seg;
}

/* ---------- scenes ---------- */
function inbox(T) {
  const wrap = $('inbox-wrap');
  const hookOn = T < T_GAME, endOn = T >= T_REALLY - .05 && T < C('archives') - .4;
  if (!hookOn && !endOn) { show(wrap, false); show($('half-a'), false); show($('half-b'), false); return; }
  show(wrap, true, 1, '');
  let A, count;
  if (hookOn) {
    // mail keeps arriving: 6 rows, then a flood up to "181", then a slow creep
    const t181 = W('unread', '181') + .35;
    A = 6 + 8 * eo((T - .8) / (t181 - .8)) + Math.max(0, T - t181) * .35;
    count = Math.round(lerp(122, 181, eo((T - .8) / (t181 - .8)))) + Math.floor(Math.max(0, T - t181) * 1.2);
    if (T < .8) { A = 6; count = 122; }
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
  if (hookOn) {
    const tf = W('tried', 'filters'), tr = W('tried', 'reminders');
    const f = vis(T, tf - .05, 99), r = vis(T, tr - .05, 99);
    place($('chip-filters'), f); place($('chip-rem'), r);
    const slot = $('slot-rem'), w = 214 + 16;
    slot.style.width = (r ? w * eo((T - tr + .05) / .45) : 0) + 'px'; slot.style.paddingLeft = slot.style.width === '0px' ? '0' : '16px';
    const s = eo((T - (C('sword') - .1)) / .35);
    for (const el of tried.querySelectorAll('.strike')) el.style.transform = `scaleX(${s})`;
    for (const el of tried.querySelectorAll('.chip')) el.style.color = s > .5 ? '#8b8397' : '';
  }
  // the slash across the card, then it splits
  const sl = $('slash');
  const sp = clamp((T - (T_SWORD - .12)) / .14);
  sl.style.opacity = hookOn && T > T_SWORD - .12 && T < T_SPLIT + .12 ? 1 : 0;
  sl.style.transform = `rotate(-14deg) translateX(${lerp(-1400, 0, eo(sp))}px) scaleY(${1 - clamp((T - T_SPLIT) / .12)})`;
  const card = $('inbox');
  if (hookOn && T >= T_SPLIT) {
    const p = eo((T - T_SPLIT) / .32);
    card.style.visibility = 'hidden'; tried.style.visibility = 'hidden';
    for (const [id, sgn] of [['half-a', -1], ['half-b', 1]]) {
      const h = $(id); if (!h.firstChild) { const c = wrap.cloneNode(true); c.removeAttribute('id'); c.style.position = 'absolute'; c.style.inset = '0'; c.querySelector('.slash')?.remove(); for (const k of c.querySelectorAll('.card,.chips')) { k.style.visibility = 'visible'; k.style.opacity = 1; } h.appendChild(c); }
      const clip = sgn < 0 ? 'polygon(0 0,100% 0,100% 37%,0 63%)' : 'polygon(0 63%,100% 37%,100% 100%,0 100%)';
      h.style.clipPath = clip; h.style.visibility = 'visible';
      h.style.transform = `translate(${sgn * 60 * p}px,${sgn * 150 * p + 260 * p * p}px) rotate(${sgn * 5 * p}deg)`;
      h.style.opacity = 1 - clamp((T - T_SPLIT - .18) / .14);
      h.firstChild.style.visibility = 'visible';
      h.firstChild.querySelector('#tried, .chips') && (h.firstChild.querySelector('.chips').style.visibility = 'visible');
    }
  } else {
    card.style.visibility = 'visible'; show($('half-a'), false); show($('half-b'), false);
    card.style.opacity = co; card.style.transform = `translateY(${cy}px)`;
  }
}

function flash(T) {
  const f = $('flash');
  const hits = [[T_SPLIT, .5, .22], [T_INBOX, .7, .3], [T_HERO + .02, .45, .35]];
  let o = 0; for (const [t, a, d] of hits) if (T >= t && T < t + d) o = Math.max(o, a * (1 - (T - t) / d));
  show(f, o > 0, o);
}

function slam(T) {
  // "Inbox Zero!": the logo lands on the night, then glides to where the home screen keeps it
  const L = $('logo-slam'), a = T_INBOX, g0 = C('hack'), g1 = g0 + .9;
  const night = $('night');
  const nightOn = (T >= a && T < g1 + .4) || T >= C('try') - .3;
  if (nightOn) {
    show(night, true, T >= C('try') - .3 ? eo((T - C('try') + .3) / .3) : 1, '');
    $('night-img').style.filter = T < g1 + .4 ? `blur(${lerp(22, 0, eio((T - g0) / .9))}px) brightness(${lerp(.42, 1, eio((T - g0) / .9))}) saturate(1.2)` : 'blur(22px) brightness(.42) saturate(1.2)';
  } else show(night, false);
  if (T < a || T >= g1 + .25) return show(L, false);
  const p = eo((T - a) / .28);
  let s = lerp(1.35, 1, p), x = 0, y = 0, w = 1100, o = clamp((T - a) / .08);
  if (T >= g0) { const q = eio((T - g0) / .9); w = lerp(1100, 430 / 1, q); x = 0; y = lerp(0, 240 - 540, q); s = 1; o = 1 - clamp((T - g1) / .25); }
  L.style.width = w + 'px';
  show(L, true, o, `translate(-50%,-50%) translate(${x}px,${y}px) scale(${s})`);
}

function homeScreen(T) {
  // the real home screen: under the logo glide, and again when the agent's link opens on the Quest
  const wins = [[C('hack'), C('round'), .3, .6], [T_HOME, C('grab') - .1, 0, .3]];
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
    [C('hack') + .7, W('game', 'clear') - .05, 1500, 1000, [960, 765], W('game', 'clear')],
    [C('connect') + .15, T_CONNECT - .08, 1500, 900, 'c-btn', T_CONNECT],
    [W('link', 'opens') - .2, T_OPEN - .08, 1400, 880, 'm-open', T_OPEN],
    [T_HOME + .15, W('pick', 'level') - .05, 1500, 960, [1092, 452], W('pick', 'level')],
    [W('pick', 'level') + .3, W('play', 'play') - .05, 1092, 452, [960, 765], W('play', 'play')],
    [C('browser') - .55, W('browser', 'browser') - .05, 1420, 980, [860, 724], W('browser', 'browser')],
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
  const setup = T >= M_IN && T < T_HOME + .05, done = T >= M2_IN && T < M2_OUT + .35;
  if (!setup && !done) return show(el, false);
  show(el, true, 1, '');
  place(win, setup ? vis(T, M_IN, T_OPEN + .4, { y: 50, din: .55 }) : vis(T, M2_IN, M2_OUT, { y: 50, din: .55 }));
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
    msg('m-done', T, M2_IN + .3);
    const rows = [['r-arch', W('archives', 'archives') - .05], ['r-send', C('sends')], ['r-later', E('sends') - .15]];
    rows.forEach(([id, at], i) => {
      place($(id), vis(T, at, 999, { y: 18, din: .35 }));
      $(id).querySelector('.tk').classList.toggle('done', T >= T_OKAY + .25 + i * .16);
    });
    place($('m-ok').parentElement, vis(T, C('okay') - .15, 999, { y: 18, din: .35 }));
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
  } else show(L, false);
  // hands
  const hl = $('hand-l'), hr = $('hand-r');
  const lv = vis(T, C('grab') - .05, C('cut') - .25, { y: 120, din: .45 });
  if (lv) {
    const img = T >= W('throw', 'throw') ? 'left-throw' : T >= W('grab', 'read') ? 'left-read' : 'left-grab';
    if (!hl.src.includes(img)) hl.src = `../work/assets/hands/${img}.png`;
    const pop = T - Math.max(W('throw', 'throw'), 0) >= 0 && T - W('throw', 'throw') < .25 ? 1 + .08 * Math.sin(Math.PI * (T - W('throw', 'throw')) / .25) : 1;
    show(hl, true, lv.o, `translate(${(1 - lv.pi) * -200}px,${lv.y}px) scale(${pop})`);
  } else show(hl, false);
  const rv = vis(T, C('cut') - .05, C('replies') - .3, { y: 120, din: .45 });
  if (rv) {
    const img = T >= W('cut', 'pieces') - .1 ? 'right-destroy' : 'right-slash';
    if (!hr.src.includes(img)) hr.src = `../work/assets/hands/${img}.png`;
    show(hr, true, rv.o, `translate(${(1 - rv.pi) * 200}px,${rv.y}px)`);
  } else show(hr, false);
  // phrases: each rises in as the last lifts out
  PHRASES.forEach(([, a, b], i) => { const v = vis(T, a, b, { y: 28, din: .45, dout: .25, lift: -22 }); place(phraseEls[i], v, 'translateX(-50%)'); if (v) phraseEls[i].style.transform = `translateX(-50%) translateY(${v.y}px)`; });
  // dictation bubble
  const mv = vis(T, C('pull') - .05, C('later') + .2, { y: 24, din: .4 });
  if (mv) {
    const words = 'Monday works, see you then', t0 = W('pull', 'say');
    const n = Math.round(words.length * clamp((T - t0) / .9));
    $('mic-t').textContent = words.slice(0, n) || '…';
    const m = $('mic'); show(m, true, mv.o, `translateX(-50%) translateY(${mv.y}px) scale(${lerp(.9, 1, mv.pi)})`);
    m.querySelector('.micdot').style.transform = `scale(${1 + .08 * Math.sin(T * 14)})`;
  } else show($('mic'), false);
}

function browser(T) {
  const a = C('iwsdk') - .02, b = C('chair') - .3;
  const el = $('browser');
  if (T < a || T >= b + .3) return show(el, false);
  show(el, true, 1, '');
  const v = vis(T, a, b, { y: 50, din: .6 });
  place($('win'), v, `scale(${lerp(.97, 1, v ? v.pi : 1)})`);
  const s1 = vis(T, W('iwsdk', 'immersive') - .1, C('nodl') - .1, { y: 26 });
  const s2 = vis(T, C('nodl') - .05, b, { y: 26 });
  $('sdk-row').style.visibility = s1 ? 'visible' : 'hidden'; place($('chip-sdk'), s1);
  $('nodl-row').style.visibility = s2 ? 'visible' : 'hidden'; place($('chip-nodl'), s2);
  // the window lifts a little to make room for the chip
  if (v) $('win').style.transform += ` translateY(${-36 * eo((T - W('iwsdk', 'immersive') + .1) / .5)}px)`;
}

function seated(T) {
  // v6: the generated seated player, keyed and retimed so the grab lands on "come to you" and the slash on "stretching"
  const a = C('chair') - .05, b = C('really') - .3;
  const el = $('seated');
  if (T < a || T >= b + .3) return show(el, false);
  const o = clamp((T - a) / .3) * (1 - clamp((T - b) / .3));
  show(el, true, o, '');
  const f = clamp(Math.round((T - a) * FPS) + 1, 1, FOOT.seated);
  const src = `../work/footage/seated/${String(f).padStart(4, '0')}.png`;
  if (!$('seat-img').src.endsWith(src.slice(2))) $('seat-img').src = src;
}

function flow(T) {
  // "The game never touches your inbox": inbox, agent, game, built out from the centre; then the round is deleted
  const a = C('never') - .25, b = C('try') - .4, el = $('flow');
  if (T < a || T >= b + .3) return show(el, false);
  const out = clamp((T - b) / .3);
  show(el, true, 1 - out, `translateY(${-24 * eo(out)}px)`);
  const NW = 440, STEP = 620;
  const pA = eo((T - a) / .5), pG = eo((T - W('never', 'game') + .1) / .5), pI = eo((T - W('never', 'touches') + .05) / .5);
  const width = NW + (pG + pI) * STEP, left = 960 - width / 2;
  const xI = left, xA = left + pI * STEP, xG = xA + STEP;
  const node = (id, x, p) => { const n = $(id); n.style.left = x + 'px'; show(n, p > 0, p, `translateY(${(1 - p) * 30}px)`); };
  node('n-inbox', xI, pI); node('n-agent', xA, pA); node('n-game', xG, pG);
  const wire = (id, chip, x0, p, gone = 0) => {
    const w = $(id), c = $(chip), q = eo((p - .5) / .5);
    w.style.left = x0 + NW + 22 + 'px'; w.style.width = STEP - NW - 44 + 'px';
    show(w, q > 0, q * (1 - .75 * gone), `scaleX(${q})`);
    c.style.left = x0 + NW + (STEP - NW) / 2 + 'px';
    show(c, q > 0 && gone < 1, q * (1 - clamp(gone * 5)), `translateX(-50%) translateY(${(1 - q) * 14}px)`);
  };
  // the round goes when the game is done: its chip breaks into pixels
  const dp = clamp((T - W('deleted', 'deleted')) / 1.0);
  wire('w-ia', 'c-ia', xI, pI); wire('w-ag', 'c-ag', xA, pG, dp);
  // no line from the game to the inbox: a dashed path with a cross on it
  const xp = eo((T - W('never', 'inbox')) / .5), arc = $('arc');
  arc.style.opacity = .9 * xp; arc.style.strokeDashoffset = 0;
  $('flow-arc').style.clipPath = `inset(0 0 0 ${(1 - xp) * 100}%)`;
  const xo = eo((T - W('never', 'inbox') - .3) / .3);
  show($('nox'), xo > 0, xo, `scale(${lerp(.4, 1, xo) + .15 * Math.sin(Math.PI * clamp((T - W('never', 'inbox') - .3) / .3))})`);
  const px = $('pixels');
  if (dp > 0 && dp < 1) {
    px.style.visibility = 'visible';
    const cx = xA + NW + (STEP - NW) / 2, cy = 485, cw = 180, ch = 54, GX = 14, GY = 4;
    pixels.forEach(({ i }, k) => {
      if (k >= GX * GY) { i.style.opacity = 0; return; }
      const gx = k % GX, gy = Math.floor(k / GX), d = clamp((dp - rnd(k) * .3) / .7);
      i.style.width = cw / GX + 1 + 'px'; i.style.height = ch / GY + 1 + 'px';
      i.style.left = cx - cw / 2 + gx * cw / GX + 'px'; i.style.top = cy - ch / 2 + gy * ch / GY + 'px';
      i.style.opacity = 1 - eo(d);
      i.style.transform = `translate(${(rnd(k + 9) - .5) * 160 * eo(d)}px,${-150 * eo(d) * (.5 + rnd(k + 3))}px) scale(${1 - .7 * d})`;
      i.style.background = rnd(k + 5) > .6 ? '#ff9ec8' : '#d9d3e3';
    });
  } else px.style.visibility = 'hidden';
}

function closing(T) {
  const a = C('try') - .3, el = $('close');
  if (T < a) { show(el, false); show($('petals'), false); return; }
  if (T >= T_OUT + .45) { show(el, false); show($('petals'), false); return; }
  const gone = 1 - eo((T - T_OUT) / .4);
  show(el, true, gone, `translateY(${-24 * (1 - gone)}px)`);
  const H = T_HERO;
  // the address types itself
  const url = 'inboxzerovr.com', t0 = W('try', 'inboxzerovrcom') - .1;
  $('url-t').textContent = url.slice(0, Math.round(url.length * clamp((T - t0) / .7))) || '';
  $('caret').style.opacity = (Math.floor(T * 2.2) % 2 || T < t0 + .7) ? 1 : 0;
  const uv = vis(T, C('try') - .1, 999, { y: 30 });
  const hq = eio((T - H) / .6);
  const urlY = lerp(380, 520, hq);
  const U = $('url'); U.style.top = urlY + 'px';
  if (uv) show(U, true, uv.o, `translateX(-50%) translateY(${uv.y}px) scale(${lerp(1, .82, hq)})`);
  // seven levels build from the centre
  const ct = C('seven') + .25, gap = 22, cw = 210;
  const arrived = cards.map((c, i) => eo((T - ct - i * .11) / .4));
  const total = arrived.reduce((s, p) => s + p * (cw + gap), 0) - gap;
  let x = 960 - total / 2;
  const out = 0, cardsY = lerp(560, 700, hq);
  cards.forEach((c, i) => {
    const p = arrived[i];
    if (p <= 0 || out >= 1) { c.style.visibility = 'hidden'; x += 0; return; }
    c.style.visibility = 'visible'; c.style.opacity = p * (1 - out);
    c.style.left = x + 'px'; c.style.top = cardsY + 'px';
    c.style.transform = `translateY(${(1 - p) * 30 - out * 26}px)`;
    x += p * (cw + gap);
  });
  // the hero: the logo lands
  const lv = vis(T, H - .02, 999, { y: 50, din: .45 });
  const ls = lv ? lerp(1.18, 1, eo((T - H) / .35)) + .012 * Math.sin((T - H) * 2) : 1;
  const push = 1 + .03 * clamp((T - H - .6) / 4);
  if (lv) show($('end-logo'), true, lv.o, `translateY(${250 + lv.y}px) scale(${ls * push})`); else show($('end-logo'), false);
  place($('credit'), vis(T, H + 1.4, 999, { y: 20 }));
  // "or connect your agent": a chip under the level cards, gone when the logo lands
  const av = vis(T, W('agent', 'agent') - .1, H - .25, { y: 24 });
  const chip = $('agent-chip'); chip.style.top = '740px';
  if (av) show(chip, true, av.o, `translateX(-50%) translateY(${av.y}px)`); else show(chip, false);
  // petals burst on "hero"
  const pt = T - W('hero', 'hero') + .05;
  if (pt > 0) {
    show($('petals'), true, gone, '');
    petals.forEach((p, k) => {
      const ang = rnd(k) * Math.PI * 2, sp = 500 + 900 * rnd(k + 1), life = clamp(pt / (2.6 + rnd(k + 2) * 1.6));
      const px = 960 + Math.cos(ang) * sp * eo(pt / 1.2) + Math.sin(pt * 2 + k) * 30;
      const py = 470 + Math.sin(ang) * sp * .6 * eo(pt / 1.2) + 260 * pt * pt * .25;
      const s = 10 + 16 * rnd(k + 4);
      p.style.width = s + 'px'; p.style.height = s * .8 + 'px';
      p.style.left = px + 'px'; p.style.top = py + 'px';
      p.style.opacity = 1 - life; p.style.transform = `rotate(${pt * 200 * (rnd(k + 6) - .5) + k * 40}deg)`;
      p.style.background = rnd(k + 7) > .7 ? '#ffffff' : rnd(k + 8) > .5 ? '#ff9ec8' : '#ffc2db';
    });
  } else show($('petals'), false);
}

function outro(T) {
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
  const on = T < T_GAME || (T >= M_IN + .05 && T < T_HOME + .35) || (T >= C('iwsdk') - .02 && T < C('try') - .3);
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
const SOUND = false;      // v7: "remove all sound effects"
if (SOUND) buildSfx();

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
  outro(T);
  cursor(T);
  const imgs = [...document.images].filter(i => i.style.visibility !== 'hidden' && !i.complete);
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  if (!$('foot-img').complete) await $('foot-img').decode().catch(() => {});
}
Object.assign(window, { renderAt, SFX, AMB, DUR, FPS });
document.fonts.ready.then(() => { window.READY = true; });
