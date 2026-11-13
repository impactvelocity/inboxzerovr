import { cookies, headers } from 'next/headers';
import { EncryptJWT, jwtDecrypt, SignJWT, jwtVerify } from 'jose';
import { env } from './env';

/**
 * Three cookies, nothing on the server:
 *   izvr_s  the Gmail session: the refresh token and the current access token, encrypted (JWE)
 *   izvr_a  this browser has the access code, so Connect Gmail is offered (signed)
 *   izvr_o  an OAuth sign-in in progress: its state and PKCE verifier, for ten minutes (encrypted)
 * All http-only, SameSite=Lax (the sign-in comes back to us as a top-level GET).
 */

export interface Session {
  refresh: string;
  access: string;
  /** When the access token runs out, in ms since 1970. */
  expires: number;
  email: string;
  name: string;
}

interface Pending { state: string; verifier: string; back: string }

const S = 'izvr_s', A = 'izvr_a', O = 'izvr_o';
const MONTH = 60 * 60 * 24 * 30;

let keyCache: Uint8Array | null = null;
async function key(): Promise<Uint8Array> {
  if (!env.authSecret) throw new Error('AUTH_SECRET is not set');
  if (!keyCache) keyCache = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.authSecret)));
  return keyCache;
}

async function seal(payload: Record<string, unknown>, seconds: number): Promise<string> {
  return new EncryptJWT(payload).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuedAt().setExpirationTime(`${seconds}s`).encrypt(await key());
}
async function open<T>(token: string | undefined): Promise<T | null> {
  if (!token || !env.authSecret) return null;
  try { return (await jwtDecrypt(token, await key())).payload as T; } catch { return null; }
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

async function set(name: string, value: string, maxAge: number) {
  (await cookies()).set(name, value, { httpOnly: true, sameSite: 'lax', secure: await secure(), path: '/', maxAge });
}

export async function readSession(): Promise<Session | null> {
  return open<Session>((await cookies()).get(S)?.value);
}
export async function writeSession(session: Session) { await set(S, await seal({ ...session }, MONTH), MONTH); }
export async function clearSession() { (await cookies()).delete(S); }

export async function hasAccess(): Promise<boolean> {
  const token = (await cookies()).get(A)?.value;
  if (!token || !env.authSecret) return false;
  try { await jwtVerify(token, await key()); return true; } catch { return false; }
}
export async function grantAccess() {
  const token = await new SignJWT({ access: true }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${MONTH}s`).sign(await key());
  await set(A, token, MONTH);
}
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

export async function writePending(p: Pending) { await set(O, await seal({ ...p }, 600), 600); }
export async function takePending(): Promise<Pending | null> {
  const jar = await cookies();
  const p = await open<Pending>(jar.get(O)?.value);
  jar.delete(O);
  return p;
}
