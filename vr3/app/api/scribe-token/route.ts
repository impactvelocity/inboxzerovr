import { gateway } from 'ai';
import { env } from '@/lib/env';
import { json } from '@/lib/http';
import { hasAccess, hasRound } from '@/lib/session';

/**
 * Round two's mic streams to ElevenLabs Scribe v2 realtime through the Vercel AI Gateway (2026-11-14: "also use this for
 * dication, so its all in AI gateway"; it went straight to ElevenLabs before). The headset never sees the gateway key, only a
 * short-lived client secret (`vcst_…`) and the gateway's WebSocket address; play/src/dictate.ts connects with them. Minting
 * needs a real AI_GATEWAY_API_KEY: Vercel's OIDC token is refused for client secrets. `?check` says whether a token can be
 * had, without spending one.
 *
 * Tokens cost money, so they go to browsers that opened an agent round or have the access code, or to
 * everyone when SCRIBE_PUBLIC=1 (and always in development). Others get 403 and the game uses the browser's own speech
 * recognition, then the mock.
 */
export async function GET(req: Request) {
  const allowed = process.env.SCRIBE_PUBLIC === '1' || process.env.NODE_ENV === 'development' || (await hasAccess()) || (await hasRound());
  const ready = env.gatewayKey && allowed;
  if (new URL(req.url).searchParams.has('check')) return json({ ready });
  if (!env.gatewayKey) return json({ error: 'AI_GATEWAY_API_KEY is not set' }, 501);
  if (!allowed) return json({ error: 'The mic service is invite only' }, 403);
  try {
    const { token, url } = await gateway.experimental_transcription.getToken({ model: env.micModel, expiresAfterSeconds: 120 });
    return json({ token, url });
  } catch (e) {
    return json({ error: `AI Gateway: ${(e as Error).message}` }, 502);
  }
}
