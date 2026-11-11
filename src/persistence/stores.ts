import type { Draft, Reminder } from '../domain/types';
import { KEYS, readVersioned, writeVersioned, type KeyValueStore } from './storage';

/**
 * Reminders and drafts are saved through async interfaces so a remote backend
 * can replace local storage later. A rejected promise means nothing was saved.
 */
export interface ReminderStore {
  list(): Promise<Reminder[]>;
  /** Idempotent: saving the same id again replaces it, never duplicates. */
  save(reminder: Reminder): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface DraftStore {
  get(id: string): Promise<Draft | null>;
  list(): Promise<Draft[]>;
  /** Idempotent by id. Saving a draft never sends anything. */
  save(draft: Draft): Promise<void>;
  remove(id: string): Promise<void>;
}

export const reminderIdFor = (messageId: string) => `rem-${messageId}`;
export const draftIdFor = (messageId: string) => `draft-${messageId}`;

class LocalCollection<T extends { id: string }> {
  constructor(
    private store: KeyValueStore,
    private key: string,
  ) {}

  private read(): Record<string, T> {
    return readVersioned<Record<string, T>>(this.store, this.key) ?? {};
  }

  async list(): Promise<T[]> {
    return Object.values(this.read());
  }

  async get(id: string): Promise<T | null> {
    return this.read()[id] ?? null;
  }

  async save(value: T): Promise<void> {
    const all = this.read();
    all[value.id] = value;
    writeVersioned(this.store, this.key, all);
    // Read back: a store that silently drops writes must not count as saved.
    if (!this.read()[value.id]) throw new Error('Storage did not keep the saved value');
  }

  async remove(id: string): Promise<void> {
    const all = this.read();
    if (!(id in all)) return;
    delete all[id];
    writeVersioned(this.store, this.key, all);
  }
}

export function localReminderStore(store: KeyValueStore): ReminderStore {
  return new LocalCollection<Reminder>(store, KEYS.reminders);
}

export function localDraftStore(store: KeyValueStore): DraftStore {
  return new LocalCollection<Draft>(store, KEYS.drafts);
}
