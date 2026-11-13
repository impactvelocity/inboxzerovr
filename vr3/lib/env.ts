/** The server's settings, all from the environment (.env.local in development; see .env.example). */
export const env = {
  authSecret: process.env.AUTH_SECRET ?? '',
  /** ?access= codes: a browser with one gets the mic in the demo too. Several: separate with commas. */
  accessCodes: (process.env.ACCESS_CODE ?? '').split(',').map(s => s.trim()).filter(Boolean),
  /** The AI Gateway reads AI_GATEWAY_API_KEY itself; on Vercel an OIDC token works too. */
  ai: !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
  /** Writes up what was said into the mic as an email (lib/ai.ts). */
  polishModel: process.env.POLISH_MODEL || 'anthropic/claude-haiku-5.5',
  fallbackModel: process.env.FALLBACK_MODEL || 'google/gemini-3.8-flash',
  elevenlabs: process.env.ELEVENLABS_API_KEY ?? '',
  publicOrigin: process.env.PUBLIC_ORIGIN ?? '',
};
