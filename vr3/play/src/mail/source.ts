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
 * said into the mic is written up as an email by the server's one model. The agent reads that,
 * checks with the player, and does the archiving and replying itself.
 *
 * Gmail sign-in, reading the inbox and the models that sorted it and wrote replies were here
 * until 2026-11-13; the agent does all of that now.
 *
 * letters.ts calls deck(), arrived(), settled(), repliesReady(), want(), mockWords(), sent(),
 * abandon() and finish(); the home screen (src/mailui.ts) shows the state.
 */

/** The agent round's code, for this tab until it is played (a reload, or the headset waking, keeps it). */
const ROUND_KEY = 'vr3.round';
const remember = (code: string) => { try { if (code) sessionStorage.setItem(ROUND_KEY, code); else sessionStorage.removeItem(ROUND_KEY); } catch { /* private window */ } };
const remembered = () => { try { return sessionStorage.getItem(ROUND_KEY) ?? ''; } catch { return ''; } };

interface Outcome { cut: boolean; reply?: number; said?: string }

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
    /** An agent round, by its code: the next game plays it when it is ready. */
    round: { code: '', title: '', state: 'idle' as 'idle' | 'loading' | 'ready' | 'failed' | 'sending', count: 0, error: '' },
  };

  let roundCards: Email[] = [];
  let roundTicket = 0;
  const outcomes = new Map<Email, Outcome>();

  function clearCode() {
    roundTicket++; roundCards = []; remember('');
    if (state.round.code || state.round.state !== 'idle') { state.round = { code: '', title: '', state: 'idle', count: 0, error: '' }; told(); }
  }

  /** Fetches an agent round by its code. */
  async function loadRound(code: string) {
    const mine = ++roundTicket;
    roundCards = [];
    state.round = { code, title: '', state: 'loading', count: 0, error: '' }; told();
    try {
      const r = await fetch(`/api/rounds/${encodeURIComponent(code)}`, { credentials: 'same-origin', cache: 'no-store' });
      const body = await r.json().catch(() => ({})) as AgentRoundResponse & { error?: string };
      if (mine !== roundTicket) return;
      if (!r.ok) throw new Error(body.error || `the server said ${r.status}`);
      roundCards = body.emails.map((c: AgentCard): Email => ({ ...c, id: c.ref, replies: [c.replies[0], c.replies[1]] }));
      state.round = { code, title: body.title, state: roundCards.length ? 'ready' : 'failed', count: roundCards.length, error: roundCards.length ? '' : 'That round has no emails.' };
      state.notice = '';
      remember(code);
    } catch (e) {
      if (mine !== roundTicket) return;
      state.round = { code, title: '', state: 'failed', count: 0, error: (e as Error).message };
      remember('');
    }
    told();
  }

  /** The end of an agent round: what was done with each email goes to the agent (through the server). */
  async function finishRound() {
    const outs: AgentOutcome[] = [];
    for (const [email, o] of outcomes) {
      if (!email.id) continue;
      if (o.cut) outs.push({ ref: email.id, action: 'archive' });
      else if (o.said !== undefined) outs.push({ ref: email.id, action: 'reply', dictated: o.said });
      else if (o.reply !== undefined) outs.push({ ref: email.id, action: 'reply', reply_index: o.reply });
    }
    outcomes.clear();
    const code = state.round.code;
    state.round.state = 'sending'; told();
    try {
      const r = await fetch(`/api/rounds/${code}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcomes: outs }), credentials: 'same-origin', cache: 'no-store' });
      const body = await r.json().catch(() => ({})) as AgentResultsResponse & { error?: string };
      if (!r.ok) throw new Error(body.error || `the server said ${r.status}`);
      const bits = [body.archive ? `${body.archive} to archive` : '', body.reply ? `${body.reply} ${body.reply === 1 ? 'reply' : 'replies'}` : '', body.leave ? `${body.leave} left as they are` : ''].filter(Boolean);
      state.notice = `Game ${code} sent to your agent: ${bits.join(', ') || 'nothing to do'}. Tell your agent you're done.`;
      roundTicket++; roundCards = []; remember('');
      state.round = { code: '', title: '', state: 'idle', count: 0, error: '' };
    } catch (e) {
      state.notice = `Game ${code}: the results could not be sent (${(e as Error).message}).`;
      state.round.state = 'failed'; state.round.error = (e as Error).message;
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
      if (round && /^\d{4}$/.test(round.trim())) void loadRound(round.trim());
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
    /** Is the next game an agent round? */
    roundReady: () => state.round.state === 'ready' && roundCards.length > 0,

    /** The demo's emails, for letters.ts to shuffle. */
    demoEmails: (): Email[] => [...Emails],

    /** Round one's emails: an agent round if one is ready (all of it, in the agent's order), else null for the demo. */
    deck(_n: number): Email[] | null {
      outcomes.clear();
      state.playing = state.round.state === 'ready' && roundCards.length > 0;
      told();
      if (!state.playing) return null;
      return roundCards.map(c => ({ ...c, replies: [c.replies[0], c.replies[1]] as [string, string] }));
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
      if ('reply' in how) { o.reply = how.reply; o.said = undefined; } else { o.said = how.said === dictation(email) ? '' : how.said; o.reply = undefined; }
      outcomes.set(email, o);
    },

    /** A game left before its end (Esc, the menu, another level): nothing is sent, and the round can be played again. */
    abandon() {
      if (!state.playing) return;
      state.playing = false;
      outcomes.clear(); told();
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
