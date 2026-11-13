import { writeReplies } from '@/lib/ai';
import { live, message, thread } from '@/lib/gmail';
import { guard, json } from '@/lib/http';
import { parse } from '@/lib/mime';
import { stockReplies } from '@/lib/rules';
import type { RepliesResponse } from '@/play/src/mail/wire';

export const maxDuration = 60;

/**
 * POST { id, threadId } : two replies to that email, written from its thread. The game asks as
 * soon as an email that needs an answer comes in, or is kept, so the replies are ready by round
 * two. The mail is read from Gmail here, not taken from the game.
 */
export async function POST(req: Request) {
  return guard(async () => {
    const { id, threadId } = (await req.json().catch(() => ({}))) as { id?: string; threadId?: string };
    if (typeof id !== 'string' || !id) return json({ error: 'id is needed' }, 400);
    const s = await live();
    let messages = threadId ? (await thread(s, threadId).catch(() => null))?.messages ?? [] : [];
    const at = messages.findIndex(m => m.id === id);
    messages = at >= 0 ? messages.slice(0, at + 1) : [await message(s, id)];
    const parsed = messages.map(m => parse(m, 2500));
    const written = await writeReplies(parsed, s.name);
    const answer: RepliesResponse = written ? { replies: written, by: 'ai' } : { replies: stockReplies(parsed[parsed.length - 1], s.name), by: 'rules' };
    return json(answer);
  });
}
