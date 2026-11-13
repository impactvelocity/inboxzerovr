import { agentCancel, keyFrom, limit, rest } from '@/lib/agent';
import { openRound, RoundError } from '@/lib/rounds';
import { grantRound } from '@/lib/session';

/**
 * GET /api/rounds/{code}: the game, when the player types a code. The cards, never the agent's key.
 * Codes are only 4 digits, so wrong ones are limited per address (a stranger can't walk through them).
 *
 * DELETE /api/rounds/{code} with `Authorization: Bearer <key>`: the agent deletes its round and results.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return rest(async () => {
    await limit('open', 30, 600);
    const round = await openRound(code);
    if (!round) {
      await limit('miss', 8, 600);
      throw new RoundError('No game with that code. Check it with your agent: codes last a day at most, and only until played.', 404);
    }
    await grantRound();      // (the mic's tokens are for players of a round too: app/api/scribe-token)
    return round;
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return rest(() => agentCancel({ code, key: keyFrom(req) }));
}
