import { guide } from '@/lib/guide';
import { origin } from '@/lib/session';

/** /agent.md: the guide for agents, with this site's own address in it (the same text as the MCP resource inboxzero://guide; lib/guide.ts). */
export async function GET() {
  return new Response(guide(await origin()), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } });
}
