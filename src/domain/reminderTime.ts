interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function partsIn(instant: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

/** The instant at which a wall clock in `timeZone` reads the given local date and time. */
export function zonedTimeToInstant(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, 0);
  let guess = wanted;
  // Two passes settle on the right UTC offset, including across DST changes.
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = wanted - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/**
 * The reminder instant for "tomorrow": `hour`:00 on the calendar day after
 * `now`, where both the calendar day and the hour are read in `timeZone`.
 */
export function tomorrowAt(now: Date, timeZone: string, hour: number): Date {
  const today = partsIn(now, timeZone);
  // Date.UTC normalises day overflow (e.g. Jan 32 → Feb 1).
  const next = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return zonedTimeToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hour, timeZone);
}

export function formatHour(hour: number): string {
  const h = ((hour + 11) % 12) + 1;
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatReminder(dueAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dueAt));
}

/** Short received-time label: time of day if it is the same local day as `now`, otherwise the date. */
export function formatReceived(receivedAt: string, timeZone: string, now: Date): string {
  const then = new Date(receivedAt);
  const a = partsIn(then, timeZone);
  const b = partsIn(now, timeZone);
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  return new Intl.DateTimeFormat(
    'en-US',
    sameDay
      ? { timeZone, hour: 'numeric', minute: '2-digit' }
      : { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  ).format(then);
}

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
