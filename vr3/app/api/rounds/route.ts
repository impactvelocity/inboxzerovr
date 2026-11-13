import { agentCreate, rest } from '@/lib/agent';

/**
 * POST /api/rounds: an agent sends a round of emails and gets a 4-digit game code and a key.
 * The same as the MCP tool create_round (app/mcp/route.ts). How to use it: public/agent.md.
 */
export async function POST(req: Request) {
  return rest(async () => agentCreate(await req.json().catch(() => null)), 201);
}
