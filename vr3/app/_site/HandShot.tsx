'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * One picture of a hand doing a move, in the controls part of "How it works": the user's PNG at
 * /site/hands/<name>.png (made from the briefs in design/site-hands-v1/prompts.md). Until that file exists the
 * tile shows what it is given instead (a small pixel icon), so pictures can be dropped in one at a
 * time with no change here.
 */
export function HandShot({ name, alt, children }: { name: string; alt: string; children: ReactNode }) {
  const [missing, setMissing] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // (a picture that failed before the page woke up never fires its error here: ask it)
  useEffect(() => { const el = img.current; if (el && el.complete && !el.naturalWidth) setMissing(true); }, []);
  return (
    <div className="shot">
      {missing ? children : <img ref={img} src={`/site/hands/${name}.png`} alt={alt} loading="lazy" onError={() => setMissing(true)} />}
    </div>
  );
}
