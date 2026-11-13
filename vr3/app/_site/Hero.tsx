'use client';

import { useEffect, useRef, useState } from 'react';
import { LEVELS, SITE } from './content';

/**
 * The top of the page. It shows one level at a time, its painting behind and its own logo in
 * front, as the game's home screen does, and moves on every few seconds until one is picked.
 *
 * Two versions of the words and buttons (page.tsx decides which from the browser):
 * - on a headset, the one thing to do is play, so there is one big button;
 * - anywhere else, play on this screen or send the page to a Quest.
 */
const EVERY = 5200;

export function Hero({ vr, judge, playHref }: { vr: boolean; judge: boolean; playHref: string }) {
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));      // paintings are only fetched once shown, or next up
  const [quest, setQuest] = useState('');
  const held = useRef(false);

  useEffect(() => {
    // Meta's own "open this link on my headset" page. (Only any use once the site has a public address.)
    setQuest(`https://www.oculus.com/open_url/?url=${encodeURIComponent(new URL(playHref, location.origin).href)}`);
  }, [playHref]);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => { if (!held.current && !document.hidden) setAt(i => (i + 1) % LEVELS.length); }, EVERY);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { setSeen(old => (old.has(at) && old.has((at + 1) % LEVELS.length) ? old : new Set([...old, at, (at + 1) % LEVELS.length]))); }, [at]);

  const level = LEVELS[at];
  const href = (id: string) => `${playHref}${playHref.includes('?') ? '&' : '?'}level=${id}`;

  return (
    <header className={`hero${vr ? ' in-vr' : ''}`} style={{ '--accent': level.accent } as React.CSSProperties}
      onPointerEnter={() => { held.current = true; }} onPointerLeave={() => { held.current = false; }}>
      <div className="hero-art" aria-hidden>
        {LEVELS.map((l, i) => seen.has(i) && <img key={l.id} className={i === at ? 'on' : ''} src={`/play/home/${l.id}.webp`} alt="" />)}
      </div>
      <div className="hero-shade" aria-hidden />

      <div className="hero-body">
        <p className="byline">
          <img src={SITE.author.avatar} alt="" width={28} height={28} />
          <span>Built by <a href={SITE.author.url} target="_blank" rel="noopener noreferrer">{SITE.author.name}</a></span>
          <span className="sep" aria-hidden />
          <span>for the <a href={SITE.competition.url} target="_blank" rel="noopener noreferrer">Meta VR Start Competition</a></span>
        </p>

        <div className="hero-logo">
          {LEVELS.map((l, i) => (seen.has(i) || i === 0) && <img key={l.id} className={i === at ? 'on' : ''} src={`/play/logos/${l.id}.webp`} alt={i === 0 ? 'Inbox Zero' : ''} />)}
        </div>

        <h1>Clear your inbox<br /><span className="with">with <em key={level.id}>{level.hero}</em>.</span></h1>
        {vr
          ? <p className="lede">Ten unread emails are about to fly at you. Hit the junk. Grab the ones that matter and throw them to keep them.</p>
          : <p className="lede">Put on a headset and your unread email flies at you, one letter at a time. Hit the junk. Grab the ones that matter and throw them to keep them. Ten letters later you are done.</p>}

        {vr ? (
          <div className="cta">
            <a className="pix big" href={href(level.id)}>PLAY GAME</a>
            <p className="cta-note"><b>You’re in a headset.</b> Stay in your chair. Left hand grabs a letter, right hand destroys it.</p>
          </div>
        ) : (
          <div className="cta">
            <div className="cta-row">
              <a className="pix" href={href(level.id)}>PLAY IN BROWSER</a>
              {quest && <a className="pix ghost" href={quest} target="_blank" rel="noopener noreferrer">SEND TO QUEST</a>}
            </div>
            <p className="cta-note">Open this page in a Quest’s browser to play in VR. On a laptop, X cuts and C keeps.</p>
          </div>
        )}

        <p className="access">
          {judge
            ? <><i className="dot on" />Judge access is on. The microphone writes down what you say.</>
            : <><i className="dot" />Without a code from your AI agent, you play a demo inbox.</>}
        </p>
      </div>

      <div className="hero-levels" role="group" aria-label="Levels">
        {LEVELS.map((l, i) => (
          <button key={l.id} type="button" className={i === at ? 'on' : ''} style={{ '--accent': l.accent } as React.CSSProperties}
            aria-pressed={i === at} onClick={() => { held.current = true; setAt(i); }}>
            <span>{l.name}</span>
          </button>
        ))}
      </div>
    </header>
  );
}
