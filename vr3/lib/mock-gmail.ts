import { Fixtures, asRaw } from './demo-fixtures';
import type { GmailMessage } from './mime';
import type { Session } from './session';

/**
 * A pretend Gmail (MOCK_GMAIL=1): the demo emails (lib/demo-fixtures.ts) stand in for the inbox,
 * and archiving and drafts are only logged. It lets the whole live path (the API, the models, the
 * game's real-mail side) run without a Google client. Anyone with the invite counts as signed in.
 * Never set it where real players are.
 */
const TAB = { promotions: 'CATEGORY_PROMOTIONS', social: 'CATEGORY_SOCIAL', updates: 'CATEGORY_UPDATES', forums: 'CATEGORY_FORUMS' } as const;
const archived = new Set<string>();
const started = Date.now();

function toMessage(id: string): GmailMessage {
  const f = Fixtures.find(x => x.id === id);
  if (!f) throw new Error(`no such email ${id}`);
  const raw = asRaw(f, 'you@demo.example', started);
  const [head, ...rest] = raw.split('\r\n\r\n');
  const headers = head.split('\r\n').map(line => { const at = line.indexOf(': '); return { name: line.slice(0, at), value: line.slice(at + 2) }; });
  return {
    id, threadId: id, internalDate: String(started - f.hoursAgo * 3_600_000),
    labelIds: ['INBOX', 'UNREAD', ...(f.tab ? [TAB[f.tab]] : [])], snippet: f.text.slice(0, 120),
    payload: { mimeType: 'text/plain', headers, body: { data: Buffer.from(rest.join('\r\n\r\n'), 'utf8').toString('base64url') } },
  };
}

export const mock = {
  session: (): Session => ({ refresh: 'mock', access: 'mock', expires: Date.now() + 3_600_000, email: 'you@demo.example', name: 'Demo Player' }),
  async unread(count: number) {
    const left = [...Fixtures].sort((a, b) => a.hoursAgo - b.hoursAgo).filter(f => !archived.has(f.id));
    return { ids: left.slice(0, count).map(f => ({ id: f.id, threadId: f.id })), total: left.length };
  },
  message: async (id: string) => toMessage(id),
  thread: async (id: string) => ({ id, messages: [toMessage(id)] }),
  async archive(ids: string[]) { for (const id of ids) archived.add(id); console.log(`[mock gmail] archived ${ids.join(', ')}`); },
  async draft(threadId: string, headers: string, body: string) {
    console.log(`[mock gmail] draft on ${threadId}:\n${headers.split('\r\n').slice(0, 3).join('\n')}\n---\n${body}\n---`);
    return { id: `draft-${threadId}` };
  },
};
