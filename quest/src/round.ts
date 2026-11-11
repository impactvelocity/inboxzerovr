import { EMAILS, type Email } from './emails.js';

/**
 * One sitting of Inbox Zero. No rendering in here: just the rules.
 *
 *   home    the start screen
 *   intro1  "get ready" text
 *   review  Round 1. Emails arrive one at a time: destroy it or keep it.
 *   intro2  "get ready" text (skipped when nothing was kept)
 *   work    Round 2. Each kept email again: send a ready-made reply,
 *           dictate one, or leave it for tomorrow.
 *   done    summary, then back to home
 */

// ------------------------------------------------------------------ tuning
export const ROUND = {
  size: 12, // emails in round 1
  junkShare: 0.65, // fraction of them that are junk
};

/** Any ROUND key can be set from the page address, e.g. `?size=8`. */
export function applyRoundOverrides(search: string): void {
  const values = ROUND as Record<string, number>;
  const params = new URLSearchParams(search);
  for (const key of Object.keys(values)) {
    const raw = params.get(key);
    if (raw !== null && raw !== '' && Number.isFinite(Number(raw))) {
      values[key] = Number(raw);
    }
  }
}

export type Phase = 'home' | 'intro1' | 'review' | 'intro2' | 'work' | 'done';
export type ReviewAction = 'destroy' | 'keep';
export type WorkAction = 'reply' | 'dictate' | 'later';

export interface Verdict {
  /** False only for destroying an email that needed a reply. */
  correct: boolean;
  headline: string; // shown at the card
  finished: boolean; // that was the last email of this round
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export class Session {
  phase: Phase = 'home';
  deck: Email[] = [];
  index = 0;
  /** Emails kept in round 1, in order: the deck of round 2. */
  keptEmails: Email[] = [];
  workIndex = 0;
  streak = 0; // decisions in a row without a mistake
  mistakes = 0; // real emails destroyed
  destroyed = 0;
  kept = 0;
  replied = 0;
  dictated = 0;
  later = 0;

  get remaining(): number {
    if (this.phase === 'review') return this.deck.length - this.index;
    if (this.phase === 'work') return this.keptEmails.length - this.workIndex;
    return 0;
  }

  get current(): Email | null {
    if (this.phase === 'review') return this.deck[this.index] ?? null;
    if (this.phase === 'work') return this.keptEmails[this.workIndex] ?? null;
    return null;
  }

  /** Home -> the round 1 intro. */
  start(seed: number): void {
    const rng = mulberry32(seed);
    const size = Math.max(1, Math.round(ROUND.size));
    const junkCount = Math.min(size, Math.round(size * ROUND.junkShare));
    const junk = shuffle(
      EMAILS.filter((email) => email.kind === 'junk'),
      rng,
    );
    const real = shuffle(
      EMAILS.filter((email) => email.kind === 'real'),
      rng,
    );
    const deck: Email[] = [];
    for (let i = 0; i < junkCount; i++) deck.push(junk[i % junk.length]);
    for (let i = 0; i < size - junkCount; i++) deck.push(real[i % real.length]);
    this.deck = shuffle(deck, rng);
    this.index = 0;
    this.keptEmails = [];
    this.workIndex = 0;
    this.streak = 0;
    this.mistakes = 0;
    this.destroyed = 0;
    this.kept = 0;
    this.replied = 0;
    this.dictated = 0;
    this.later = 0;
    this.phase = 'intro1';
  }

  beginReview(): void {
    if (this.phase === 'intro1') this.phase = 'review';
  }

  beginWork(): void {
    if (this.phase === 'intro2') this.phase = 'work';
  }

  goHome(): void {
    this.phase = 'home';
  }

  /** Round 1: destroy or keep the current email. */
  review(action: ReviewAction): Verdict | null {
    if (this.phase !== 'review') return null;
    const email = this.current;
    if (!email) return null;
    let correct = true;
    let headline: string;
    if (action === 'destroy') {
      this.destroyed += 1;
      correct = email.kind === 'junk';
      headline = correct ? 'DESTROYED' : 'OOPS! YOU NEEDED THAT';
    } else {
      this.kept += 1;
      this.keptEmails.push(email);
      headline = 'KEPT';
    }
    if (correct) this.streak += 1;
    else {
      this.streak = 0;
      this.mistakes += 1;
    }
    this.index += 1;
    const finished = this.index >= this.deck.length;
    if (finished) this.phase = this.keptEmails.length > 0 ? 'intro2' : 'done';
    return { correct, headline, finished };
  }

  /** Round 2: deal with the current kept email. */
  work(action: WorkAction): Verdict | null {
    if (this.phase !== 'work') return null;
    if (!this.current) return null;
    let headline = 'SENT';
    if (action === 'reply') this.replied += 1;
    else if (action === 'dictate') this.dictated += 1;
    else {
      this.later += 1;
      headline = 'TOMORROW';
    }
    this.streak += 1;
    this.workIndex += 1;
    const finished = this.workIndex >= this.keptEmails.length;
    if (finished) this.phase = 'done';
    return { correct: true, headline, finished };
  }
}
