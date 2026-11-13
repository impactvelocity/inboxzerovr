'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A level as a small scene: its painting behind, its own logo across the top, and over them the
 * game's 3D view of the level (play/src/showcase.ts, served at /play/showcase.html): a Quest hand
 * on the left, one of the level's emails floating in the middle, its weapon on the right, and its
 * air (petals, embers, bubbles, stars).
 *
 * The 3D view is an iframe with a see-through canvas. It is only there while the level is on or
 * near the screen, so a long page holds two or three of them at most. This tells it where the
 * pointer is; hovering is a taste of the level (the weapon hits the email). On a screen with no
 * pointer to hover with (a phone), the scene in the middle of the screen plays instead. With
 * reduced motion asked for, there is just the painting and the logo.
 *
 * The whole scene is a link into that level.
 */
export function LevelScene({ id, name, href }: { id: string; name: string; href: string }) {
  const box = useRef<HTMLAnchorElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(false), [ready, setReady] = useState(false);
  const centred = useRef(false);      // (no hover here, and this scene is the one in the middle of the screen)

  useEffect(() => {
    const el = box.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new IntersectionObserver(([entry]) => { setNear(entry.isIntersecting); if (!entry.isIntersecting) setReady(false); }, { rootMargin: '20% 0px' });
    seen.observe(el);
    const say = (hover: boolean) => frame.current?.contentWindow?.postMessage({ type: 'vr3-show', x: 0, y: 0, hover }, location.origin);
    const middle = matchMedia('(hover: none)').matches
      ? new IntersectionObserver(([entry]) => { centred.current = entry.isIntersecting; say(entry.isIntersecting); }, { rootMargin: '-42% 0px' })
      : null;
    middle?.observe(el);
    const told = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || (event.data as { type?: string } | null)?.type !== 'vr3-show-ready') return;
      setReady(true); if (centred.current) say(true);
    };
    addEventListener('message', told);
    return () => { seen.disconnect(); middle?.disconnect(); removeEventListener('message', told); };
  }, []);

  const tell = (x: number, y: number, hover: boolean) => frame.current?.contentWindow?.postMessage({ type: 'vr3-show', x, y, hover }, location.origin);
  const at = (event: React.PointerEvent): [number, number] => {
    const r = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - r.left) / r.width * 2 - 1, (event.clientY - r.top) / r.height * 2 - 1];
  };

  return (
    <a ref={box} className={`scene${ready ? ' live' : ''}`} href={href} aria-label={`Play ${name}`}
      onPointerMove={event => { if (event.pointerType !== 'touch') tell(...at(event), true); }}
      onPointerLeave={event => { if (event.pointerType !== 'touch') tell(0, 0, false); }}>
      <img className="scene-art" src={`/play/home/${id}.webp`} alt={`${name}: the level’s painted backdrop`} loading="lazy" width={1672} height={941} />
      <span className="scene-shade" aria-hidden />
      {near && <iframe ref={frame} className="scene-3d" src={`/play/showcase.html?level=${id}`} title={`${name} in 3D`} tabIndex={-1} aria-hidden loading="lazy" />}
      <img className="scene-logo" src={`/play/logos/${id}.webp`} alt="" loading="lazy" />
    </a>
  );
}
