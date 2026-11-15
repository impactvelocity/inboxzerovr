'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A level as a small scene: its painting behind, its own logo across the top, and over them the
 * game's 3D view of the level (play/src/showcase.ts, served at /play/showcase.html): one of the
 * level's emails floating in the middle, its weapon on the right, and its air (petals, embers,
 * bubbles, stars).
 *
 * The 3D view is an iframe with a see-through canvas. It is only there while the level is on or
 * near the screen, so a long page holds two or three of them at most.
 *
 * Hovering shows the level being played (2026-11-15: "instead of animating to hit the email, email, and stuff fade away
 * and the gif fades in and plays (and out on mouse out)"): the 3D view and the logo fade out, the painting darkens, and
 * the user's recording of the level (public/site/levels/<id>.gif) fades in on a small screen in the middle ("keeps the
 * main level background, and adds a border around the gif, like its tv": the recordings are small, 400 px wide). A recording is only fetched the first
 * time its level is hovered (they are a few MB each), and only fades in once it has loaded. On a screen with no pointer to
 * hover with (a phone), the scene in the middle of the screen plays its recording instead. With reduced motion asked for,
 * there is just the painting and the logo.
 *
 * The whole scene is a link into that level.
 */
export function LevelScene({ id, name, href }: { id: string; name: string; href: string }) {
  const box = useRef<HTMLAnchorElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(false), [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false), [wanted, setWanted] = useState(false), [loaded, setLoaded] = useState(false);
  const still = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { still.current = true; return; }
    const seen = new IntersectionObserver(([entry]) => { setNear(entry.isIntersecting); if (!entry.isIntersecting) setReady(false); }, { rootMargin: '20% 0px' });
    seen.observe(el);
    const middle = matchMedia('(hover: none)').matches
      ? new IntersectionObserver(([entry]) => play(entry.isIntersecting), { rootMargin: '-42% 0px' })
      : null;
    middle?.observe(el);
    const told = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || (event.data as { type?: string } | null)?.type !== 'vr3-show-ready') return;
      setReady(true);
    };
    addEventListener('message', told);
    return () => { seen.disconnect(); middle?.disconnect(); removeEventListener('message', told); };
  }, []);

  /** Show the recording (fetching it the first time), or go back to the 3D view. */
  const play = (on: boolean) => {
    if (still.current) return;
    if (on) setWanted(true);
    setPlaying(on);
  };

  const showing = playing && loaded;
  return (
    <a ref={box} className={`scene${ready ? ' live' : ''}${showing ? ' playing' : ''}`} href={href} aria-label={`Play ${name}`}
      onPointerEnter={event => { if (event.pointerType !== 'touch') play(true); }}
      onPointerLeave={event => { if (event.pointerType !== 'touch') play(false); }}>
      <img className="scene-art" src={`/play/home/${id}.webp`} alt={`${name}: the level’s painted backdrop`} loading="lazy" width={1672} height={941} />
      <span className="scene-shade" aria-hidden />
      {near && <iframe ref={frame} className="scene-3d" src={`/play/showcase.html?level=${id}`} title={`${name} in 3D`} tabIndex={-1} aria-hidden loading="lazy" />}
      {wanted && <span className="scene-tv"><img src={`/site/levels/${id}.gif`} alt={`${name} being played`} width={400} height={226} onLoad={() => setLoaded(true)} /></span>}
      <img className="scene-logo" src={`/play/logos/${id}.webp`} alt="" loading="lazy" />
    </a>
  );
}
