import { env } from './env';
import { readSession, writeSession, type Session } from './session';
import type { GmailMessage } from './mime';
import { mock } from './mock-gmail';

/**
 * Gmail through its REST API (no client library): sign-in, reading unread mail and threads,
 * archiving, drafts, and putting the demo inbox into a demo account.
 *
 * One scope does all of it: gmail.modify (read, change labels, drafts, insert). It never sends
 * and never deletes.
 */

export const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.modify'];

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN = 'https://oauth2.googleapis.com/token';

export class NotSignedIn extends Error { constructor() { super('Not signed in to Gmail'); } }
export class GmailError extends Error { constructor(public status: number, message: string) { super(message); } }

export function authUrl(redirect: string, state: string, challenge: string): string {
  const q = new URLSearchParams({
    client_id: env.googleId, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

interface TokenReply { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; scope?: string }

async function token(body: Record<string, string>): Promise<TokenReply> {
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.googleId, client_secret: env.googleSecret, ...body }) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new GmailError(r.status, `Google token: ${json.error ?? r.status} ${json.error_description ?? ''}`.trim());
  return json as TokenReply;
}

/** The sign-in's code, traded for tokens and who it is. */
export async function finishSignIn(code: string, verifier: string, redirect: string): Promise<Session> {
  const t = await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect });
  if (!t.refresh_token) throw new GmailError(400, 'Google gave no refresh token');
  const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } }).then(r => r.json()).catch(() => ({}));
  return { refresh: t.refresh_token, access: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000, email: me.email ?? '', name: me.given_name ?? me.name ?? '' };
}

export async function revoke(session: Session) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(session.refresh)}`, { method: 'POST' }).catch(() => {});
}

/** The signed-in session with a live access token (refreshed, and the cookie rewritten, when it has run out). */
export async function live(): Promise<Session> {
  if (env.mockGmail) return mock.session();
  const s = await readSession();
  if (!s) throw new NotSignedIn();
  if (Date.now() < s.expires) return s;
  try {
    const t = await token({ grant_type: 'refresh_token', refresh_token: s.refresh });
    const next = { ...s, access: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
    await writeSession(next);
    return next;
  } catch (e) {
    // A refresh token from an app in Testing mode lasts seven days: then it is sign in again.
    if (e instanceof GmailError && e.status === 400) throw new NotSignedIn();
    throw e;
  }
}

async function call<T>(s: Session, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${s.access}`, 'Content-Type': 'application/json', ...init?.headers } });
  if (r.status === 401) throw new NotSignedIn();
  if (!r.ok) throw new GmailError(r.status, `Gmail ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}

/** The newest `count` unread emails in the inbox, newest first as the inbox lists them, and how many are unread in all. */
export async function unread(s: Session, count: number): Promise<{ ids: { id: string; threadId: string }[]; total: number }> {
  if (env.mockGmail) return mock.unread(count);
  const [list, label] = await Promise.all([
    call<{ messages?: { id: string; threadId: string }[] }>(s, `/messages?${new URLSearchParams({ q: 'is:unread in:inbox -in:chats', maxResults: String(count) })}`),
    call<{ messagesUnread?: number }>(s, '/labels/INBOX').catch(() => ({ messagesUnread: undefined })),
  ]);
  const ids = list.messages ?? [];
  return { ids, total: label.messagesUnread ?? ids.length };
}

export const message = (s: Session, id: string) => env.mockGmail ? mock.message(id) : call<GmailMessage>(s, `/messages/${encodeURIComponent(id)}?format=full`);
export const thread = (s: Session, id: string) => env.mockGmail ? mock.thread(id) : call<{ id: string; messages: GmailMessage[] }>(s, `/threads/${encodeURIComponent(id)}?format=full`);

/** Archive: out of the inbox, nothing else (still unread, still in All Mail). */
export async function archive(s: Session, ids: string[]) {
  if (env.mockGmail) return mock.archive(ids);
  for (let i = 0; i < ids.length; i += 1000) await call(s, '/messages/batchModify', { method: 'POST', body: JSON.stringify({ ids: ids.slice(i, i + 1000), removeLabelIds: ['INBOX'] }) });
}

/** RFC 2047 for a header that is not plain ASCII. */
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

/** A reply saved as a draft on its thread: to the sender, Re: the subject, threaded by its Message-ID. */
export async function draftReply(s: Session, original: { threadId: string; fromName: string; fromAddress: string; subject: string; messageId: string; references: string }, body: string) {
  const subject = /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`;
  const to = original.fromName && original.fromName !== original.fromAddress ? `${word(original.fromName)} <${original.fromAddress}>` : original.fromAddress;
  const lines = [
    `To: ${to}`,
    `Subject: ${word(subject)}`,
    ...(original.messageId ? [`In-Reply-To: ${original.messageId}`, `References: ${(original.references + ' ' + original.messageId).trim()}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ];
  if (env.mockGmail) return mock.draft(original.threadId, lines.join('\r\n'), body);
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
  return call<{ id: string }>(s, '/drafts', { method: 'POST', body: JSON.stringify({ message: { raw, threadId: original.threadId } }) });
}

/** Puts a made-up email straight into the inbox as unread, without sending anything (the demo account). */
export async function insert(s: Session, raw: string) {
  return call<{ id: string }>(s, '/messages?internalDateSource=dateHeader', { method: 'POST', body: JSON.stringify({ raw: Buffer.from(raw, 'utf8').toString('base64url'), labelIds: ['INBOX', 'UNREAD'] }) });
}
