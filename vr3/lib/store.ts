/**
 * The one place the server keeps anything: agent rounds (lib/rounds.ts) and rate-limit counters.
 *
 * Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
 * (or the KV_REST_API_* names Vercel's Upstash integration uses). Without them, a Map in this
 * process's memory: fine for `npm run dev`, but rounds vanish on a restart and are not shared
 * between serverless instances, so a deploy needs Upstash.
 *
 * Every key is written with an expiry, so nothing is kept by accident.
 */

const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
export const storeKind: 'upstash' | 'memory' = url && token ? 'upstash' : 'memory';

async function redis(...command: (string | number)[]): Promise<unknown> {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), cache: 'no-store' });
  const body = (await r.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!r.ok || body.error) throw new Error(`Upstash: ${body.error ?? r.status}`);
  return body.result;
}

// (in memory: on globalThis so Next's dev server, which loads each route on its own, shares one)
type Entry = { value: string; until: number };
const g = globalThis as unknown as { __izvrStore?: Map<string, Entry> };
const mem = (g.__izvrStore ??= new Map());
function live(key: string): Entry | null {
  const e = mem.get(key);
  if (!e) return null;
  if (e.until <= Date.now()) { mem.delete(key); return null; }
  return e;
}

export const store = {
  async get<T>(key: string): Promise<T | null> {
    const raw = storeKind === 'upstash' ? (await redis('GET', key)) as string | null : live(key)?.value ?? null;
    return raw ? JSON.parse(raw) as T : null;
  },

  /** Writes `value` for `seconds`. With `onlyIfNew`, only when the key is free (false if it was taken). */
  async set(key: string, value: unknown, seconds: number, onlyIfNew = false): Promise<boolean> {
    const raw = JSON.stringify(value), s = Math.max(1, Math.round(seconds));
    if (storeKind === 'upstash') return (await redis('SET', key, raw, 'EX', s, ...(onlyIfNew ? ['NX'] : []))) === 'OK';
    if (onlyIfNew && live(key)) return false;
    mem.set(key, { value: raw, until: Date.now() + s * 1000 });
    return true;
  },

  async del(key: string): Promise<void> {
    if (storeKind === 'upstash') await redis('DEL', key);
    else mem.delete(key);
  },

  /** Counts a hit in a window of `seconds` that starts with the first one; returns the count so far. */
  async hit(key: string, seconds: number): Promise<number> {
    if (storeKind === 'upstash') {
      const n = Number(await redis('INCR', key));
      if (n === 1) await redis('EXPIRE', key, seconds);
      return n;
    }
    const e = live(key), n = (e ? Number(e.value) : 0) + 1;
    mem.set(key, { value: String(n), until: e?.until ?? Date.now() + seconds * 1000 });
    return n;
  },
};
