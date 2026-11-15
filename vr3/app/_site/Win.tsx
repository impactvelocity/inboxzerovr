'use client';

import { useEffect, useRef, useState } from 'react';
import { ANTHEM_LYRICS } from '../../play/src/levels/lyrics';

/**
 * A level's win, over the footer's painting as its easter egg (FootEgg.tsx; first built in the hero, 2026-11-15: "the nav, hero text, level selector, etc would fade away, the background would
 * add more particles for that level, and it would play the end song for each level and show the lyrics like it does on the
 * game, a simple way for people to see / hear that end part"; "build the kyoto first to see if it feels fun"; then
 * "move this as an easter egg for the footer").
 *
 * The song is the game's own (/play/audio/<level>/anthem.m4a) and so are its words and their times (play/src/levels/lyrics.ts).
 * As in the game's end (play/src/endlyrics.ts): each word comes in as it is sung, in the pixel letters, the line it is on in
 * the middle. Then, as in the game, it is cut (2026-11-15: "make it center, and not so big text, and maybe try and smash them
 * with the weapon"): when the next line starts, the level's weapon sweeps through the old one and its two halves fall away;
 * the last line goes the same way, and the level's logo comes in. Over the painting, the
 * level's air: more of it than the scenes below, beating with the song (its -pulse.json, as the game's music pulses), and a
 * puff of it from each word as it lands. It ends by itself a little after the song, or on STOP / Esc.
 */
export interface WinAir { colours: string[]; count: number; size: [number, number]; fall: number; drift: number; sway: number }
/** The levels with a win to show, and their air (Kyoto's petals: play/src/showcase.ts SHOWS.kyoto, more and bigger). */
export const WINS: Record<string, { lyrics: string; audio: string; air: WinAir }> = {
  kyoto: { lyrics: 'kyoto', audio: 'kyoto', air: { colours: ['#ffc4d8', '#ff9fc0', '#fff0f5', '#ff8fb8'], count: 150, size: [6, 14], fall: 38, drift: -26, sway: 22 } },
};

const CUT_LAST = 0.9;        // s after the last word, the weapon cuts the last line
const LOGO_AFTER = 1.35;     // s after the last word, the logo comes in (a little after the cut)
const CUTTING = 1.0;         // s a cut line takes to fall away
/** Kyoto's katana in pixels, its tip to the right: h grip, p its pink wrap, g the guard, b blade, e the edge, s its shade. */
const KATANA = [
  '..........gg............................',
  'hphphphphpggbbbbbbbbbbbbbbbbbbbbbbbbbbb.',
  'phphphphphggeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'hphphphphpggssssssssssssssssssssssssss..',
  '..........gg............................',
];
const INK: Record<string, string> = { h: '#2a1a2e', p: '#ff8fb8', g: '#e0ac48', b: '#dfe6f2', e: '#ffffff', s: '#9aa6bb' };
function Katana() {
  return (
    <svg className="win-katana" viewBox={`0 0 ${KATANA[0].length} ${KATANA.length}`} shapeRendering="crispEdges" aria-hidden>
      {KATANA.flatMap((row, y) => [...row].map((c, x) => (INK[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={INK[c]} /> : null)))}
    </svg>
  );
}
const HOLD = 2.4;            // s the logo stays once the song is over, before the hero comes back

interface Petal { x: number; y: number; s: number; vx: number; vy: number; phase: number; spin: number; colour: string; life: number }

export function Win({ level, onEnd }: { level: string; onEnd(): void }) {
  const win = WINS[level];
  const lines = ANTHEM_LYRICS[win.lyrics] ?? [];
  const lastWord = Math.max(...lines.flat().map(([t]) => t));
  const canvas = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(-1);
  const [over, setOver] = useState(false);
  const clock = useRef({ t: -1, pulse: [] as number[], step: 0.05, words: 0, cuts: 0 });

  // the song, its beat, and the clock everything follows
  useEffect(() => {
    const audio = new Audio(`/play/audio/${win.audio}/anthem.m4a`);
    let frame = 0, ended = 0, gone = false;
    void fetch(`/play/audio/${win.audio}/anthem-pulse.json`).then(r => (r.ok ? r.json() : null)).then((d: { pulse?: number[]; step?: number } | null) => {
      if (d?.pulse) { clock.current.pulse = d.pulse; clock.current.step = d.step ?? 0.05; }
    }).catch(() => undefined);
    const tick = () => {
      frame = requestAnimationFrame(tick);
      clock.current.t = audio.currentTime;
      setT(audio.currentTime);
    };
    audio.addEventListener('ended', () => { setOver(true); ended = window.setTimeout(() => { if (!gone) onEnd(); }, HOLD * 1000); });
    audio.play().catch(() => { if (!gone) onEnd(); });      // (not when this was taken down first: that pause also fails the play)
    frame = requestAnimationFrame(tick);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onEnd(); };
    addEventListener('keydown', key);
    return () => { gone = true; cancelAnimationFrame(frame); clearTimeout(ended); audio.pause(); removeEventListener('keydown', key); };
  }, []);

  // the air: petals drifting down and across, more on the beat, a puff from each word
  useEffect(() => {
    const el = canvas.current, g = el?.getContext('2d');
    if (!el || !g) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { air } = win;
    let w = 0, h = 0, frame = 0, last = 0;
    const petals: Petal[] = [];
    const make = (x: number, y: number, burst = false): Petal => {
      const angle = Math.random() * Math.PI * 2, kick = burst ? 60 + Math.random() * 160 : 0;
      return {
        x, y, s: air.size[0] + Math.random() * (air.size[1] - air.size[0]),
        vx: air.drift * (0.6 + Math.random() * 0.8) + Math.cos(angle) * kick, vy: air.fall * (0.6 + Math.random() * 0.8) + Math.sin(angle) * kick,
        phase: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 3, colour: air.colours[(Math.random() * air.colours.length) | 0], life: burst ? 2.6 : Infinity,
      };
    };
    const size = () => {
      const box = el.getBoundingClientRect(), ratio = Math.min(devicePixelRatio, 2);
      w = box.width; h = box.height; el.width = Math.round(w * ratio); el.height = Math.round(h * ratio); g.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    size();
    for (let i = 0; i < air.count; i++) petals.push(make(Math.random() * w * 1.2, Math.random() * h));
    const resized = new ResizeObserver(size); resized.observe(el);

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      const c = clock.current, beat = c.pulse.length && c.t >= 0 ? c.pulse[Math.min(c.pulse.length - 1, Math.floor(c.t / c.step))] ?? 0 : 0;
      // a puff from the middle for each word that has landed since the last frame
      const landed = lines.flat().filter(([at]) => at <= c.t).length;
      for (; c.words < landed; c.words++) for (let i = 0; i < 14; i++) petals.push(make(w / 2 + (Math.random() - 0.5) * w * 0.3, h * 0.48 + (Math.random() - 0.5) * 40, true));
      // and a bigger one along the line, each time the weapon cuts one
      const cuts = lines.filter((line, i) => i > 0 && line[0][0] <= c.t).length + (c.t >= lastWord + CUT_LAST ? 1 : 0);
      for (; c.cuts < cuts; c.cuts++) for (let i = 0; i < 40; i++) petals.push(make(w * (0.2 + Math.random() * 0.6), h * 0.5 + (Math.random() - 0.5) * 30, true));
      g.clearRect(0, 0, w, h);
      const speed = still ? 0 : 1 + beat * 0.9;
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.phase += dt * 2;
        p.x += (p.vx + Math.sin(p.phase) * air.sway) * dt * speed;
        p.y += p.vy * dt * speed;
        if (p.life !== Infinity) { p.life -= dt; p.vx *= 1 - dt * 1.4; p.vy = p.vy * (1 - dt * 1.4) + air.fall * dt * 1.4; if (p.life <= 0) { petals.splice(i, 1); continue; } }
        else if (p.y > h + 20 || p.x < -20) { Object.assign(p, make(Math.random() * w * 1.2, -20)); if (Math.random() < 0.5) { p.x = w + 20; p.y = Math.random() * h; } }
        const fade = p.life === Infinity ? 1 : Math.min(1, p.life / 0.8);
        const s = p.s * (1 + beat * 0.35), flip = Math.abs(Math.cos(p.phase * 0.7 + p.spin));      // (a petal turning over: narrower, then wide)
        g.globalAlpha = (0.55 + beat * 0.45) * fade;
        g.fillStyle = p.colour;
        g.fillRect(Math.round(p.x), Math.round(p.y), Math.max(2, Math.round(s * (0.35 + 0.65 * flip))), Math.round(s * 0.62));
      }
      g.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); resized.disconnect(); };
  }, []);

  // the words: the line being sung, in the middle; the line before it being cut, while it falls; then the logo
  const starts = lines.map(line => line[0][0]);
  const now = starts.reduce((found, at, i) => (at <= t ? i : found), -1);
  const cutLast = t >= lastWord + CUT_LAST;
  const cut = cutLast ? (t - lastWord - CUT_LAST < CUTTING ? lines.length - 1 : -1)
    : now > 0 && t - starts[now] < CUTTING ? now - 1 : -1;
  const words = now >= 0 && !cutLast ? lines[now].filter(([at]) => at <= t) : [];
  const showLogo = over || t > lastWord + LOGO_AFTER;
  const said = (i: number) => lines[i].map(([, word]) => word).join(' ');

  return (
    <div className="win" style={{ '--accent': win.air.colours[1] } as React.CSSProperties}>
      <canvas ref={canvas} className="win-air" aria-hidden />
      <div className="win-words" aria-live="polite">
        {words.length > 0 && (
          <p key={now} className="win-line now">
            {words.map(([, word], k) => <span key={k} className={k === words.length - 1 ? 'fresh' : undefined}>{word}</span>)}
          </p>
        )}
        {cut >= 0 && (
          <div key={`cut-${cut}`} className="win-cut" aria-hidden>
            <p className="win-line half top">{said(cut)}</p>
            <p className="win-line half bottom">{said(cut)}</p>
            <span className="win-slash" />
            <Katana />
          </div>
        )}
        {showLogo && <img className="win-logo" src={`/play/logos/${level}.webp`} alt={`${level} cleared`} />}
      </div>
      <button type="button" className="pix small win-stop" onClick={onEnd}>STOP</button>
    </div>
  );
}
