import { revoke } from '@/lib/gmail';
import { json } from '@/lib/http';
import { clearSession, readSession } from '@/lib/session';

/** Signs out: Google is told to forget the grant, and the cookie goes. */
export async function POST() {
  const s = await readSession();
  if (s) await revoke(s);
  await clearSession();
  return json({ connected: false });
}
