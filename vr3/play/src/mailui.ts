import { KEYPAD_SHADOW, pixelLabel, startButton } from './home';
import { mail } from './mail/source';
import { uiSound } from './uisound';

/** FINDING YOUR GAME shows at least this long, so it reads (the mock code is found at once). */
const FINDING_MS = 1300;

/**
 * The home screen's way into a game (2026-11-13):
 *
 *   [ ENTER CODE ]  [ JUST PLAY ]
 *
 * ENTER CODE opens a keypad for the 4-digit code the player's AI agent gave them. Its Play sends the
 * keypad away (the top bounces up, the keys bounce down), says FINDING YOUR GAME, then INBOX READY with a Play
 * button, or NO INBOX FOUND with Try Again (2026-11-14). A real agent round's code plays their emails;
 * 1234 plays a mock round from the demo inbox, as if real (MOCK_CODE); any other is not found. JUST PLAY is the
 * demo, made-up emails. A code in the address (`?code=1234`, the link an agent hands out) is filled
 * in already: JUST PLAY goes, the main button plays that code, and the code shows top right so the
 * player can see it is theirs. The tab keeps the code until the game is played (src/mail/source.ts).
 */
export function bindMailUi() {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const start = $<HTMLButtonElement>('start'), justPlay = $<HTMLButtonElement>('just-play'), badge = $<HTMLButtonElement>('code-badge');
  const dialog = $<HTMLDialogElement>('code'), status = $('mail-status');
  if (!start || !justPlay || !badge || !dialog || !status) return;
  const slots = Array.from(dialog.querySelectorAll<HTMLSpanElement>('.code-slots span')), slotBox = dialog.querySelector<HTMLElement>('.code-slots')!;
  const state = $('code-state')!, play = $<HTMLButtonElement>('code-play')!, back = $<HTMLButtonElement>('code-cancel')!;
  const find = $('code-find')!, findCode = $('find-code')!, findTitle = $('find-title')!, findLine = $('find-line')!;
  const findPlay = $<HTMLButtonElement>('find-play')!, findBack = $<HTMLButtonElement>('find-back')!, findRetry = $<HTMLButtonElement>('find-retry')!;
  const accent = () => getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#f6b3cc';

  let digits = '';
  /** Just Play was pressed: this start is the demo, whatever code there is. */
  let demoOnce = false;
  const codeOn = () => !!mail.state.round.code && mail.state.round.state !== 'missing';

  // The main button: with a code it starts; without one it asks for one.
  startButton.setGate(() => {
    if (demoOnce) { demoOnce = false; return true; }
    if (codeOn()) return true;
    openPad();
    return false;
  });
  justPlay.addEventListener('click', () => {
    if (start.disabled) return;
    uiSound('confirm');
    mail.clearCode();
    demoOnce = true; start.click();
  });
  badge.addEventListener('click', () => { uiSound('key'); openPad(); });
  // the line under Enter Code in the pixel letters too (2026-11-13: "make pixel font, drop the period at end")
  { const lede = dialog.querySelector<HTMLElement>('.code-lede'); if (lede) pixelLabel(lede, lede.textContent ?? '', 1.5, '#ffffff', KEYPAD_SHADOW); }

  // ---------------------------------------------------------------- the keypad
  function openPad() {
    // ENTER CODE big, in the pixel letters, in the chosen level's colour (2026-11-13: "make enter code large text on the keypad")
    { const title = dialog!.querySelector<HTMLElement>('#code-title'); if (title) pixelLabel(title, 'Enter Inbox Code', 3, getComputedStyle(title).color, KEYPAD_SHADOW); }
    digits = codeOn() ? mail.state.round.code : '';
    setView('pad', true);
    drawSlots(); dialog!.showModal();
  }
  function drawSlots() {
    slots.forEach((slot, i) => {
      const d = digits[i];
      slot.classList.toggle('on', !!d); slot.classList.toggle('next', i === digits.length);
      if (d) pixelLabel(slot, d, 6, '#ffffff', KEYPAD_SHADOW); else slot.replaceChildren();
    });
    slotBox.setAttribute('aria-label', digits ? `Code ${digits.split('').join(' ')}` : 'No digits yet');
    play.disabled = digits.length !== 4;
    state.textContent = '';      // (what the code finds shows after Play now: the finding view below)
  }
  function press(key: string) {
    // (retro keypad sounds, src/uisound.ts: each digit a touch higher than the one before it; Del a lower tick, Clr the back blip)
    if (key === 'clear') { if (digits) uiSound('back', { volume: 0.8 }); digits = ''; }
    else if (key === 'back') { if (digits) uiSound('key', { pitch: 0.75 }); digits = digits.slice(0, -1); }
    else if (/^\d$/.test(key) && digits.length < 4) { digits += key; uiSound('key', { pitch: 0.94 + digits.length * 0.06 }); }
    drawSlots();
  }
  dialog.querySelectorAll<HTMLButtonElement>('.code-pad [data-key]').forEach(b => b.addEventListener('click', () => press(b.dataset.key!)));
  dialog.addEventListener('keydown', e => {
    if (view !== 'pad') return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter' && !play.disabled) { e.preventDefault(); play.click(); }
    else return;
    e.stopPropagation();
  });
  back.addEventListener('click', () => {
    uiSound('back');
    // (leaving without four digits forgets a half-typed code; a full one stays)
    if (digits.length !== 4) { digits = ''; mail.clearCode(); }
    dialog.close();
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) (view === 'pad' ? back : findBack).click(); });
  play.addEventListener('click', () => {
    if (digits.length !== 4 || view !== 'pad') return;
    uiSound('confirm');
    mail.useCode(digits);
    finding();
  });

  // ---------------------------------------------------------------- finding the game (2026-11-14)
  let view: 'pad' | 'finding' | 'found' | 'missing' = 'pad';
  let since = 0, wait = 0;
  function setView(v: typeof view, now = false) {
    view = v; find.dataset.state = v;
    if (now) { dialog!.classList.add('snap'); requestAnimationFrame(() => dialog!.classList.remove('snap')); }
    dialog!.classList.toggle('away', v !== 'pad');
  }
  function finding() {
    pixelLabel(findCode, `Game ${digits}`, 2, '#ffffff', KEYPAD_SHADOW);
    pixelLabel(findTitle, 'Finding your game', 3, accent(), KEYPAD_SHADOW);
    findLine.textContent = '';
    setView('finding');
    since = performance.now();
    settle();
  }
  /** Once the code is looked up (and FINDING YOUR GAME has shown long enough): INBOX READY, or NO INBOX FOUND. */
  function settle() {
    if (view !== 'finding') return;
    const r = mail.state.round;
    if (r.code !== digits || (r.state !== 'ready' && r.state !== 'missing')) return;
    const left = FINDING_MS - (performance.now() - since);
    window.clearTimeout(wait);
    if (left > 0) { wait = window.setTimeout(settle, left); return; }
    if (r.state === 'ready') {
      // (2026-11-14: "make it Inbox Ready ( not Found it )", "sub title pixel font and say something - Your 18 Emails are Ready to Play")
      pixelLabel(findTitle, 'Inbox Ready', 4, accent(), KEYPAD_SHADOW);
      pixelLabel(findLine, r.count === 1 ? 'Your 1 email is ready to play' : `Your ${r.count} emails are ready to play`, 1.5, '#ffffff', KEYPAD_SHADOW);
      setView('found');
      requestAnimationFrame(() => findPlay.focus({ preventScroll: true }));
    } else {
      const busy = r.error === 'busy';
      pixelLabel(findTitle, busy ? 'Too many tries' : 'No Inbox Found', 3, '#ff6b6b', KEYPAD_SHADOW);
      // (2026-11-14: "make it say "No Inbox Found" and make check code with your agent be pixel")
      pixelLabel(findLine, busy ? 'Wait a few minutes, then try again' : 'Check the code with your agent', 1.5, '#ffffff', KEYPAD_SHADOW);
      setView('missing');
      requestAnimationFrame(() => findRetry.focus({ preventScroll: true }));
    }
  }
  pixelLabel(findPlay, 'Play', 3, '#14121a');
  findPlay.addEventListener('click', () => {
    if (view !== 'found' || !mail.roundReady()) return;
    uiSound('confirm');
    dialog.close();
    start.click();      // (inside this click, so the headset still counts it as the player's own press)
  });
  findRetry.addEventListener('click', () => {
    uiSound('key');
    mail.clearCode(); digits = ''; drawSlots();
    setView('pad');
  });
  // Back: a found game stays (the main button plays it); anything else is forgotten
  findBack.addEventListener('click', () => {
    uiSound('back');
    if (view !== 'found') { mail.clearCode(); digits = ''; }
    dialog.close();
  });
  dialog.addEventListener('cancel', () => uiSound('back'));      // (Escape)
  dialog.addEventListener('close', () => {
    window.clearTimeout(wait);
    if (view === 'finding' || view === 'missing') { if (mail.state.round.state !== 'ready') mail.clearCode(); digits = ''; }
    // (back to the keypad once it has faded out, so what was showing fades with it rather than the keys flashing back)
    window.setTimeout(() => { if (!dialog.open) setView('pad', true); }, 260);
  });

  // ---------------------------------------------------------------- what shows
  let shownCode = '';
  const show = () => {
    const s = mail.state, r = s.round, on = codeOn();
    justPlay.hidden = on;
    badge.hidden = !on;
    if (on && r.code !== shownCode) pixelLabel(badge, `Code ${r.code}`, 2, '#ffffff');
    shownCode = on ? r.code : '';
    startButton.setLabel(on ? 'Clear Your Inbox' : 'Enter Code');
    if (dialog.open) settle();
    // (a code not found while the keypad was shut: forget it)
    else if (r.state === 'missing') mail.clearCode();
    // under the buttons: only how sending the results went
    status.textContent = r.state === 'sending' ? 'Sending your choices to your agent...' : s.notice;
  };
  mail.listen(show);
  show();
  void mail.init();
}
