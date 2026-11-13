import type { Category, EmailKind } from '../play/src/mail/emails';
import type { WireEmail, WireReply } from '../play/src/mail/wire';
import type { Parsed } from './mime';

/**
 * Sorting and replies without a model: used when there is no AI Gateway key, and for any email
 * the model could not do. Plain rules on Gmail's own labels, the sender and the words. Good
 * enough to play; the model's cards read better.
 */

/** Cut to at most `n` characters at a word, with '...' when something was cut. */
export function clamp(s: string | null | undefined, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 3), space = cut.lastIndexOf(' ');
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}...`;
}

const FREE_MAIL = /@(gmail|googlemail|icloud|me|mac|yahoo|ymail|outlook|hotmail|live|msn|aol|proton|protonmail|pm|fastmail|hey|gmx|zoho)\./i;
const PERSON: readonly Category[] = ['Work', 'Personal', 'Calendar'];
export const isPersonCard = (c: Category) => PERSON.includes(c);

function category(p: Parsed): Category {
  const words = `${p.subject}\n${p.text.slice(0, 1500)}`;
  if (p.labels.includes('CATEGORY_PROMOTIONS')) return 'Promo';
  if (p.labels.includes('CATEGORY_SOCIAL')) return 'Social';
  if (/\b(receipt|your order|order (confirmation|#)|invoice|payment received|thanks for your (order|purchase))\b/i.test(words)) return 'Receipt';
  if (/\b(your (bill|statement)|payment (is )?due|amount due|payment failed|card (was )?declined|autopay)\b/i.test(words)) return 'Bill';
  if (/\b(shipped|out for delivery|was delivered|tracking number|on its way|delivery (attempt|failed))\b/i.test(words)) return 'Tracking';
  if (/\b(security alert|new sign-?in|password|verification code|unusual (activity|sign)|suspicious)\b/i.test(words)) return 'Alert';
  if (/\b(invitation|invited you|rsvp|calendar)\b/i.test(words) || /^(invitation|updated invitation|accepted|declined):/i.test(p.subject)) return 'Calendar';
  if (p.labels.includes('CATEGORY_FORUMS') || p.unsubscribe) return /\b(\d+% off|sale|deal|discount|offer|free shipping|last chance)\b/i.test(words) ? 'Promo' : 'Newsletter';
  if (p.robot) return 'Alert';
  return FREE_MAIL.test(p.fromAddress) ? 'Personal' : 'Work';
}

function headline(s: string) { return clamp(s.replace(/^(re|fwd?):\s*/gi, '').toUpperCase(), 30); }

/** The first sentences of the text, up to about `n` characters. */
function opening(text: string, n: number) {
  const body = withoutSignOff(text).replace(/^(hi|hey|hello|dear|good (morning|afternoon|evening))\b[^\n,!.:]{0,30}[,!.:]?\s*/i, '');
  return clamp(body.replace(/\n+/g, ' '), n);
}

/** Drops the sign-off: short closing lines (a name, "Thanks,", a company) at the end. */
function withoutSignOff(text: string) {
  const lines = text.trim().split('\n');
  while (lines.length > 1) {
    const last = lines[lines.length - 1].trim();
    if (!last || /^(thanks|thank you|best|cheers|love|regards|warmly|sincerely|xo+|sent from)\b/i.test(last) || (last.length <= 32 && !/[.?!:]$/.test(last))) lines.pop();
    else break;
  }
  return lines.join('\n');
}

export function byRules(p: Parsed): WireEmail {
  const c = category(p);
  const person = isPersonCard(c) && !p.robot;
  const words = `${p.subject}\n${p.text.slice(0, 1500)}`;
  const amount = words.match(/[$€£]\s?\d[\d,]*(\.\d\d)?/)?.[0]?.replace(/\s/g, '');
  const failed = /\b(failed|declined|missed|unable to deliver|exception|returned)\b/i.test(words);
  const kind: EmailKind = person || c === 'Bill' || (c === 'Tracking' && failed) || (c === 'Alert' && /\b(security|sign-?in|unusual|suspicious)\b/i.test(p.subject)) ? 'Real' : 'Junk';
  const step = /\bdelivered\b/i.test(words) ? 3 : /\bout for delivery\b/i.test(words) ? 2 : /\b(shipped|on its way|in transit)\b/i.test(words) ? 1 : 0;
  const email: WireEmail = {
    id: p.id, threadId: p.threadId, sortedBy: 'rules',
    kind, category: c, needsReply: person,
    from: clamp(p.fromName || p.fromAddress, 24),
    subject: clamp(p.subject.replace(/^((re|fwd?):\s*)+/i, ''), 60),
    step: c === 'Tracking' ? step : 0,
    failed: (c === 'Tracking' || c === 'Bill') && failed,
  };
  if (isPersonCard(c)) email.body = opening(p.text || p.snippet, 200);
  else if (c === 'Newsletter' || c === 'Promo') {
    const lines = (p.text || p.snippet).split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(l => l.length >= 12 && l.length <= 70 && !/unsubscribe|view (this|in) (email|browser)|privacy|©|\(c\)/i.test(l));
    email.items = [headline(p.subject), ...lines.slice(0, 4).map(l => clamp(l, 40))];
  } else email.snippet = opening(p.text || p.snippet, 80);
  if ((c === 'Receipt' || c === 'Bill') && amount) email.amount = amount;
  if (c === 'Bill') email.due = failed ? 'PAYMENT FAILED' : 'DUE SOON';
  return email;
}

const first = (name: string) => name.split(/[\s(]/)[0] || 'there';

/** Two stock replies for when no model can write them. */
export function stockReplies(p: Parsed, me: string): [WireReply, WireReply] {
  const hi = `Hi ${first(p.fromName)},`, sign = me ? `\n\nBest,\n${first(me)}` : '\n\nBest';
  return [
    { short: 'Thanks, sounds good to me!', full: `${hi}\n\nThanks for this, sounds good to me.${sign}` },
    { short: 'Thanks! Could we talk this through later this week?', full: `${hi}\n\nThanks for sending this. Could we talk it through later this week?${sign}` },
  ];
}

/** What was said into the mic, as an email, without a model. */
export function plainPolish(p: Parsed, said: string, me: string): string {
  const text = said.trim().replace(/^\w/, c => c.toUpperCase());
  return `Hi ${first(p.fromName)},\n\n${/[.!?]$/.test(text) ? text : `${text}.`}${me ? `\n\nBest,\n${first(me)}` : '\n\nBest'}`;
}
