import { Fixtures, asRaw } from '@/lib/demo-fixtures';
import { env } from '@/lib/env';
import { insert, live } from '@/lib/gmail';
import { guard, json } from '@/lib/http';

/**
 * POST : puts the demo inbox (lib/demo-fixtures.ts) into the signed-in Gmail as unread mail,
 * without sending anything. For a demo account only: allowed in development, or with ALLOW_SEED=1.
 */
export async function POST() {
  if (!env.allowSeed) return json({ error: 'Seeding is off (set ALLOW_SEED=1, for a demo account only)' }, 403);
  return guard(async () => {
    const s = await live();
    const now = Date.now();
    let added = 0;
    for (const f of Fixtures) { await insert(s, asRaw(f, s.email || 'me@demo.example', now)); added++; }
    return json({ added, into: s.email });
  });
}
