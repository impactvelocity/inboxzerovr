import { headers } from 'next/headers';
import { z } from 'zod';
import { deleteRound, CodeAndKey, CreateRound, createRound, getResults, playInstructions, questLink, RoundError, type Results } from './rounds';
import { origin } from './session';
import { store } from './store';

/**
 * What an agent can do, the same over REST (app/api/rounds) and MCP (app/mcp/route.ts):
 * create a round, read its results (waiting a little for them if asked), cancel it.
 */

/** The caller's address, for rate limits. */
export async function callerIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'local').split(',')[0].trim();
}

/**
 * In `next dev` every limit is 25 times as generous, so the keypad's wrong codes can be tried over and over
 * (2026-11-14: "reduce the rate limit in dev mode so I can test more"; 8 misses in 10 minutes becomes 200).
 * A production build keeps the real limits.
 */
const DEV_LIMIT_SCALE = process.env.NODE_ENV === 'development' ? 25 : 1;

/** Counts a hit for this caller; throws 429 past `n` in `seconds` (`n` times DEV_LIMIT_SCALE). */
export async function limit(name: string, n: number, seconds: number) {
  const count = await store.hit(`izvr:rl:${name}:${await callerIp()}`, seconds);
  if (count > n * DEV_LIMIT_SCALE) throw new RoundError('Too many tries: wait a few minutes.', 429);
}

export class InputError extends RoundError {
  constructor(error: z.ZodError) {
    super(`The input is not right: ${error.issues.slice(0, 6).map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`, 400);
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new InputError(r.error);
  return r.data;
}

// ---------------------------------------------------------------- what comes back (the MCP tools' outputSchema)

export const CreateOutput = z.object({
  code: z.string().describe('The 4-digit game code the user types in (or that play_url fills in).'),
  key: z.string().describe('Keep this: get_results and delete_round need it with the code.'),
  expires_at: z.string().describe('When the round and its results are deleted if you have not called delete_round by then (ISO 8601): 4 hours after it was made at most.'),
  emails: z.number().describe('How many emails the round has.'),
  play_url: z.string().describe('Opens the game with the code filled in, in any browser (the Quest\'s too).'),
  quest_url: z.string().describe('Meta\'s send-to-headset link: opened on a phone or computer signed in to the user\'s Meta account, it opens play_url in their Quest\'s browser.'),
  play_instructions: z.string().describe('What to tell the user, and what to do after.'),
});

export const ResultAction = z.object({
  ref: z.string().describe('Your ref for the email.'),
  action: z.enum(['archive', 'reply', 'leave']).describe('archive: they slashed it. reply: they picked or spoke a reply. leave: kept but not answered, or let go: leave it unread.'),
  reply_index: z.number().optional().describe('reply, picked: 0 your first draft (or the first stock reply), 1 the second.'),
  reply_text: z.string().optional().describe('reply, picked: the draft they picked, word for word.'),
  dictated: z.string().optional().describe('reply, spoken: what they said into the mic, as speech-to-text heard it, word for word. Write the email from it yourself, in their voice; check names.'),
  ask_user: z.boolean().optional().describe('reply: true when they chose to answer by voice but no words were caught. Ask them what to say.'),
});

export const ResultsOutput = z.object({
  code: z.string(),
  status: z.enum(['waiting', 'playing', 'done']).describe('waiting: nobody has entered the code yet. playing: the game is open. done: finished, actions are filled in.'),
  plays: z.number().describe('How many times the round was played to the end (0 until done). Past 1, the user played it again and the actions are the last game\'s: if you read results before, read these in their place.'),
  summary: z.string().describe('One line, like "Archive 6, reply to 2, leave 4 as they are."'),
  actions: z.array(ResultAction).describe('When done: every ref of the round exactly once, in your order. Empty until then.'),
  expires_at: z.string().describe('When the round and its results are deleted if you have not called delete_round by then (ISO 8601).'),
});

export const DeleteOutput = z.object({ code: z.string(), deleted: z.boolean() });

// ---------------------------------------------------------------- the three calls

export async function agentCreate(input: unknown) {
  await limit('create', 60, 600);      // (agents on one platform share addresses: generous)
  const made = await createRound(parse(CreateRound, input));
  const site = await origin();
  const play_url = `${site}/play/?code=${made.code}`;
  return {
    ...made,
    play_url,
    quest_url: questLink(play_url),
    play_instructions: playInstructions(made.code, site),
  };
}

export const ResultsInput = CodeAndKey.extend({
  wait_seconds: z.number().min(0).max(25).optional().describe('Wait up to this many seconds for the game to finish before answering. Default 0.'),
});

export async function agentResults(input: unknown): Promise<Results> {
  const { code, key, wait_seconds } = parse(ResultsInput, input);
  const until = Date.now() + (wait_seconds ?? 0) * 1000;
  for (;;) {
    const r = await getResults(code, key);
    if (r.status === 'done' || Date.now() >= until) return r;
    await new Promise(res => setTimeout(res, 2000));
  }
}

export async function agentDelete(input: unknown) {
  const { code, key } = parse(CodeAndKey, input);
  return deleteRound(code, key);
}

/** The key from `Authorization: Bearer <key>`, or ?key= for agents that can only fetch a URL. */
export function keyFrom(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : new URL(req.url).searchParams.get('key') ?? '';
}

/** Turns failures into JSON answers for the REST routes. */
export async function rest(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    return Response.json(await fn(), { status, headers: { 'Cache-Control': 'no-store'} });
  } catch (e) {
    if (e instanceof RoundError) return Response.json({ error: e.message }, { status: e.status, headers: { 'Cache-Control': 'no-store'} });
    console.error(e);
    return Response.json({ error: 'Something went wrong' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
