import type { Category } from '../play/src/mail/emails';

/** Small text helpers for turning an agent's emails into cards, and the mic's words into an email without a model. */

/** Cut to at most `n` characters at a word, with '...' when something was cut. */
export function clamp(s: string | null | undefined, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 3), space = cut.lastIndexOf(' ');
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}...`;
}

const PERSON: readonly Category[] = ['Work', 'Personal', 'Calendar'];
/** Cards for mail from people: they show the start of the message rather than a one-line gist. */
export const isPersonCard = (c: Category) => PERSON.includes(c);
