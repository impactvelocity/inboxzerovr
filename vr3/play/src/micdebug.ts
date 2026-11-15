import { dictate } from './dictate';
import { pixelLabel } from './home';
import { uiSound } from './uisound';

/**
 * Debug Mic, beside the mic icon on the home page (2026-11-15: "add a debug mic button next to mic icon to test mic setup and
 * transcription so its easier than playing a game, i need to test online and locally, it didnt seem to work online").
 *
 * A card that says, line by line, what the mic needs and whether it has it: a secure page, the mic approved and there, something
 * to write the words down (Scribe through the AI Gateway, else the browser's own), then Record runs a real take down the same
 * path as round two (dictate.ts) and shows the words as they come, which engine heard them, and what went wrong.
 *
 * Online, Scribe is invite only (app/api/scribe-token): without an ?access= link or an agent round the server says 403 and the
 * mic falls back, on the Quest to made-up words. The card says so, and takes the access code there.
 */
export function bindMicDebug() {
  const button = document.getElementById('debug-mic') as HTMLButtonElement | null, dialog = document.getElementById('mic-debug') as HTMLDialogElement | null;
  if (!button || !dialog) return;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const checks = $('mic-checks'), said = $('mic-said'), line = $('mic-line'), json = $('mic-json'), record = $<HTMLButtonElement>('mic-record');
  const access = $<HTMLFormElement>('mic-access'), code = $<HTMLInputElement>('mic-access-code'), bar = dialog.querySelector<HTMLElement>('.mic-debug-meter span');
  let accessNote = '';

  function row(name: string, ok: boolean | null, text: string) {
    return `<dt>${name}</dt><dd class="${ok === null ? '' : ok ? 'on' : 'off'}">${text}</dd>`;
  }
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

  function words(): [boolean | null, string] {
    if (dictate.scribe === true) return [true, 'ElevenLabs Scribe, through the AI Gateway'];
    if (dictate.scribe === null) return [null, 'Checking the server…'];
    const why = dictate.scribeWhy;
    const fallback = dictate.hasBrowserSpeech ? 'this browser\'s own speech writes them instead' : 'this browser has no speech of its own, so the words are made up';
    if (why === 'invite-only') return [false, `Scribe is invite only here: open the game with ?access=CODE, or put the code below. Until then ${fallback}.`];
    if (why === 'no-key') return [false, `The server has no AI_GATEWAY_API_KEY. Until it does, ${fallback}.`];
    if (why === 'no-server') return [false, `The server's /api could not be reached (locally: npm run dev:all in vr3). Until then ${fallback}.`];
    return [false, `Scribe is not ready on the server. Until it is, ${fallback}.`];
  }

  function show() {
    const p = dictate.permission, connected = p === 'granted' && dictate.hasDevice;
    const mic = p === 'unavailable' ? 'Needs a secure page' : !dictate.hasDevice ? 'No microphone found'
      : p === 'denied' ? 'Blocked for this site: allow it in the browser\'s site settings'
      : p === 'granted' ? `Connected${dictate.device ? `: ${esc(dictate.device)}` : ''}` : 'Not connected yet: Record asks for it';
    const [wordsOk, wordsText] = words();
    checks.innerHTML =
      row('Page', window.isSecureContext, window.isSecureContext ? `Secure (${esc(location.protocol.replace(':', ''))})` : 'Not secure: the mic needs https or localhost') +
      row('Mic', connected ? true : p === 'unknown' ? null : false, mic) +
      row('Words', wordsOk, esc(wordsText)) +
      row('Browser', dictate.hasBrowserSpeech, dictate.hasBrowserSpeech ? 'Has its own speech to text (the fallback)' : 'No speech to text of its own (the Quest browser has none)');
    access.hidden = dictate.scribeWhy !== 'invite-only' && !accessNote;
  }

  const engines: Record<string, string> = { pending: 'Opening the mic…', scribe: 'Scribe', browser: 'Browser speech', voice: 'Voice only: heard, but nothing writes the words', mock: 'Demo: no real mic' };
  let raf = 0, wasPhase = '', recordShown = '';
  // (the home page's buttons are in pixel letters: home.ts drew Record's once, so its new words are drawn the same way)
  const recordLabel = (words: string) => { if (words === recordShown) return; recordShown = words; pixelLabel(record, words, 2, '#14121a'); record.setAttribute('aria-label', words); };
  function frame() {
    raf = requestAnimationFrame(frame);
    const phase = dictate.phase, busy = dictate.debugging && (phase === 'opening' || phase === 'listening' || phase === 'finishing');
    if (bar) bar.style.width = `${Math.round(Math.min(1, dictate.level * 1.4) * 100)}%`;
    recordLabel(!busy ? (phase === 'done' && dictate.debugging ? 'Again' : 'Record') : phase === 'listening' ? 'Stop' : phase === 'opening' ? 'Opening' : 'Finishing');
    record.disabled = busy && phase !== 'listening';
    if (dictate.debugging) {
      const text = dictate.text.trim();
      said.textContent = text || (phase === 'done' ? (dictate.engine === 'voice' && dictate.spoke ? 'Your voice was heard, but nothing wrote the words down.' : 'Nothing was written down.') : phase === 'listening' ? 'Listening… say something.' : '');
      said.classList.toggle('empty', !text);
      line.textContent = [phase === 'done' ? `Done · ${engines[dictate.engine] ?? dictate.engine}` : engines[dictate.engine] ?? dictate.engine, dictate.trouble].filter(Boolean).join(' · ');
      line.classList.toggle('off', !!dictate.trouble || dictate.engine === 'voice' || dictate.engine === 'mock');
    }
    if (phase !== wasPhase) { wasPhase = phase; json.textContent = JSON.stringify({ ...dictate.diagnostics(), origin: location.origin, ua: navigator.userAgent }, null, 1); }
  }

  button.addEventListener('click', () => {
    uiSound('confirm');
    accessNote = ''; said.textContent = 'Press Record and say something. It stops by itself after a pause.'; said.classList.add('empty'); line.textContent = ''; line.className = 'mic-line';
    dictate.recheck(); show();
    dialog.showModal();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  });
  record.addEventListener('click', () => {
    if (dictate.debugging && dictate.phase === 'listening') { dictate.debugStop(); return; }
    uiSound('confirm');
    said.textContent = ''; line.textContent = 'Opening the mic…'; line.className = 'mic-line';
    void dictate.debugTake().then(ok => {
      show();
      if (!ok) { said.textContent = 'The mic did not open.'; line.textContent = dictate.trouble || 'The browser said no'; line.className = 'mic-line off'; }
    });
  });
  access.addEventListener('submit', e => {
    e.preventDefault();
    const value = code.value.trim(); if (!value) return;
    void fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: value }), credentials: 'same-origin' })
      .then(async r => { const b = await r.json().catch(() => ({})) as { error?: string }; return r.ok ? '' : b.error ?? `HTTP ${r.status}`; }, () => 'the server could not be reached')
      .then(error => { accessNote = error; code.value = ''; line.textContent = error ? `Access: ${error}` : 'Access is on for this browser: Scribe should be ready.'; line.className = `mic-line ${error ? 'off' : 'on'}`; dictate.recheck(); });
  });
  $('mic-debug-close').addEventListener('click', () => { uiSound('back'); dialog.close(); });
  dialog.addEventListener('close', () => { cancelAnimationFrame(raf); dictate.debugEnd(); });
  dictate.onChange(() => { if (dialog.open) show(); });
}
