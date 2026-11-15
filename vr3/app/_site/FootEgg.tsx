'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Win } from './Win';

/**
 * The footer's easter egg (2026-11-15: "move this as an easter egg for the footer"): the Inbox Zero logo under the buttons is
 * also a button. Pressed, the footer's words step aside, the page scrolls to show all of the footer, and Kyoto's win plays
 * over its painting (Win.tsx: the end song, its words cut by the katana, the petals). The nav steps aside too.
 */
export function FootEgg() {
  const button = useRef<HTMLButtonElement>(null);
  const [foot, setFoot] = useState<HTMLElement | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => { setFoot(button.current?.closest('footer') ?? null); }, []);
  useEffect(() => {
    document.body.classList.toggle('winning', on);
    foot?.classList.toggle('winning', on);
    if (on) foot?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [on, foot]);

  return (
    <>
      <button ref={button} type="button" className="foot-egg" onClick={() => setOn(true)} aria-label="Inbox Zero (play the Kyoto win)">
        <img className="foot-logo" src="/play/logos/site.webp" alt="" width={126} height={26} loading="lazy" />
      </button>
      {on && foot && createPortal(<Win level="kyoto" onEnd={() => setOn(false)} />, foot)}
    </>
  );
}
