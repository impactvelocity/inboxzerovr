import { sortEmail } from '@/lib/ai';
import { env } from '@/lib/env';
import { live, message, unread } from '@/lib/gmail';
import { guard, pool } from '@/lib/http';
import { parse } from '@/lib/mime';
import { byRules } from '@/lib/rules';
import { DefaultCount, MaxCount, type InboxLine } from '@/play/src/mail/wire';

export const maxDuration = 60;

/**
 * GET ?count=N : the newest N unread emails, each sorted into a card, streamed one JSON line at a
 * time as they are ready (see InboxLine), so the game can start before the last one is done.
 * Nothing is kept: the mail is read, sorted and forgotten with the request.
 */
export async function GET(req: Request) {
  return guard(async () => {
    const asked = Number(new URL(req.url).searchParams.get('count'));
    const count = Number.isFinite(asked) && asked > 0 ? Math.min(MaxCount, Math.round(asked)) : DefaultCount;
    const s = await live();                    // (before the stream: a refreshed token rewrites the cookie)
    const { ids, total } = await unread(s, count);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(out) {
        const send = (line: InboxLine) => out.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        send({ type: 'meta', count: ids.length, unread: total, ai: env.ai });
        await pool(ids, 8, async (ref, index) => {
          try {
            const parsed = parse(await message(s, ref.id));
            send({ type: 'email', index, email: await sortEmail(parsed).catch(() => byRules(parsed)) });
          } catch (e) {
            send({ type: 'error', message: `email ${index + 1}: ${(e as Error).message}` });
          }
        });
        send({ type: 'done' });
        out.close();
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  });
}
