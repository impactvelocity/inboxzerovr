export interface AttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Message {
  id: string;
  providerMessageId?: string;
  threadId?: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  preview: string;
  bodyText: string;
  /** ISO 8601 instant. */
  receivedAt: string;
  attachmentMetadata: AttachmentMeta[];
  originalProviderLabels: string[];
}

export type Disposition = 'pending' | 'kept' | 'archived' | 'deferred' | 'handled';
export type ReviewStatus = 'none' | 'unopened' | 'opened' | 'drafted';
export type SyncStatus = 'local' | 'pending' | 'synced' | 'failed';

export interface SessionItem {
  messageId: string;
  disposition: Disposition;
  reviewStatus: ReviewStatus;
  draftId?: string;
  reminderId?: string;
  syncStatus: SyncStatus;
}

export type ActionType =
  | 'archive'
  | 'keep'
  | 'defer'
  | 'handle'
  | 'remind'
  | 'draft_finish'
  | 'draft_remind';

export interface Draft {
  id: string;
  messageId: string;
  threadId?: string;
  text: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  messageId: string;
  /** ISO 8601 instant the reminder is due. */
  dueAt: string;
  timezone: string;
  createdAt: string;
  senderName: string;
  subject: string;
}

export interface ActionRecord {
  actionId: string;
  messageId: string;
  actionType: ActionType;
  timestamp: string;
  previousState: SessionItem;
  nextState: SessionItem;
  providerStatus: SyncStatus;
  error?: string;
  /** Side effects this action created, so Undo can reverse exactly those. */
  createdReminderId?: string;
  savedDraftId?: string;
  /** Draft content that existed before this action overwrote it, if any. */
  previousDraft?: Draft | null;
}

/** A queue of messages with their per-session state and undo history. */
export interface Deck {
  queue: string[];
  items: Record<string, SessionItem>;
  history: ActionRecord[];
}

export type Phase = 'setup' | 'tutorial' | 'triage' | 'review' | 'complete';

export interface SessionState {
  schemaVersion: 1;
  sessionId: string;
  source: 'demo';
  /** Human-readable description of what this batch covers. */
  batchLabel: string;
  startedAt: string;
  tutorialDone: boolean;
  undoTaught: boolean;
  /** Player chose to end the review with messages still kept. */
  finished: boolean;
  tutorial: Deck;
  main: Deck;
}

export interface Settings {
  bladeHand: 'right' | 'left';
  effects: 'full' | 'reduced';
  sound: boolean;
  music: boolean;
  reminderHour: number;
  timezone: string;
}

export interface Counts {
  total: number;
  pending: number;
  kept: number;
  archived: number;
  deferred: number;
  handled: number;
  drafts: number;
}
