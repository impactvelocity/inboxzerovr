import { DEMO_BATCH_LABEL, DEMO_MESSAGES, TUTORIAL_MESSAGES } from '../domain/demoEmails';
import type { Draft, Message } from '../domain/types';

export interface Batch {
  messages: Message[];
  /** What this batch covers, shown in the summary so it is never mistaken for the whole inbox. */
  label: string;
  /** True only when the provider has confirmed the batch is the entire inbox. */
  coversWholeInbox: boolean;
  /** True when pagination or a cap cut the batch short. */
  truncated: boolean;
}

/**
 * Everything the app needs from a mail service. The demo provider is the only
 * implementation; a Gmail adapter would implement the same interface behind a
 * backend that holds the credentials.
 */
export interface EmailProvider {
  readonly id: string;
  readonly connected: boolean;
  list(): Promise<Batch>;
  read(messageId: string): Promise<Message | null>;
  /** Remove from the inbox. Never a permanent delete. */
  archive(messageId: string): Promise<void>;
  /** Put back exactly the inbox state this app changed. */
  restore(messageId: string): Promise<void>;
  saveReplyDraft(draft: Draft): Promise<void>;
}

/** Fictional messages held in memory. Remote operations are no-ops because nothing is remote. */
export class DemoEmailProvider implements EmailProvider {
  readonly id = 'demo';
  readonly connected = false;
  private byId = new Map<string, Message>();

  constructor() {
    for (const m of [...TUTORIAL_MESSAGES, ...DEMO_MESSAGES]) this.byId.set(m.id, m);
  }

  get tutorialMessages(): Message[] {
    return TUTORIAL_MESSAGES;
  }

  async list(): Promise<Batch> {
    return { messages: DEMO_MESSAGES, label: DEMO_BATCH_LABEL, coversWholeInbox: false, truncated: false };
  }

  async read(messageId: string): Promise<Message | null> {
    return this.byId.get(messageId) ?? null;
  }

  /** Synchronous lookup for rendering; demo data is always in memory. */
  peek(messageId: string): Message | null {
    return this.byId.get(messageId) ?? null;
  }

  async archive(): Promise<void> {}
  async restore(): Promise<void> {}
  async saveReplyDraft(): Promise<void> {}
}

/** Gmail is not implemented. The UI reads this to show it as unavailable. */
export const GMAIL_AVAILABLE = false;
