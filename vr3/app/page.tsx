import { headers } from 'next/headers';
import { Demo } from './_site/Demo';
import { HandShot } from './_site/HandShot';
import { LevelScene } from './_site/LevelScene';
import { Hero } from './_site/Hero';
import { CATEGORIES, LEVELS, SITE } from './_site/content';

/**
 * The site's front page: what the game is, how it plays, each level, and a way in. The game itself
 * is the static build at /play/ (vr3/play).
 *
 * - An ?access= code given here is carried on to the game, which trades it for the cookie that
 *   turns on the mic in the demo; the page then says judge access is on.
 * - In a headset's browser the top of the page is the short version: one PLAY GAME button.
 *   ?vr=1 and ?vr=0 force one or the other, to look at both on a desk.
 */
const HEADSET = /OculusBrowser|Quest|Pico|Wolvic|VisionOS/i;

type Params = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const query = await searchParams;
  const access = typeof query.access === 'string' ? query.access : '';
  const playHref = access ? `/play/?access=${encodeURIComponent(access)}` : '/play/';
  const agent = (await headers()).get('user-agent') ?? '';
  const vr = query.vr === '1' || (query.vr !== '0' && HEADSET.test(agent));
  const levelHref = (id: string) => `${playHref}${access ? '&' : '?'}level=${id}`;

  return (
    <div className={vr ? 'site in-vr' : 'site'}>
      <nav className="nav">
        <a className="nav-logo" href="#top" aria-label="Inbox Zero VR"><img src="/play/logos/site.webp" alt="Inbox Zero" width={146} height={30} /></a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#ai">The AI</a>
          <a href="#why">Why</a>
          <a href="#levels">Levels</a>
        </div>
        <a className="pix small" href={playHref}>{vr ? 'PLAY GAME' : 'PLAY'}</a>
      </nav>

      <main id="top">
        <Hero vr={vr} judge={!!access} playHref={playHref} />

        {/* ───────── the demo video ───────── */}
        <section className="band demo" id="demo">
          <div className="wrap">
            <h2>Watch one inbox get cleared.</h2>
            <p className="sub">Ten emails, from the countdown to the last one.</p>
            <Demo />
          </div>
        </section>

        {/* ───────── how it works ───────── */}
        <section className="band how" id="how">
          <div className="wrap">
            <h2>Clear your inbox, one game at a time.</h2>

            <ol className="steps">
              <li>
                <span className="num">01</span>
                <h3>Ask your agent</h3>
                <p>Tell an AI agent that can read your email to set up a game. It writes a card for each of your newest unread emails and gives you a 4-digit code. Type the code into the game.</p>
                <p className="quiet">No agent? The game plays a demo inbox.</p>
              </li>
              <li>
                <span className="num">02</span>
                <h3>Play two rounds</h3>
                <p>In round one every email flies at you, and you cut it or keep it. In round two the ones you kept come back to be answered. You stay in your chair for both.</p>
              </li>
              <li>
                <span className="num">03</span>
                <h3>Tell your agent you’re done</h3>
                <p>It lists what you chose: archive these six, reply to Sam, leave three. Say OK and it does it.</p>
              </li>
            </ol>

            <h3 className="mini">The controls</h3>
            <div className="hands">
              <article className="hand-card left">
                <h4>Left hand</h4>
                <div className="shots">
                  <figure>
                    <HandShot name="left-grab" alt="A left hand reaching for an email"><Pixels art={ICON_GRAB} /></HandShot>
                    <figcaption><b>Grab</b>Reach towards a letter and squeeze.</figcaption>
                  </figure>
                  <figure>
                    <HandShot name="left-read" alt="A left hand holding an email up close"><Pixels art={ICON_READ} /></HandShot>
                    <figcaption><b>Read</b>It comes up close enough to read.</figcaption>
                  </figure>
                  <figure>
                    <HandShot name="left-throw" alt="A left hand throwing an email away, the email glowing gold"><Pixels art={ICON_KEEP} /></HandShot>
                    <figcaption><b>Throw</b>Throw it anywhere to keep it. It flashes gold.</figcaption>
                  </figure>
                </div>
              </article>
              <article className="hand-card right">
                <h4>Right hand</h4>
                <div className="shots">
                  <figure>
                    <HandShot name="right-destroy" alt="A right hand swinging a katana through an email, cutting it in two in a burst of cherry blossom"><Pixels art={ICON_CUT} /></HandShot>
                    <figcaption><b>Slash and destroy</b>Swing through the email and it is gone. The level decides what you swing.</figcaption>
                  </figure>
                </div>
              </article>
            </div>

            <h3 className="mini">The rounds</h3>
            <div className="rounds">
              <article className="round">
                <div className="mock one" aria-hidden>
                  <div className="bar"><span>3 / 10</span><i style={{ '--fill': '30%' } as React.CSSProperties} /><span>30%</span></div>
                  <div className="mail cut">
                    <span className="tag" style={{ '--t': '#ffa24a' } as React.CSSProperties}>PROMO</span>
                    <b>Flash sale ends tonight</b>
                    <small>Deals Daily · 48 hours only</small>
                  </div>
                  <span className="float saved">SAVED</span>
                </div>
                <h4>Round 1</h4>
                <p>Your unread emails fly in from the middle of the scene, one after another. Cut the junk. Grab the ones that matter, read them, and throw them to keep them.</p>
              </article>
              <article className="round">
                <div className="mock two" aria-hidden>
                  <div className="bubble l">Thursday works. See you at ten.</div>
                  <div className="mail">
                    <span className="tag" style={{ '--t': '#ff6ec7' } as React.CSSProperties}>PERSONAL</span>
                    <b>Coffee this week?</b>
                    <small>Maya Chen</small>
                  </div>
                  <div className="bubble r">Can we do next week instead?</div>
                  <span className="mic"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12z" /></svg></span>
                  <span className="float later">LATER</span>
                </div>
                <h4>Round 2</h4>
                <p>Each email you kept comes back with two replies already written. Hold the email against one to choose it. Hold it against the microphone to say your own. Throw it away and it waits until tomorrow.</p>
              </article>
            </div>

            <h3 className="mini">What your agent does after</h3>
            <dl className="outcomes">
              <div><dt>Cut</dt><dd>Archived, not deleted.</dd></div>
              <div><dt>Kept</dt><dd>Left alone. Still unread.</dd></div>
              <div><dt>Replied</dt><dd>Sent, or saved as a draft. Your agent asks which.</dd></div>
              <div><dt>Later</dt><dd>Left alone.</dd></div>
            </dl>
            <p className="fine">The game itself never touches your inbox. Quit halfway and your agent gets nothing to act on.</p>
          </div>
        </section>

        {/* ───────── the AI ───────── */}
        <section className="band ai" id="ai">
          <div className="wrap">
            <h2>It has read your mail before you pick up the sword.</h2>
            <div className="bento">
              <article className="wide">
                <h3>Your agent makes the cards</h3>
                <p>The game never connects to your inbox. Your own AI agent reads your unread mail and writes a card for each email: the sender, the gist, and one of eleven types.</p>
                <ul className="chips">{CATEGORIES.map(([name, tint]) => <li key={name} style={{ '--t': tint } as React.CSSProperties}>{name}</li>)}</ul>
              </article>
              <article>
                <h3>Two replies, written before you start</h3>
                <p>For mail from a person, your agent writes two short replies. In round two you hold the email against the one you want.</p>
              </article>
              <article>
                <h3>Say it, and it becomes an email</h3>
                <p>Hold an email against the microphone and talk. Your words appear as you say them, and are then tidied into a reply.</p>
              </article>
              <article className="wide keep">
                <h3>Deleted when you finish</h3>
                <p>Your agent sends a short summary of each email, never the whole thing. The server deletes them the moment your game ends, and deletes your choices 10 minutes after your agent reads them.</p>
                <ul className="ticks">
                  <li>No sign-in, and no access to your mailbox</li>
                  <li>Each email goes under a number only your agent can match to the real one</li>
                  <li>The one model on our side writes up your spoken replies, with zero data retention</li>
                  <li>Your agent is told to check with you before it archives or replies</li>
                </ul>
              </article>
            </div>
            <p className="note">
              <i className="dot" />
              <span>Anyone whose AI agent can read their email can play their own inbox. Everyone else plays the same demo inbox. The microphone is on in agent games and for judges, and off in the public demo to keep the audio bill small.</span>
            </p>
          </div>
        </section>

        {/* ───────── why ───────── */}
        <section className="band why" id="why">
          <div className="wrap">
            <h2>Email is easier to face when you can hit it.</h2>
            <p className="sub">An unread count follows you around all day. Inbox Zero turns it into one sitting. Put the headset on, deal with ten emails, take it off.</p>

            <div className="why-grid">
              <article>
                <h3>One game a day</h3>
                <p>A game is ten emails, and then it stops. There is a countdown, the letters, and a last one. Nothing loads underneath it, and there is no streak to keep alive.</p>
              </article>
              <article>
                <h3>Built for Leisure Lovers</h3>
                <p>Meta sorted Quest players into four groups. Leisure Lovers play alone, in short sessions, to wind down. It is a large group, and Meta says few of them are on Quest yet.</p>
                <ul className="ticks">
                  <li>You play alone</li>
                  <li>You stay in your chair</li>
                  <li>A game is ten emails long</li>
                  <li>It is free, and runs in the browser</li>
                  <li>The best score is zero</li>
                </ul>
                <a className="more" href={SITE.segments} target="_blank" rel="noopener noreferrer">Meta’s 2025 player segments ↗</a>
              </article>
              <article className="venn-card">
                <h3>A game that leaves work done</h3>
                <div className="venn" aria-hidden><span>GAMING</span><b>INBOX<br />ZERO</b><span>PRODUCTIVITY</span></div>
                <p>The competition has a gaming track and a productivity track. Inbox Zero belongs in both. You swing a sword for a few minutes, and afterwards your junk is archived and your replies are drafted.</p>
              </article>
            </div>
          </div>
        </section>

        {/* ───────── the levels ───────── */}
        <section className="band levels" id="levels">
          <div className="wrap">
            <h2>Cut it, smash it, melt it, burn it or punch it.</h2>
            <p className="sub">There are eight levels. The rules are the same in all of them. The room and the weapon change. Point at one to try its weapon.</p>
          </div>
          {LEVELS.map(level => (
            <article className="level" key={level.id} id={level.id} style={{ '--accent': level.accent } as React.CSSProperties}>
              <LevelScene id={level.id} name={level.name} href={levelHref(level.id)} />
              <div className="level-words">
                <h3>{level.name}</h3>
                <p>{level.story}</p>
                <a className="pix small" href={levelHref(level.id)}>PLAY THIS LEVEL</a>
              </div>
            </article>
          ))}
        </section>
      </main>

      {/* ───────── made for ───────── */}
      <footer className="foot" id="made">
        <div className="foot-scene">
          <div className="foot-words">
            <h2>Built for the <a href={SITE.competition.url} target="_blank" rel="noopener noreferrer">Meta VR Start<br />Developer Competition 2026</a></h2>
            <p className="sub">One person made it. It runs in the Quest’s browser, so there is nothing to install. The game is WebXR and three.js, each level is a flat painting given depth, and a small server reads the mail and forgets it.</p>
            <ul className="tools">{SITE.tools.map(tool => <li key={tool.name}><a href={tool.url} target="_blank" rel="noopener noreferrer">{tool.name}</a></li>)}</ul>
            <p className="fine">No emails were deleted in the making of this game.</p>
          </div>
          <div className="foot-art"><img src="/play/garden/twilight-v2.webp" alt="" loading="lazy" aria-hidden /></div>
        </div>
        <div className="foot-bar">
          <img className="foot-logo" src="/play/logos/site.webp" alt="Inbox Zero" width={126} height={26} loading="lazy" />
          <p className="byline">
            <img src={SITE.author.avatar} alt="" width={28} height={28} loading="lazy" />
            <span>Built by <a href={SITE.author.url} target="_blank" rel="noopener noreferrer">{SITE.author.name}</a></span>
          </p>
          <span className="grow" />
          <a className="icon" href={SITE.github} target="_blank" rel="noopener noreferrer" aria-label="Inbox Zero VR on GitHub" title="Source on GitHub">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
          </a>
          <a className="icon" href={SITE.author.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${SITE.author.name} on LinkedIn`} title={`${SITE.author.name} on LinkedIn`}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
          </a>
          <a className="pix small" href={playHref}>{vr ? 'PLAY GAME' : 'PLAY'}</a>
        </div>
      </footer>
    </div>
  );
}

/* Small pixel pictures, shown in a hand's tile until its real picture exists (HandShot): '#' is ink, 'a' is the accent, anything else is empty. */
const ICON_GRAB = [
  'aa..........aa',
  'a............a',
  '..##########..',
  '..##......##..',
  '..#.#....#.#..',
  '..#..#..#..#..',
  '..#...##...#..',
  '..##########..',
  'a............a',
  'aa..........aa',
];
const ICON_READ = [
  '..##########..',
  '..#........#..',
  '..#.aaaaaa.#..',
  '..#........#..',
  '..#.aaaa...#..',
  '..#........#..',
  '..#.aaaaaa.#..',
  '..#........#..',
  '..#.aaa....#..',
  '..##########..',
];
const ICON_KEEP = [
  '.........a....',
  '..a.....aaa...',
  '.........a....',
  '....##########',
  'aa..##......##',
  '....#.#....#.#',
  'aaa.#..#..#..#',
  '....#...##...#',
  'aa..#........#',
  '....##########',
];
const ICON_CUT = [
  '...........aa.',
  '######....aa..',
  '##....#..aa...',
  '#.#.....aa....',
  '#..#...aa.####',
  '#.....aa.#...#',
  '#....aa.....##',
  '####aa.....#.#',
  '...aa..#.....#',
  '..aa...#######',
];

function Pixels({ art }: { art: string[] }) {
  const cells = art.flatMap((row, y) => [...row].map((c, x) => (c === '#' || c === 'a' ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} className={c === 'a' ? 'a' : undefined} /> : null)));
  return <svg className="pixels" viewBox={`0 0 ${art[0].length} ${art.length}`} width={84} height={60} shapeRendering="crispEdges" aria-hidden>{cells}</svg>;
}
