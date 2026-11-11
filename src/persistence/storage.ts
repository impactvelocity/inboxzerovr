import type { SessionState, Settings } from '../domain/types';

/** The subset of the Web Storage API this app uses, so tests can inject a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SCHEMA_VERSION = 1;

export const KEYS = {
  session: 'inboxzero.session',
  settings: 'inboxzero.settings',
  reminders: 'inboxzero.reminders',
  drafts: 'inboxzero.drafts',
} as const;

interface Envelope<T> {
  schemaVersion: number;
  data: T;
}

export function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** localStorage when it works, otherwise an in-memory store (private windows, blocked storage). */
export function browserStore(): { store: KeyValueStore; durable: boolean } {
  try {
    const ls = window.localStorage;
    ls.setItem('inboxzero.probe', '1');
    ls.removeItem('inboxzero.probe');
    return { store: ls, durable: true };
  } catch {
    return { store: memoryStore(), durable: false };
  }
}

/** Read a versioned value. Unknown versions and corrupt data read as null rather than throwing. */
export function readVersioned<T>(store: KeyValueStore, key: string): T | null {
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env !== 'object' || env.schemaVersion !== SCHEMA_VERSION) return null;
    return env.data ?? null;
  } catch {
    return null;
  }
}

/** Write a versioned value. Throws if the underlying store rejects the write. */
export function writeVersioned<T>(store: KeyValueStore, key: string, data: T): void {
  const env: Envelope<T> = { schemaVersion: SCHEMA_VERSION, data };
  store.setItem(key, JSON.stringify(env));
}

function isDeck(d: unknown): boolean {
  const deck = d as { queue?: unknown; items?: unknown; history?: unknown } | null;
  if (!deck || !Array.isArray(deck.queue) || !Array.isArray(deck.history) || typeof deck.items !== 'object') return false;
  const items = deck.items as Record<string, unknown>;
  return deck.queue.every((id) => typeof id === 'string' && !!items[id]);
}

export function loadSession(store: KeyValueStore): SessionState | null {
  const s = readVersioned<SessionState>(store, KEYS.session);
  if (!s || s.schemaVersion !== 1 || !isDeck(s.main) || !isDeck(s.tutorial)) return null;
  return s;
}

export function saveSession(store: KeyValueStore, session: SessionState | null): void {
  if (session) writeVersioned(store, KEYS.session, session);
  else store.removeItem(KEYS.session);
}

export function loadSettings(store: KeyValueStore, defaults: Settings): Settings {
  const s = readVersioned<Partial<Settings>>(store, KEYS.settings);
  return { ...defaults, ...(s ?? {}) };
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  writeVersioned(store, KEYS.settings, settings);
}

/** Remove everything this app stores except settings. */
export function clearDemoData(store: KeyValueStore): void {
  store.removeItem(KEYS.session);
  store.removeItem(KEYS.reminders);
  store.removeItem(KEYS.drafts);
}
