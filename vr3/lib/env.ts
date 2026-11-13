/** The server's settings, all from the environment (.env.local in development; see .env.example). */
export const env = {
  authSecret: process.env.AUTH_SECRET ?? '',
  accessCodes: (process.env.ACCESS_CODE ?? '').split(',').map(s => s.trim()).filter(Boolean),
  googleId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  /** The AI Gateway reads AI_GATEWAY_API_KEY itself; on Vercel an OIDC token works too. */
  ai: !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
  sortModel: process.env.SORT_MODEL || 'anthropic/claude-haiku-5.5',
  replyModel: process.env.REPLY_MODEL || 'anthropic/claude-sonnet-5.5',
  fallbackModel: process.env.FALLBACK_MODEL || 'google/gemini-3.8-flash',
  elevenlabs: process.env.ELEVENLABS_API_KEY ?? '',
  publicOrigin: process.env.PUBLIC_ORIGIN ?? '',
  allowSeed: process.env.ALLOW_SEED === '1' || process.env.NODE_ENV === 'development',
  /** A pretend Gmail made of the demo emails (lib/mock-gmail.ts), for trying the live path without Google. Never set it where real players are. */
  mockGmail: process.env.MOCK_GMAIL === '1',
};

export const googleReady = () => !!(env.googleId && env.googleSecret && env.authSecret);
