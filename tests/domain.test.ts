import { describe, expect, it } from 'vitest';
import { tomorrowAt } from '../src/domain/reminderTime';
import { applyAction, countDeck, createDeck, currentMessageId, createSession, phaseOf, undoLast } from '../src/domain/session';
import { DEMO_MESSAGES } from '../src/domain/demoEmails';

const extras = (n = 1) => ({ actionId: `a${n}`, now: new Date('2026-11-10T12:00:00Z') });

describe('session transitions', () => {
  it('archives only the current pending message, once', () => {
    const deck = createDeck(['a', 'b']);
    expect(applyAction(deck, 'b', 'archive', extras())).toEqual({ ok: false, reason: 'not-current' });
    const first = applyAction(deck, 'a', 'archive', extras());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(countDeck(first.deck)).toMatchObject({ archived: 1, pending: 1 });
    // The duplicate is rejected and nothing is counted twice.
    expect(applyAction(first.deck, 'a', 'archive', extras(2))).toEqual({ ok: false, reason: 'already-resolved' });
    expect(currentMessageId(first.deck)).toBe('b');
  });

  it('only lets kept messages be handled', () => {
    const deck = createDeck(['a']);
    expect(applyAction(deck, 'a', 'handle', extras())).toEqual({ ok: false, reason: 'not-kept' });
    const kept = applyAction(deck, 'a', 'keep', extras());
    if (!kept.ok) throw new Error('keep failed');
    expect(kept.deck.items.a).toMatchObject({ disposition: 'kept', reviewStatus: 'unopened' });
    const handled = applyAction(kept.deck, 'a', 'handle', extras(2));
    expect(handled.ok && handled.deck.items.a.disposition).toBe('handled');
  });

  it('undo restores the message, classification and counts, newest first', () => {
    let deck = createDeck(['a', 'b']);
    const r1 = applyAction(deck, 'a', 'keep', extras(1));
    if (!r1.ok) throw new Error();
    const r2 = applyAction(r1.deck, 'b', 'defer', { ...extras(2), reminderId: 'rem-b', createdReminderId: 'rem-b' });
    if (!r2.ok) throw new Error();
    deck = r2.deck;
    const u1 = undoLast(deck)!;
    expect(u1.action.messageId).toBe('b');
    expect(u1.action.createdReminderId).toBe('rem-b');
    expect(u1.deck.items.b).toEqual({ messageId: 'b', disposition: 'pending', reviewStatus: 'none', syncStatus: 'local' });
    const u2 = undoLast(u1.deck)!;
    expect(u2.action.messageId).toBe('a');
    expect(countDeck(u2.deck)).toMatchObject({ pending: 2, kept: 0, deferred: 0 });
    expect(undoLast(u2.deck)).toBeNull();
  });

  it('derives the phase from state', () => {
    expect(phaseOf(null)).toBe('setup');
    let s = createSession({ sessionId: 's', now: new Date(), tutorialIds: ['t'], messageIds: ['a', 'b'], batchLabel: 'x' });
    expect(phaseOf(s)).toBe('tutorial');
    s = { ...s, tutorialDone: true };
    expect(phaseOf(s)).toBe('triage');
    const r1 = applyAction(s.main, 'a', 'keep', extras(1));
    if (!r1.ok) throw new Error();
    const r2 = applyAction(r1.deck, 'b', 'archive', extras(2));
    if (!r2.ok) throw new Error();
    expect(phaseOf({ ...s, main: r2.deck })).toBe('review');
    expect(phaseOf({ ...s, main: r2.deck, finished: true })).toBe('complete');
    const r3 = applyAction(r2.deck, 'a', 'handle', extras(3));
    if (!r3.ok) throw new Error();
    expect(phaseOf({ ...s, main: r3.deck })).toBe('complete');
  });

  it('goes straight to complete when nothing was kept', () => {
    const s = createSession({ sessionId: 's', now: new Date(), tutorialIds: [], messageIds: ['a'], batchLabel: 'x' });
    const r = applyAction(s.main, 'a', 'archive', extras());
    if (!r.ok) throw new Error();
    expect(phaseOf({ ...s, main: r.deck })).toBe('complete');
  });
});

describe('demo content', () => {
  it('has twenty messages with distinct ids and the required edge cases', () => {
    expect(DEMO_MESSAGES).toHaveLength(20);
    expect(new Set(DEMO_MESSAGES.map((m) => m.id)).size).toBe(20);
    const subjects = DEMO_MESSAGES.map((m) => m.subject);
    expect(subjects.filter((s) => s === 'Weekly digest')).toHaveLength(2);
    expect(DEMO_MESSAGES.some((m) => m.preview === '')).toBe(true);
    expect(DEMO_MESSAGES.some((m) => m.attachmentMetadata.length > 0)).toBe(true);
    expect(DEMO_MESSAGES.some((m) => m.subject.length > 100)).toBe(true);
    expect(DEMO_MESSAGES.some((m) => m.bodyText.length > 1500)).toBe(true);
  });
});

describe('tomorrow reminder time', () => {
  it('is 9:00 the next calendar day in the given timezone', () => {
    // 2026-11-10 15:00 in Los Angeles (PST, UTC-8).
    const due = tomorrowAt(new Date('2026-11-10T23:00:00Z'), 'America/Los_Angeles', 9);
    expect(due.toISOString()).toBe('2026-11-11T17:00:00.000Z');
  });

  it('uses the local calendar day, not the UTC one, near midnight', () => {
    // 23:58 on Nov 9 in Los Angeles is already Nov 10 in UTC. Tomorrow is still Nov 10 locally.
    const due = tomorrowAt(new Date('2026-11-10T07:58:00Z'), 'America/Los_Angeles', 9);
    expect(due.toISOString()).toBe('2026-11-10T17:00:00.000Z');
    // The same instant in Tokyo is 16:58 on Nov 10, so tomorrow is Nov 11 at 9:00 JST.
    const tokyo = tomorrowAt(new Date('2026-11-10T07:58:00Z'), 'Asia/Tokyo', 9);
    expect(tokyo.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('keeps 9:00 wall-clock time across a daylight-saving change', () => {
    // US clocks go back on 2026-11-01. From Oct 31 (PDT, UTC-7), tomorrow 9:00 is PST (UTC-8).
    const due = tomorrowAt(new Date('2026-10-31T20:00:00Z'), 'America/Los_Angeles', 9);
    expect(due.toISOString()).toBe('2026-11-01T17:00:00.000Z');
    // Clocks go forward on 2026-03-08.
    const spring = tomorrowAt(new Date('2026-03-07T20:00:00Z'), 'America/Los_Angeles', 9);
    expect(spring.toISOString()).toBe('2026-03-08T16:00:00.000Z');
  });

  it('rolls over month and year ends', () => {
    const due = tomorrowAt(new Date('2026-12-31T12:00:00Z'), 'UTC', 9);
    expect(due.toISOString()).toBe('2027-01-01T09:00:00.000Z');
  });
});
