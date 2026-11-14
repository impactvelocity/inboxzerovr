import { mail, type GameResults } from './mail/source';
import { pixelLabel } from './home';
import { MARKS } from './roundui';
import { uiSound } from './uisound';

/**
 * The results of a real game (2026-11-14, asked for: "after a game is done, and they exit, this would be a "real
 * game", so I want to have a different page / screen on exit - this would give them their 8 Archived, 2 replies
 * ( and show replies ), a button to replay again ( lets say it was their first time, and didnt really understand
 * it ), and a message about tell your agent your done, and how your email wasn't touched, and the game data will be
 * deleted", "also a button to go back, which will go to normal homepage, no code added").
 *
 * It takes the level select's place on the home screen (the level's picture and logo stay) until the player leaves
 * it: Play Again plays the same emails once more, with How to Play first; Back is the home screen as it is for anyone
 * with no code. A mock round (code 1234, MOCK_CODE in src/mail/source.ts) shows the same screen.
 * The counts' colours are the progress bar's (roundui.ts MARKS): archived as cut, replies as sent, the rest as later.
 */
export function bindResults() {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const box = $('results'), title = $('results-title'), sub = $('results-sub'), tally = $('results-tally');
  const list = $('results-replies'), lead = $('results-lead'), status = $('results-status');
  const again = $<HTMLButtonElement>('results-again'), back = $<HTMLButtonElement>('results-back');
  const accent = () => getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#f6b3cc';
  pixelLabel($('results-note-title'), "Tell your agent you're done", 2, '#ffffff');
  let shown: GameResults | null = null;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  function render(r: GameResults) {
    pixelLabel(title, 'Inbox Cleared', 5, accent());
    pixelLabel(sub, `Game ${r.code}`, 2, '#ffffff');
    // the counts
    tally.replaceChildren();
    const counts: [number, string, string][] = [[r.archived.length, 'Archived', MARKS.cut], [r.replies.length, r.replies.length === 1 ? 'Reply' : 'Replies', MARKS.reply]];
    if (r.left.length) counts.push([r.left.length, 'Left Unread', MARKS.tomorrow]);
    for (const [n, word, colour] of counts) {
      const tile = document.createElement('div'); tile.className = 'tally pixbox'; tile.style.setProperty('--edge', `color-mix(in srgb, ${colour} 55%, #2b2735)`);
      const number = document.createElement('span'), name = document.createElement('span'); number.className = 'n'; name.className = 'w';
      pixelLabel(number, String(n), 6, colour); pixelLabel(name, word, 2, '#ffffff');
      tile.setAttribute('role', 'group'); tile.setAttribute('aria-label', `${n} ${word}`);
      tile.append(number, name); tally.append(tile);
    }
    // the replies, each under who it goes to
    list.replaceChildren();
    list.hidden = !r.replies.length;
    if (r.replies.length) {
      const heading = document.createElement('h3'); heading.className = 'results-h'; pixelLabel(heading, r.replies.length === 1 ? 'Your Reply' : 'Your Replies', 2, '#ffffff'); list.append(heading);
      for (const reply of r.replies) {
        const row = document.createElement('article'); row.className = 'reply-row';
        const to = document.createElement('p'); to.className = 'reply-to';
        const who = document.createElement('b'); who.textContent = `To ${reply.from}`; to.append(who, ` · ${reply.subject}`);
        const said = document.createElement('p'); said.className = 'reply-text pixbox';
        const tag = document.createElement('span'); tag.className = 'reply-tag'; pixelLabel(tag, reply.how === 'mic' ? 'Your words' : `Reply ${reply.how}`, 1.5, accent());
        const words = document.createElement('span'); words.textContent = reply.text;
        said.append(tag, words); row.append(to, said); list.append(row);
      }
    }
    // what happens now
    const doing = [r.archived.length ? `archives ${plural(r.archived.length, 'email', 'emails')}` : '', r.replies.length ? `sends ${plural(r.replies.length, 'reply', 'replies')}` : ''].filter(Boolean);
    lead.textContent = doing.length ? `It has your choices, and checks with you before it ${doing.join(' and ')}.` : 'It has your choices, and checks with you before it does anything.';
  }
  function showStatus(r: GameResults) {
    status.textContent = r.sent === 'sending' ? 'Sending your choices to your agent...'
      : r.sent === 'failed' ? `Your choices didn't reach your agent (${r.error}). Ask it for a new code and play again.`
      : r.sent === 'already' ? 'This was a replay: your agent keeps the choices from your first game.'
      : '';
    status.hidden = !status.textContent;
  }

  /** Show the results if there are some and the player is home (not in a game). */
  function refresh() {
    const r = mail.state.results, on = !!r && !document.body.classList.contains('playing');
    document.body.classList.toggle('show-results', on);
    box.hidden = !on;
    if (!r) { shown = null; return; }
    if (on && r !== shown) { render(r); shown = r; requestAnimationFrame(() => again.focus({ preventScroll: true })); }
    if (on) showStatus(r);
  }

  pixelLabel(again, 'Play Again', 3, '#14121a');
  again.addEventListener('click', () => {
    uiSound('confirm');
    if (!mail.replay()) return;      // (a game from a code: How to Play comes first, src/howto.ts)
    // (inside this click, so a headset still counts entering VR as the player's own press)
    $<HTMLButtonElement>('start').click();
  });
  back.addEventListener('click', () => { uiSound('back'); mail.dismissResults(); mail.clearCode(); refresh(); });
  mail.listen(refresh);
  refresh();
  return { refresh };
}
