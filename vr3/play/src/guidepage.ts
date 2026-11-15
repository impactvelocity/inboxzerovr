import './style.css';
import { pixelWords } from './home';
import type { HandGuide } from './handguide';

/**
 * guide.html: one round of How to Play for the site's front page (2026-11-15: "use the animations and how to play pop up to
 * rebuild this", "Round 1 - Sorting your email - two cards", "Round 2 - replying"). The same two cards, words and lit hands
 * as the home screen's pop-up (index.html #guide, src/handguide.ts and src/replyguide.ts), on a see-through page the site
 * lays over its own dark panel.
 *
 *   ?round=sort | reply      which round (sort by default)
 *   &accent=%23f6b3cc        the colour the hands and lit card take
 *   &driven=1                the page around picks which card plays (see below); otherwise they take turns here
 *
 * In the pop-up a card plays when it is picked. Here nobody is asked to pick: the cards take turns by themselves, each for one
 * play of its loop, and a click picks one and carries on from there. Nothing runs while the page is off the screen. It tells
 * the page around it how tall it is ({ type: 'vr3-guide-size', height }), so the frame fits it exactly, and again
 * whenever it is asked ({ type: 'vr3-guide-measure' }).
 */
const query = new URLSearchParams(location.search);
const round = query.get('round') === 'reply' ? 'reply' : 'sort';
const accent = /^#[0-9a-f]{3,8}$/i.test(query.get('accent') ?? '') ? query.get('accent')! : '#f6b3cc';
/** Each card's loop in seconds (handguide.ts TURN_LEFT / TURN_RIGHT, replyguide.ts TURN). */
const TURNS = round === 'sort' ? { left: 3.55, right: 4.4 } : { left: 4.4, right: 4.4 };
const WORDS = round === 'sort'
  ? { left: ['Grab to read', 'Throw to keep'], right: ['Grip to arm', 'Slash to clear'] }
  : { left: ['Move to choose', 'Hold to send'], right: ['Bring to mic', 'Say your reply'] };

document.documentElement.style.setProperty('--accent', accent);
const host = document.createElement('div');
host.className = 'hand-guide';
host.style.setProperty('--accent', accent);
host.innerHTML = `<canvas aria-hidden="true"></canvas>${(['left', 'right'] as const).map(side =>
  `<div class="hand-card pixbox" data-hand="${side}" role="button" tabindex="0" aria-pressed="false">` +
  `<span class="px-words" data-step="${side}:0">${WORDS[side][0]}</span><div class="hand-view"></div>` +
  `<span class="px-words" data-step="${side}:${round === 'sort' && side === 'left' ? 2 : 1}">${WORDS[side][1]}</span></div>`).join('')}`;
document.body.append(host);
host.querySelectorAll<HTMLElement>('.px-words').forEach(pixelWords);

// the height, for the frame around this page
const tell = () => parent.postMessage({ type: 'vr3-guide-size', round, height: Math.ceil(host.getBoundingClientRect().height) }, location.origin);
new ResizeObserver(tell).observe(host);
// (the page around may not be listening yet when this first reports, so it can ask again)
addEventListener('message', event => { if (event.origin === location.origin && (event.data as { type?: string } | null)?.type === 'vr3-guide-measure') tell(); });

const made: Promise<HandGuide> = round === 'sort'
  ? import('./handguide').then(m => m.createHandGuide(host))
  : import('./replyguide').then(m => m.createReplyGuide(host));

/** ?driven=1: the page around says which card plays (one card at a time across several of these frames). */
const driven = query.get('driven') === '1';
type Side = 'left' | 'right';
const say = (type: string, extra: Record<string, unknown> = {}) => parent.postMessage({ type, round, ...extra }, location.origin);
/** What the page last asked for, kept until the hands have loaded; then whatever runs them. */
let wanted: Side | 'idle' = 'idle', obey: ((what: Side | 'idle') => void) | null = null;
if (driven) addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  const data = event.data as { type?: string; side?: Side } | null;
  const what = data?.type === 'vr3-guide-play' && (data.side === 'left' || data.side === 'right') ? data.side : data?.type === 'vr3-guide-idle' ? 'idle' : null;
  if (!what) return;
  wanted = what; obey?.(what);
});

void made.then(guide => {
  guide.accent(accent);
  const cards = Array.from(host.querySelectorAll<HTMLElement>('.hand-card'));

  if (driven) {
    // Told { type: 'vr3-guide-play', side }: that card plays its loop once, then the frame goes quiet and says
    // { type: 'vr3-guide-done', side }. Told { type: 'vr3-guide-idle' }: quiet now. A click says
    // { type: 'vr3-guide-picked', side } and leaves the choosing to the page.
    let timer = 0;
    /** Both hands at rest, neither card lit. */
    const idle = () => {
      clearTimeout(timer); guide.stop(); guide.frame(0, 0, 'both');
      host.querySelectorAll('.hand-card.on, [data-step].on').forEach(el => el.classList.remove('on'));
    };
    const play = (side: Side) => {
      clearTimeout(timer); guide.stop(); guide.start(); guide.pick(side);
      timer = window.setTimeout(() => { idle(); say('vr3-guide-done', { side }); }, TURNS[side] * 1000);
    };
    obey = what => (what === 'idle' ? idle() : play(what));
    cards.forEach(card => card.addEventListener('click', () => say('vr3-guide-picked', { side: card.dataset.hand })));
    obey(wanted);
    say('vr3-guide-ready');
    return;
  }

  let side: 'left' | 'right' = 'left', timer = 0, running = false;
  /** Play one card for one loop, then hand over to the other. */
  const play = (which: 'left' | 'right') => {
    side = which; guide.pick(which);
    clearTimeout(timer); timer = window.setTimeout(() => play(side === 'left' ? 'right' : 'left'), TURNS[which] * 1000);
  };
  const run = (on: boolean) => {
    if (on === running) return;
    running = on;
    if (on) { guide.start(); play('left'); } else { clearTimeout(timer); guide.stop(); }
  };
  cards.forEach(card => card.addEventListener('click', () => { if (running) play(card.dataset.hand as 'left' | 'right'); }));
  // (an observer inside a frame measures against the top page's screen, so this is "on the site's screen")
  new IntersectionObserver(([entry]) => run(entry.isIntersecting), { threshold: 0.15 }).observe(host);
}).catch(() => host.classList.add('failed'));
