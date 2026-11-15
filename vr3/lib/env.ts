/** The server's settings, all from the environment (.env.local in development; see .env.example). */
export const env = {
  authSecret: process.env.AUTH_SECRET ?? '',
  /** ?access= codes: a browser with one gets the mic in the demo too. Several: separate with commas. */
  accessCodes: (process.env.ACCESS_CODE ?? '').split(',').map(s => s.trim()).filter(Boolean),
  /** Round two's mic: a client secret is minted for the browser (app/api/scribe-token), which needs a real gateway key, not OIDC. */
  gatewayKey: !!process.env.AI_GATEWAY_API_KEY,
  micModel: process.env.MIC_MODEL || 'elevenlabs/scribe-v2-realtime',
  /** SCRIBE_PUBLIC: true (1/true/yes/on), the mic for everyone; false (0/false/no/off), only for access codes and agent rounds; null, unset. */
  scribePublic: flag(process.env.SCRIBE_PUBLIC),
  publicOrigin: process.env.PUBLIC_ORIGIN ?? '',
};

function flag(value: string | undefined): boolean | null {
  const v = (value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v) ? true : ['0', 'false', 'no', 'off'].includes(v) ? false : null;
}
