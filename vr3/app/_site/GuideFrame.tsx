'use client';

import { useEffect, useRef, useState } from 'react';

export type Side = 'left' | 'right';
/** Which card this frame should be playing now (`n` changes to play the same card again), or null for still. */
export type Playing = { side: Side; n: number } | null;

/**
 * One round of the game's How to Play (play/guide.html?driven=1, src/guidepage.ts): the pop-up's two cards with the lit
 * Quest hands, floating on the section's own background. HowToPlay decides which card plays; this passes that on, and
 * passes back when a card has finished or was clicked. The page inside also says how tall it is (and is asked again once
 * this is listening), so the frame fits it with no scrollbar.
 */
export function GuideFrame({ round, accent, title, playing, onDone, onPicked }: {
  round: 'sort' | 'reply'; accent: string; title: string; playing: Playing;
  onDone(side: Side): void; onPicked(side: Side): void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const latest = useRef({ playing, onDone, onPicked });
  latest.current = { playing, onDone, onPicked };

  const post = (message: object) => frame.current?.contentWindow?.postMessage(message, location.origin);
  const command = () => { const now = latest.current.playing; post(now ? { type: 'vr3-guide-play', side: now.side } : { type: 'vr3-guide-idle' }); };
  const hello = () => { post({ type: 'vr3-guide-measure' }); command(); };

  useEffect(() => {
    const heard = (event: MessageEvent) => {
      const data = event.data as { type?: string; height?: number; side?: Side } | null;
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || !data?.type) return;
      if (data.type === 'vr3-guide-size' && typeof data.height === 'number' && data.height > 0) setHeight(data.height);
      else if (data.type === 'vr3-guide-ready') command();
      else if (data.type === 'vr3-guide-done' && data.side) latest.current.onDone(data.side);
      else if (data.type === 'vr3-guide-picked' && data.side) latest.current.onPicked(data.side);
    };
    addEventListener('message', heard);
    hello();      // (the frame may have loaded and reported before this was listening)
    return () => removeEventListener('message', heard);
  }, []);

  useEffect(command, [playing?.side, playing?.n, playing === null]);

  return (
    <div className="guide-screen" style={{ '--accent': accent } as React.CSSProperties}>
      <iframe ref={frame} src={`/play/guide.html?round=${round}&driven=1&accent=${encodeURIComponent(accent)}`} title={title} loading="lazy" onLoad={hello}
        style={height ? { height } : undefined} />
    </div>
  );
}
