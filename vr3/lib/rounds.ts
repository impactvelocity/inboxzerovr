import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Category } from '../play/src/mail/emails';
import { Categories, type AgentCard, type AgentOutcome, type AgentRoundResponse } from '../play/src/mail/wire';
import { clamp, isPersonCard } from './text';
import { store } from './store';

/**
 * Agent rounds (2026-11-13): how anyone plays their own mail. The game never connects to a
 * mailbox; the player's own AI agent already reads theirs, so it sends us a round of emails it has
 * summarised and sorted (each under a reference only it can turn back into a real message), and
 * gets a 4-digit code. The player types the code into the game and plays. The game posts what was
 * done, and the agent fetches the results, shows them to the player and does the archiving and
 * replying with its own tools. This is only data in to make the game, and data out so the agent
 * can act: nothing is written or rewritten here (2026-11-15: "the replies should just be whatever
 * they say, and stored as that, let their own agent figure out the end").
 *
 * What is kept, and for how long (2026-11-15: "once the agent acknowledges it - game setup and results
 * are deleted", "maybe 4 hrs for time limit instead of 24"): the round as sent and its results, together,
 * until the agent calls delete_round once it has acted, or 4 hours after the round was made (`hours` can
 * make that shorter), whichever comes first.
 * A Play Again from the results screen (2026-11-15: "a replay should keep the old results until the game is completed
 * again, and then overwritten previous results"): the results are replaced only when that game is finished, and the
 * agent sees `plays` go up. Only the game that opened the round can post (the `play` token it was given), and nobody
 * can open a round once it has been played, so a stranger who guesses a code can't read or overwrite a finished one.
 * The agent's key is kept only as a SHA-256 hash.
 *
 * Used by the REST routes (app/api/rounds) and the MCP server (app/mcp/route.ts).
 */

const MAX_EMAILS = 30;
/** Every round, and its results, is gone this long after it was made at the latest. */
export const MAX_HOURS = 4;
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
  // (required, two, 2026-11-15: an agent's feedback was that it got back a stock reply it never wrote and couldn't tell it from its own;
  //  round two shows two bubbles on every email kept, so every email brings its two, and every reply in the results is the agent's)
  replies: z.array(z.string().trim().min(1).max(220)).length(2).describe('Exactly two short replies for the two bubbles in round two, the left then the right, which the user picks between if they keep this email. One or two sentences each, written as the user, no greeting or sign-off, and different from each other (a yes and a not-now, say). Every email needs two. From a person: replies you would send. From automated mail nobody reads a reply to (receipts, deliveries, newsletters, promos, alerts): two things the user might want you to do instead, like "Unsubscribe me" or "Remind me Friday to pay this"; if they pick one, you do that rather than send it.'),
  amount: z.string().trim().max(20).optional().describe('Receipt and Bill: the amount as written, like $84.10.'),
  due: z.string().trim().max(24).optional().describe('Bill: when it is due, like Fri 14 Nov, or "payment failed".'),
});
export type RoundEmail = z.infer<typeof RoundEmail>;

export const CreateRound = z.object({
  emails: z.array(RoundEmail).min(1).max(MAX_EMAILS).describe(`The emails for this game, in the order they should come (newest first is usual). 5 to 20 plays best; at most ${MAX_EMAILS}.`),
  // (2026-11-15: "the AI agent creates a short title, use that so its like oh yeah this is my game": the found screen shows it)
  title: z.string().trim().max(40).optional().describe('Always give one: a short title for this game that the user will recognise as theirs, shown big when their code is found, like "Tuesday inbox" or "Launch week catch-up". 2 to 4 words, 24 characters or fewer.'),
  hours: z.number().min(0.25).max(MAX_HOURS).optional().describe(`How long the round and its results are kept at most, if you don't call delete_round first. Default and most: ${MAX_HOURS}.`),
});
export type CreateRound = z.infer<typeof CreateRound>;

export const CodeAndKey = z.object({
  code: z.string().trim().regex(/^\d{4}$/).describe('The 4-digit game code create_round gave.'),
  key: z.string().trim().min(10).max(80).describe('The key create_round gave with the code.'),
});

// ---------------------------------------------------------------- what is kept

type Outcome = { action: 'archive' } | { action: 'reply'; reply_index: number } | { action: 'reply'; dictated: string } | { action: 'reply'; ask_user: true };

interface Round {
  code: string;
  keyHash: string;
  title: string;
  created: number;
  /** When it is deleted, round and results, if the agent hasn't deleted it first (ms). It never moves. */
  until: number;
  status: 'waiting' | 'opened' | 'done';
  /** Given to the game when it opens the round; only that game can post results (and post them again on a replay). */
  play?: string;
  /** How many finished games the results come from (the last one counts). */
  plays?: number;
  /** As the agent sent them, until the round is deleted. */
  emails: RoundEmail[];
  /** What the game did, once it is finished (the last game, after a Play Again): every ref of the round, in order. */
  results: { ref: string; outcome: Outcome | null }[] | null;
  finished?: number;
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
  if (!r || !timingSafeEqual(given, want)) throw new RoundError(`No round with that code and key. It may have been deleted, or be more than ${MAX_HOURS} hours old.`, 404);
  return r;
}

// ---------------------------------------------------------------- the agent's side

export async function createRound(input: CreateRound) {
  const refs = new Set<string>();
  for (const e of input.emails) {
    if (refs.has(e.ref)) throw new RoundError(`Two emails have the ref "${e.ref}": each needs its own.`, 400);
    refs.add(e.ref);
  }
  const hours = Math.min(input.hours ?? MAX_HOURS, MAX_HOURS), now = Date.now(), key = randomBytes(18).toString('base64url');
  const round: Round = {
    code: '', keyHash: hash(key), title: input.title || 'Your inbox', created: now, until: now + hours * 3600_000,
    status: 'waiting', emails: input.emails, results: null,
  };
  // (a free 4-digit code: 10,000 of them, and a round holds one for 4 hours at most)
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
  /** Said into the mic: `dictated` is their words as speech-to-text heard them, nothing more. The agent writes the email. */
  | { ref: string; action: 'reply'; dictated: string }
  /** They chose to answer by voice, but no words were caught (no mic in their browser): ask them what to say. */
  | { ref: string; action: 'reply'; ask_user: true }
  | { ref: string; action: 'leave' };

export interface Results {
  code: string;
  status: 'waiting' | 'playing' | 'done';
  /** How many times the round was played to the end: past 1, they played it again and these are the last game's choices. */
  plays: number;
  /** Plain words for the user, e.g. "Archive 6, reply to 2, leave 4." */
  summary: string;
  actions: ResultAction[];
  expires_at: string;
}

export async function getResults(code: string, key: string): Promise<Results> {
  const r = await loadWithKey(code, key);
  if (r.status !== 'done' || !r.results) {
    return {
      code, status: r.status === 'opened' ? 'playing' : 'waiting', plays: 0, actions: [], expires_at: new Date(r.until).toISOString(),
      summary: r.status === 'opened' ? 'The game is open but not finished yet.' : 'Nobody has entered this code in the game yet.',
    };
  }
  const replies = new Map(r.emails.map(e => [e.ref, toCard(e).replies]));
  const actions: ResultAction[] = r.results.map(({ ref, outcome }) => {
    if (!outcome) return { ref, action: 'leave' };
    if (outcome.action === 'archive') return { ref, action: 'archive' };
    if ('dictated' in outcome) return { ref, action: 'reply', dictated: outcome.dictated };
    if ('ask_user' in outcome) return { ref, action: 'reply', ask_user: true };
    return { ref, action: 'reply', reply_index: outcome.reply_index, reply_text: replies.get(ref)?.[outcome.reply_index] ?? '' };
  });
  const n = (a: string) => actions.filter(x => x.action === a).length;
  const plays = r.plays ?? 1;
  const summary = `Archive ${n('archive')}, reply to ${n('reply')}, leave ${n('leave')} as they are.${plays > 1 ? ` (From game ${plays}: they played it again, and the last game counts.)` : ''}`;
  return { code, status: 'done', plays, summary, actions, expires_at: new Date(r.until).toISOString() };
}

/** The agent is done with it (acted, or the user said no): the round and its results go now. */
export async function deleteRound(code: string, key: string) {
  await loadWithKey(code, key);
  await store.del(prefix + code);
  return { code, deleted: true };
}

// ---------------------------------------------------------------- the game's side


/** Sentences of a summary, each cut to fit a line of a newsletter card. */
const lines = (s: string, n: number) => s.split(/(?<=[.!?])\s+|\s*[;\n•]\s*/).map(l => l.trim()).filter(l => l.length > 2).map(l => clamp(l, n));

/** One email as an agent sent it → the card the game draws (the fields of the game's own Email). */
export function toCard(e: RoundEmail): AgentCard {
  const category: Category = e.category ?? 'Personal';
  const words = `${e.subject} ${e.summary}`;
  const failed = /\b(failed|declined|missed|unable to deliver|returned)\b/i.test(words);
  const important = e.important ?? (isPersonCard(category) || category === 'Bill' || (category === 'Tracking' && failed) || (category === 'Alert' && /\b(security|sign-?in|unusual|suspicious)\b/i.test(words)));
  const given = (e.replies ?? []).map(r => clamp(r, 200));
  const card: AgentCard = {
    ref: e.ref, id: e.ref,
    kind: important ? 'Real' : 'Junk', category, needsReply: isPersonCard(category),
    from: clamp(e.from.replace(/\s*<[^>]*>\s*$/, ''), 24),
    subject: clamp(e.subject.replace(/^((re|fwd?):\s*)+/i, ''), 60),
    step: category === 'Tracking' ? (/\bdelivered\b/i.test(words) ? 3 : /\bout for delivery\b/i.test(words) ? 2 : /\b(shipped|on its way|in transit)\b/i.test(words) ? 1 : 0) : 0,
    failed: (category === 'Tracking' || category === 'Bill') && failed,
    // (the agent's two, always: nothing of ours is ever offered as a reply)
    replies: [given[0] ?? '', given[1] ?? ''],
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
  if (!r || r.status === 'done') return null;      // (played: only the game that played it can play it again, from the cards it kept)
  if (r.status === 'waiting' || !r.play) { r.status = 'opened'; r.play ??= randomBytes(18).toString('base64url'); await store.set(prefix + code, r, left(r)); }
  return { code, title: r.title, play: r.play, emails: r.emails.map(toCard) };
}

/**
 * The game is over: keep what was done, as it was done (words said into the mic as they were heard). Played again
 * (Play Again), the new game's choices replace the old ones when it is finished; until then the agent reads the old ones.
 * `play` is the token the game got when it opened it.
 */
export async function finishRound(code: string, outcomes: AgentOutcome[], play: string) {
  const r = await load(code);
  if (!r) throw new RoundError('That round has expired or was deleted.', 404);
  if (!r.play || typeof play !== 'string' || !timingSafeEqual(Buffer.from(hash(play)), Buffer.from(hash(r.play)))) throw new RoundError('This game was opened on another device: finish it there.', 403);
  const refs = new Set(r.emails.map(e => e.ref)), byRef = new Map<string, Outcome>();
  for (const o of outcomes) {
    if (!refs.has(o.ref)) continue;
    if (o.action === 'archive') byRef.set(o.ref, { action: 'archive' });
    else if ('dictated' in o && typeof o.dictated === 'string') byRef.set(o.ref, o.dictated.trim() ? { action: 'reply', dictated: o.dictated.trim().slice(0, 1000) } : { action: 'reply', ask_user: true });
    else if ('reply_index' in o && (o.reply_index === 0 || o.reply_index === 1)) byRef.set(o.ref, { action: 'reply', reply_index: o.reply_index });
  }
  r.results = r.emails.map(e => ({ ref: e.ref, outcome: byRef.get(e.ref) ?? null }));
  r.status = 'done'; r.finished = Date.now(); r.plays = (r.plays ?? 0) + 1;
  await store.set(prefix + code, r, left(r));
  const n = (a: string) => r.results!.filter(x => (x.outcome?.action ?? 'leave') === a).length;
  return { archive: n('archive'), reply: n('reply'), leave: n('leave'), plays: r.plays };
}

// ---------------------------------------------------------------- the words agents read

/** Meta's send-to-headset link: tapped on a phone or computer signed in to the user's Meta account, it opens `url` in their Quest's browser. */
export function questLink(url: string) {
  return `https://www.oculus.com/open_url/?url=${encodeURIComponent(url)}`;
}

/**
 * What the agent shows the user, word for word (2026-11-15: agents gave "the code, but not the url ... they should give the code
 * and a url to open, but also the open in vr url too"): the code and both links, each on its own line, as plain URLs so no
 * client can hide them behind a link it doesn't render.
 */
export function userMessage(code: string, site: string) {
  const play = `${site}/play/?code=${code}`;
  return `Your Inbox Zero game is ready. Your code is ${code}.

Open in VR (sends it to your Meta Quest): ${questLink(play)}
Open in a browser (on your Quest, or anywhere): ${play}

Or go to ${site}/play/, press Enter Code and type ${code}. Tell me when you're done.`;
}

/** What the agent does after it has shown the message. */
export function nextSteps() {
  return `When they say they're done, call get_results with this code and key, show them what they chose by sender and subject, and only after they agree do it with your own email tools: archive what says archive, send or draft the replies, and leave the rest unread. Write each reply as a proper email in their voice: a chosen reply as reply_text, or what they said into the mic as dictated (their words as heard; check names). A reply you wrote for automated mail ("Unsubscribe me") is a thing to do, not to send. Then call delete_round with this code and key. If you don't, the round and its results are deleted ${MAX_HOURS} hours after it was made.`;
}
