import type { Category, Email } from './emails';

/**
 * What the game and the site's API (vr3/app/api, vr3/lib) say to each other. Both sides import
 * this file, so a change here is a change to both.
 *
 * Since 2026-11-13 the only real mail is an agent round (below): the game never connects to a
 * mailbox, and the only model on our side writes up what was said into the mic.
 */

export const Categories: readonly Category[] = [
  'Work', 'Personal', 'Newsletter', 'Spam', 'Promo', 'Receipt', 'Bill', 'Tracking', 'Social', 'Calendar', 'Alert',
];

// ---------------------------------------------------------------- agent rounds (2026-11-13)
//
// The player's own AI agent (any agent that can read their mail: through MCP at /mcp, or plain
// REST at /api/rounds) sends a round of already summarised emails, gets a 4-digit code back, and
// the player types the code into the game. When the game is over the results wait for the agent,
// which shows them to the player and does the archiving and replying itself. The server never
// sees the mailbox, only what the agent chose to send, and deletes it when the game is played.
// The server side is vr3/lib/rounds.ts; the agent's instructions are vr3/public/agent.md.

/** One email as the game gets it from an agent round: the card, and the agent's own reference for it. */
export interface AgentCard extends Omit<Email, 'replies'> {
  /** The agent's opaque reference (never a real message id): the game gives it back with the result. */
  ref: string;
  replies: [string, string];
}

/** GET /api/rounds/{code}: the round, for the game. */
export interface AgentRoundResponse { code: string; title: string; emails: AgentCard[] }

/** What the game did with one email of an agent round. Anything not listed was left as it was. */
export type AgentOutcome =
  | { ref: string; action: 'archive' }
  | { ref: string; action: 'reply'; reply_index: number }
  | { ref: string; action: 'reply'; dictated: string };

/** POST /api/rounds/{code}/results from the game. */
export interface AgentResultsRequest { outcomes: AgentOutcome[] }
export interface AgentResultsResponse { archive: number; reply: number; leave: number }
