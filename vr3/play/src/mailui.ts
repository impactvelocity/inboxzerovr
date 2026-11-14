import { pixelLabel, startButton } from './home';
import { mail } from './mail/source';

/**
 * The home screen's way into a game (2026-11-13):
 *
 *   [ ENTER CODE ]  [ JUST PLAY ]
 *
 * ENTER CODE opens a keypad for the 4-digit code the player's AI agent gave them. A code that is a
 * real agent round plays their emails; any other number plays the demo for now. JUST PLAY is the
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

  let digits = '';
  /** Just Play was pressed: this start is the demo, whatever code there is. */
  let demoOnce = false;
  const codeOn = () => !!mail.state.round.code;

  // The main button: with a code it starts; without one it asks for one.
  startButton.setGate(() => {
    if (demoOnce) { demoOnce = false; return true; }
    if (codeOn()) return true;
    openPad();
    return false;
  });
  justPlay.addEventListener('click', () => {
    if (start.disabled) return;
    mail.clearCode();
    demoOnce = true; start.click();
  });
  badge.addEventListener('click', () => openPad());
  // the line under Enter Code in the pixel letters too (2026-11-13: "make pixel font, drop the period at end")
  { const lede = dialog.querySelector<HTMLElement>('.code-lede'); if (lede) pixelLabel(lede, lede.textContent ?? '', 1.5, '#ffffff'); }

  // ---------------------------------------------------------------- the keypad
  function openPad() {
    // ENTER CODE big, in the pixel letters, in the chosen level's colour (2026-11-13: "make enter code large text on the keypad")
    { const title = dialog!.querySelector<HTMLElement>('#code-title'); if (title) pixelLabel(title, 'Enter Code', 3, getComputedStyle(title).color); }
    digits = mail.state.round.code;
    drawSlots(); dialog!.showModal();
  }
  function drawSlots() {
    slots.forEach((slot, i) => {
      const d = digits[i];
      slot.classList.toggle('on', !!d); slot.classList.toggle('next', i === digits.length);
      if (d) pixelLabel(slot, d, 6, '#ffffff'); else slot.replaceChildren();
    });
    slotBox.setAttribute('aria-label', digits ? `Code ${digits.split('').join(' ')}` : 'No digits yet');
    play.disabled = digits.length !== 4;
    const r = mail.state.round;
    state.textContent = digits.length < 4 ? '' : r.code !== digits || r.state === 'loading' ? 'Finding that game...'
      : r.state === 'ready' ? `${r.title}: ${r.count} ${r.count === 1 ? 'email' : 'emails'} from your agent.`
      : 'No agent game with that code: the demo plays.';
  }
  function press(key: string) {
    if (key === 'clear') digits = '';
    else if (key === 'back') digits = digits.slice(0, -1);
    else if (/^\d$/.test(key) && digits.length < 4) digits += key;
    if (digits.length === 4) mail.useCode(digits);
    drawSlots();
  }
  dialog.querySelectorAll<HTMLButtonElement>('.code-pad [data-key]').forEach(b => b.addEventListener('click', () => press(b.dataset.key!)));
  dialog.addEventListener('keydown', e => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter' && !play.disabled) { e.preventDefault(); play.click(); }
    else return;
    e.stopPropagation();
  });
  back.addEventListener('click', () => {
    // (leaving without four digits forgets a half-typed code; a full one stays)
    if (digits.length !== 4) { digits = ''; mail.clearCode(); }
    dialog.close();
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) back.click(); });
  play.addEventListener('click', () => {
    if (digits.length !== 4) return;
    mail.useCode(digits);
    dialog.close();
    start.click();      // (inside this click, so the headset still counts it as the player's own press)
  });

  // ---------------------------------------------------------------- what shows
  let shownCode = '';
  const show = () => {
    const s = mail.state, r = s.round, on = codeOn();
    justPlay.hidden = on;
    badge.hidden = !on;
    if (on && r.code !== shownCode) pixelLabel(badge, `Code ${r.code}`, 2, '#ffffff');
    shownCode = on ? r.code : '';
    startButton.setLabel(on ? 'Clean Your Inbox' : 'Enter Code');
    if (dialog.open) drawSlots();
    // under the buttons: only how sending the results went
    status.textContent = r.state === 'sending' ? 'Sending your choices to your agent...' : s.notice;
  };
  mail.listen(show);
  show();
  void mail.init();
}
