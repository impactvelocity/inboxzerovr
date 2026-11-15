'use client';

import { useEffect, useState } from 'react';
import { LEVELS } from './content';

/**
 * The top of the page. It shows one level at a time, its painting behind and its own logo in
 * front, as the game's home screen does, and moves on every few seconds until one is picked.
 *
 * Two versions of the words and buttons (page.tsx decides which from the browser):
 * - on a headset, the one thing to do is play, so there is one big button;
 * - anywhere else, connect your agent's MCP or play the demo on this screen.
 */
const EVERY = 5200;

export function Hero({ vr, judge, playHref }: { vr: boolean; judge: boolean; playHref: string }) {
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));      // paintings are only fetched once shown, or next up
  const [paused, setPaused] = useState(false);                            // the pointer is over the hero
  const [hover, setHover] = useState<number | null>(null);                 // the level tile being pointed at

  // Moves on to the next level EVERY ms; starts over after each change and after the pointer leaves,
  // so the bar on the picked tile (CSS, the same length) always matches.
  useEffect(() => {
    if (paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setTimeout(() => setAt(i => (i + 1) % LEVELS.length), EVERY);
    return () => clearTimeout(timer);
  }, [at, paused]);
  useEffect(() => { setSeen(old => (old.has(at) && old.has((at + 1) % LEVELS.length) ? old : new Set([...old, at, (at + 1) % LEVELS.length]))); }, [at]);

  const level = LEVELS[at];
  const href = (id: string) => `${playHref}${playHref.includes('?') ? '&' : '?'}level=${id}`;

  return (
    <header className={`hero${vr ? ' in-vr' : ''}`} style={{ '--accent': level.accent } as React.CSSProperties}
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="hero-art" aria-hidden>
        {LEVELS.map((l, i) => seen.has(i) && <img key={l.id} className={i === at ? 'on' : ''} src={`/play/home/${l.id}.webp`} alt="" />)}
      </div>
      <div className="hero-shade" aria-hidden />

      <div className="hero-body">
        <div className="hero-logo">
          {LEVELS.map((l, i) => (seen.has(i) || i === 0) && <img key={l.id} className={i === at ? 'on' : ''} src={`/play/logos/${l.id}.webp`} alt={i === 0 ? 'Inbox Zero' : ''} />)}
        </div>

        <h1>Clear your inbox<br /><span className="with">with <em key={level.id}>{level.hero}</em></span></h1>
        {vr
          ? <p className="lede">Grab an email to read it. Throw it to keep it, or smash it into tiny little pieces.</p>
          : <p className="lede">Your unread email as a short VR game on the Meta Quest. Grab an email to read it. Throw it to keep it, or smash it into tiny little pieces.</p>}

        {vr ? (
          <div className="cta">
            <a className="pix big" href={href(level.id)}>PLAY GAME</a>
            <p className="cta-note"><b>You’re in a headset.</b> Stay in your chair. Left hand grabs a letter, right hand destroys it.</p>
          </div>
        ) : (
          <div className="cta">
            <div className="cta-row">
              <a className="pix ghost" href="#how">CONNECT MCP</a>
              <a className="pix" href={href(level.id)}>PLAY DEMO</a>
            </div>
          </div>
        )}

        {judge && <p className="access"><i className="dot on" />Judge access is on. The microphone writes down what you say.</p>}
      </div>

      <div className="hero-pick">
        <div className={`hero-levels${paused ? ' paused' : ''}`} role="group" aria-label="Levels" onPointerLeave={() => setHover(null)}>
          {LEVELS.map((l, i) => (
            <button key={l.id} type="button" className={i === at ? 'on' : ''} style={{ '--accent': l.accent, '--every': `${EVERY}ms` } as React.CSSProperties}
              aria-pressed={i === at} aria-label={l.name} onPointerEnter={() => setHover(i)} onClick={() => setAt(i)}>
              <img src={`/play/thumbs/home/${l.id}.webp`} alt="" width={84} height={52} decoding="async" />
            </button>
          ))}
        </div>
        <p className="hero-level-name" aria-hidden style={{ '--accent': LEVELS[hover ?? at].accent } as React.CSSProperties}>{LEVELS[hover ?? at].name}</p>
      </div>
    </header>
  );
}
