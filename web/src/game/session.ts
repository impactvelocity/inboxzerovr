import { Emails, type Email } from './emails';

export type Phase = 'Home' | 'Intro1' | 'Review' | 'Intro2' | 'Work' | 'Done';
export type ReviewAction = 'Destroy' | 'Keep';
export type WorkAction = 'Reply' | 'Dictate' | 'Later';

export interface Verdict {
  /** False only for destroying an email that needed a reply. */
  correct: boolean;
  /** Shown at the card. */
  headline: string;
  /** That was the last email of this round. */
  finished: boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
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

/**
 * One sitting of Inbox Zero. No rendering in here: just the rules (Unity: Session.cs).
 *
 *   Home    the start screen
 *   Intro1  "get ready" text
 *   Review  Round 1. Emails arrive one at a time: destroy it or keep it.
 *   Intro2  "get ready" text (skipped when nothing was kept)
 *   Work    Round 2. Each kept email again: send a ready-made reply, dictate one, or leave it
 *           for tomorrow.
 *   Done    summary, then back to home
 */
export class Session {
  phase: Phase = 'Home';
  deck: Email[] = [];
  index = 0;
  /** Emails kept in round 1, in order: the deck of round 2. */
  keptEmails: Email[] = [];
  workIndex = 0;
  /** Decisions in a row without a mistake. */
  streak = 0;
  bestStreak = 0;
  /** Real emails destroyed. */
  mistakes = 0;
  destroyed = 0;
  kept = 0;
  replied = 0;
  dictated = 0;
  later = 0;

  get remaining(): number {
    return this.phase === 'Review' ? this.deck.length - this.index : this.phase === 'Work' ? this.keptEmails.length - this.workIndex : 0;
  }

  /** S for a clean run, then A, B, C as needed emails get destroyed. */
  get rank(): string {
    return this.mistakes === 0 ? 'S' : this.mistakes === 1 ? 'A' : this.mistakes === 2 ? 'B' : 'C';
  }

  get current(): Email | null {
    if (this.phase === 'Review') return this.index < this.deck.length ? this.deck[this.index] : null;
    if (this.phase === 'Work') return this.workIndex < this.keptEmails.length ? this.keptEmails[this.workIndex] : null;
    return null;
  }

  /** Home -> the round 1 intro. The same seed deals the same emails. */
  start(seed: number, roundSize: number, junkShare: number): void {
    const rng = mulberry32(seed);
    const size = Math.max(1, Math.floor(roundSize));
    const junkCount = Math.min(size, Math.round(size * junkShare));
    const junk = shuffle(Emails.filter((e) => e.kind === 'Junk'), rng);
    const real = shuffle(Emails.filter((e) => e.kind === 'Real'), rng);
    const next: Email[] = [];
    for (let i = 0; i < junkCount; i++) next.push(junk[i % junk.length]);
    for (let i = 0; i < size - junkCount; i++) next.push(real[i % real.length]);
    this.deck = shuffle(next, rng);
    this.index = 0;
    this.keptEmails = [];
    this.workIndex = 0;
    this.streak = this.bestStreak = this.mistakes = this.destroyed = this.kept = this.replied = this.dictated = this.later = 0;
    this.phase = 'Intro1';
  }

  beginReview(): void {
    if (this.phase === 'Intro1') this.phase = 'Review';
  }

  beginWork(): void {
    if (this.phase === 'Intro2') this.phase = 'Work';
  }

  goHome(): void {
    this.phase = 'Home';
  }

  /**
   * Put the current email at the back of its round, undecided, to come round again. Nothing is
   * counted and the streak is left alone.
   */
  defer(): boolean {
    const pile = this.phase === 'Review' ? this.deck : this.phase === 'Work' ? this.keptEmails : null;
    const at = this.phase === 'Review' ? this.index : this.workIndex;
    if (pile === null || at >= pile.length) return false;
    const [email] = pile.splice(at, 1);
    pile.push(email);
    return true;
  }

  /** Round 1: destroy or keep the current email. */
  review(action: ReviewAction): Verdict | null {
    if (this.phase !== 'Review') return null;
    const email = this.current;
    if (email === null) return null;
    let correct = true;
    let headline: string;
    if (action === 'Destroy') {
      this.destroyed++;
      correct = email.kind === 'Junk';
      headline = correct ? 'DESTROYED' : 'OOPS! YOU NEEDED THAT';
    } else {
      this.kept++;
      this.keptEmails.push(email);
      headline = 'KEPT';
    }
    if (correct) this.streak++;
    else {
      this.streak = 0;
      this.mistakes++;
    }
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.index++;
    const finished = this.index >= this.deck.length;
    if (finished) this.phase = this.keptEmails.length > 0 ? 'Intro2' : 'Done';
    return { correct, headline, finished };
  }

  /** Round 2: deal with the current kept email. */
  work(action: WorkAction): Verdict | null {
    if (this.phase !== 'Work' || this.current === null) return null;
    let headline = 'SENT';
    if (action === 'Reply') this.replied++;
    else if (action === 'Dictate') this.dictated++;
    else {
      this.later++;
      headline = 'TOMORROW';
    }
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.workIndex++;
    const finished = this.workIndex >= this.keptEmails.length;
    if (finished) this.phase = 'Done';
    return { correct: true, headline, finished };
  }
}
