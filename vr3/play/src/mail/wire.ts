import type { Category, Email, EmailKind } from './emails';

/**
 * What the game and the site's API (vr3/app/api, vr3/lib) say to each other about real mail.
 * Both sides import this file, so a change here is a change to both.
 *
 * Nothing here is kept anywhere: the server reads Gmail, sorts, and forgets; the game holds the
 * cards and drafts in memory for one game.
 */

export const Categories: readonly Category[] = [
  'Work', 'Personal', 'Newsletter', 'Spam', 'Promo', 'Receipt', 'Bill', 'Tracking', 'Social', 'Calendar', 'Alert',
];
export const Kinds: readonly EmailKind[] = ['Junk', 'Real'];

/** One unread email made into a card: the game's own Email, with where it came from. */
export interface WireEmail extends Omit<Email, 'replies'> {
  id: string;
  threadId: string;
  needsReply: boolean;
  /** 'ai' when the model sorted it; 'rules' when it was sorted without one (no key, or the model failed). */
  sortedBy: 'ai' | 'rules';
}

/** GET /api/inbox?count=N streams one JSON object per line: first `meta`, then an `email` as each is sorted, then `done`. */
export type InboxLine =
  | { type: 'meta'; count: number; unread: number; ai: boolean }
  | { type: 'email'; index: number; email: WireEmail }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** A reply in two sizes: what the bubble shows, and the email that is saved as a draft. */
export interface WireReply { short: string; full: string }

/** POST /api/replies { id } → two replies: A goes along with it, B is a kind alternative. */
export interface RepliesResponse { replies: [WireReply, WireReply]; by: 'ai' | 'rules' }

/** POST /api/polish { id, said } → what was said into the mic, made into the email that is saved. */
export interface PolishResponse { full: string; by: 'ai' | 'rules' }

/** POST /api/apply: what the game did to real mail. Cut is archived; a sent reply becomes a draft on its thread. Kept and later change nothing. */
export interface ApplyRequest { archive: string[]; drafts: { id: string; body: string }[] }
export interface ApplyResponse { archived: number; drafts: number; failed: string[] }

/** GET /api/me: what the home screen needs to know. */
export interface MeResponse {
  /** This browser has the access code (the ?access= link), so Connect Gmail is offered. */
  access: boolean;
  /** Google sign-in is set up on the server (client id and secret). */
  google: boolean;
  /** Signed in with Gmail. */
  connected: boolean;
  email?: string;
  name?: string;
  /** The AI Gateway key is set: sorting and replies use the models (otherwise rules and stock replies). */
  ai: boolean;
}

/**
 * The demo inbox, baked (vr3: `npm run bake`): made-up but real-looking emails run once through the
 * same sorting and replies as real mail, and kept in src/mail/demo-inbox.json. Each also carries
 * what the mock mic "hears" when there is no mic.
 */
export interface BakedEmail extends WireEmail { replies: [WireReply, WireReply]; said: string }
export interface DemoInbox { baked: string; emails: BakedEmail[] }

/** How many unread emails a game can take, and the default (Settings on the home screen). */
export const CountChoices = [5, 10, 15, 20] as const;
export const DefaultCount = 10;
export const MaxCount = 30;
