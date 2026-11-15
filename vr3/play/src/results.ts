import { mail, type GameResults } from './mail/source';
import { KEYPAD_SHADOW, pixelLabel, pixelSentence } from './home';
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
/** The replies under the counts, each under who it goes to: off, the player reviews them with their agent. */
const SHOW_REPLIES = false;

export function bindResults() {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const box = $('results'), title = $('results-title'), tally = $('results-tally');
  const list = $('results-replies'), lead = $('results-lead'), status = $('results-status');
  const again = $<HTMLButtonElement>('results-again'), back = $<HTMLButtonElement>('results-back');
  const accent = () => getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#f6b3cc';
  pixelLabel($('results-note-title'), 'Your Agent has Your Results', 4, '#ffffff', KEYPAD_SHADOW);
  let shown: GameResults | null = null;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  /** A tile's number counting up from 0 to `n`, starting `delay` seconds from now, over at most 0.7 s. */
  function countUp(el: HTMLElement, n: number, delay: number) {
    const start = performance.now() + delay * 1000, span = Math.min(0.7, 0.08 * n) * 1000;
    let shown = 0;
    const step = (now: number) => {
      if (!el.isConnected) return;
      const k = span ? Math.min(1, Math.max(0, (now - start) / span)) : now >= start ? 1 : 0, value = Math.round(n * (1 - (1 - k) ** 2));
      if (value !== shown) { shown = value; pixelLabel(el, String(value), 5, '#14121a'); }
      if (k < 1) requestAnimationFrame(step);
    };
    if (n > 0) requestAnimationFrame(step);
  }
  function render(r: GameResults) {
    // (the near-black drop, as on the keypad; no GAME 1234 under it: the code shows top right, 2026-11-14)
    pixelLabel(title, 'Inbox Cleared', 5, accent(), KEYPAD_SHADOW);
    // the counts
    tally.replaceChildren();
    const counts: [number, string, string][] = [[r.archived.length, 'Archived', MARKS.cut], [r.replies.length, r.replies.length === 1 ? 'Reply' : 'Replies', MARKS.reply]];
    if (r.left.length) counts.push([r.left.length, 'Left Unread', MARKS.tomorrow]);
    // full-colour tiles, number and word in a row in dark letters; each pops in after the one before and counts up to its number
    counts.forEach(([n, word, colour], i) => {
      const tile = document.createElement('div'); tile.className = 'tally pixbox';
      tile.style.setProperty('--c', colour); tile.style.setProperty('--d', `${0.12 + i * 0.12}s`);
      const number = document.createElement('span'), name = document.createElement('span'); number.className = 'n'; name.className = 'w';
      // (room for the final number from the start, so the tile does not grow as it counts)
      pixelLabel(number, String(n), 5, '#14121a'); number.style.minWidth = (number.firstElementChild as HTMLCanvasElement).style.width;
      pixelLabel(number, '0', 5, '#14121a'); pixelLabel(name, word, 2.5, '#14121a');
      tile.setAttribute('role', 'group'); tile.setAttribute('aria-label', `${n} ${word}`);
      tile.append(number, name); tally.append(tile);
      countUp(number, n, 0.2 + i * 0.12);
    });
    // the replies, each under who it goes to
    // (not shown since 2026-11-14: "hide the your replies, since that would be reviewed in the agent"; the agent shows them)
    list.replaceChildren();
    list.hidden = true;
    if (SHOW_REPLIES && r.replies.length) {
      list.hidden = false;
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
    // (2026-11-14: "You can play again to retry, or go back to your Agent and approve the X archives, and 4 replies"; nothing on what was left)
    // in the pixel letters, the counts in their tiles' colours (2026-11-14: "pixel the under text ( and larger )")
    const parts: { text: string; strong: boolean; colour?: string }[] = [{ text: 'You can play again to retry, or go back to your agent', strong: false }];
    const archives = r.archived.length ? plural(r.archived.length, 'archive', 'archives') : '', replies = r.replies.length ? plural(r.replies.length, 'reply', 'replies') : '';
    if (archives || replies) {
      parts.push({ text: ' and approve the ', strong: false });
      if (archives) parts.push({ text: archives, strong: true, colour: MARKS.cut });
      if (archives && replies) parts.push({ text: ' and ', strong: false });
      if (replies) parts.push({ text: replies, strong: true, colour: MARKS.reply });
    }
    pixelSentence(lead, parts, 2.5, '#ffffff', accent());
  }
  function showStatus(r: GameResults) {
    status.textContent = r.sent === 'sending' ? 'Sending your choices to your agent...'
      : r.sent === 'failed' ? `Your choices didn't reach your agent (${r.error}). Ask it for a new code and play again.`
      : r.sent === 'ok' && r.replay ? 'Played again: your agent now has these choices in place of the last game\'s.'
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
  // MOCK, top left by the mic: the results screen with mock data. Hidden since 2026-11-14 ("you can hide the mock button - the end
  // scene is polished"): a dev build shows it again with ?mock=1 in the address.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('mock') === '1') {
    const mock = $<HTMLButtonElement>('mock-results');
    mock.hidden = false;
    mock.addEventListener('click', () => { uiSound('confirm'); mail.mockResults(); });
  }
  refresh();
  return { refresh };
}
