import { env, googleReady } from '@/lib/env';
import { json } from '@/lib/http';
import { mock } from '@/lib/mock-gmail';
import { hasAccess, readSession } from '@/lib/session';
import type { MeResponse } from '@/play/src/mail/wire';

/** What the home screen needs: may this browser connect Gmail, is it connected, is there a model. Also wakes the server. */
export async function GET() {
  const [access, real] = await Promise.all([hasAccess(), readSession()]);
  const session = env.mockGmail && access ? mock.session() : real;      // (the pretend Gmail: connected for anyone with the invite)
  const me: MeResponse = { access, google: googleReady() || env.mockGmail, connected: !!session, ai: env.ai, ...(session ? { email: session.email, name: session.name } : {}) };
  return json(me);
}
