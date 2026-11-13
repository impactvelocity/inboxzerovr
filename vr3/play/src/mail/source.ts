import { Emails, dictation, type Email } from './emails';
import baked from './demo-inbox.json';
import {
  CountChoices, DefaultCount, MaxCount,
  type ApplyResponse, type DemoInbox, type InboxLine, type MeResponse, type PolishResponse, type RepliesResponse, type WireEmail, type WireReply,
} from './wire';

/**
 * Where a game's emails come from (2026-11-12): the demo inbox, or the player's own Gmail.
 *
 * Demo: the baked demo inbox (src/mail/demo-inbox.json, real-looking emails with replies already
 * written) when there is one, otherwise the made-up inbox in emails.ts. Everyone gets this.
 *
 * Gmail: only with the access code (a ?access= link) and a sign-in. The site's API (vr3/app/api)
 * reads the newest unread emails and sorts each into a card; this file holds them for one game:
 *   - an email that needs an answer starts its two replies being written as it comes in, any
 *     other one when it is kept, so they are ready by round two
 *   - round two shows them as soon as they are (WRITING... until then, and they cannot be sent yet)
 *   - a reply sent, or a dictation kept, becomes the text of a draft
 *   - at the end: cut emails are archived and the drafts saved (POST /api/apply). Kept and later
 *     change nothing, so the inbox looks as it did, less what was cut.
 * Nothing is stored: the cards and drafts live here until the game is over.
 *
 * letters.ts calls deck(), arrived(), settled(), repliesReady(), sent() and finish(); the home
 * screen (src/mailui.ts) shows the state and its choices.
 */

export type MailMode = 'demo' | 'gmail';
export const WRITING = 'WRITING A REPLY...';

const demo = baked as DemoInbox;
const KEY = 'vr3.mail';

interface Pending { abort: AbortController; done: Promise<WireReply[] | null>; replies: WireReply[] | null }
interface Outcome { cut: boolean; draft: Promise<string | null> | null }

function load(): { mode: MailMode; count: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { mode: saved.mode === 'gmail' ? 'gmail' : 'demo', count: CountChoices.includes(saved.count) ? saved.count : DefaultCount };
  } catch { return { mode: 'demo', count: DefaultCount }; }
}

function toEmail(w: WireEmail): Email {
  return { ...w, replies: [WRITING, WRITING] };
}

function createMail() {
  const saved = load();
  const listeners = new Set<() => void>();
  const told = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  const state = {
    /** What the server says (null until it has answered, or if there is no server: the game alone). */
    me: null as MeResponse | null,
    /** Which inbox the player chose. Gmail plays only when connected and its emails are in. */
    mode: saved.mode as MailMode,
    /** How many emails a game takes. */
    count: saved.count as number,
    inbox: { state: 'idle' as 'idle' | 'loading' | 'ready' | 'failed', expected: 0, loaded: 0, unread: 0, ai: false, error: '' },
    /** A line for the home screen: what happened with the sign-in, or the last game's write-back. */
    notice: '',
    /** Is the game being played on real mail just now? */
    playing: false,
    /** Busy writing back to Gmail after a game. */
    applying: false,
  };

  let cards: (Email | null)[] = [];
  let ticket = 0;
  const pending = new Map<Email, Pending>();
  const outcomes = new Map<Email, Outcome>();
  /** Called when an email's replies come in, so round two can show them if it is up. */
  let onReplies: ((email: Email) => void) | null = null;

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ mode: state.mode, count: state.count })); } catch { /* private window */ } };

  async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal });
    if (r.status === 401) { signedOut(); throw new Error('signed out'); }
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json() as Promise<T>;
  }

  function signedOut() {
    if (state.me) state.me = { ...state.me, connected: false, email: undefined, name: undefined };
    cards = []; state.inbox.state = 'idle'; state.notice = 'Gmail signed out: connect again to play your inbox.';
    told();
  }

  /** The demo's emails: the baked inbox if there is one, otherwise the made-up one. */
  function demoEmails(): Email[] {
    if (!demo.emails.length) return [...Emails];
    return demo.emails.map(b => ({ ...b, replies: [b.replies[0].short, b.replies[1].short] as [string, string] }));
  }
  const demoById = new Map(demo.emails.map(b => [b.id, b]));

  async function refresh() {
    try { state.me = await api<MeResponse>('/api/me'); }
    catch { state.me = null; }          // (no server: the game on its own, the demo only)
    told();
    if (gmailOn() && state.inbox.state === 'idle') void fetchInbox();
  }

  const gmailOn = () => state.mode === 'gmail' && !!state.me?.connected;

  /** Reads the inbox: the cards stream in one by one, in inbox order. */
  async function fetchInbox() {
    const mine = ++ticket;
    cards = []; state.inbox = { state: 'loading', expected: state.count, loaded: 0, unread: 0, ai: false, error: '' }; told();
    try {
      const r = await fetch(`/api/inbox?count=${state.count}`, { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) { signedOut(); return; }
      if (!r.ok || !r.body) throw new Error(`the inbox said ${r.status}`);
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let rest = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (mine !== ticket) { void reader.cancel(); return; }
        rest += value ?? '';
        const lines = rest.split('\n'); rest = lines.pop() ?? '';
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const line = JSON.parse(raw) as InboxLine;
          if (line.type === 'meta') { state.inbox.expected = line.count; state.inbox.unread = line.unread; state.inbox.ai = line.ai; cards = new Array(line.count).fill(null); }
          else if (line.type === 'email') { cards[line.index] = toEmail(line.email); state.inbox.loaded++; }
          else if (line.type === 'error') console.warn(`[mail] ${line.message}`);
        }
        told();
        if (done) break;
      }
      state.inbox.state = 'ready';
    } catch (e) {
      if (mine !== ticket) return;
      state.inbox.state = 'failed'; state.inbox.error = (e as Error).message;
    }
    told();
  }

  /** Start writing an email's two replies, if they are not already being written. */
  function draftReplies(email: Email) {
    if (!state.playing || !email.id || pending.has(email)) return;
    const abort = new AbortController();
    const p: Pending = { abort, replies: null, done: Promise.resolve(null) };
    p.done = api<RepliesResponse>('/api/replies', { id: email.id, threadId: email.threadId }, abort.signal)
      .then(r => {
        p.replies = r.replies;
        email.replies = [r.replies[0].short, r.replies[1].short];
        onReplies?.(email);
        return r.replies;
      })
      .catch(e => {
        if (abort.signal.aborted) return null;
        console.warn(`[mail] replies for "${email.subject}": ${(e as Error).message}`);
        const stock: WireReply[] = [{ short: 'Thanks, sounds good to me!', full: 'Thanks, sounds good to me!' }, { short: 'Thanks! Can we talk about this later this week?', full: 'Thanks! Can we talk about this later this week?' }];
        p.replies = stock; email.replies = [stock[0].short, stock[1].short]; onReplies?.(email);
        return stock;
      });
    pending.set(email, p);
  }

  return {
    state,
    /** Something changed (for the home screen). Returns a function that stops listening. */
    listen(f: () => void) { listeners.add(f); return () => listeners.delete(f); },

    /** At startup: the ?access= code (traded for a cookie, then taken out of the address), what came back from a sign-in, and what the server says. */
    async init() {
      const url = new URL(location.href);
      const code = url.searchParams.get('access'), back = url.searchParams.get('gmail');
      if (code !== null || back !== null) {
        url.searchParams.delete('access'); url.searchParams.delete('gmail');
        history.replaceState(history.state, '', url.pathname + (url.search === '?' ? '' : url.search) + url.hash);
      }
      if (code) {
        try { await api('/api/access', { code }); state.notice = 'Invite accepted: you can connect Gmail.'; }
        catch { state.notice = 'That invite link did not work.'; }
      }
      // (the sign-in only comes back with ?gmail= when it went wrong)
      if (back) state.notice = back === 'denied' ? 'Gmail was not connected: access was not given.' : back === 'expired' ? 'The sign-in took too long: try again.' : 'Gmail could not be connected: try again.';
      await refresh();
    },

    setMode(mode: MailMode) {
      if (mode === state.mode) return;
      state.mode = mode; save(); told();
      if (gmailOn() && state.inbox.state !== 'loading') void fetchInbox();
    },
    setCount(count: number) {
      const n = Math.max(1, Math.min(MaxCount, Math.round(count)));
      if (n === state.count) return;
      state.count = n; save(); told();
      if (gmailOn()) void fetchInbox();
    },
    /** Off to Google's sign-in, coming back to this page with Gmail chosen. */
    connect() {
      state.mode = 'gmail'; save();
      location.href = `/api/auth/google?back=${encodeURIComponent(location.pathname)}`;
    },
    async signOut() {
      ticket++; cards = []; state.inbox.state = 'idle';
      try { await api('/api/auth/signout', {}); } catch { /* gone anyway */ }
      state.mode = 'demo'; save();
      await refresh();
      state.notice = 'Signed out of Gmail.'; told();
    },
    reload() { if (gmailOn()) void fetchInbox(); },

    /** Is the next game on real mail? (Gmail chosen, connected, and at least one email in.) */
    gmailReady: () => gmailOn() && cards.some(Boolean),
    /** The demo's emails, for letters.ts to shuffle. */
    demoEmails,

    /** Round one's emails: real mail if it is ready (in inbox order, up to `n`), else null for the demo. */
    deck(n: number): Email[] | null {
      for (const p of pending.values()) p.abort.abort();
      pending.clear(); outcomes.clear();
      const real = gmailOn() ? cards.filter((c): c is Email => !!c) : [];
      state.playing = real.length > 0;
      told();
      if (!state.playing) return null;
      for (const c of real) c.replies = [WRITING, WRITING];
      return real.slice(0, n);
    },
    /** An email has come in: if it needs an answer, its replies start being written now. */
    arrived(email: Email) { if (state.playing && email.needsReply) draftReplies(email); },
    /** What became of an email in round one ('cut', 'kept', 'missed'). */
    settled(email: Email, what: string) {
      if (!state.playing || !email.id) return;
      const o = outcomes.get(email) ?? { cut: false, draft: null };
      o.cut = what === 'cut';
      outcomes.set(email, o);
      if (what === 'kept') draftReplies(email);
      if (what === 'cut') { const p = pending.get(email); if (p && !p.replies) { p.abort.abort(); pending.delete(email); } }
    },
    /** Are the replies on this email real yet? (Demo emails always are.) */
    repliesReady(email: Email) { return !state.playing || !email.id || !!pending.get(email)?.replies; },
    /** Round two is up and waiting on an email's replies: make sure they are being written. */
    want(email: Email) { if (state.playing && email.id) draftReplies(email); },
    set onReplies(f: ((email: Email) => void) | null) { onReplies = f; },
    /** What the mock mic types out when there is no real one. */
    mockWords(email: Email): string {
      if (email.id && demoById.has(email.id)) return demoById.get(email.id)!.said;
      const p = email.id ? pending.get(email) : undefined;
      return p?.replies?.[0]?.full.split('\n').filter(l => l.trim() && !/^(hi|hey|hello|dear|best|thanks|cheers)\b/i.test(l.trim())).join(' ') || dictation(email);
    },
    /** Round two: a reply was sent (0 or 1), or what was said into the mic was kept. */
    sent(email: Email, how: { reply: number } | { said: string }) {
      if (!state.playing || !email.id) return;
      const o = outcomes.get(email) ?? { cut: false, draft: null };
      o.cut = false;
      if ('reply' in how) o.draft = (pending.get(email)?.done ?? Promise.resolve(null)).then(r => r?.[how.reply]?.full ?? null);
      else o.draft = api<PolishResponse>('/api/polish', { id: email.id, said: how.said }).then(r => r.full).catch(() => how.said);
      outcomes.set(email, o);
    },

    /** A game left before its end (Esc, the menu, another level): nothing is done to Gmail. */
    abandon() {
      if (!state.playing) return;
      state.playing = false;
      for (const p of pending.values()) p.abort.abort();
      pending.clear(); outcomes.clear(); told();
    },

    /** The game is over: archive what was cut and save the drafts. Then the inbox is read again for the next game. */
    async finish(): Promise<ApplyResponse | null> {
      if (!state.playing) return null;
      state.playing = false;
      for (const p of pending.values()) if (!p.replies) p.abort.abort();
      const archive: string[] = [], drafts: { id: string; body: string }[] = [];
      const waits: Promise<void>[] = [];
      for (const [email, o] of outcomes) {
        if (!email.id) continue;
        if (o.cut) archive.push(email.id);
        else if (o.draft) waits.push(o.draft.then(body => { if (body) drafts.push({ id: email.id!, body }); }));
      }
      await Promise.all(waits);
      pending.clear(); outcomes.clear();
      if (!archive.length && !drafts.length) { state.notice = 'Last game: nothing to change in Gmail.'; told(); void fetchInbox(); return { archived: 0, drafts: 0, failed: [] }; }
      state.applying = true; told();
      try {
        const r = await api<ApplyResponse>('/api/apply', { archive, drafts });
        const bits = [r.archived ? `${r.archived} archived` : '', r.drafts ? `${r.drafts} ${r.drafts === 1 ? 'reply saved as a draft' : 'replies saved as drafts'}` : ''].filter(Boolean);
        state.notice = `Last game: ${bits.join(', ') || 'nothing changed'} in Gmail.${r.failed.length ? ` ${r.failed.length} could not be done.` : ''}`;
        return r;
      } catch (e) {
        state.notice = `Last game: Gmail could not be updated (${(e as Error).message}).`;
        return null;
      } finally {
        state.applying = false; told();
        void fetchInbox();
      }
    },
  };
}

export const mail = createMail();
