import { env } from '@/lib/env';
import { json } from '@/lib/http';
import { hasAccess, readSession } from '@/lib/session';

/**
 * Round two's mic streams to ElevenLabs Scribe; the headset never sees the API key, only a
 * single-use token (one session, gone after 15 minutes). Moved here from the game's Vite config
 * on 2026-11-12. `?check` says whether a token can be had, without spending one.
 *
 * Tokens cost money, so they go to browsers with the access code or a Gmail session, or to
 * everyone when SCRIBE_PUBLIC=1 (and always in development). Others get 403 and the game uses the browser's own speech
 * recognition, then the mock.
 */
export async function GET(req: Request) {
  const allowed = process.env.SCRIBE_PUBLIC === '1' || process.env.NODE_ENV === 'development' || (await hasAccess()) || !!(await readSession());
  const ready = !!env.elevenlabs && allowed;
  if (new URL(req.url).searchParams.has('check')) return json({ ready });
  if (!env.elevenlabs) return json({ error: 'ELEVENLABS_API_KEY is not set' }, 501);
  if (!allowed) return json({ error: 'The mic service is invite only' }, 403);
  try {
    const reply = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': env.elevenlabs } });
    const body = await reply.text();
    if (!reply.ok) return json({ error: `ElevenLabs said ${reply.status}`, detail: body.slice(0, 300) }, 502);
    return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}
