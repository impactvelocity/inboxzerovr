/**
 * Turns a Gmail API message (format=full) into what sorting and replies need: who, what, when,
 * Gmail's own hints, and the text of the message without its quoted history.
 */

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export interface Parsed {
  id: string;
  threadId: string;
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: Date;
  messageId: string;
  references: string;
  labels: string[];
  /** It has a List-Unsubscribe header: a mailing. */
  unsubscribe: boolean;
  /** Sent by a robot (noreply, notifications@…). */
  robot: boolean;
  /** The message's own words, quoted replies and signatures cut away, whitespace tidied. */
  text: string;
  /** Gmail's own snippet: a fallback when there is no text part. */
  snippet: string;
}

function header(part: GmailPart | undefined, name: string): string {
  const h = part?.headers?.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

const decode = (data?: string) => (data ? Buffer.from(data, 'base64url').toString('utf8') : '');

function walk(part: GmailPart | undefined, out: { plain: string[]; html: string[] }) {
  if (!part) return;
  if (part.filename) return; // an attachment
  const type = (part.mimeType ?? '').toLowerCase();
  if (type === 'text/plain' && part.body?.data) out.plain.push(decode(part.body.data));
  else if (type === 'text/html' && part.body?.data) out.html.push(decode(part.body.data));
  for (const p of part.parts ?? []) walk(p, out);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', mdash: '-', ndash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: '(c)', reg: '(R)', trade: '(TM)', zwnj: '', zwj: '' };

/** A good-enough HTML to text: blocks become lines, everything else goes. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Cut the quoted history ("On … wrote:", "> …", forwarded headers) and a signature. */
export function ownWords(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^On .{4,200}wrote:?$/i.test(t) || /^-{2,}\s*Original Message\s*-{2,}/i.test(t) || /^From: .+/.test(t) && out.length > 2) break;
    if (/^(--|__)\s*$/.test(t)) break; // a signature
    if (t.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n');
}

export const tidy = (s: string) => s.replace(/[​-‏⁠﻿͏]/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function parseFrom(from: string): { name: string; address: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].split('@')[0], address: m[2].trim().toLowerCase() };
  const address = from.trim().toLowerCase();
  return { name: address.split('@')[0], address };
}

export function parse(message: GmailMessage, maxChars = 6000): Parsed {
  const p = message.payload;
  const { name, address } = parseFrom(header(p, 'From'));
  const out = { plain: [] as string[], html: [] as string[] };
  walk(p, out);
  let text = out.plain.length ? out.plain.join('\n') : out.html.length ? htmlToText(out.html.join('\n')) : '';
  text = tidy(ownWords(text));
  if (!text) text = tidy(htmlToText(message.snippet ?? ''));
  const local = address.split('@')[0];
  return {
    id: message.id,
    threadId: message.threadId,
    fromName: name,
    fromAddress: address,
    to: header(p, 'To'),
    subject: header(p, 'Subject').trim() || '(no subject)',
    date: new Date(Number(message.internalDate ?? Date.now())),
    messageId: header(p, 'Message-ID') || header(p, 'Message-Id'),
    references: header(p, 'References'),
    labels: message.labelIds ?? [],
    unsubscribe: !!header(p, 'List-Unsubscribe'),
    robot: /^(no-?reply|do-?not-?reply|notifications?|alerts?|updates?|info|news|newsletter|marketing|hello|team|support|mailer-daemon|bounce)/i.test(local),
    text: text.length > maxChars ? text.slice(0, maxChars) : text,
    snippet: tidy(htmlToText(message.snippet ?? '')),
  };
}
