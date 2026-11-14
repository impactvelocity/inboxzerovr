'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * One picture of a hand doing a move, in the controls part of "How it works": the user's picture at
 * /site/hands/<name>.webp (640 px, made from their 1024 px PNG beside it: a tenth of the bytes; the briefs are in
 * design/site-hands-v1/prompts.md). A PNG with no WebP yet is used as it is; with neither, the tile shows what
 * it is given instead (a small pixel icon), so pictures can be dropped in one at a time with no change here.
 */
export function HandShot({ name, alt, children }: { name: string; alt: string; children: ReactNode }) {
  const [missing, setMissing] = useState(false);
  const [png, setPng] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // (a picture that failed before the page woke up never fires its error here: ask it)
  useEffect(() => { const el = img.current; if (el && el.complete && !el.naturalWidth) setPng(true); }, []);
  return (
    <div className="shot">
      {missing ? children : <img ref={img} src={`/site/hands/${name}.${png ? 'png' : 'webp'}`} alt={alt} loading="lazy" decoding="async" onError={() => (png ? setMissing(true) : setPng(true))} />}
    </div>
  );
}
