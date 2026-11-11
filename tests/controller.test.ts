import { describe, expect, it } from 'vitest';
import { SessionController, type AppEvent } from '../src/app/SessionController';
import { KEYS, memoryStore, type KeyValueStore } from '../src/persistence/storage';
import { localDraftStore, localReminderStore } from '../src/persistence/stores';
import { DemoEmailProvider } from '../src/providers/EmailProvider';

function setup(store: KeyValueStore = memoryStore()) {
  let tick = 0;
  const controller = new SessionController({
    store,
    reminders: localReminderStore(store),
    drafts: localDraftStore(store),
    provider: new DemoEmailProvider(),
    now: () => new Date('2026-11-10T20:00:00Z'),
    newId: () => `id${tick++}`,
  });
  controller.updateSettings({ timezone: 'America/Los_Angeles', reminderHour: 9 });
  const events: AppEvent[] = [];
  controller.onEvent((e) => events.push(e));
  return { controller, events, store };
}

async function startTriage(c: SessionController) {
  await c.dispatch({ type: 'start' });
  await c.dispatch({ type: 'skipTutorial' });
}

/** A store whose writes to one key can be made to fail. */
function flakyStore(failKey: string) {
  const inner = memoryStore();
  const state = { failing: false };
  const store: KeyValueStore = {
    getItem: (k) => inner.getItem(k),
    removeItem: (k) => inner.removeItem(k),
    setItem: (k, v) => {
      if (state.failing && k === failKey) throw new Error('QuotaExceededError');
      inner.setItem(k, v);
    },
  };
  return { store, state };
}

describe('tutorial', () => {
  it('walks slash, keep, tomorrow, then undo, and touches no real data', async () => {
    const { controller: c, events } = setup();
    await c.dispatch({ type: 'start' });
    expect(c.phase).toBe('tutorial');
    expect(c.tutorialStep).toBe('archive');

    await c.dispatch({ type: 'keep' }); // wrong action for this card
    expect(c.tutorialStep).toBe('archive');
    expect(events.some((e) => e.type === 'rejected' && e.reason === 'tutorial-expects-other')).toBe(true);

    await c.dispatch({ type: 'archive' });
    await c.dispatch({ type: 'keep' });
    await c.dispatch({ type: 'defer' });
    expect(c.tutorialStep).toBe('undo');
    expect(c.phase).toBe('tutorial');

    await c.dispatch({ type: 'undo' });
    expect(c.tutorialStep).toBe('defer');
    await c.dispatch({ type: 'defer' });
    expect(c.phase).toBe('triage');

    expect(c.counts).toMatchObject({ total: 20, pending: 20 });
    expect(await c.listReminders()).toEqual([]);
  });
});

describe('triage', () => {
  it('one archive command changes one count, and a duplicate is ignored', async () => {
    const { controller: c, events } = setup();
    await startTriage(c);
    const id = c.currentId!;
    // Two submissions for the same card, as repeated collision frames would produce.
    const first = c.dispatch({ type: 'archive', id, via: { kind: 'slash', angle: 0 } });
    const second = c.dispatch({ type: 'archive', id, via: { kind: 'slash', angle: 0 } });
    await Promise.all([first, second]);
    expect(c.counts).toMatchObject({ archived: 1, pending: 19 });
    expect(events.filter((e) => e.type === 'action')).toHaveLength(1);
    expect(c.currentId).not.toBe(id);
  });

  it('tomorrow saves a 9:00 reminder and undo removes it', async () => {
    const { controller: c } = setup();
    await startTriage(c);
    const id = c.currentId!;
    await c.dispatch({ type: 'defer' });
    const reminders = await c.listReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ messageId: id, dueAt: '2026-11-11T17:00:00.000Z' });
    expect(c.counts.deferred).toBe(1);

    await c.dispatch({ type: 'undo' });
    expect(await c.listReminders()).toEqual([]);
    expect(c.counts).toMatchObject({ deferred: 0, pending: 20 });
    expect(c.currentId).toBe(id);
  });

  it('a failed reminder save leaves the message unresolved', async () => {
    const { store, state } = flakyStore(KEYS.reminders);
    const { controller: c, events } = setup(store);
    await startTriage(c);
    const id = c.currentId!;
    state.failing = true;
    await c.dispatch({ type: 'defer' });
    expect(c.currentId).toBe(id);
    expect(c.counts).toMatchObject({ deferred: 0, pending: 20 });
    expect(events.some((e) => e.type === 'toast' && e.tone === 'warn')).toBe(true);
    expect(events.some((e) => e.type === 'action')).toBe(false);

    state.failing = false;
    await c.dispatch({ type: 'defer' });
    expect(c.counts.deferred).toBe(1);
    expect(await c.listReminders()).toHaveLength(1); // the retry did not duplicate it
  });

  it('rejects actions while paused and while the menu is open', async () => {
    const { controller: c } = setup();
    await startTriage(c);
    await c.dispatch({ type: 'setPaused', paused: true });
    await c.dispatch({ type: 'archive' });
    expect(c.counts.archived).toBe(0);
    await c.dispatch({ type: 'setPaused', paused: false });
    await c.dispatch({ type: 'setMenu', open: true });
    await c.dispatch({ type: 'archive' });
    expect(c.counts.archived).toBe(0);
    await c.dispatch({ type: 'setMenu', open: false });
    await c.dispatch({ type: 'archive' });
    expect(c.counts.archived).toBe(1);
  });
});

async function triageAll(c: SessionController, keep: number) {
  await startTriage(c);
  for (let i = 0; i < 20; i++) await c.dispatch({ type: i < keep ? 'keep' : 'archive' });
}

describe('review and summary', () => {
  it.each([0, 1, 3, 12])('handles %i kept messages', async (kept) => {
    const { controller: c } = setup();
    await triageAll(c, kept);
    expect(c.keptIds).toHaveLength(kept);
    expect(c.phase).toBe(kept === 0 ? 'complete' : 'review');
    for (const id of [...c.keptIds]) await c.dispatch({ type: 'handle', id });
    expect(c.phase).toBe('complete');
    expect(c.counts).toMatchObject({ kept: 0, handled: kept, archived: 20 - kept });
    expect(c.wholeInboxCleared).toBe(false); // a demo batch never claims inbox zero
  });

  it('saves a draft before finishing, and never marks handled on an empty or failed save', async () => {
    const { store, state } = flakyStore(KEYS.drafts);
    const { controller: c } = setup(store);
    await triageAll(c, 1);
    const id = c.keptIds[0];
    await c.dispatch({ type: 'reviewOpen', id });
    await c.dispatch({ type: 'composeOpen', id });

    await c.dispatch({ type: 'draftFinish', id }); // empty
    expect(c.counts.kept).toBe(1);

    await c.dispatch({ type: 'composeSetText', text: 'Yes, confirmed.' });
    state.failing = true;
    await c.dispatch({ type: 'draftFinish', id });
    expect(c.counts.kept).toBe(1);
    expect(await c.listDrafts()).toEqual([]);
    expect(c.ui.review.text).toBe('Yes, confirmed.'); // the text is not lost

    state.failing = false;
    await c.dispatch({ type: 'draftFinish', id });
    expect(c.counts).toMatchObject({ kept: 0, handled: 1, drafts: 1 });
    expect((await c.listDrafts())[0]).toMatchObject({ messageId: id, text: 'Yes, confirmed.' });
    expect(c.phase).toBe('complete');
  });

  it('draft & remind needs both saves; a failed reminder rolls the draft back', async () => {
    const { store, state } = flakyStore(KEYS.reminders);
    const { controller: c } = setup(store);
    await triageAll(c, 1);
    const id = c.keptIds[0];
    await c.dispatch({ type: 'composeOpen', id });
    await c.dispatch({ type: 'composeSetText', text: 'Will reply properly tomorrow.' });
    state.failing = true;
    await c.dispatch({ type: 'draftRemind', id });
    expect(c.counts.kept).toBe(1);
    expect(await c.listDrafts()).toEqual([]);

    state.failing = false;
    await c.dispatch({ type: 'draftRemind', id });
    expect(c.counts).toMatchObject({ kept: 0, deferred: 1, drafts: 1 });
    expect(await c.listReminders()).toHaveLength(1);

    // Undo from the summary restores the message and removes both saves.
    expect(c.phase).toBe('complete');
    await c.dispatch({ type: 'undo' });
    expect(c.phase).toBe('review');
    expect(c.counts).toMatchObject({ kept: 1, deferred: 0, drafts: 0 });
    expect(await c.listDrafts()).toEqual([]);
    expect(await c.listReminders()).toEqual([]);
  });

  it('finishing early reports what still needs attention', async () => {
    const { controller: c } = setup();
    await triageAll(c, 3);
    await c.dispatch({ type: 'handle', id: c.keptIds[0] });
    await c.dispatch({ type: 'finish' });
    expect(c.phase).toBe('complete');
    expect(c.counts).toMatchObject({ kept: 2, handled: 1, archived: 17 });
    await c.dispatch({ type: 'resumeReview' });
    expect(c.phase).toBe('review');
  });
});

describe('persistence', () => {
  it('reload resumes the session without resurrecting resolved messages', async () => {
    const store = memoryStore();
    const first = setup(store).controller;
    await startTriage(first);
    await first.dispatch({ type: 'archive' });
    await first.dispatch({ type: 'keep' });
    await first.dispatch({ type: 'defer' });
    const nextId = first.currentId;

    const second = setup(store).controller;
    expect(second.hasSavedSession()).toBe(true);
    await second.dispatch({ type: 'resume' });
    expect(second.phase).toBe('triage');
    expect(second.currentId).toBe(nextId);
    expect(second.counts).toMatchObject({ archived: 1, kept: 1, deferred: 1, pending: 17 });
    expect(await second.listReminders()).toHaveLength(1);
    // History survives too, so undo still works after a reload.
    await second.dispatch({ type: 'undo' });
    expect(second.counts.deferred).toBe(0);
    expect(await second.listReminders()).toEqual([]);
  });

  it('ignores corrupt or unknown-version saved data', async () => {
    const store = memoryStore();
    store.setItem(KEYS.session, '{not json');
    expect(setup(store).controller.hasSavedSession()).toBe(false);
    store.setItem(KEYS.session, JSON.stringify({ schemaVersion: 99, data: {} }));
    expect(setup(store).controller.hasSavedSession()).toBe(false);
  });

  it('reset clears the session, reminders and drafts', async () => {
    const { controller: c, store } = setup();
    await startTriage(c);
    await c.dispatch({ type: 'defer' });
    await c.dispatch({ type: 'reset' });
    expect(c.phase).toBe('setup');
    expect(store.getItem(KEYS.session)).toBeNull();
    expect(await c.listReminders()).toEqual([]);
  });

  it('warns when progress cannot be saved but keeps working', async () => {
    const { store, state } = flakyStore(KEYS.session);
    const { controller: c } = setup(store);
    await startTriage(c);
    state.failing = true;
    await c.dispatch({ type: 'archive' });
    expect(c.counts.archived).toBe(1);
    expect(c.ui.saveWarning).toMatch(/could not be saved/);
  });
});
