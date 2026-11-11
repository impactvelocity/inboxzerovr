import type {
  ActionRecord,
  ActionType,
  Counts,
  Deck,
  Phase,
  SessionItem,
  SessionState,
} from './types';

/** The action each tutorial card expects, in queue order. */
export const TUTORIAL_EXPECTED: ActionType[] = ['archive', 'keep', 'defer'];

export function createDeck(messageIds: string[]): Deck {
  const items: Record<string, SessionItem> = {};
  for (const id of messageIds) {
    items[id] = { messageId: id, disposition: 'pending', reviewStatus: 'none', syncStatus: 'local' };
  }
  return { queue: [...messageIds], items, history: [] };
}

export function createSession(opts: {
  sessionId: string;
  now: Date;
  tutorialIds: string[];
  messageIds: string[];
  batchLabel: string;
}): SessionState {
  return {
    schemaVersion: 1,
    sessionId: opts.sessionId,
    source: 'demo',
    batchLabel: opts.batchLabel,
    startedAt: opts.now.toISOString(),
    tutorialDone: opts.tutorialIds.length === 0,
    undoTaught: false,
    finished: false,
    tutorial: createDeck(opts.tutorialIds),
    main: createDeck(opts.messageIds),
  };
}

export function countDeck(deck: Deck): Counts {
  const c: Counts = { total: deck.queue.length, pending: 0, kept: 0, archived: 0, deferred: 0, handled: 0, drafts: 0 };
  for (const id of deck.queue) {
    const item = deck.items[id];
    c[item.disposition] += 1;
    if (item.draftId) c.drafts += 1;
  }
  return c;
}

export function phaseOf(state: SessionState | null): Phase {
  if (!state) return 'setup';
  if (!state.tutorialDone) return 'tutorial';
  const c = countDeck(state.main);
  if (c.pending > 0) return 'triage';
  if (c.kept > 0 && !state.finished) return 'review';
  return 'complete';
}

export function activeDeck(state: SessionState): Deck {
  return state.tutorialDone ? state.main : state.tutorial;
}

/** First message still awaiting a triage decision, or null. */
export function currentMessageId(deck: Deck): string | null {
  return deck.queue.find((id) => deck.items[id].disposition === 'pending') ?? null;
}

export function keptIds(deck: Deck): string[] {
  return deck.queue.filter((id) => deck.items[id].disposition === 'kept');
}

const TRIAGE_ACTIONS: ActionType[] = ['archive', 'keep', 'defer'];

export interface ActionExtras {
  actionId: string;
  now: Date;
  reminderId?: string;
  draftId?: string;
  createdReminderId?: string;
  savedDraftId?: string;
  previousDraft?: ActionRecord['previousDraft'];
}

export type RejectReason = 'unknown-message' | 'not-current' | 'already-resolved' | 'not-kept';

export type ApplyResult = { ok: true; deck: Deck; action: ActionRecord } | { ok: false; reason: RejectReason };

/** Whether `type` may be applied to `messageId` right now, without changing anything. */
export function checkAction(deck: Deck, messageId: string, type: ActionType): true | RejectReason {
  const item = deck.items[messageId];
  if (!item) return 'unknown-message';
  if (TRIAGE_ACTIONS.includes(type)) {
    if (item.disposition !== 'pending') return 'already-resolved';
    if (currentMessageId(deck) !== messageId) return 'not-current';
    return true;
  }
  if (item.disposition !== 'kept') return item.disposition === 'pending' ? 'not-kept' : 'already-resolved';
  return true;
}

/**
 * Apply one action to a deck. Pure: returns a new deck and the recorded
 * action, or a rejection. A second attempt on an already resolved message is
 * rejected, which is what suppresses duplicate submissions.
 */
export function applyAction(deck: Deck, messageId: string, type: ActionType, extras: ActionExtras): ApplyResult {
  const check = checkAction(deck, messageId, type);
  if (check !== true) return { ok: false, reason: check };
  const prev = deck.items[messageId];
  const next: SessionItem = { ...prev };
  switch (type) {
    case 'archive':
      next.disposition = 'archived';
      break;
    case 'keep':
      next.disposition = 'kept';
      next.reviewStatus = 'unopened';
      break;
    case 'defer':
    case 'remind':
      next.disposition = 'deferred';
      next.reminderId = extras.reminderId;
      break;
    case 'handle':
      next.disposition = 'handled';
      break;
    case 'draft_finish':
      next.disposition = 'handled';
      next.reviewStatus = 'drafted';
      next.draftId = extras.draftId;
      break;
    case 'draft_remind':
      next.disposition = 'deferred';
      next.reviewStatus = 'drafted';
      next.draftId = extras.draftId;
      next.reminderId = extras.reminderId;
      break;
  }
  const action: ActionRecord = {
    actionId: extras.actionId,
    messageId,
    actionType: type,
    timestamp: extras.now.toISOString(),
    previousState: prev,
    nextState: next,
    providerStatus: 'local',
    createdReminderId: extras.createdReminderId,
    savedDraftId: extras.savedDraftId,
    previousDraft: extras.previousDraft,
  };
  return {
    ok: true,
    action,
    deck: { queue: deck.queue, items: { ...deck.items, [messageId]: next }, history: [...deck.history, action] },
  };
}

/** Mark a kept message as opened in review. Not an undoable action. */
export function markOpened(deck: Deck, messageId: string): Deck {
  const item = deck.items[messageId];
  if (!item || item.disposition !== 'kept' || item.reviewStatus !== 'unopened') return deck;
  return { ...deck, items: { ...deck.items, [messageId]: { ...item, reviewStatus: 'opened' } } };
}

/** Reverse the newest action. Returns the reversed action so side effects can be undone too. */
export function undoLast(deck: Deck): { deck: Deck; action: ActionRecord } | null {
  const action = deck.history[deck.history.length - 1];
  if (!action) return null;
  return {
    action,
    deck: {
      queue: deck.queue,
      items: { ...deck.items, [action.messageId]: action.previousState },
      history: deck.history.slice(0, -1),
    },
  };
}
