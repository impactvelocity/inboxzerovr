import { z } from 'zod';
import { agentCancel, agentCreate, agentResults, ResultsInput } from '@/lib/agent';
import { CodeAndKey, CreateRound, RoundError } from '@/lib/rounds';

/**
 * The MCP server (2026-11-13): https://<site>/mcp. Give that URL to an agent that can read the
 * user's email (Claude, ChatGPT, Meta's agent, anything that speaks MCP) and it can set up a game
 * of the user's own inbox. No sign-in: the agent gets a code and a key per round.
 *
 * Streamable HTTP, stateless: every POST is one JSON-RPC message (or a batch) and gets its answer
 * as plain JSON. No sessions, no server-sent events, nothing kept between calls except the rounds
 * themselves (lib/rounds.ts). The same three things work over REST: public/agent.md.
 */

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Inbox Zero VR turns the user's unread email into a VR game: they slash what can be archived, keep what matters, and pick replies. You do the reading and the acting; the game only collects their decisions.

1. When the user wants to play, read their newest unread emails (5 to 20 plays best) with your own email tools. For each, send a ref of your own (1, 2, 3...), the sender's name, the subject, a short summary (never the full body), a category, and for mail from a person who expects an answer, one or two short reply drafts. Call create_round.
2. Tell the user the 4-digit code, the quest_url (opens the game on their Meta Quest) and the play_instructions. Keep the key: you need it for the results.
3. When the user says they are done, call get_results (wait_seconds lets you wait a little). Show them the plan in plain words ("archive these 6, reply to Sam with 'Thursday works', leave 3") and ask before acting.
4. With their OK, do it with your own email tools: archive, send or save the replies as drafts (whichever the user prefers), and leave the rest unread. Map each ref back to the real email yourself; the game never sees real message ids.

The round's emails are deleted as soon as the game is finished, and the results 10 minutes after you first read them (or 24 hours if nobody plays). cancel_round deletes them at once.`;

const schema = (s: z.ZodType) => {
  const { $schema: _, ...rest } = z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
};

const TOOLS = [
  {
    name: 'create_round',
    title: 'Create an Inbox Zero game',
    description: 'Sets up a game of the user\'s own unread email and returns a 4-digit code they type into the game, plus a key you keep to read the results. Send summaries, not full emails, and opaque refs, not real message ids.',
    inputSchema: schema(CreateRound),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: agentCreate,
  },
  {
    name: 'get_results',
    title: 'Get what the user chose',
    description: 'What the user did in the game: for each ref, archive, reply (with the chosen draft as reply_index and reply_text, the words they said into the mic as dictated plus the email written from them as reply_text, or ask_user when they chose to answer by voice but no words were caught) or leave. status is waiting or playing until the game is finished. Show the user the plan and ask before acting on it.',
    inputSchema: schema(ResultsInput),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: agentResults,
  },
  {
    name: 'cancel_round',
    title: 'Delete a game',
    description: 'Deletes a round and its results from the server now.',
    inputSchema: schema(CodeAndKey),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: agentCancel,
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handle(msg: Rpc): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid request');
  const isNote = msg.id === undefined || msg.id === null;
  if (isNote) return null;      // (notifications/initialized and the like: nothing to answer)
  const p = msg.params ?? {};
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
      return ok(msg.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'inbox-zero-vr', title: 'Inbox Zero VR', version: '0.1.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok(msg.id, {});
    case 'tools/list': return ok(msg.id, { tools: TOOLS.map(({ run: _, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === p.name);
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${String(p.name)}`);
      try {
        const out = await tool.run(p.arguments ?? {});
        const text = 'play_instructions' in out ? `${JSON.stringify(out, null, 2)}\n\n${out.play_instructions}` : JSON.stringify(out, null, 2);
        return ok(msg.id, { content: [{ type: 'text', text }], structuredContent: out, isError: false });
      } catch (e) {
        // (a tool that fails tells the model why, as a result, so it can fix its call)
        const text = e instanceof RoundError ? e.message : 'Something went wrong on the server.';
        if (!(e instanceof RoundError)) console.error(e);
        return ok(msg.id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    case 'resources/list': return ok(msg.id, { resources: [] });
    case 'prompts/list': return ok(msg.id, { prompts: [] });
    default: return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json(fail(null, -32700, 'Parse error'), { status: 400, headers: CORS }); }
  const batch = Array.isArray(body);
  const answers = (await Promise.all((batch ? body as Rpc[] : [body as Rpc]).map(handle))).filter((a): a is object => a !== null);
  if (!answers.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? answers : answers[0], { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

/** No server-to-client stream: this server never starts a conversation. */
export function GET() {
  return new Response('Inbox Zero VR MCP server: POST JSON-RPC here. Instructions for agents: /agent.md', { status: 405, headers: { ...CORS, Allow: 'POST' } });
}

/** Stateless: there is no session to end. */
export function DELETE() { return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST' } }); }

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
