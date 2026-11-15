import { z } from 'zod';
import { agentCreate, agentDelete, agentResults, CreateOutput, DeleteOutput, ResultsInput, ResultsOutput } from '@/lib/agent';
import { guide, instructions, playPrompt } from '@/lib/guide';
import { CodeAndKey, CreateRound, RoundError } from '@/lib/rounds';
import { origin } from '@/lib/session';

/**
 * The MCP server (2026-11-13): https://<site>/mcp. Give that URL to an agent that can read the
 * user's email (Claude, ChatGPT, Meta's agent, anything that speaks MCP) and it can set up a game
 * of the user's own inbox. No sign-in: the agent gets a code and a key per round.
 *
 * Streamable HTTP, stateless: every POST is one JSON-RPC message (or a batch) and gets its answer
 * as plain JSON. No sessions, no server-sent events, nothing kept between calls except the rounds
 * themselves (lib/rounds.ts). The same three tools work over REST (app/api/rounds).
 *
 * What an agent is told (2026-11-15), all from lib/guide.ts: the instructions when it connects, each
 * tool's description, input and output schema, the full guide as the resource inboxzero://guide
 * (also the page /agent.md), and the prompt play_inbox_zero (a slash command in Claude and others).
 */

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const schema = (s: z.ZodType, io: 'input' | 'output' = 'input') => {
  const { $schema: _, ...rest } = z.toJSONSchema(s, { io, unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
};

const TOOLS = [
  {
    name: 'create_round',
    title: 'Create an Inbox Zero game',
    description: 'Sets up a game of the user\'s own unread email (5 to 20 plays best, 30 at most) and returns a 4-digit code they type into the game, a play_url that fills it in, a quest_url that opens it on their Quest, message_for_user, and a key you keep to read the results. Show the user message_for_user straight away, word for word: it has the code and both links (Open in VR, and the browser link), and they need all three. Send short summaries, never full emails, and opaque refs of your own, never real message ids. Every email needs exactly two short replies, the two bubbles the user picks between: for mail from a person, replies written as the user; for automated mail, two things you could do instead ("Unsubscribe me"). The guide (resource inboxzero://guide) says how each field is shown.',
    inputSchema: schema(CreateRound),
    outputSchema: schema(CreateOutput, 'output'),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: agentCreate,
  },
  {
    name: 'get_results',
    title: 'Get what the user chose',
    description: 'What the user did in the game, once they say they are done. status is waiting (code not entered yet), playing, or done; wait_seconds waits up to 25 seconds for the end. When done, every ref comes back once: archive (slashed), reply (a picked draft as reply_index and reply_text; or what they said into the mic as dictated, word for word: write the email from it yourself; or ask_user when no words were caught: ask them), or leave (leave it unread). plays counts finished games: if they played it again, the last game\'s choices replace the first\'s, so read again if plays went up. Show the user the plan by sender and subject and ask before acting; then call delete_round.',
    inputSchema: schema(ResultsInput),
    outputSchema: schema(ResultsOutput, 'output'),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: agentResults,
  },
  {
    name: 'delete_round',
    title: 'Done with a game',
    description: 'Deletes the round and its results from the server now. Call it once you have acted on the results, or when the user says no or changes their mind. Otherwise both are deleted 4 hours after the round was made.',
    inputSchema: schema(CodeAndKey),
    outputSchema: schema(DeleteOutput, 'output'),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: agentDelete,
  },
];

const GUIDE_URI = 'inboxzero://guide';
const RESOURCES = [{ uri: GUIDE_URI, name: 'guide', title: 'Inbox Zero VR: the guide for agents', description: 'How the game plays, the flow, every field of a round and how it is shown, what each result means and what to do, what is kept, limits, REST and an example.', mimeType: 'text/markdown' }];

const PROMPTS = [{
  name: 'play_inbox_zero',
  title: 'Play Inbox Zero VR with my email',
  description: 'Makes a game of your newest unread emails and gives you the code; when you\'re done, shows you the plan before acting.',
  arguments: [{ name: 'count', description: 'How many emails (5 to 20 plays best). Default 10 to 15.', required: false }],
}];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handle(msg: Rpc, site: string): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid request');
  const isNote = msg.id === undefined || msg.id === null;
  if (isNote) return null;      // (notifications/initialized and the like: nothing to answer)
  const p = msg.params ?? {};
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
      return ok(msg.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false }, prompts: { listChanged: false } },
        serverInfo: { name: 'inbox-zero-vr', title: 'Inbox Zero VR', version: '0.2.0', websiteUrl: site },
        instructions: instructions(site),
      });
    }
    case 'ping': return ok(msg.id, {});
    case 'tools/list': return ok(msg.id, { tools: TOOLS.map(({ run: _, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === p.name);
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${String(p.name)}`);
      try {
        const out = await tool.run(p.arguments ?? {});
        // (create_round: the message for the user first, so a client that shows the model only the text still has it, links and all)
        const text = 'message_for_user' in out
          ? `Show the user this message now, word for word. Keep the code and BOTH links (Open in VR, and the browser link): never drop or shorten them.\n\n${out.message_for_user}\n\nThen: ${out.next_steps}\n\nKeep the key: ${out.key}\n\n${JSON.stringify(out, null, 2)}`
          : JSON.stringify(out, null, 2);
        return ok(msg.id, { content: [{ type: 'text', text }], structuredContent: out, isError: false });
      } catch (e) {
        // (a tool that fails tells the model why, as a result, so it can fix its call)
        const text = e instanceof RoundError ? e.message : 'Something went wrong on the server.';
        if (!(e instanceof RoundError)) console.error(e);
        return ok(msg.id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    case 'resources/list': return ok(msg.id, { resources: RESOURCES });
    case 'resources/templates/list': return ok(msg.id, { resourceTemplates: [] });
    case 'resources/read': {
      if (p.uri !== GUIDE_URI) return fail(msg.id, -32002, `Resource not found: ${String(p.uri)}`);
      return ok(msg.id, { contents: [{ uri: GUIDE_URI, mimeType: 'text/markdown', text: guide(site) }] });
    }
    case 'prompts/list': return ok(msg.id, { prompts: PROMPTS });
    case 'prompts/get': {
      if (p.name !== 'play_inbox_zero') return fail(msg.id, -32602, `Unknown prompt: ${String(p.name)}`);
      const args = (p.arguments ?? {}) as Record<string, string>;
      return ok(msg.id, { description: PROMPTS[0].description, messages: [{ role: 'user', content: { type: 'text', text: playPrompt(args.count) } }] });
    }
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
  const batch = Array.isArray(body), site = await origin();
  const answers = (await Promise.all((batch ? body as Rpc[] : [body as Rpc]).map(m => handle(m, site)))).filter((a): a is object => a !== null);
  if (!answers.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? answers : answers[0], { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

/** No server-to-client stream: this server never starts a conversation. */
export function GET() {
  return new Response('Inbox Zero VR MCP server: add this URL to your AI agent as a remote MCP server (Streamable HTTP, no sign-in). The guide for agents: /agent.md', { status: 405, headers: { ...CORS, Allow: 'POST' } });
}

/** Stateless: there is no session to end. */
export function DELETE() { return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST' } }); }

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
