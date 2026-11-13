import { finishSignIn } from '@/lib/gmail';
import { redirect } from '@/lib/http';
import { origin, takePending, writeSession } from '@/lib/session';

/** Google comes back here. The code is traded for tokens, kept only in the encrypted cookie, and it is back to the game. */
export async function GET(req: Request) {
  const url = new URL(req.url), base = await origin();
  const pending = await takePending();
  const to = pending?.back ?? '/play/';
  const back = (why: string) => redirect(`${base}${to}${why ? `${to.includes('?') ? '&' : '?'}gmail=${why}` : ''}`);
  if (!pending || url.searchParams.get('state') !== pending.state) return back('expired');
  if (url.searchParams.get('error')) return back(url.searchParams.get('error') === 'access_denied' ? 'denied' : 'failed');
  const code = url.searchParams.get('code');
  if (!code) return back('failed');
  try {
    await writeSession(await finishSignIn(code, pending.verifier, `${base}/api/auth/callback`));
    return back('');
  } catch (e) {
    console.warn(`[auth] ${(e as Error).message}`);
    return back('failed');
  }
}
