import type { SessionController } from '../app/SessionController';
import type { AudioFeedback } from '../audio/AudioFeedback';
import { formatHour, formatReminder } from '../domain/reminderTime';
import { SHORTCUTS, type DesktopControls } from '../input/DesktopControls';
import { GMAIL_AVAILABLE } from '../providers/EmailProvider';
import type { GameView } from '../render/GameView';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const PHASE_LABEL: Record<string, string> = {
  tutorial: 'Practice',
  triage: 'Triage',
  review: 'Review',
  complete: 'Session cleared',
};

/** Ordinary HTML for everything outside immersive mode: start screen, settings, desktop overlay. */
export class LaunchScreen {
  private launch = $('launch');
  private hud = $('hud');
  private composer = $<HTMLTextAreaElement>('composer-text');
  private vrSupported = false;
  private showStats: boolean;

  constructor(
    private controller: SessionController,
    private view: GameView,
    private audio: AudioFeedback,
    private desktop: DesktopControls,
    private storageDurable: boolean,
  ) {
    this.showStats = new URLSearchParams(location.search).has('stats');
    const c = controller;

    $('btn-start').addEventListener('click', () => this.begin('start'));
    $('btn-resume').addEventListener('click', () => this.begin('resume'));
    $('btn-vr').addEventListener('click', () => this.begin(c.hasSavedSession() ? 'resume' : 'start', true));
    $('hud-vr').addEventListener('click', () => this.enterVR());
    $('hud-menu').addEventListener('click', () => view.dispatch({ type: 'setMenu', open: !c.ui.menuOpen }, true));
    $('hud-exit').addEventListener('click', () => this.showLaunch());
    $('btn-reset').addEventListener('click', async () => {
      await c.dispatch({ type: 'reset' });
      this.refreshLaunch();
    });

    // Gmail stays visibly unavailable until a real adapter exists.
    const gmail = $<HTMLButtonElement>('btn-gmail');
    gmail.disabled = !GMAIL_AVAILABLE;

    // Settings
    const hand = $<HTMLSelectElement>('set-hand');
    const effects = $<HTMLSelectElement>('set-effects');
    const hour = $<HTMLSelectElement>('set-hour');
    const sound = $<HTMLInputElement>('set-sound');
    const music = $<HTMLInputElement>('set-music');
    for (let h = 5; h <= 20; h++) hour.add(new Option(`Tomorrow, ${formatHour(h)}`, String(h)));
    hand.addEventListener('change', () => c.updateSettings({ bladeHand: hand.value as 'left' | 'right' }));
    effects.addEventListener('change', () => c.updateSettings({ effects: effects.value as 'full' | 'reduced' }));
    hour.addEventListener('change', () => c.updateSettings({ reminderHour: Number(hour.value) }));
    sound.addEventListener('change', () => c.updateSettings({ sound: sound.checked }));
    music.addEventListener('change', () => c.updateSettings({ music: music.checked }));

    this.composer.addEventListener('input', () => {
      void c.dispatch({ type: 'composeSetText', text: this.composer.value });
    });

    $('hud-keys').innerHTML =
      SHORTCUTS.map(([k, label]) => `<span><kbd>${k}</kbd>${label}</span>`).join('') +
      '<span>Drag across the card to slash</span>';

    void this.detectVR();
    c.subscribe(() => this.sync());
    this.sync();
    this.refreshLaunch();
    if (this.showStats) {
      $('hud-stats').hidden = false;
      window.setInterval(() => {
        const s = view.stats;
        $('hud-stats').textContent = `${s.fps.toFixed(0)} fps  ${s.calls} draw calls  ${s.triangles} tris`;
        if (view.inVR) console.info('[stats]', JSON.stringify(s));
      }, 1000);
    }
  }

  private async detectVR(): Promise<void> {
    const note = $('vr-note');
    const btn = $<HTMLButtonElement>('btn-vr');
    if (!window.isSecureContext) {
      note.textContent = 'VR needs a secure origin. Open this page over https, or on localhost.';
    } else if (!navigator.xr) {
      note.textContent = 'This browser has no WebXR. Open the page in the headset browser to enter VR. The desktop mode works here.';
    } else {
      try {
        this.vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
      } catch {
        this.vrSupported = false;
      }
      note.textContent = this.vrSupported ? '' : 'No VR headset was found. The desktop mode works here.';
    }
    btn.disabled = !this.vrSupported;
    $('hud-vr').hidden = !this.vrSupported;
  }

  private async begin(kind: 'start' | 'resume', vr = false): Promise<void> {
    // These run inside a click, which is what allows audio and the VR session to start.
    this.audio.unlock();
    const entering = vr ? this.view.enterVR() : null;
    await this.controller.dispatch({ type: kind });
    if (this.controller.phase === 'setup') {
      this.refreshLaunch();
      return;
    }
    this.launch.hidden = true;
    this.hud.hidden = false;
    this.desktop.enabled = true;
    try {
      await entering;
    } catch (err) {
      console.warn('Could not enter VR', err);
      $('vr-note').textContent = 'The headset did not start a VR session. Continuing in desktop mode.';
    }
    this.sync();
  }

  private async enterVR(): Promise<void> {
    this.audio.unlock();
    try {
      await this.view.enterVR();
    } catch (err) {
      console.warn('Could not enter VR', err);
    }
  }

  /** Back to the start screen. The session stays saved and can be resumed. */
  showLaunch(): void {
    this.launch.hidden = false;
    this.hud.hidden = true;
    this.desktop.enabled = false;
    this.audio.setMusic(false);
    this.refreshLaunch();
  }

  private refreshLaunch(): void {
    const c = this.controller;
    $('btn-resume').hidden = !c.hasSavedSession();
    $<HTMLButtonElement>('btn-start').textContent = c.hasSavedSession() ? 'Start new demo' : 'Start demo';
    const s = c.settings;
    $<HTMLSelectElement>('set-hand').value = s.bladeHand;
    $<HTMLSelectElement>('set-effects').value = s.effects;
    $<HTMLSelectElement>('set-hour').value = String(s.reminderHour);
    $<HTMLInputElement>('set-sound').checked = s.sound;
    $<HTMLInputElement>('set-music').checked = s.music;
    $('tz-note').textContent = `Times use this device's timezone: ${s.timezone}.` + (this.storageDurable ? '' : ' Storage is blocked in this browser, so nothing will survive a reload.');

    void c.listReminders().then((reminders) => {
      const list = $('reminder-list');
      list.textContent = '';
      if (reminders.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No reminders yet. Send a message to Tomorrow to create one.';
        list.append(li);
        return;
      }
      const now = Date.now();
      for (const r of reminders) {
        const due = new Date(r.dueAt).getTime() <= now;
        const li = document.createElement('li');
        if (due) li.className = 'due';
        const title = document.createElement('strong');
        title.textContent = `${r.senderName}: ${r.subject}`;
        const when = document.createElement('span');
        when.className = 'when';
        when.textContent = `${due ? 'Due now, was set for' : 'Due'} ${formatReminder(r.dueAt, r.timezone)}`;
        li.append(title, when);
        list.append(li);
      }
    });
  }

  private sync(): void {
    const c = this.controller;
    const phase = c.phase;
    if (phase === 'setup' && this.launch.hidden) {
      this.showLaunch();
      return;
    }
    const n = c.counts;
    const detail =
      phase === 'triage' ? `${n.pending} left` : phase === 'review' ? `${n.kept} to handle` : phase === 'tutorial' ? 'nothing here is saved' : '';
    $('hud-status').textContent = `Inbox Zero · ${PHASE_LABEL[phase] ?? ''}${detail ? ` · ${detail}` : ''}${c.ui.busy ? ' · saving…' : ''}`;

    const warning = $('hud-warning');
    warning.hidden = !c.ui.saveWarning;
    warning.textContent = c.ui.saveWarning ?? '';

    // Typed drafts: the DOM is only visible outside immersive mode.
    const composing = phase === 'review' && c.ui.review.mode === 'compose' && !this.view.inVR && !c.ui.menuOpen;
    $('composer').hidden = !composing;
    if (composing && this.composer.value !== c.ui.review.text) this.composer.value = c.ui.review.text;
  }

  /** Called when the view enters or leaves VR. */
  onVRChange(): void {
    this.sync();
  }
}
