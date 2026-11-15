import { SITE } from './content';

/** The demo video: the YouTube player, straight in the frame. */
export function Demo() {
  return (
    <div className="demo-frame">
      <div className="demo-bar" aria-hidden><i /><i /><i /><span>INBOX ZERO · DEMO</span></div>
      <div className="demo-screen">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${SITE.demoVideo}?rel=0`}
          title="Inbox Zero VR demo video"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );
}
