import { headers } from 'next/headers';
import { z } from 'zod';
import { cancelRound, CodeAndKey, CreateRound, createRound, getResults, playInstructions, RoundError, type Results } from './rounds';
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

/** Counts a hit for this caller; throws 429 past `n` in `seconds`. */
export async function limit(name: string, n: number, seconds: number) {
  const count = await store.hit(`izvr:rl:${name}:${await callerIp()}`, seconds);
  if (count > n) throw new RoundError('Too many tries: wait a few minutes.', 429);
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

export async function agentCreate(input: unknown) {
  await limit('create', 60, 600);      // (agents on one platform share addresses: generous)
  const made = await createRound(parse(CreateRound, input));
  const site = await origin();
  return {
    ...made,
    play_url: `${site}/play/?code=${made.code}`,
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

export async function agentCancel(input: unknown) {
  const { code, key } = parse(CodeAndKey, input);
  return cancelRound(code, key);
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
