/**
 * Bakes the demo inbox: runs lib/demo-fixtures.ts through the same sorting and replies as real
 * mail and writes play/src/mail/demo-inbox.json, which the public demo plays (no server needed).
 *
 *   npm run bake            (needs AI_GATEWAY_API_KEY in .env.local)
 *
 * Without a key it stops: a demo sorted by rules is what the game already falls back to.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sortEmail, writeReplies } from '../lib/ai';
import { asParsed, Fixtures } from '../lib/demo-fixtures';
import { env } from '../lib/env';
import { stockReplies } from '../lib/rules';
import type { BakedEmail, DemoInbox } from '../play/src/mail/wire';

if (!env.ai) { console.error('AI_GATEWAY_API_KEY is not set (in vr3/.env.local): nothing baked.'); process.exit(1); }

const out = fileURLToPath(new URL('../play/src/mail/demo-inbox.json', import.meta.url));
const emails: BakedEmail[] = [];
let n = 0;
await Promise.all(Fixtures.map(async (f, i) => {
  const p = asParsed(f);
  const card = await sortEmail(p);
  const replies = (card.kind === 'Real' ? await writeReplies([p], '') : null) ?? stockReplies(p, '');
  emails[i] = { ...card, replies, said: f.said ?? replies[0].short };
  console.log(`${String(++n).padStart(2)}/${Fixtures.length}  ${card.sortedBy === 'ai' ? 'ai   ' : 'RULES'}  ${card.kind.padEnd(4)} ${card.category.padEnd(10)} ${card.subject}`);
}));
const inbox: DemoInbox = { baked: new Date().toISOString(), emails };
writeFileSync(out, `${JSON.stringify(inbox, null, 2)}\n`);
console.log(`wrote ${emails.length} emails to play/src/mail/demo-inbox.json (sorted with ${env.sortModel}, replies with ${env.replyModel})`);
