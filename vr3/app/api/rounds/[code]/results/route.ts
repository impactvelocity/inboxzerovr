import { agentResults, keyFrom, limit, rest } from '@/lib/agent';
import { finishRound, RoundError } from '@/lib/rounds';
import type { AgentResultsRequest } from '@/play/src/mail/wire';

/**
 * GET /api/rounds/{code}/results with `Authorization: Bearer <key>` (or ?key=): the agent reads what
 * the player chose. ?wait=N waits up to N seconds (at most 25) for the game to finish.
 * The same as the MCP tool get_results.
 *
 * POST /api/rounds/{code}/results { outcomes }: the game, at its end. The emails are deleted then.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const wait = Number(new URL(req.url).searchParams.get('wait') ?? 0);
  return rest(() => agentResults({ code, key: keyFrom(req), ...(wait > 0 ? { wait_seconds: Math.min(25, wait) } : {}) }));
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return rest(async () => {
    await limit('finish', 30, 600);
    const body = (await req.json().catch(() => null)) as AgentResultsRequest | null;
    if (!body || !Array.isArray(body.outcomes)) throw new RoundError('outcomes is needed', 400);
    return finishRound(code, body.outcomes.slice(0, 60));
  });
}
