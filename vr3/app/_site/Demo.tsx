'use client';

import { useState } from 'react';
import { SITE } from './content';

/**
 * The demo video: a still with a play button, and YouTube only once it is pressed (so the page
 * loads nothing of theirs until then). With no video set yet (content.ts), it says so.
 */
export function Demo() {
  const [playing, setPlaying] = useState(false);
  const id = SITE.demoVideo;
  return (
    <div className="demo-frame">
      <div className="demo-bar" aria-hidden><i /><i /><i /><span>INBOX ZERO · DEMO</span></div>
      <div className="demo-screen">
        {playing && id
          ? <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} title="Inbox Zero VR demo video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          : (
            <button type="button" className="demo-poster" disabled={!id} onClick={() => setPlaying(true)} aria-label={id ? 'Play the demo video' : 'Demo video coming soon'}>
              <img src="/play/home/kyoto.webp" alt="" loading="lazy" />
              <span className="demo-play" aria-hidden><svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
              <span className="demo-label">{id ? 'PLAY THE DEMO VIDEO' : 'DEMO VIDEO COMING SOON'}</span>
            </button>
          )}
      </div>
    </div>
  );
}
