import { env } from '@/lib/env';
import { json } from '@/lib/http';
import { codeMatches, grantAccess } from '@/lib/session';

/** POST { code }: the ?access= code from the link (judges). Right, and this browser gets the mic in the demo for a month. */
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!env.authSecret || !env.accessCodes.length) return json({ error: 'No access codes are set up' }, 501);
  if (typeof code !== 'string' || !codeMatches(code)) { await new Promise(r => setTimeout(r, 400)); return json({ error: 'That code is not right' }, 403); }
  await grantAccess();
  return json({ access: true });
}
