import { GmailError, NotSignedIn } from './gmail';

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Runs a route, turning the usual failures into answers the game understands (401: sign in again). */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (e) {
    if (e instanceof NotSignedIn) return json({ error: 'signed-out' }, 401);
    if (e instanceof GmailError) { console.warn(e.message); return json({ error: e.message }, e.status === 429 ? 429 : 502); }
    console.error(e);
    return json({ error: 'Something went wrong' }, 500);
  }
}

/** Runs `fn` over `items` with at most `n` at once, in order of starting. */
export async function pool<T>(items: readonly T[], n: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } }));
}

/** A redirect whose headers stay open, so the cookies set during the request go with it. */
export const redirect = (url: string) => new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
