import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';

/**
 * Two cookies, both only to say who may use the mic (its tokens cost money: app/api/scribe-token).
 * Nothing about anyone's mail is in either.
 *   izvr_a  this browser has an ?access= code (judges): the mic in the demo too, for a month (signed)
 *   izvr_r  this browser opened an agent round in the last 3 hours (signed)
 * Both http-only, SameSite=Lax. Without AUTH_SECRET, neither is given.
 */

const A = 'izvr_a', R = 'izvr_r';
const MONTH = 60 * 60 * 24 * 30;

let keyCache: Uint8Array | null = null;
async function key(): Promise<Uint8Array> {
  if (!env.authSecret) throw new Error('AUTH_SECRET is not set');
  if (!keyCache) keyCache = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.authSecret)));
  return keyCache;
}

/** Whether this request came over https (directly, or through a proxy that says so). */
export async function secure(): Promise<boolean> {
  const h = await headers();
  return (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https' || env.publicOrigin.startsWith('https');
}

/** The origin the browser sees: through the game's dev proxy (5183) or Next itself (3000) or the deployed site. */
export async function origin(): Promise<string> {
  if (env.publicOrigin) return env.publicOrigin.replace(/\/$/, '');
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000').split(',')[0].trim();
  const proto = (h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')).split(',')[0].trim();
  return `${proto}://${host}`;
}

async function grant(name: string, seconds: number) {
  if (!env.authSecret) return;
  const token = await new SignJWT({ [name]: true }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${seconds}s`).sign(await key());
  (await cookies()).set(name, token, { httpOnly: true, sameSite: 'lax', secure: await secure(), path: '/', maxAge: seconds });
}
async function has(name: string): Promise<boolean> {
  const token = (await cookies()).get(name)?.value;
  if (!token || !env.authSecret) return false;
  try { await jwtVerify(token, await key()); return true; } catch { return false; }
}

export const grantAccess = () => grant(A, MONTH);
export const hasAccess = () => has(A);
/** An agent round was opened here (lib/rounds.ts). */
export const grantRound = () => grant(R, 3 * 3600);
export const hasRound = () => has(R);

/** Whether a code is one of ACCESS_CODE's, compared in constant time. */
export function codeMatches(code: string): boolean {
  const given = new TextEncoder().encode(code);
  let ok = false;
  for (const c of env.accessCodes) {
    const want = new TextEncoder().encode(c);
    let diff = want.length ^ given.length;
    for (let i = 0; i < want.length; i++) diff |= want[i] ^ (given[i] ?? 0);
    if (diff === 0) ok = true;
  }
  return ok;
}
