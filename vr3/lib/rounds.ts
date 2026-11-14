import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Category } from '../play/src/mail/emails';
import { Categories, type AgentCard, type AgentOutcome, type AgentRoundResponse } from '../play/src/mail/wire';
import { polish } from './ai';
import { clamp, isPersonCard, plainPolish } from './text';
import { store } from './store';

/**
 * Agent rounds (2026-11-13): how anyone plays their own mail. The game never connects to a
 * mailbox; the player's own AI agent already reads theirs, so it sends us a round of emails it has
 * summarised and sorted (each under a reference only it can turn back into a real message), and
 * gets a 4-digit code. The player types the code into the game and plays. The game posts what was
 * done, the emails are deleted at once, and the agent fetches the results, shows them to the
 * player and does the archiving and replying with its own tools.
 *
 * What is kept, and for how long:
 *   - the round as sent (references, sender, subject, summary, sort, reply drafts): until the game
 *     is finished, or `hours` (default 24) if it never is
 *   - the results (references, archive / reply / leave, the chosen reply, or the dictated words and
 *     the email the model made of them):
 *     until 10 minutes after the agent first reads them, or the same `hours`
 *   - the agent can delete a round and its results at any time (cancel)
 * The agent's key is kept only as a SHA-256 hash.
 *
 * Used by the REST routes (app/api/rounds) and the MCP server (app/mcp/route.ts).
 */

const MAX_EMAILS = 30;
const RESULTS_GRACE = 10 * 60;
const prefix = 'izvr:round:';

// ---------------------------------------------------------------- what an agent sends

const CategoryInput = z.preprocess(
  v => typeof v === 'string' ? Categories.find(c => c.toLowerCase() === v.trim().toLowerCase()) ?? v : v,
  z.enum(Categories as [Category, ...Category[]]),
);

export const RoundEmail = z.object({
  ref: z.string().trim().min(1).max(64).describe('Your own reference for this email, so you can find it again when the results come back. Use an opaque one (1, 2, 3 or a short random id), never the real message id.'),
  from: z.string().trim().min(1).max(80).describe('Who sent it, as the user knows them: a name or a company. No email address needed.'),
  subject: z.string().trim().max(140).describe('The subject line, without Re:/Fwd: chains.'),
  summary: z.string().trim().max(400).describe('What the email says and wants, in at most about 180 characters, written short in the sender\'s own voice. Keep names, dates, times and amounts. Never the full body.'),
  category: CategoryInput.optional().describe('Which card it is shown on: Work, Personal, Calendar (people and invites), Newsletter, Promo, Spam, Receipt, Bill, Tracking, Social or Alert.'),
  important: z.boolean().optional().describe('True if the user would want to keep it or act on it (a person writing to them, a bill, a failed payment or delivery, a security alert). Guessed from the category if left out.'),
  special: z.boolean().optional().describe('True for the one or two emails that matter most right now (a deadline today, a failed payment, someone waiting on them). The game shows them with the level\'s own special effect, so they stand out. Use it sparingly: one or two a round.'),
  replies: z.array(z.string().trim().min(1).max(220)).max(2).optional().describe('Up to two short reply drafts (one or two sentences each) the user can pick in round two. Write them for anything a person sent that expects an answer.'),
  amount: z.string().trim().max(20).optional().describe('Receipt and Bill: the amount as written, like $84.10.'),
  due: z.string().trim().max(24).optional().describe('Bill: when it is due, like Fri 14 Nov, or "payment failed".'),
});
export type RoundEmail = z.infer<typeof RoundEmail>;

export const CreateRound = z.object({
  emails: z.array(RoundEmail).min(1).max(MAX_EMAILS).describe(`The emails for this game, in the order they should come (newest first is usual). 5 to 20 plays best; at most ${MAX_EMAILS}.`),
  title: z.string().trim().max(40).optional().describe('A few words shown in the game, like "Tuesday inbox".'),
  hours: z.number().min(0.25).max(24).optional().describe('How long the round waits to be played before it is deleted. Default 24.'),
});
export type CreateRound = z.infer<typeof CreateRound>;

export const CodeAndKey = z.object({
  code: z.string().trim().regex(/^\d{4}$/).describe('The 4-digit game code create_round gave.'),
  key: z.string().trim().min(10).max(80).describe('The key create_round gave with the code.'),
});

// ---------------------------------------------------------------- what is kept

type Outcome = { action: 'archive' } | { action: 'reply'; reply_index: number } | { action: 'reply'; dictated: string; text?: string; by?: 'ai' | 'rules' } | { action: 'reply'; ask_user: true };

interface Round {
  code: string;
  keyHash: string;
  title: string;
  created: number;
  /** When it is deleted if nobody plays it (ms). */
  until: number;
  status: 'waiting' | 'opened' | 'done';
  /** Gone as soon as the game is finished. */
  emails: RoundEmail[] | null;
  /** What the game did, once it is finished: every ref of the round, in order. */
  results: { ref: string; outcome: Outcome | null; replies: string[] }[] | null;
  finished?: number;
  /** When the agent first read the results (they go 10 minutes later). */
  read?: number;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const left = (r: Round) => Math.max(1, Math.round((r.until - Date.now()) / 1000));

export class RoundError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function load(code: string): Promise<Round | null> {
  if (!/^\d{4}$/.test(code)) return null;
  return store.get<Round>(prefix + code);
}

async function loadWithKey(code: string, key: string): Promise<Round> {
  const r = await load(code);
  const given = Buffer.from(hash(key ?? '')), want = Buffer.from(r?.keyHash ?? hash('none'));
  if (!r || !timingSafeEqual(given, want)) throw new RoundError('No round with that code and key. It may have expired, been deleted, or its results already read more than 10 minutes ago.', 404);
  return r;
}

// ---------------------------------------------------------------- the agent's side

export async function createRound(input: CreateRound) {
  const refs = new Set<string>();
  for (const e of input.emails) {
    if (refs.has(e.ref)) throw new RoundError(`Two emails have the ref "${e.ref}": each needs its own.`, 400);
    refs.add(e.ref);
  }
  const hours = input.hours ?? 24, now = Date.now(), key = randomBytes(18).toString('base64url');
  const round: Round = {
    code: '', keyHash: hash(key), title: input.title || 'Your inbox', created: now, until: now + hours * 3600_000,
    status: 'waiting', emails: input.emails, results: null,
  };
  // (a free 4-digit code: 10,000 of them, and a round holds one for a day at most)
  for (let tries = 0; tries < 40; tries++) {
    const code = String(randomInt(0, 10000)).padStart(4, '0');
    round.code = code;
    if (await store.set(prefix + code, round, hours * 3600, true)) {
      return { code, key, expires_at: new Date(round.until).toISOString(), emails: input.emails.length };
    }
  }
  throw new RoundError('No free game code just now: try again in a minute.', 503);
}

export type ResultAction =
  | { ref: string; action: 'archive' }
  | { ref: string; action: 'reply'; reply_index: number; reply_text: string }
  /** Said into the mic: `dictated` is the words as heard, `reply_text` the email made of them (by the model, or by rules without one). */
  | { ref: string; action: 'reply'; dictated: string; reply_text: string; written_by: 'ai' | 'rules' }
  /** They chose to answer by voice, but no words were caught (no mic in their browser): ask them what to say. */
  | { ref: string; action: 'reply'; ask_user: true }
  | { ref: string; action: 'leave' };

export interface Results {
  code: string;
  status: 'waiting' | 'playing' | 'done';
  /** Plain words for the user, e.g. "Archive 6, reply to 2, leave 4." */
  summary: string;
  actions: ResultAction[];
  expires_at: string;
}

export async function getResults(code: string, key: string): Promise<Results> {
  const r = await loadWithKey(code, key);
  if (r.status !== 'done' || !r.results) {
    return {
      code, status: r.status === 'opened' ? 'playing' : 'waiting', actions: [], expires_at: new Date(r.until).toISOString(),
      summary: r.status === 'opened' ? 'The game is open but not finished yet.' : 'Nobody has entered this code in the game yet.',
    };
  }
  if (!r.read) {
    r.read = Date.now(); r.until = r.read + RESULTS_GRACE * 1000;
    await store.set(prefix + code, r, RESULTS_GRACE);
  }
  const actions: ResultAction[] = r.results.map(({ ref, outcome, replies }) => {
    if (!outcome) return { ref, action: 'leave' };
    if (outcome.action === 'archive') return { ref, action: 'archive' };
    if ('dictated' in outcome) return { ref, action: 'reply', dictated: outcome.dictated, reply_text: outcome.text ?? outcome.dictated, written_by: outcome.by ?? 'rules' };
    if ('ask_user' in outcome) return { ref, action: 'reply', ask_user: true };
    return { ref, action: 'reply', reply_index: outcome.reply_index, reply_text: replies[outcome.reply_index] ?? '' };
  });
  const n = (a: string) => actions.filter(x => x.action === a).length;
  const summary = `Archive ${n('archive')}, reply to ${n('reply')}, leave ${n('leave')} as they are.`;
  return { code, status: 'done', summary, actions, expires_at: new Date(r.until).toISOString() };
}

export async function cancelRound(code: string, key: string) {
  await loadWithKey(code, key);
  await store.del(prefix + code);
  return { code, deleted: true };
}

// ---------------------------------------------------------------- the game's side

const STOCK: [string, string] = ['Thanks, got it!', 'Thanks! Can we talk about this later this week?'];
const SPAM_NO: [string, string] = ['Please take me off this list. Thank you!', 'Not interested, thanks'];

/** Sentences of a summary, each cut to fit a line of a newsletter card. */
const lines = (s: string, n: number) => s.split(/(?<=[.!?])\s+|\s*[;\n•]\s*/).map(l => l.trim()).filter(l => l.length > 2).map(l => clamp(l, n));

/** One email as an agent sent it → the card the game draws (the fields of the game's own Email). */
export function toCard(e: RoundEmail): AgentCard {
  const category: Category = e.category ?? (e.replies?.length ? 'Personal' : 'Newsletter');
  const words = `${e.subject} ${e.summary}`;
  const failed = /\b(failed|declined|missed|unable to deliver|returned)\b/i.test(words);
  const important = e.important ?? (isPersonCard(category) || category === 'Bill' || (category === 'Tracking' && failed) || (category === 'Alert' && /\b(security|sign-?in|unusual|suspicious)\b/i.test(words)));
  const given = (e.replies ?? []).map(r => clamp(r, 200));
  const stock = category === 'Spam' || category === 'Promo' ? SPAM_NO : STOCK;
  const card: AgentCard = {
    ref: e.ref, id: e.ref,
    kind: important ? 'Real' : 'Junk', category, needsReply: given.length > 0,
    from: clamp(e.from.replace(/\s*<[^>]*>\s*$/, ''), 24),
    subject: clamp(e.subject.replace(/^((re|fwd?):\s*)+/i, ''), 60),
    step: category === 'Tracking' ? (/\bdelivered\b/i.test(words) ? 3 : /\bout for delivery\b/i.test(words) ? 2 : /\b(shipped|on its way|in transit)\b/i.test(words) ? 1 : 0) : 0,
    failed: (category === 'Tracking' || category === 'Bill') && failed,
    // (two bubbles in round two always: what the agent wrote, topped up with a stock one)
    replies: [given[0] ?? stock[0], given[1] ?? stock[given[0] === stock[1] ? 0 : 1]],
  };
  if (e.special) card.special = true;
  if (isPersonCard(category)) card.body = clamp(e.summary, 200);
  else if (category === 'Newsletter' || category === 'Promo') card.items = [clamp(card.subject.toUpperCase(), 30), ...lines(e.summary, 40).slice(0, 4)];
  else card.snippet = clamp(e.summary, 80);
  if ((category === 'Receipt' || category === 'Bill') && e.amount) card.amount = clamp(e.amount, 12);
  if (category === 'Bill') card.due = clamp((e.due || (failed ? 'payment failed' : 'due soon')).toUpperCase(), 16);
  return card;
}

/** The game asks for a round by its code (this is what a stranger guessing codes would hit: see the rate limit in the route). */
export async function openRound(code: string): Promise<AgentRoundResponse | null> {
  const r = await load(code);
  if (!r || !r.emails) return null;
  if (r.status === 'waiting') { r.status = 'opened'; await store.set(prefix + code, r, left(r)); }
  return { code, title: r.title, emails: r.emails.map(toCard) };
}

/** The game is over: keep what was done, drop the emails. A round can be finished once. */
export async function finishRound(code: string, outcomes: AgentOutcome[]) {
  const r = await load(code);
  if (!r) throw new RoundError('That round has expired or was deleted.', 404);
  if (!r.emails || r.status === 'done') throw new RoundError('That round was already played.', 409);
  const byRef = new Map<string, Outcome>();
  for (const o of outcomes) {
    const e = r.emails.find(x => x.ref === o.ref);
    if (!e) continue;
    if (o.action === 'archive') byRef.set(o.ref, { action: 'archive' });
    else if ('dictated' in o && typeof o.dictated === 'string') byRef.set(o.ref, o.dictated.trim() ? { action: 'reply', dictated: o.dictated.trim().slice(0, 1000) } : { action: 'reply', ask_user: true });
    else if ('reply_index' in o && (o.reply_index === 0 || o.reply_index === 1)) byRef.set(o.ref, { action: 'reply', reply_index: o.reply_index });
  }
  // (what was said into the mic becomes the email it meant, while the email it answers is still here: lib/ai.ts)
  await Promise.all(r.emails.map(async e => {
    const o = byRef.get(e.ref);
    if (!o || !('dictated' in o)) return;
    const from = e.from.replace(/\s*<[^>]*>\s*$/, ''), full = await polish({ from, subject: e.subject, summary: e.summary }, o.dictated);
    o.text = full ?? plainPolish(from, o.dictated); o.by = full ? 'ai' : 'rules';
  }));
  r.results = r.emails.map(e => ({ ref: e.ref, outcome: byRef.get(e.ref) ?? null, replies: toCard(e).replies }));
  r.emails = null; r.status = 'done'; r.finished = Date.now();
  await store.set(prefix + code, r, left(r));
  const n = (a: string) => r.results!.filter(x => (x.outcome?.action ?? 'leave') === a).length;
  return { archive: n('archive'), reply: n('reply'), leave: n('leave') };
}

// ---------------------------------------------------------------- the words agents read

/** Meta's send-to-headset link: tapped on a phone or computer signed in to the user's Meta account, it opens `url` in their Quest's browser. */
export function questLink(url: string) {
  return `https://www.oculus.com/open_url/?url=${encodeURIComponent(url)}`;
}

export function playInstructions(code: string, site: string) {
  return `Tell the user: "Your Inbox Zero game is ready. Tap ${questLink(`${site}/play/?code=${code}`)} to open it on your Meta Quest, or open ${site}/play/?code=${code} in the Quest's browser (or any browser), then press Clean Your Inbox. Or open ${site}/play/, press Enter Code and type ${code}. Tell me when you're done." When they say they're done, call get_results with this code and key, show them what they chose, and only after they agree do it with your own email tools: archive what says archive, send or draft the replies (expand a chosen reply into a proper email; a spoken one comes as reply_text, already written up from their words), and leave the rest unread. The round is deleted once played, and the results 10 minutes after you first read them.`;
}
