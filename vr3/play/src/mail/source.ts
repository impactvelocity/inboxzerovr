import { Emails, dictation, type Email } from './emails';
import type { AgentCard, AgentOutcome, AgentResultsResponse, AgentRoundResponse } from './wire';

/**
 * Where a game's emails come from: the demo inbox, or an agent round.
 *
 * Demo: the made-up inbox in emails.ts. Everyone gets this, and nothing leaves the game.
 *
 * Agent round (2026-11-13): the player's own AI agent sent a round of their emails, already
 * summarised and with reply drafts, to vr3/app/mcp (or /api/rounds) and told them a 4-digit code.
 * With a code typed in (the Inbox card, or ?code= in the address; the tab keeps it until played)
 * the next game is that round. Nothing is drafted here: the agent wrote the replies. At the end
 * the game says what was done with each email (POST /api/rounds/{code}/results), where what was
 * said into the mic goes as it was heard: the agent writes the email from it. The agent reads that,
 * checks with the player, and does the archiving and replying itself.
 *
 * Gmail sign-in, reading the inbox and the models that sorted it and wrote replies were here
 * until 2026-11-13; the agent does all of that now.
 *
 * Mock rounds (2026-11-14, "allow any number to "play" a real game until we make that real, it will load demo
 * emails, but act as if it was real"): a code with no agent round behind it (or no server to ask) plays a round
 * made from the demo inbox, picked by the code so the same code is the same inbox. It acts as a real game does:
 * the How to Play intro first (src/howto.ts), and at the end the results screen (src/results.ts), but nothing is
 * sent anywhere. Just Play is still the plain demo.
 *
 * letters.ts calls deck(), arrived(), settled(), repliesReady(), want(), mockWords(), sent(),
 * abandon() and finish(); the home screen (src/mailui.ts) shows the state.
 */

/** The agent round's code, for this tab until it is played (a reload, or the headset waking, keeps it). */
const ROUND_KEY = 'vr3.round';
const remember = (code: string) => { try { if (code) sessionStorage.setItem(ROUND_KEY, code); else sessionStorage.removeItem(ROUND_KEY); } catch { /* private window */ } };
const remembered = () => { try { return sessionStorage.getItem(ROUND_KEY) ?? ''; } catch { return ''; } };

interface Outcome { cut: boolean; reply?: number; said?: string; words?: string }

/** One email in the results, as the player saw it. */
export interface ResultLine { from: string; subject: string }
export interface ResultReply extends ResultLine { text: string; how: 'A' | 'B' | 'mic' }
/**
 * What a real game (an agent round, or a mock one) came to, for the results screen (src/results.ts):
 * what was archived, the replies and their words, what was left. `sent` is how giving it to the agent went.
 */
export interface GameResults {
  code: string; title: string; mock: boolean; replay: boolean;
  archived: ResultLine[]; replies: ResultReply[]; left: ResultLine[];
  sent: 'mock' | 'sending' | 'ok' | 'failed' | 'already'; error: string;
}

/**
 * The one code that finds a game while agent rounds are mocked (2026-11-14: "for now lets mock 1234 as the only real
 * game code, the rest can produce not found so we can try that"). A real agent round, by its own code, still plays.
 */
export const MOCK_CODE = '1234';

/** A mock round's emails: the demo inbox, picked and ordered by the code (the same code, the same inbox). */
function mockRound(code: string): Email[] {
  let seed = (parseInt(code, 10) || 1) * 2654435761 % 4294967296;
  const dice = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const mix = <T,>(list: T[]) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(dice() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  const n = 10 + Math.floor(dice() * 5), real = Math.round(n * 0.4);      // 10 to 14 emails, about four in ten worth keeping
  const keep = mix(Emails.filter(e => e.kind === 'Real')).slice(0, real), junk = mix(Emails.filter(e => e.kind === 'Junk')).slice(0, n - real);
  const deck = mix([...keep, ...junk]).map((e, i): Email => ({ ...e, replies: [e.replies[0], e.replies[1]], id: `m${i + 1}`, needsReply: e.kind === 'Real', special: false }));
  const special = deck.find(e => e.kind === 'Real'); if (special) special.special = true;      // (one that matters, as an agent marks it)
  return deck;
}

function createMail() {
  const listeners = new Set<() => void>();
  const told = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  const state = {
    /** How many emails a game takes: 0 lets the game choose (the demo's own range; an agent round is all of it). */
    count: 0,
    /** A line for the home screen: how the last agent round went. */
    notice: '',
    /** Is the game being played on an agent round just now? */
    playing: false,
    /** An agent round, by its code: the next game plays it when it is ready. `mock`: no agent sent it; it is made from the demo inbox (MOCK_CODE).
     *  'missing': no game has that code (typed on the keypad, which says so). */
    round: { code: '', title: '', state: 'idle' as 'idle' | 'loading' | 'ready' | 'missing' | 'failed' | 'sending', count: 0, error: '', mock: false },
    /** The last real game's results, for the results screen, until the player leaves it. */
    results: null as GameResults | null,
  };

  let roundCards: Email[] = [];
  let roundTicket = 0;
  const outcomes = new Map<Email, Outcome>();
  /** The emails as dealt to the game (letters.ts holds these copies), in order, for the results. */
  let dealt: Email[] = [];
  /** The last real game, kept so Play Again on the results screen can play it again. */
  let last: { code: string; title: string; cards: Email[]; mock: boolean; play: string } | null = null;
  /** The token the server gave this game when it opened the round: the results (and a replay's) are posted with it. */
  let playToken = '';
  /** This game is a Play Again of the last one. */
  let replaying = false;
  const idle = () => ({ code: '', title: '', state: 'idle' as const, count: 0, error: '', mock: false });

  function clearCode() {
    roundTicket++; roundCards = []; remember(''); replaying = false;
    if (state.round.code || state.round.state !== 'idle') { state.round = idle(); told(); }
  }

  /** Fetches an agent round by its code. `link`: the code came in the address (or this tab kept it), not from the keypad. */
  async function loadRound(code: string, link = false) {
    const mine = ++roundTicket;
    roundCards = [];
    state.round = { code, title: '', state: 'loading', count: 0, error: '', mock: false }; told();
    try {
      const r = await fetch(`/api/rounds/${encodeURIComponent(code)}`, { credentials: 'same-origin', cache: 'no-store' });
      const body = await r.json().catch(() => ({})) as AgentRoundResponse & { error?: string };
      if (mine !== roundTicket) return;
      if (!r.ok) throw new Error(body.error || `the server said ${r.status}`);
      roundCards = body.emails.map((c: AgentCard): Email => ({ ...c, id: c.ref, replies: [c.replies[0], c.replies[1]] }));
      playToken = body.play ?? '';
      state.round = { code, title: body.title, state: roundCards.length ? 'ready' : 'failed', count: roundCards.length, error: roundCards.length ? '' : 'That round has no emails.', mock: false };
    } catch (e) {
      if (mine !== roundTicket) return;
      if (code !== MOCK_CODE) {
        // (the server allows 8 misses in 10 minutes from one address: past that it says so, which is not "not found")
        const busy = /too many tries/i.test((e as Error).message);
        // no game with that code: the keypad says so; a link's code is dropped, with a line on the home screen
        roundCards = []; remember('');
        if (link) { state.round = idle(); state.notice = busy ? 'Too many tries: wait a few minutes, then enter your code.' : `No inbox found for code ${code}. Check it with your agent.`; }
        else state.round = { code, title: '', state: 'missing', count: 0, error: busy ? 'busy' : 'No game has that code.', mock: false };
        told(); return;
      }
      // the mock code: a round from the demo inbox, played as if real
      roundCards = mockRound(code);
      state.round = { code, title: "Today's inbox", state: 'ready', count: roundCards.length, error: '', mock: true };
    }
    state.notice = '';
    remember(code);
    told();
  }

  /** What the game came to, email by email, in the order they were dealt (for the results screen). */
  function tally(): GameResults {
    const r = state.round, out: GameResults = { code: r.code, title: r.title, mock: r.mock, replay: replaying, archived: [], replies: [], left: [], sent: r.mock ? 'mock' : 'sending', error: '' };
    for (const email of dealt) {
      const o = outcomes.get(email), line = { from: email.from, subject: email.subject };
      if (o?.cut) out.archived.push(line);
      // (in an agent's round the mock mic's words are not the player's: the agent asks them instead, and so says this)
      else if (o?.words !== undefined) out.replies.push({ ...line, text: !r.mock && o.said === '' ? 'Your agent will ask you what you want to say.' : o.words, how: 'mic' });
      else if (o?.reply !== undefined) out.replies.push({ ...line, text: email.replies[o.reply] ?? '', how: o.reply === 1 ? 'B' : 'A' });
      else out.left.push(line);
    }
    return out;
  }

  /** The end of an agent round: what was done with each email goes to the agent (through the server). */
  async function finishRound() {
    const results = state.results = tally();
    last = { code: state.round.code, title: state.round.title, cards: roundCards, mock: state.round.mock, play: playToken };
    if (state.round.mock) {
      // a mock round: nothing to send; it is over, as a real one is once its results are given
      outcomes.clear(); dealt = []; replaying = false;
      roundTicket++; roundCards = []; remember('');
      state.round = idle();
      told(); return;
    }
    const outs: AgentOutcome[] = [];
    for (const [email, o] of outcomes) {
      if (!email.id) continue;
      if (o.cut) outs.push({ ref: email.id, action: 'archive' });
      else if (o.said !== undefined) outs.push({ ref: email.id, action: 'reply', dictated: o.said });
      else if (o.reply !== undefined) outs.push({ ref: email.id, action: 'reply', reply_index: o.reply });
    }
    outcomes.clear(); dealt = []; replaying = false;
    const code = state.round.code;
    state.round.state = 'sending'; told();
    try {
      const r = await fetch(`/api/rounds/${code}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcomes: outs, play: last.play }), credentials: 'same-origin', cache: 'no-store' });
      const body = await r.json().catch(() => ({})) as AgentResultsResponse & { error?: string };
      if (!r.ok) throw new Error(body.error || `the server said ${r.status}`);
      void body;
      results.sent = 'ok';
      roundTicket++; roundCards = []; remember('');
      state.round = idle();
    } catch (e) {
      // (a Play Again replaces the agent's results when it is finished, 2026-11-15; 'already' was the old 409, when the first game's choices stood)
      const message = (e as Error).message;
      results.sent = /already played/i.test(message) ? 'already' : 'failed'; results.error = message;
      if (results.sent === 'already') { roundTicket++; roundCards = []; remember(''); state.round = idle(); }
      else { state.round.state = 'failed'; state.round.error = message; }
    }
    told();
  }

  return {
    state,
    /** Something changed (for the home screen). Returns a function that stops listening. */
    listen(f: () => void) { listeners.add(f); return () => listeners.delete(f); },

    /** At startup: an agent round's ?code= (or the one this tab kept), and a judge's ?access= code (traded for the mic's cookie). Both are taken out of the address. */
    async init() {
      const url = new URL(location.href);
      const access = url.searchParams.get('access'), round = url.searchParams.get('code') ?? remembered();
      if (round && /^\d{4}$/.test(round.trim())) void loadRound(round.trim(), true);
      if (access !== null || url.searchParams.has('code')) {
        url.searchParams.delete('access'); url.searchParams.delete('code');
        history.replaceState(history.state, '', url.pathname + (url.search === '?' ? '' : url.search) + url.hash);
      }
      if (access) {
        const r = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: access }), credentials: 'same-origin' }).catch(() => null);
        state.notice = r?.ok ? 'Judge access is on: the mic writes down what you say.' : 'That access link did not work.';
        told();
      }
    },

    /** A code from the player's agent: the next game is that round (4 digits; anything else clears it). */
    useCode(code: string) {
      const c = code.replace(/\D/g, '');
      if (c.length !== 4) { clearCode(); return; }
      if (c === state.round.code && (state.round.state === 'ready' || state.round.state === 'loading')) return;
      void loadRound(c);
    },
    clearCode,
    /** Is the next game an agent round (a real one, or a mock one)? */
    roundReady: () => state.round.state === 'ready' && roundCards.length > 0,
    /** The results screen is done with: forget them. */
    dismissResults() { if (state.results || state.notice) { state.results = null; state.notice = ''; told(); } },
    /** Play Again, from the results screen: the last real game's emails, once more. False if there is none. */
    replay(): boolean {
      if (!last) return false;
      roundTicket++; roundCards = last.cards; playToken = last.play; replaying = true; state.results = null; state.notice = '';
      state.round = { code: last.code, title: last.title, state: 'ready', count: last.cards.length, error: '', mock: last.mock };
      remember(last.code); told(); return true;
    },

    /**
     * For checks (the MOCK button top left, dev builds only; 2026-11-14: "show the end screen of game with mock data so I can test it"):
     * the results screen as if game 1234 had just been played, with three replies (A, B and the mic), the junk archived and the rest
     * left unread. Play Again on it plays that inbox.
     */
    mockResults() {
      const cards = mockRound(MOCK_CODE), title = "Today's inbox", line = (e: Email): ResultLine => ({ from: e.from, subject: e.subject });
      last = { code: MOCK_CODE, title, cards, mock: true, play: '' };
      const real = cards.filter(e => e.kind === 'Real'), junk = cards.filter(e => e.kind !== 'Real');
      const replies = real.slice(0, 3).map((e, i): ResultReply => i === 2 ? { ...line(e), text: dictation(e), how: 'mic' } : { ...line(e), text: e.replies[i] ?? '', how: i === 0 ? 'A' : 'B' });
      state.results = { code: MOCK_CODE, title, mock: true, replay: false, archived: junk.map(line), replies, left: real.slice(3).map(line), sent: 'mock', error: '' };
      told();
    },

    /** The demo's emails, for letters.ts to shuffle. */
    demoEmails: (): Email[] => [...Emails],

    /** Round one's emails: an agent round if one is ready (all of it, in the agent's order), else null for the demo. */
    deck(_n: number): Email[] | null {
      outcomes.clear();
      state.playing = state.round.state === 'ready' && roundCards.length > 0;
      told();
      if (!state.playing) { dealt = []; return null; }
      return dealt = roundCards.map(c => ({ ...c, replies: [c.replies[0], c.replies[1]] as [string, string] }));
    },
    /** An email has come in. (Agent rounds come with their replies written: nothing to start.) */
    arrived(_email: Email) { /* nothing */ },
    /** What became of an email in round one ('cut', 'kept', 'missed'). */
    settled(email: Email, what: string) {
      if (!state.playing || !email.id) return;
      const o = outcomes.get(email) ?? { cut: false };
      o.cut = what === 'cut';
      outcomes.set(email, o);
    },
    /** Are the replies on this email ready? (Always: the demo's and the agent's are written beforehand.) */
    repliesReady(_email: Email) { return true; },
    /** Round two is up and waiting on an email's replies. (Never: see repliesReady.) */
    want(_email: Email) { /* nothing */ },
    /** Called when an email's replies come in late. (They never do now; kept for letters.ts.) */
    set onReplies(_f: ((email: Email) => void) | null) { /* nothing */ },
    /** What the mock mic types out when there is no real one. */
    mockWords(email: Email): string { return dictation(email); },
    /** Round two: a reply was sent (0 or 1), or what was said into the mic was kept. */
    sent(email: Email, how: { reply: number } | { said: string }) {
      if (!state.playing || !email.id) return;
      const o = outcomes.get(email) ?? { cut: false };
      o.cut = false;
      // (words the mock mic made up are not the player's: the agent is told to ask them instead)
      // (for an agent; the words themselves, mock or not, are kept for the results screen)
      if ('reply' in how) { o.reply = how.reply; o.said = undefined; o.words = undefined; } else { o.said = how.said === dictation(email) ? '' : how.said; o.words = how.said; o.reply = undefined; }
      outcomes.set(email, o);
    },

    /** A game left before its end (Esc, the menu, another level): nothing is sent, and the round can be played again. */
    abandon() {
      if (!state.playing) return;
      state.playing = false;
      outcomes.clear(); dealt = []; told();
    },

    /** The game is over: an agent round's results go to the agent. */
    async finish(): Promise<void> {
      if (!state.playing) return;
      state.playing = false;
      await finishRound();
    },
  };
}

export const mail = createMail();
