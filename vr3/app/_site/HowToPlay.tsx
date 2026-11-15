'use client';

import { useEffect, useRef, useState } from 'react';
import { GuideFrame, type Playing, type Side } from './GuideFrame';

/**
 * How to Play's two rounds, one card animating at a time across both (2026-11-15: "only one card at a time being animated,
 * active, and auto move forward to next, even if selected", then "it should select the next right away after each one is
 * done"):
 * Round 1 left, Round 1 right, Round 2 left, Round 2 right, and round again. A clicked card plays next, and the order
 * carries on from it. Nothing plays while the section is off the screen.
 */
const ORDER: { round: 'sort' | 'reply'; side: Side }[] = [
  { round: 'sort', side: 'left' }, { round: 'sort', side: 'right' }, { round: 'reply', side: 'left' }, { round: 'reply', side: 'right' },
];

export function HowToPlay() {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ i: 0, n: 0 });      // (n: a click on the playing card plays it again)
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const seen = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 });
    if (box.current) seen.observe(box.current);
    return () => seen.disconnect();
  }, []);

  const playing = (round: 'sort' | 'reply'): Playing => (onScreen && ORDER[at.i].round === round ? { side: ORDER[at.i].side, n: at.n } : null);
  const done = (round: 'sort' | 'reply', side: Side) => {
    const now = ORDER[at.i];
    if (now.round !== round || now.side !== side) return;
    setAt(a => ({ i: (a.i + 1) % ORDER.length, n: a.n + 1 }));
  };
  const picked = (round: 'sort' | 'reply', side: Side) => {
    setAt(a => ({ i: ORDER.findIndex(o => o.round === round && o.side === side), n: a.n + 1 }));
  };

  return (
    <div className="guides" ref={box}>
      <article className="guide" style={{ '--accent': '#f6b3cc' } as React.CSSProperties}>
        <h3><span>Round 1</span>Sorting your email</h3>
        <GuideFrame round="sort" accent="#f6b3cc" playing={playing('sort')} onDone={side => done('sort', side)} onPicked={side => picked('sort', side)}
          title="Round 1. Left hand: grab to read, throw to keep. Right hand: grip to arm, slash to clear." />
        <p>One email at a time: keep it or slash to archive</p>
      </article>
      <article className="guide" style={{ '--accent': '#35e8ff' } as React.CSSProperties}>
        <h3><span>Round 2</span>Replying</h3>
        <GuideFrame round="reply" accent="#35e8ff" playing={playing('reply')} onDone={side => done('reply', side)} onPicked={side => picked('reply', side)}
          title="Round 2. Move the email to a reply to choose it and hold to send, or bring it to the mic and say your reply." />
        <p>Throw or cut to leave it unread for tomorrow</p>
      </article>
    </div>
  );
}
