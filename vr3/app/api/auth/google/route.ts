import { googleReady } from '@/lib/env';
import { authUrl } from '@/lib/gmail';
import { json, redirect } from '@/lib/http';
import { hasAccess, origin, writePending } from '@/lib/session';

const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');

/** GET ?back=/play/ : off to Google's sign-in (only with the access code), coming back to `back`. */
export async function GET(req: Request) {
  if (!googleReady()) return json({ error: 'Google sign-in is not set up on this server' }, 501);
  if (!(await hasAccess())) return json({ error: 'Connecting Gmail is invite only' }, 403);
  const back = new URL(req.url).searchParams.get('back') ?? '/play/';
  const state = b64(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  await writePending({ state, verifier, back: back.startsWith('/') && !back.startsWith('//') ? back : '/play/' });
  return redirect(authUrl(`${await origin()}/api/auth/callback`, state, challenge));
}
