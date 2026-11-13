import { polish } from '@/lib/ai';
import { live, message } from '@/lib/gmail';
import { guard, json } from '@/lib/http';
import { parse } from '@/lib/mime';
import { plainPolish } from '@/lib/rules';
import type { PolishResponse } from '@/play/src/mail/wire';

/** POST { id, said } : what was said into round two's mic, made into the email that is saved as a draft. */
export async function POST(req: Request) {
  return guard(async () => {
    const { id, said } = (await req.json().catch(() => ({}))) as { id?: string; said?: string };
    if (typeof id !== 'string' || !id || typeof said !== 'string' || !said.trim()) return json({ error: 'id and said are needed' }, 400);
    const s = await live();
    const p = parse(await message(s, id), 2500);
    const words = said.trim().slice(0, 2000);
    const full = await polish(p, words, s.name);
    const answer: PolishResponse = full ? { full, by: 'ai' } : { full: plainPolish(p, words, s.name), by: 'rules' };
    return json(answer);
  });
}
