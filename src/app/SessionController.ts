import { DEFAULT_REMINDER_HOUR } from '../config';
import { formatReminder, localTimezone, tomorrowAt } from '../domain/reminderTime';
import {
  TUTORIAL_EXPECTED,
  activeDeck,
  applyAction,
  checkAction,
  countDeck,
  createSession,
  currentMessageId,
  keptIds,
  markOpened,
  phaseOf,
  undoLast,
  type ActionExtras,
} from '../domain/session';
import type {
  ActionRecord,
  ActionType,
  Counts,
  Deck,
  Draft,
  Message,
  Phase,
  Reminder,
  SessionState,
  Settings,
} from '../domain/types';
import {
  clearDemoData,
  loadSession,
  loadSettings,
  saveSession,
  saveSettings,
  type KeyValueStore,
} from '../persistence/storage';
import { draftIdFor, reminderIdFor, type DraftStore, type ReminderStore } from '../persistence/stores';
import type { DemoEmailProvider } from '../providers/EmailProvider';

/** How an action was physically triggered. Only affects feedback, never the outcome. */
export type Via = { kind: 'slash'; angle: number } | { kind: 'throw' } | { kind: 'button' };

export type Command =
  | { type: 'start' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'skipTutorial' }
  | { type: 'archive'; id?: string; via?: Via }
  | { type: 'keep'; id?: string; via?: Via }
  | { type: 'defer'; id?: string; via?: Via }
  | { type: 'read'; id?: string }
  | { type: 'closeRead' }
  | { type: 'undo' }
  | { type: 'reviewOpen'; id: string }
  | { type: 'reviewBack' }
  | { type: 'reviewPage'; delta: number }
  | { type: 'handle'; id: string }
  | { type: 'remindOpen'; id: string }
  | { type: 'remindConfirm'; id: string }
  | { type: 'composeOpen'; id: string }
  | { type: 'composeSetText'; text: string }
  | { type: 'draftFinish'; id: string }
  | { type: 'draftRemind'; id: string }
  | { type: 'finish' }
  | { type: 'resumeReview' }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setMenu'; open: boolean };

export type ReviewMode = 'list' | 'detail' | 'compose' | 'remind';

export interface UiState {
  /** Message open in the expanded reading panel, if any. */
  reading: string | null;
  paused: boolean;
  /** An async save is in flight; new actions wait behind it. */
  busy: boolean;
  menuOpen: boolean;
  review: { mode: ReviewMode; messageId: string | null; text: string; page: number };
  /** Set when progress could not be written to storage. */
  saveWarning: string | null;
}

export type AppEvent =
  | { type: 'action'; action: ActionRecord; via: Via; tutorial: boolean }
  | { type: 'undo'; action: ActionRecord }
  | { type: 'rejected'; command: Command['type']; reason: string }
  | { type: 'toast'; text: string; tone: 'info' | 'warn' }
  | { type: 'phase'; from: Phase; to: Phase };

export interface ControllerDeps {
  store: KeyValueStore;
  reminders: ReminderStore;
  drafts: DraftStore;
  provider: DemoEmailProvider;
  now?: () => Date;
  newId?: () => string;
}

export const DEFAULT_SETTINGS: Settings = {
  bladeHand: 'right',
  effects: 'full',
  sound: true,
  music: true,
  reminderHour: DEFAULT_REMINDER_HOUR,
  timezone: localTimezone(),
};

const BUTTON: Via = { kind: 'button' };

const TUTORIAL_HINT: Record<string, string> = {
  archive: 'This card is for practising the slash. Swing through it, or press Archive.',
  keep: 'This card is for practising KEEP. Grab it and release toward the left portal.',
  defer: 'This card is for practising TOMORROW. Grab it and release toward the right portal.',
};

const PAST_TENSE: Record<ActionType, string> = {
  archive: 'Archived',
  keep: 'Kept for review',
  defer: 'Reminder set',
  handle: 'Handled and archived',
  remind: 'Reminder set',
  draft_finish: 'Draft saved, message archived',
  draft_remind: 'Draft saved, reminder set',
};

/**
 * The single place session state changes. Desktop and VR input both dispatch
 * the same commands here; rendering only reads state and reacts to events.
 * Commands run one at a time, so an action that waits on a save can never be
 * overtaken by a second action or by Undo.
 */
export class SessionController {
  state: SessionState | null = null;
  settings: Settings;
  ui: UiState = SessionController.freshUi();

  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: AppEvent) => void>();
  private chain: Promise<void> = Promise.resolve();
  private messages = new Map<string, Message>();
  private coversWholeInbox = false;
  private now: () => Date;
  private newId: () => string;
  private counter = 0;

  constructor(private deps: ControllerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => `a${Date.now().toString(36)}-${(this.counter++).toString(36)}`);
    this.settings = loadSettings(deps.store, DEFAULT_SETTINGS);
  }

  private static freshUi(): UiState {
    return {
      reading: null,
      paused: false,
      busy: false,
      menuOpen: false,
      review: { mode: 'list', messageId: null, text: '', page: 0 },
      saveWarning: null,
    };
  }

  // ---- read side -----------------------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEvent(fn: (e: AppEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  get phase(): Phase {
    return phaseOf(this.state);
  }

  get deck(): Deck | null {
    return this.state ? activeDeck(this.state) : null;
  }

  get currentId(): string | null {
    const phase = this.phase;
    if (!this.deck || (phase !== 'tutorial' && phase !== 'triage')) return null;
    return currentMessageId(this.deck);
  }

  get counts(): Counts {
    return this.state ? countDeck(this.state.main) : countDeck({ queue: [], items: {}, history: [] });
  }

  get keptIds(): string[] {
    return this.state ? keptIds(this.state.main) : [];
  }

  get canUndo(): boolean {
    return !!this.deck && this.deck.history.length > 0;
  }

  /** "Inbox zero" may only be claimed when a connected provider confirms it. The demo never does. */
  get wholeInboxCleared(): boolean {
    return this.coversWholeInbox && this.phase === 'complete' && this.counts.kept === 0;
  }

  message(id: string | null): Message | null {
    return id ? (this.messages.get(id) ?? null) : null;
  }

  /** Step in the tutorial: which practice action is expected next, or 'undo' / null. */
  get tutorialStep(): ActionType | 'undo' | null {
    if (!this.state || this.state.tutorialDone) return null;
    const id = currentMessageId(this.state.tutorial);
    if (!id) return 'undo';
    return TUTORIAL_EXPECTED[this.state.tutorial.queue.indexOf(id)] ?? null;
  }

  hasSavedSession(): boolean {
    return loadSession(this.deps.store) !== null;
  }

  listReminders(): Promise<Reminder[]> {
    return this.deps.reminders.list().then((r) => r.sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
  }

  listDrafts(): Promise<Draft[]> {
    return this.deps.drafts.list();
  }

  reminderPreview(): string {
    const due = tomorrowAt(this.now(), this.settings.timezone, this.settings.reminderHour);
    return formatReminder(due.toISOString(), this.settings.timezone);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.settings.reminderHour = Math.min(23, Math.max(0, Math.round(this.settings.reminderHour)));
    try {
      saveSettings(this.deps.store, this.settings);
    } catch {
      this.ui.saveWarning = 'Settings could not be saved on this device.';
    }
    this.emitChange();
  }

  // ---- write side ----------------------------------------------------------

  /** Queue a command. Resolves when it has been fully applied or rejected. */
  dispatch(cmd: Command): Promise<void> {
    const run = this.chain.then(() => this.run(cmd));
    this.chain = run.catch((err) => {
      console.error('Command failed', cmd.type, err);
      this.ui.busy = false;
      this.emit({ type: 'toast', text: 'Something went wrong. Nothing was changed.', tone: 'warn' });
      this.emitChange();
    });
    return this.chain;
  }

  private async run(cmd: Command): Promise<void> {
    if (cmd.type === 'setPaused') {
      if (this.ui.paused !== cmd.paused) {
        this.ui.paused = cmd.paused;
        this.emitChange();
      }
      return;
    }
    if (this.ui.paused && cmd.type !== 'reset') return this.reject(cmd, 'paused');

    switch (cmd.type) {
      case 'start':
        return this.start();
      case 'resume':
        return this.resume();
      case 'reset':
        return this.reset();
      case 'setMenu':
        this.ui.menuOpen = cmd.open;
        return this.emitChange();
    }
    if (!this.state) return this.reject(cmd, 'no-session');
    if (this.ui.menuOpen) return this.reject(cmd, 'menu-open');

    switch (cmd.type) {
      case 'skipTutorial':
        if (this.state.tutorialDone) return;
        return this.commit({ ...this.state, tutorialDone: true });
      case 'archive':
      case 'keep':
      case 'defer':
        return this.triage(cmd.type, cmd.id ?? this.currentId, cmd.via ?? BUTTON);
      case 'read': {
        const id = cmd.id ?? this.currentId;
        if (!id || !this.messages.has(id)) return this.reject(cmd, 'no-message');
        this.ui.reading = id;
        return this.emitChange();
      }
      case 'closeRead':
        this.ui.reading = null;
        return this.emitChange();
      case 'undo':
        return this.undo();
      case 'reviewOpen':
        if (this.phase !== 'review' || !this.keptIds.includes(cmd.id)) return this.reject(cmd, 'not-kept');
        this.ui.review = { ...this.ui.review, mode: 'detail', messageId: cmd.id, text: '' };
        return this.commit({ ...this.state, main: markOpened(this.state.main, cmd.id) });
      case 'reviewBack': {
        const r = this.ui.review;
        this.ui.review = r.mode === 'detail' || r.mode === 'list'
          ? { ...r, mode: 'list', messageId: null, text: '' }
          : { ...r, mode: 'detail' };
        return this.emitChange();
      }
      case 'reviewPage':
        this.ui.review = { ...this.ui.review, page: Math.max(0, this.ui.review.page + cmd.delta) };
        return this.emitChange();
      case 'remindOpen':
        if (this.phase !== 'review' || !this.keptIds.includes(cmd.id)) return this.reject(cmd, 'not-kept');
        this.ui.review = { ...this.ui.review, mode: 'remind', messageId: cmd.id };
        return this.emitChange();
      case 'composeOpen': {
        if (this.phase !== 'review' || !this.keptIds.includes(cmd.id)) return this.reject(cmd, 'not-kept');
        const existing = await this.deps.drafts.get(draftIdFor(cmd.id));
        this.ui.review = { ...this.ui.review, mode: 'compose', messageId: cmd.id, text: existing?.text ?? '' };
        return this.emitChange();
      }
      case 'composeSetText':
        if (this.ui.review.mode !== 'compose') return;
        this.ui.review = { ...this.ui.review, text: cmd.text };
        return this.emitChange();
      case 'handle':
        return this.resolveKept('handle', cmd.id);
      case 'remindConfirm':
        return this.resolveKept('remind', cmd.id);
      case 'draftFinish':
        return this.resolveKept('draft_finish', cmd.id);
      case 'draftRemind':
        return this.resolveKept('draft_remind', cmd.id);
      case 'finish':
        if (this.phase !== 'review') return this.reject(cmd, 'not-in-review');
        this.ui.review = { mode: 'list', messageId: null, text: '', page: 0 };
        return this.commit({ ...this.state, finished: true });
      case 'resumeReview':
        if (!this.state.finished) return;
        return this.commit({ ...this.state, finished: false });
    }
  }

  private async start(): Promise<void> {
    const batch = await this.deps.provider.list();
    try {
      clearDemoData(this.deps.store);
    } catch {
      /* reported by commit below if storage is still failing */
    }
    this.loadMessages(batch.messages);
    this.coversWholeInbox = batch.coversWholeInbox;
    this.ui = SessionController.freshUi();
    this.commit(
      createSession({
        sessionId: this.newId(),
        now: this.now(),
        tutorialIds: this.deps.provider.tutorialMessages.map((m) => m.id),
        messageIds: batch.messages.map((m) => m.id),
        batchLabel: batch.label,
      }),
      'setup',
    );
  }

  private async resume(): Promise<void> {
    const saved = loadSession(this.deps.store);
    if (!saved) return this.reject({ type: 'resume' }, 'nothing-saved');
    const batch = await this.deps.provider.list();
    this.loadMessages(batch.messages);
    const known = [...saved.main.queue, ...saved.tutorial.queue].every((id) => this.messages.has(id));
    if (!known) {
      this.emit({ type: 'toast', text: 'The saved session no longer matches the demo data.', tone: 'warn' });
      return this.reject({ type: 'resume' }, 'stale-session');
    }
    this.coversWholeInbox = batch.coversWholeInbox;
    this.ui = SessionController.freshUi();
    const from = this.phase;
    this.state = saved;
    this.afterChange(from);
  }

  private async reset(): Promise<void> {
    const from = this.phase;
    try {
      clearDemoData(this.deps.store);
    } catch {
      this.emit({ type: 'toast', text: 'Stored demo data could not be cleared.', tone: 'warn' });
    }
    this.state = null;
    this.ui = SessionController.freshUi();
    this.afterChange(from);
  }

  private loadMessages(batch: Message[]): void {
    this.messages.clear();
    for (const m of [...this.deps.provider.tutorialMessages, ...batch]) this.messages.set(m.id, m);
  }

  private async triage(type: 'archive' | 'keep' | 'defer', id: string | null, via: Via): Promise<void> {
    const state = this.state!;
    const phase = this.phase;
    if (phase !== 'tutorial' && phase !== 'triage') return this.reject({ type }, 'not-in-triage');
    if (!id) return this.reject({ type }, 'no-message');
    const deck = activeDeck(state);
    const check = checkAction(deck, id, type);
    if (check !== true) return this.reject({ type }, check);

    if (phase === 'tutorial') {
      const expected = TUTORIAL_EXPECTED[deck.queue.indexOf(id)];
      if (expected !== type) {
        this.emit({ type: 'toast', text: TUTORIAL_HINT[expected] ?? 'Try the highlighted action.', tone: 'info' });
        return this.reject({ type }, 'tutorial-expects-other');
      }
      // Practice only: no reminder is saved for the tutorial's Tomorrow card.
      const res = applyAction(deck, id, type, this.extras());
      if (!res.ok) return this.reject({ type }, res.reason);
      this.ui.reading = null;
      const done = currentMessageId(res.deck) === null && state.undoTaught;
      this.commit({ ...state, tutorial: res.deck, tutorialDone: done }, undefined, [
        { type: 'action', action: res.action, via, tutorial: true },
      ]);
      return;
    }

    const extras = this.extras();
    if (type === 'defer') {
      const reminder = await this.saveReminder(id);
      if (!reminder) return;
      extras.reminderId = reminder.id;
      extras.createdReminderId = reminder.id;
    }
    const res = applyAction(this.state!.main, id, type, extras);
    if (!res.ok) return this.reject({ type }, res.reason);
    this.ui.reading = null;
    this.commit({ ...this.state!, main: res.deck }, undefined, [{ type: 'action', action: res.action, via, tutorial: false }]);
    this.emit({ type: 'toast', text: this.describe(res.action), tone: 'info' });
  }

  private async resolveKept(type: 'handle' | 'remind' | 'draft_finish' | 'draft_remind', id: string): Promise<void> {
    if (this.phase !== 'review') return this.reject({ type: 'handle', id }, 'not-in-review');
    const check = checkAction(this.state!.main, id, type);
    if (check !== true) return this.reject({ type: 'handle', id }, check);

    const extras = this.extras();
    const draftId = draftIdFor(id);
    let wroteDraft = false;

    if (type === 'draft_finish' || type === 'draft_remind') {
      const text = this.ui.review.text.trim();
      if (!text) {
        this.emit({ type: 'toast', text: 'The draft is empty. Add some text first.', tone: 'info' });
        return this.reject({ type: 'draftFinish', id }, 'empty-draft');
      }
      this.setBusy(true);
      try {
        extras.previousDraft = await this.deps.drafts.get(draftId);
        const draft: Draft = {
          id: draftId,
          messageId: id,
          threadId: this.messages.get(id)?.threadId,
          text,
          updatedAt: this.now().toISOString(),
        };
        await this.deps.drafts.save(draft);
        wroteDraft = true;
        extras.draftId = draftId;
        extras.savedDraftId = draftId;
      } catch {
        this.setBusy(false);
        this.emit({ type: 'toast', text: 'The draft could not be saved. The message is still waiting.', tone: 'warn' });
        return this.reject({ type: 'draftFinish', id }, 'draft-save-failed');
      }
    }

    if (type === 'remind' || type === 'draft_remind') {
      const reminder = await this.saveReminder(id);
      if (!reminder) {
        // Both saves are required. Put the draft back the way it was.
        if (wroteDraft) await this.restoreDraft(draftId, extras.previousDraft ?? null).catch(() => undefined);
        return;
      }
      extras.reminderId = reminder.id;
      extras.createdReminderId = reminder.id;
    }

    const res = applyAction(this.state!.main, id, type, extras);
    this.ui.busy = false;
    if (!res.ok) return this.reject({ type: 'handle', id }, res.reason);
    this.ui.review = { mode: 'list', messageId: null, text: '', page: 0 };
    this.commit({ ...this.state!, main: res.deck }, undefined, [
      { type: 'action', action: res.action, via: BUTTON, tutorial: false },
    ]);
    this.emit({ type: 'toast', text: this.describe(res.action), tone: 'info' });
  }

  /** Persist a reminder for tomorrow. Returns null (after telling the player) if it could not be saved. */
  private async saveReminder(messageId: string): Promise<Reminder | null> {
    const m = this.messages.get(messageId);
    const now = this.now();
    const reminder: Reminder = {
      id: reminderIdFor(messageId),
      messageId,
      dueAt: tomorrowAt(now, this.settings.timezone, this.settings.reminderHour).toISOString(),
      timezone: this.settings.timezone,
      createdAt: now.toISOString(),
      senderName: m?.senderName ?? '',
      subject: m?.subject ?? '',
    };
    this.setBusy(true);
    try {
      await this.deps.reminders.save(reminder);
      return reminder;
    } catch {
      this.emit({ type: 'toast', text: 'The reminder could not be saved. The message is still waiting.', tone: 'warn' });
      this.reject({ type: 'defer' }, 'reminder-save-failed');
      return null;
    } finally {
      this.setBusy(false);
    }
  }

  private restoreDraft(draftId: string, previous: Draft | null): Promise<void> {
    return previous ? this.deps.drafts.save(previous) : this.deps.drafts.remove(draftId);
  }

  private async undo(): Promise<void> {
    const state = this.state!;
    const inTutorial = !state.tutorialDone;
    const deck = activeDeck(state);
    const result = undoLast(deck);
    if (!result) {
      this.emit({ type: 'toast', text: 'Nothing to undo.', tone: 'info' });
      return this.reject({ type: 'undo' }, 'empty-history');
    }
    const { action } = result;
    // Reverse saved side effects first. If that fails the action stays in
    // place, so the screen never shows something as undone when it is not.
    this.setBusy(true);
    try {
      if (action.createdReminderId) await this.deps.reminders.remove(action.createdReminderId);
      if (action.savedDraftId) await this.restoreDraft(action.savedDraftId, action.previousDraft ?? null);
    } catch {
      this.setBusy(false);
      this.emit({ type: 'toast', text: 'Undo could not finish. Nothing was changed.', tone: 'warn' });
      return this.reject({ type: 'undo' }, 'undo-failed');
    }
    this.ui.busy = false;
    this.ui.reading = null;
    this.ui.review = { mode: 'list', messageId: null, text: '', page: 0 };
    this.commit(
      inTutorial
        ? { ...state, tutorial: result.deck, undoTaught: true }
        : { ...state, main: result.deck, finished: false },
    );
    this.emit({ type: 'undo', action });
    this.emit({ type: 'toast', text: `Undone: ${PAST_TENSE[action.actionType].toLowerCase()}`, tone: 'info' });
  }

  private describe(action: ActionRecord): string {
    const base = PAST_TENSE[action.actionType];
    if (!action.createdReminderId) return base;
    return `${base} for ${this.reminderPreview()}`;
  }

  private extras(): ActionExtras {
    return { actionId: this.newId(), now: this.now() };
  }

  private setBusy(busy: boolean): void {
    if (this.ui.busy === busy) return;
    this.ui.busy = busy;
    this.emitChange();
  }

  private reject(cmd: { type: Command['type']; id?: string }, reason: string): void {
    this.emit({ type: 'rejected', command: cmd.type, reason });
  }

  /**
   * Apply new state. `events` fire after the state is set but before
   * subscribers re-render, so a view can still grab the outgoing card's visual.
   */
  private commit(next: SessionState, fromPhase?: Phase, events: AppEvent[] = []): void {
    const from = fromPhase ?? this.phase;
    this.state = next;
    try {
      saveSession(this.deps.store, next);
      this.ui.saveWarning = null;
    } catch {
      this.ui.saveWarning = 'Progress could not be saved on this device. It will be lost on reload.';
    }
    for (const e of events) this.emit(e);
    this.afterChange(from);
  }

  private afterChange(from: Phase): void {
    const to = this.phase;
    if (to !== 'review') this.ui.review = { mode: 'list', messageId: null, text: '', page: 0 };
    this.emitChange();
    if (from !== to) this.emit({ type: 'phase', from, to });
  }

  private emitChange(): void {
    for (const fn of [...this.listeners]) fn();
  }

  private emit(e: AppEvent): void {
    for (const fn of [...this.eventListeners]) fn(e);
  }
}
