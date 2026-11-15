import { headers } from 'next/headers';
import { Demo } from './_site/Demo';
import { HowToPlay } from './_site/HowToPlay';
import { LevelScene } from './_site/LevelScene';
import { McpUrl } from './_site/McpUrl';
import { SetupGuides } from './_site/SetupGuides';
import { StarField } from './_site/StarField';
import { Hero } from './_site/Hero';
import { MetaMark } from './_site/MetaMark';
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
        <p className="nav-by">
          <img src={SITE.author.avatar} alt="" width={28} height={28} />
          <span>Built by <a href={SITE.author.url} target="_blank" rel="noopener noreferrer">{SITE.author.name}</a></span>
          <a className="nav-icon" href={SITE.author.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${SITE.author.name} on LinkedIn`} title={`${SITE.author.name} on LinkedIn`}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
          </a>
        </p>
        <div className="nav-links">
          <a className="nav-video" href="#demo">Watch Demo Video</a>
        </div>
        <p className="nav-for"><a href={SITE.competition.url} target="_blank" rel="noopener noreferrer"><MetaMark />Meta VR Start Hackathon</a></p>
      </nav>

      <main id="top">
        <Hero vr={vr} judge={!!access} playHref={playHref} />

        {/* ───────── the demo video ───────── */}
        <section className="band demo" id="demo">
          <div className="wrap">
            <Demo />
          </div>
        </section>

        {/* ───────── how it works ───────── */}
        <section className="band how" id="how">
          <div className="wrap">
            <h2 className="pixel-head">Clear your inbox, one game at a time</h2>

            <ol className="steps">
              <li style={{ '--c': 'var(--teal)' } as React.CSSProperties}>
                <Pixels art={ICON_PLUG} />
                <h3>Connect MCP</h3>
                <p>Add the MCP to your favourite agent, the one that reads your email.</p>
                <code className="mcp-url">https://<wbr />{SITE.mcp.replace('https://', '')}</code>
              </li>
              <li style={{ '--c': 'var(--pink)' } as React.CSSProperties}>
                <Pixels art={ICON_LETTER} />
                <h3>Create a Game</h3>
                <p>Ask your agent for a game. It summarizes your unread emails and gives you a 4-digit code.</p>
              </li>
              <li style={{ '--c': 'var(--blue)' } as React.CSSProperties}>
                <Pixels art={ICON_SWORD} />
                <h3>Play Inbox Zero</h3>
                <p>Type in the code. Smash or keep each email, then reply. Your agent does the rest.</p>
              </li>
            </ol>

            <aside className="privacy">
              <Pixels art={ICON_LOCK} />
              <div>
                <h3>The game never touches your inbox</h3>
                <p>Your agent sends short summaries, never your emails. Your choices go back to your agent, and nothing is kept longer than 4 hours.</p>
              </div>
            </aside>

          </div>
        </section>

        {/* ───────── how to play: the game's own How to Play pop-up, a round at a time (play/guide.html) ───────── */}
        <section className="band howto" id="how-to-play">
          <StarField />
          <div className="wrap">
            <h2 className="pixel-head">How to Play</h2>

            <HowToPlay />
          </div>
        </section>

        {/* ───────── the AI (hidden for now; drop `hidden` and put the nav link back to show it) ───────── */}
        <section className="band ai" id="ai" hidden>
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
                <p>Hold an email against the microphone and talk. Your words appear as you say them, and go to your agent just as you said them.</p>
              </article>
              <article className="wide keep">
                <h3>Deleted when you finish</h3>
                <p>Your agent sends a short summary of each email, never the whole thing. Your agent deletes the game and your choices once it has acted. Anything left is deleted after 4 hours.</p>
                <ul className="ticks">
                  <li>No sign-in, and no access to your mailbox</li>
                  <li>Each email goes under a number only your agent can match to the real one</li>
                  <li>No AI on our side reads your emails or your replies</li>
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
        {/* (hidden for now, 2026-11-15) */}
        <section className="band why" id="why" hidden>
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
            <h2 className="pixel-head">Cut it, smash it, melt it or burn it</h2>
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

        {/* ───────── how the MCP works: the address, what happens, and its three tools (app/mcp/route.ts) ───────── */}
        <section className="band mcp" id="mcp">
          <div className="wrap">
            <h2 className="pixel-head">How the MCP Works</h2>
            <McpUrl url={SITE.mcp} />
            <p className="mcp-lede">Give this URL to your agent and ask for a game. It reads your unread email and sends a short, temporary version: just enough to play one round.</p>
            <p className="mcp-lede">In the game you slash to archive, keep, pick a reply or record your own. When you’re done, your agent does the rest, and everything is deleted from our server.</p>

            <ol className="tools-grid">
              <li>
                <code>create_round</code>
                <h3>Makes the game</h3>
                <p>Your agent sends a summary of each email: who it’s from, the subject, a line on what it wants, and a couple of replies. It gets back a 4-digit code and a link that opens on your Quest.</p>
              </li>
              <li>
                <code>get_results</code>
                <h3>Reads what you chose</h3>
                <p>When you’re done, your agent gets back each email marked archive, reply or leave unread, with the reply you picked or said.</p>
              </li>
              <li>
                <code>delete_round</code>
                <h3>Cleans up</h3>
                <p>Once your agent has acted, it deletes the game and your choices. If it doesn’t, they’re deleted after 4 hours anyway.</p>
              </li>
            </ol>

            <SetupGuides url={SITE.mcp} />
          </div>
        </section>
      </main>

      {/* ───────── made for ───────── */}
      <footer className="foot" id="made">
        <img className="foot-bg" src="/play/home/kyoto.webp" alt="" loading="lazy" aria-hidden />
        <div className="foot-hero" style={{ '--accent': '#f6b3cc' } as React.CSSProperties}>
          <h2 className="pixel-head">Clear your inbox</h2>
          <div className="cta-row">
            <a className="pix ghost" href="#mcp">CONNECT MCP</a>
            <a className="pix" href={playHref}>PLAY DEMO</a>
          </div>
          <div className="foot-bar">
            {/* (the logo also played Kyoto's win, an easter egg: <FootEgg /> from ./_site/FootEgg. Hidden for now, 2026-11-15) */}
            <img className="foot-logo" src="/play/logos/site.webp" alt="Inbox Zero" width={126} height={26} loading="lazy" />
            <div className="foot-by">
              <p className="byline">
                <img src={SITE.author.avatar} alt="" width={28} height={28} loading="lazy" />
                <span>Built by <a href={SITE.author.url} target="_blank" rel="noopener noreferrer">{SITE.author.name}</a></span>
              </p>
              <a className="icon" href={SITE.github} target="_blank" rel="noopener noreferrer" aria-label="Inbox Zero VR on GitHub" title="Source on GitHub">
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
              </a>
              <a className="icon" href={SITE.author.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${SITE.author.name} on LinkedIn`} title={`${SITE.author.name} on LinkedIn`}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* Small pixel pictures (Pixels): '#' is ink, 'a' is the accent, anything else is empty. */
const ICON_PLUG = [
  '...a....a...',
  '...a....a...',
  '...a....a...',
  '.##########.',
  '.##########.',
  '.##########.',
  '..########..',
  '...######...',
  '....####....',
  '.....##.....',
  '.....##.....',
  '.....##.....',
];
const ICON_LETTER = [
  '.....a......',
  '....aaa.....',
  '.....a......',
  '############',
  '#a........a#',
  '#.a......a.#',
  '#..a....a..#',
  '#...a..a...#',
  '#....aa....#',
  '#..........#',
  '############',
];
const ICON_SWORD = [
  '..........aa',
  '.........aa.',
  '........aa..',
  '.......aa...',
  '......aa....',
  '..#..aa.....',
  '...#aa......',
  '....#.......',
  '...#.#......',
  '..#...#.....',
  '##..........',
  '##..........',
];
const ICON_LOCK = [
  '....####....',
  '...#....#...',
  '..#......#..',
  '..#......#..',
  '.##########.',
  '.##########.',
  '.####..####.',
  '.####..####.',
  '.##########.',
  '.##########.',
];

function Pixels({ art }: { art: string[] }) {
  const cells = art.flatMap((row, y) => [...row].map((c, x) => (c === '#' || c === 'a' ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} className={c === 'a' ? 'a' : undefined} /> : null)));
  return <svg className="pixels" viewBox={`0 0 ${art[0].length} ${art.length}`} width={84} height={60} shapeRendering="crispEdges" aria-hidden>{cells}</svg>;
}
