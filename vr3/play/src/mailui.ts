import { pixelLabel } from './home';
import { mail } from './mail/source';
import { CountChoices } from './mail/wire';

/**
 * The home screen's Inbox card (2026-11-12) and the line under Start: which inbox to play (the demo,
 * or your Gmail with the access code), how many emails a game takes, connecting and signing out,
 * and how the inbox and the last game's write-back went. The state is in src/mail/source.ts.
 */
export function bindMailUi() {
  const dialog = document.getElementById('inbox') as HTMLDialogElement | null;
  const open = document.getElementById('open-inbox');
  if (!dialog || !open) return;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const radios = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[name="mail-mode"]'));
  const gmailChoice = $('mail-gmail-choice'), gmailLine = $('mail-gmail-line'), invite = $('mail-invite');
  const count = $<HTMLSelectElement>('mail-count'), stateLine = $('mail-state'), status = $('mail-status');
  const connect = $<HTMLButtonElement>('mail-connect'), signOut = $<HTMLButtonElement>('mail-signout');

  for (const n of CountChoices) count.add(new Option(String(n), String(n)));
  open.addEventListener('click', () => dialog.showModal());
  dialog.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  for (const r of radios) r.addEventListener('change', () => { if (r.checked) mail.setMode(r.value === 'gmail' ? 'gmail' : 'demo'); });
  count.addEventListener('change', () => mail.setCount(Number(count.value)));
  connect.addEventListener('click', () => mail.connect());
  signOut.addEventListener('click', () => { void mail.signOut(); });
  // (their pixel words are drawn once here; the buttons themselves only show and hide)
  pixelLabel(connect, 'Connect Gmail', 2, '#ffffff');
  pixelLabel(signOut, 'Sign out', 2, '#ffffff');

  const show = () => {
    const s = mail.state, me = s.me, access = !!me?.access, connected = !!me?.connected;
    const gmail = s.mode === 'gmail';
    for (const r of radios) r.checked = r.value === s.mode;
    // Gmail is offered only with the invite (or when already connected); otherwise it is the demo, and why.
    gmailChoice.hidden = !(access || connected);
    invite.hidden = access || connected;
    if (gmail && !(access || connected)) radios.find(r => r.value === 'demo')!.checked = true;
    gmailLine.textContent = connected ? `Signed in as ${me!.email || me!.name || 'you'}.` : me && !me.google ? 'Google sign-in is not set up on this server yet.' : 'Your newest unread mail, sorted into cards by AI.';
    count.value = String(s.count);
    connect.hidden = !(access && !connected && me?.google);
    signOut.hidden = !connected;

    // what the inbox is doing
    let line = '';
    if (gmail && connected) {
      const i = s.inbox;
      if (s.applying) line = 'Updating Gmail from the last game...';
      else if (i.state === 'loading') line = i.expected ? `Sorting your inbox: ${i.loaded} of ${i.expected}...` : 'Reading your inbox...';
      else if (i.state === 'ready') line = i.expected ? `${i.expected} unread ${i.expected === 1 ? 'email' : 'emails'} ready${i.unread > i.expected ? ` (of ${i.unread})` : ''}${i.ai ? '' : ', sorted without AI'}.` : 'No unread email in your inbox: the demo plays instead.';
      else if (i.state === 'failed') line = `Your inbox could not be read (${i.error}): the demo plays instead.`;
    } else if (gmail && !connected && (access || me?.connected === false)) line = me?.google ? 'Connect Gmail to play your own inbox. Until then, the demo plays.' : '';
    stateLine.textContent = [line, s.notice].filter(Boolean).join(' ');
    // under Start: which inbox the next game is
    status.textContent = mail.gmailReady() ? `Your Gmail · ${Math.min(s.count, s.inbox.expected)} emails${s.inbox.state === 'loading' ? ` · sorting ${s.inbox.loaded}/${s.inbox.expected}` : ''}`
      : gmail && connected && s.inbox.state === 'loading' ? `Reading your Gmail${s.inbox.expected ? ` · ${s.inbox.loaded}/${s.inbox.expected}` : ''}...`
      : s.notice && !dialog.open ? s.notice : '';
  };
  mail.listen(show);
  show();
  void mail.init().then(() => { if (mail.state.notice) show(); });
}
