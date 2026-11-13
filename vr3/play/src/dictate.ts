import { pixelLabel } from './home';

/**
 * Round two's mic, for real (2026-11-12: the dictation plan, "build this").
 *
 * The letter held at the mic fills its ring; as the ring starts, `warm()` opens the mic so it is
 * already live when the ring completes; full, `start()` begins a take. The words come back as they
 * are said (`text`), and the mic's bars follow the voice (`level`). A take ends by itself: a pause
 * after speaking (`tune.quietToEnd`), nothing said at all (`tune.nothingFor`), or the longest take
 * (`tune.longest`). Then `phase` is 'done' and letters.ts offers SEND IT and REDO, or TRY AGAIN.
 *
 * Who turns speech into words, best first:
 *   'scribe'   ElevenLabs Scribe v2 realtime over a WebSocket, with a single-use token from the dev
 *              server (/api/scribe-token in the Next app, vr3/app/api; the key stays on the server)
 *   'browser'  the browser's own SpeechRecognition, where there is one (desktop Chrome; the Quest
 *              browser is unknown)
 *   'mock'     no mic or neither of the above: letters.ts types out the made-up words, as before
 *
 * The mic needs a secure page (https or localhost). Permission is asked only on the home page, from
 * Connect mic (beside Setup) or Allow mic (on the Setup card): a click of its own, so Enter VR keeps
 * its click. In VR it is never asked (2026-11-12: on the Quest the prompt took the player out of
 * VR). Without an approved mic, or with no speech service, the mic is a demo: the made-up words,
 * and DEMO under it.
 */

export const tune = {
  quietToEnd: 1.3,      // seconds of quiet after speaking that end a take
  nothingFor: 6,        // seconds with nothing said that end it (TRY AGAIN)
  longest: 30,          // the longest a take can run
  finishWait: 1.5,      // after the end, how long to wait for the last words
  speakAbove: 0.025,    // the level (RMS) that counts as speaking, at the least: it also follows the room's noise
  warmFor: 6,           // a mic opened at the ring and not used is closed after this long
};

type Phase = 'idle' | 'opening' | 'listening' | 'finishing' | 'done';
type Engine = 'pending' | 'scribe' | 'browser' | 'mock';
type Permission = 'unknown' | 'granted' | 'denied' | 'unavailable';

const RATE = 16000;
const TAP = `class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; } }
    return true;
  }
}
registerProcessor('dictate-tap', Tap);`;

interface Recognition { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null }

function createDictate() {
  const d = {
    phase: 'idle' as Phase, engine: 'mock' as Engine, permission: 'unknown' as Permission,
    /** What has been heard so far (settled words, then the ones still being worked out). */
    text: '',
    /** How loud the mic is, 0 to 1, smoothed: for the mic's bars. */
    level: 0,
    /** Why the last take went wrong, if it did (shown in the console, and on Setup). */
    trouble: '',
    /** Is there a mic at all (false: none plugged in or built in), and can the server give Scribe tokens (null: not known yet)? */
    hasDevice: true, scribe: null as boolean | null,
  };
  const listeners = new Set<() => void>();
  const told = () => listeners.forEach(f => f());

  let stream: MediaStream | null = null, ctx: AudioContext | null = null, source: MediaStreamAudioSourceNode | null = null, tap: AudioWorkletNode | null = null;
  let tapReady: Promise<void> | null = null, opening: Promise<boolean> | null = null;
  let ws: WebSocket | null = null, recog: Recognition | null = null, take = 0;
  let settled = '', partial = '', age = 0, quiet = 0, spoke = false, finishAge = 0, warmAge = 0, floor = 0.01;
  let pending: Int16Array[] = [], outBuf = new Int16Array(1600), outN = 0, carry = 0;

  const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  const canMic = !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  /**
   * Find out, without asking, whether the mic is approved and there is one: the Permissions API where
   * it knows the mic, and the devices' names (a browser only gives them once the mic is approved).
   */
  let watching = false, openedOnce = false;
  /**
   * The mic, once approved, is opened on the home page (Start, Connect mic) and kept for the whole game, its
   * track switched off between takes (2026-11-12: on the Quest the mic did not open inside VR, and every take
   * was the demo). `held`: kept open like that.
   */
  let held = false;
  // (remembered across visits: a grant the Permissions API cannot see, after a reload, still counts)
  const KEY = 'inboxzero.micApproved';
  const remember = (on: boolean) => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* no storage */ } };
  const remembered = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  async function refresh() {
    if (!canMic) { d.permission = 'unavailable'; told(); return; }
    let known = false;
    try {
      const state = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      d.permission = state.state === 'granted' ? 'granted' : state.state === 'denied' ? 'denied' : 'unknown'; known = true;
      // (a grant "this time only" reads as prompt again, but it holds while the page is open)
      if (d.permission === 'unknown' && (openedOnce || stream)) d.permission = 'granted';
      if (state.state === 'granted') remember(true); else if (state.state === 'denied') remember(false);
      if (!watching) { watching = true; state.onchange = () => void refresh(); }
    } catch { /* this browser's Permissions API does not know the mic */ }
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
      d.hasDevice = inputs.length > 0;
      if (!known && inputs.some(device => device.label)) d.permission = 'granted';
    } catch { /* no device list: assume there is a mic */ }
    told();
  }
  if (!canMic) d.permission = 'unavailable';
  else {
    void refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', () => void refresh());
    // (back on the home page after VR, or after changing the site's settings in another tab)
    window.addEventListener('focus', () => void refresh());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  }
  // (asked again whenever it is not yet known to be there: a server still starting said no once and the mic was the demo for good)
  let checking = false;
  function checkScribe() {
    if (checking) return; checking = true;
    void fetch('/api/scribe-token?check', { cache: 'no-store' }).then(r => r.ok ? r.json() : { ready: false })
      .then((r: { ready?: boolean }) => { d.scribe = !!r.ready; }).catch(() => { d.scribe ??= false; })
      .finally(() => { checking = false; told(); });
  }
  checkScribe();

  // (curly quotes to straight: the pixel letters only have the straight ones; anything else they lack shows as a space)
  const join = () => (settled + ' ' + partial).replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim();

  /** Open the mic (asking, if it has not been asked). True if it is open. `asking`: from a click on the home page, where a refusal means blocked. */
  function open(asking = false): Promise<boolean> {
    if (stream) { stream.getAudioTracks().forEach(t => { t.enabled = true; }); return Promise.resolve(true); }
    if (!canMic) return Promise.resolve(false);
    opening ??= navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      .then(async s => {
        stream = s; d.permission = 'granted'; openedOnce = true; remember(true); told();
        ctx ??= new AudioContext();
        if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
        tapReady ??= ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' })));
        await tapReady;
        source = ctx.createMediaStreamSource(s);
        tap = new AudioWorkletNode(ctx, 'dictate-tap');
        tap.port.onmessage = e => hear(e.data as Float32Array);
        source.connect(tap);
        return true;
      })
      .catch((error: unknown) => {
        const name = (error as { name?: string }).name ?? String(error);
        // (only a refusal on the home page means blocked: one inside VR is the headset not opening it there)
        if (asking && (name === 'NotAllowedError' || name === 'SecurityError')) { d.permission = 'denied'; remember(false); told(); }
        d.trouble = `mic: ${name}${asking ? '' : ' (in the game)'}`; console.warn('[dictate] no mic:', error);
        close(); return false;
      })
      .finally(() => { opening = null; });
    return opening;
  }
  function close(really = false) {
    // kept for the game: only switched off
    if (held && !really && stream) { stream.getAudioTracks().forEach(t => { t.enabled = false; }); d.level = 0; return; }
    try { source?.disconnect(); tap?.disconnect(); } catch { /* already apart */ }
    if (tap) tap.port.onmessage = null;
    stream?.getTracks().forEach(t => t.stop());
    stream = null; source = null; tap = null;
    d.level = 0;
  }

  /** A block of the mic: its loudness, and (for Scribe) 16 kHz PCM out of it. */
  function hear(block: Float32Array) {
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = Math.sqrt(sum / block.length);
    // the room's noise, followed slowly when quiet
    floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.995 + rms * 0.005;
    const speaking = rms > Math.max(tune.speakAbove, floor * 2.5);
    d.level += (Math.min(1, rms * 9) - d.level) * (speaking ? 0.6 : 0.25);
    if (d.phase === 'listening' && speaking) { quiet = 0; spoke = true; }
    if (d.engine !== 'scribe' || (d.phase !== 'opening' && d.phase !== 'listening')) return;
    // down to 16 kHz: a plain average of the samples each output sample covers
    const step = (ctx?.sampleRate ?? 48000) / RATE;
    let pos = carry;
    while (pos + step <= block.length) {
      let acc = 0, from = Math.floor(pos), to = Math.floor(pos + step);
      for (let i = from; i < to; i++) acc += block[i];
      const v = Math.max(-1, Math.min(1, acc / Math.max(1, to - from)));
      outBuf[outN++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (outN === outBuf.length) { send(outBuf, false); outBuf = new Int16Array(1600); outN = 0; }
      pos += step;
    }
    carry = pos - block.length;
  }
  function send(pcm: Int16Array, commit: boolean) {
    if (!ws || ws.readyState !== WebSocket.OPEN) { pending.push(pcm.slice()); return; }
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: btoa(bin), commit, sample_rate: RATE }));
  }

  /** A token and a socket to Scribe (null if there is no Scribe here). */
  async function connect(): Promise<WebSocket | null> {
    if (d.scribe === false) return null;
    let token = '';
    try {
      const reply = await fetch('/api/scribe-token', { cache: 'no-store' });
      if (!reply.ok) { if (reply.status !== 501) d.trouble = `token: ${reply.status}`; return null; }
      token = ((await reply.json()) as { token?: string }).token ?? '';
    } catch { return null; }
    if (!token) return null;
    return new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_${RATE}&commit_strategy=manual&token=${encodeURIComponent(token)}`);      // (no language_code: Scribe works it out)
  }
  /**
   * Scribe got ready while the mic's ring fills (2026-11-12: "quick to load / activate"): the token and
   * the socket are on their way from the ring's first moment, so the take starts on an open line.
   */
  let early: Promise<WebSocket | null> | null = null;
  function prepare() { early ??= connect(); }
  function dropEarly() { const was = early; early = null; void was?.then(socket => socket?.close()); }
  async function scribe(mine: number): Promise<boolean> {
    let socket = early ? await early : null;
    early = null;
    if (!socket || socket.readyState > WebSocket.OPEN) socket = await connect();
    if (!socket) return false;
    if (mine !== take) { socket.close(); return false; }
    ws = socket;
    const flush = () => { const waiting = pending; pending = []; waiting.forEach(p => send(p, false)); };
    if (socket.readyState === WebSocket.OPEN) flush(); else socket.onopen = flush;
    socket.onmessage = e => {
      if (mine !== take) return;
      const m = JSON.parse(String(e.data)) as { message_type: string; text?: string; error?: string };
      if (m.message_type === 'partial_transcript') partial = m.text ?? '';
      else if (m.message_type === 'committed_transcript') { settled = (settled + ' ' + (m.text ?? '')).trim(); partial = ''; if (d.phase === 'finishing') done(); }
      else if (m.error) { d.trouble = `scribe ${m.message_type}: ${m.error}`; console.warn('[dictate]', d.trouble); if (m.message_type !== 'commit_throttled' && m.message_type !== 'insufficient_audio_activity') done(); else if (d.phase === 'finishing') done(); }
      d.text = join();
    };
    socket.onerror = () => { if (mine === take) { d.trouble ||= 'scribe: connection failed'; console.warn('[dictate]', d.trouble); } };
    socket.onclose = () => { if (mine === take && (d.phase === 'listening' || d.phase === 'finishing')) done(); };
    return true;
  }
  function browser(mine: number): boolean {
    if (!Speech) return false;
    const r = new Speech();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
    r.onresult = e => {
      if (mine !== take) return;
      let fin = '', part = '';
      for (let i = 0; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) fin += res[0].transcript + ' '; else part += res[0].transcript + ' '; }
      settled = fin; partial = part; d.text = join();
    };
    r.onerror = e => { if (mine === take && e.error !== 'no-speech' && e.error !== 'aborted') { d.trouble = `speech: ${e.error}`; console.warn('[dictate]', d.trouble); } };
    r.onend = () => { if (mine === take && (d.phase === 'listening' || d.phase === 'finishing')) done(); };
    try { r.start(); } catch { return false; }
    recog = r;
    return true;
  }

  function done() {
    if (d.phase === 'done' || d.phase === 'idle') return;
    d.phase = 'done'; d.text = join();
    hangUp(); close();         // (the mic's light goes off as soon as the take is over)
  }
  function hangUp() {
    const socket = ws; ws = null; pending = []; outN = 0; carry = 0;
    if (socket) { socket.onclose = null; socket.onmessage = null; try { socket.close(); } catch { /* gone */ } }
    const r = recog; recog = null;
    if (r) { r.onend = null; r.onresult = null; try { r.abort(); } catch { /* gone */ } }
  }

  /** A real take can happen: the mic approved already (so nothing is asked in VR), and something to write the words. */
  const possible = () => canMic && (d.permission === 'granted' || (d.permission === 'unknown' && remembered()) || !!stream) && (d.hasDevice || !!stream) && (d.scribe !== false || !!Speech);
  let testing: ReturnType<typeof setTimeout> | null = null;
  const extra = {
    /** Whether real words are on their way (not the mock), for the music to go softer. */
    get live() { return d.engine !== 'mock' && (d.phase === 'opening' || d.phase === 'listening' || d.phase === 'finishing'); },
    /** Ask for the mic now (from a click on the home page), then let it go again: the browser remembers. */
    async ask() { const ok = await open(true); if (ok && d.phase === 'idle') close(); void refresh(); return ok; },
    /**
     * Start (on the home page, before VR): open the mic now if it is approved, and keep it for the game. Asks
     * nothing: if it was never approved, the mic stays the demo.
     */
    hold() {
      if (!canMic || !(d.permission === 'granted' || remembered())) return;
      held = true; void open().then(ok => { if (ok && d.phase === 'idle' && !testing) close(); });
      if (d.scribe !== true) checkScribe();
    },
    /** For the console (gardenDiagnostics): how the mic stands. */
    diagnostics() { return { permission: d.permission, remembered: remembered(), hasDevice: d.hasDevice, scribe: d.scribe, speech: !!Speech, possible: possible(), held, open: !!stream, phase: d.phase, engine: d.engine, trouble: d.trouble }; },
    /**
     * Ask if need be, then keep the mic open for a few seconds so `level` shows it hearing (the home
     * page's Connect mic). Only from a click: this is where the browser's prompt may appear.
     */
    async test(seconds = 4) {
      const ok = await open(true);
      void refresh();
      if (!ok) return false;
      held = true;      // (approved here: kept from now on, so it is already open in VR)
      if (testing) clearTimeout(testing);
      testing = setTimeout(() => { testing = null; if (d.phase === 'idle') close(); told(); }, seconds * 1000);
      told(); return true;
    },
    /** Is the mic open just now for Connect mic's test? */
    get testing() { return testing !== null; },
    /** Can a real take happen (false: the mic is a demo, the made-up words)? */
    get possible() { return possible(); },
    /** The ring at the mic has started: open the mic so it is live when the ring fills. */
    warm() { if (d.scribe !== true) checkScribe(); if (!possible()) return; warmAge = 0; void open(); prepare(); },
    /** The ring is full: listen. `engine` is 'pending' until it is known which one hears, and 'mock' if none can. */
    start() {
      hangUp();
      take++; const mine = take;
      settled = ''; partial = ''; d.text = ''; d.trouble = ''; age = 0; quiet = 0; spoke = false; finishAge = 0;
      if (!possible()) { d.engine = 'mock'; d.phase = 'done'; return; }
      d.engine = 'pending'; d.phase = 'opening';
      void (async () => {
        if (!(await open()) || mine !== take) { if (mine === take) { d.engine = 'mock'; d.phase = 'done'; } return; }
        d.engine = 'scribe'; d.phase = 'listening';         // (Scribe's audio is kept while its socket opens)
        if (await scribe(mine)) return;
        if (mine !== take) return;
        pending = []; outN = 0;
        if (browser(mine)) { d.engine = 'browser'; return; }
        d.engine = 'mock'; d.phase = 'done';
      })();
    },
    /** End the take now (the last words still come in). */
    finish() {
      if (d.phase !== 'listening' && d.phase !== 'opening') return;
      if (d.engine === 'pending' || d.phase === 'opening') { done(); return; }
      d.phase = 'finishing'; finishAge = 0;
      if (d.engine === 'scribe') {
        if (ws && ws.readyState === WebSocket.OPEN) { send(outN > 0 ? outBuf.subarray(0, outN) : new Int16Array(RATE / 10), true); outN = 0; }
        else done();
      } else recog?.stop();
    },
    /** Drop the take (the letter went elsewhere, the round ended). */
    cancel() { take++; hangUp(); d.phase = 'idle'; d.engine = 'mock'; d.text = ''; settled = ''; partial = ''; close(); },
    /** Every frame. `wanted`: the game is still recording. */
    update(dt: number, wanted: boolean) {
      if (d.phase === 'idle' || d.phase === 'done') {
        if (d.phase === 'done' && !wanted) { d.phase = 'idle'; d.engine = 'mock'; }
        if ((stream || early) && d.phase === 'idle' && !testing && (warmAge += dt) > tune.warmFor) { warmAge = -1e9; close(); dropEarly(); }
        if (!stream) d.level *= Math.exp(-dt * 6);
        return;
      }
      if (!wanted) { extra.cancel(); return; }
      age += dt; warmAge = 0;
      if (d.phase === 'listening') {
        quiet += dt;
        if ((spoke && d.text && quiet > tune.quietToEnd) || (!spoke && !d.text && age > tune.nothingFor) || age > tune.longest) extra.finish();
        // (spoke but nothing written yet: give the words time to arrive, then end anyway)
        else if (spoke && !d.text && quiet > tune.quietToEnd + 2.5) extra.finish();
      } else if (d.phase === 'finishing' && (finishAge += dt) > tune.finishWait) done();
      else if (d.phase === 'opening' && age > 8) done();
    },
    /** Something on the page wants to know when the permission changes (Setup's line). */
    onChange(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
    /** Which engine would be tried first, for Setup's line. */
    get hasBrowserSpeech() { return !!Speech; },
  };
  // (defineProperties, not assign: assign would read the getters once and keep the values)
  Object.defineProperties(d, Object.getOwnPropertyDescriptors(extra));
  return d as typeof d & typeof extra;
}

export const dictate = createDictate();

/**
 * Connect mic, on the home page beside Setup (asked for on 2026-11-12: "on the home screen - not in vr,
 * test if mic is connected, and show a button to say connect mic / approve"). It shows what it finds
 * without asking: CONNECT MIC (never asked), MIC ON, MIC BLOCKED, NO MIC FOUND, MIC NEEDS HTTPS.
 * A click asks if need be, then listens for four seconds with a meter under the button, so the
 * player sees it hear them.
 */
export function bindHomeMic() {
  const button = document.getElementById('connect-mic') as HTMLButtonElement | null, wrap = button?.parentElement, bar = wrap?.querySelector<HTMLElement>('.mic-meter span');
  if (!button || !wrap) return;
  let shown = '';
  function show() {
    const p = dictate.permission, words = dictate.scribe ? 'ElevenLabs Scribe writes down what you say.' : dictate.hasBrowserSpeech ? 'This browser writes down what you say.' : 'No speech service here, so round two\'s mic is a demo.';
    const [label, tone, title] = p === 'unavailable' ? ['Mic needs https', 'off', 'The mic only works on a secure page (https).']
      : !dictate.hasDevice ? ['No mic found', 'off', 'No microphone is connected.']
      : p === 'denied' ? ['Mic blocked', 'off', 'The mic is blocked for this site: allow it in the browser\'s site settings, then come back. Until then round two\'s mic is a demo.']
      : p === 'granted' ? [dictate.testing ? 'Listening...' : 'Mic on', 'on', `${words} Click to test it.`]
      : ['Connect mic', 'ask', 'Approve the mic here, before VR, so round two can hear your replies. Without it the mic is a demo.'];
    button!.disabled = p === 'unavailable' || !dictate.hasDevice;
    button!.title = title;
    button!.classList.toggle('mic-on', tone === 'on'); button!.classList.toggle('mic-off', tone === 'off'); button!.classList.toggle('mic-ask', tone === 'ask');
    wrap!.classList.toggle('testing', dictate.testing);
    if (label !== shown) { shown = label; pixelLabel(button!, label, 2, '#ffffff'); }
  }
  // the meter under the button while it listens
  function meter() { if (bar) bar.style.width = `${Math.round(Math.min(1, dictate.level * 1.4) * 100)}%`; if (dictate.testing) requestAnimationFrame(meter); else if (bar) bar.style.width = '0%'; }
  button.addEventListener('click', () => { void dictate.test(4).then(ok => { show(); if (ok) requestAnimationFrame(meter); }); });
  dictate.onChange(show);
  show();
}

/**
 * The mic line on the home page's Setup card: what state the mic is in, and Allow mic to ask for it
 * (a click of its own, so Start keeps its click for Enter VR).
 */
export function bindSetupMic() {
  const button = document.getElementById('setup-mic') as HTMLButtonElement | null, line = document.getElementById('setup-mic-state');
  if (!button || !line) return;
  function show() {
    const p = dictate.permission, scribe = dictate.scribe;
    const how = scribe ? 'Words by ElevenLabs Scribe.' : dictate.hasBrowserSpeech ? 'Words by this browser (no ElevenLabs key on the server).' : scribe === false ? 'No speech service here: replies stay the mock.' : '';
    line!.className = 'mic-state ' + (p === 'granted' ? 'on' : p === 'unknown' ? '' : 'off');
    line!.textContent = p === 'granted' ? `Mic on. ${how}` : p === 'denied' ? 'Mic is blocked for this site: allow it in the browser\'s site settings.'
      : p === 'unavailable' ? 'The mic needs a secure page (https).' : !dictate.hasDevice ? 'No microphone is connected.' : `Mic not allowed yet: round two's mic is a demo until it is. ${how}`;
    button!.hidden = p === 'granted' || p === 'unavailable';
  }
  button.addEventListener('click', () => { void dictate.ask().then(show); });
  dictate.onChange(show);
  show();
}
