import { archive, draftReply, live, message } from '@/lib/gmail';
import { guard, json, pool } from '@/lib/http';
import { parse } from '@/lib/mime';
import type { ApplyRequest, ApplyResponse } from '@/play/src/mail/wire';

export const maxDuration = 60;

/**
 * POST ApplyRequest : what a game did to real mail, done to Gmail at the end of the game.
 * Cut emails are archived (out of the inbox, still unread, in All Mail). A sent reply is saved as a
 * draft on its thread, and its email is left as it was. Kept and later change nothing.
 */
export async function POST(req: Request) {
  return guard(async () => {
    const body = (await req.json().catch(() => ({}))) as Partial<ApplyRequest>;
    const ids = (Array.isArray(body.archive) ? body.archive : []).filter((x): x is string => typeof x === 'string' && !!x).slice(0, 100);
    const drafts = (Array.isArray(body.drafts) ? body.drafts : []).filter(d => d && typeof d.id === 'string' && typeof d.body === 'string' && d.body.trim()).slice(0, 50);
    const s = await live();
    const failed: string[] = [];
    let archived = 0, drafted = 0;
    if (ids.length) {
      try { await archive(s, ids); archived = ids.length; } catch (e) { console.warn(`[apply] archive: ${(e as Error).message}`); failed.push(...ids); }
    }
    await pool(drafts, 4, async d => {
      try {
        const p = parse(await message(s, d.id), 200);
        await draftReply(s, p, d.body.slice(0, 5000));
        drafted++;
      } catch (e) { console.warn(`[apply] draft ${d.id}: ${(e as Error).message}`); failed.push(d.id); }
    });
    const answer: ApplyResponse = { archived, drafts: drafted, failed };
    return json(answer);
  });
}
