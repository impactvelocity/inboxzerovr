import { Group, Vector3 } from 'three';
import type { Command, SessionController } from '../app/SessionController';
import { LAYOUT, PALETTE, TIMING } from '../config';
import { formatHour, formatReceived } from '../domain/reminderTime';
import type { Message } from '../domain/types';
import { clampLines, drawIcon, fitText, font, formatBytes, measureCtx, wrapText, type Ctx, type IconName } from './text';
import { Button3D, Panel, drawFace, type ButtonOptions, type UIManager } from './ui3d';

export interface ViewActions {
  dispatch(cmd: Command): void;
  recenter(): void;
  exit(): void;
  newDemo(): void;
  inVR(): boolean;
}

export interface PanelContext {
  controller: SessionController;
  ui: UIManager;
  actions: ViewActions;
}

const EYE = new Vector3(0, LAYOUT.eyeHeight, 0);
const C = PALETTE.css;

/** Lay buttons out in a centred row. */
function row(buttons: Button3D[], y: number, z: number, gap = 0.016): void {
  const widths = buttons.map((b) => b.face.width + 0.008);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (buttons.length - 1);
  let x = -total / 2;
  buttons.forEach((b, i) => {
    b.group.position.set(x + widths[i] / 2, y, z);
    x += widths[i] + gap;
  });
}

function titleBar(ctx: Ctx, w: number, text: string, color: string, icon?: IconName, y = 34): void {
  ctx.font = font(30, 800);
  ctx.fillStyle = PALETTE.text;
  ctx.textBaseline = 'middle';
  let x = 40;
  if (icon) {
    drawIcon(ctx, icon, x, y - 17, 34, color);
    x += 48;
  }
  ctx.fillText(fitText(ctx, text, w - x - 40), x, y + 2);
}

/** Draw wrapped lines; returns the y after the last line. */
function lines(ctx: Ctx, text: string[], x: number, y: number, size: number, lineH: number): number {
  ctx.textBaseline = 'alphabetic';
  for (const l of text) {
    ctx.fillText(l, x, y + size);
    y += lineH;
  }
  return y;
}

// ---------------------------------------------------------------------------

/** Counter, tutorial prompt, toast and the always-reachable action console. */
export class Hud {
  readonly group = new Group();
  private counter = new Panel(0.44, 0.09);
  private prompt = new Panel(0.96, 0.15);
  private toast = new Panel(0.7, 0.084);
  private toastUndo: Button3D;
  private toastTimer = 0;
  private read: Button3D;
  private archive: Button3D;
  private keep: Button3D;
  private tomorrow: Button3D;
  private undo: Button3D;
  private menu: Button3D;
  private skip: Button3D;
  private keys = { counter: '', prompt: '', toast: '' };
  private console = new Group();

  constructor(private ctx: PanelContext) {
    const { ui, actions } = ctx;
    const make = (o: Omit<ButtonOptions, 'width' | 'height'> & { width?: number }) =>
      ui.add(new Button3D({ width: 0.19, height: 0.085, ...o }));
    this.menu = make({ label: 'Menu', icon: 'gear', color: 0xb6c1d8, width: 0.16, onPress: () => actions.dispatch({ type: 'setMenu', open: true }) });
    this.read = make({ label: 'Read', icon: 'read', color: 0xf3f7ff, onPress: () => this.toggleRead() });
    this.archive = make({ label: 'Archive', icon: 'slash', color: PALETTE.coral, onPress: () => actions.dispatch({ type: 'archive' }) });
    this.keep = make({ label: 'Keep', icon: 'keep', color: PALETTE.cyan, onPress: () => actions.dispatch({ type: 'keep' }) });
    this.tomorrow = make({ label: 'Tomorrow', icon: 'calendar', color: PALETTE.coral, onPress: () => actions.dispatch({ type: 'defer' }) });
    this.undo = make({ label: 'Undo', icon: 'undo', color: PALETTE.magenta, onPress: () => actions.dispatch({ type: 'undo' }) });

    // The console curves around the seat so every button faces the eye.
    const arc: [Button3D, number][] = [
      [this.menu, -39],
      [this.read, -21.5],
      [this.archive, -7.2],
      [this.keep, 7.2],
      [this.tomorrow, 21.5],
      [this.undo, 37],
    ];
    for (const [b, deg] of arc) {
      const a = (deg * Math.PI) / 180;
      b.group.position.set(Math.sin(a) * 0.84, 0.62, -Math.cos(a) * 0.84);
      b.group.lookAt(EYE);
      this.console.add(b.group);
    }

    this.counter.mesh.position.set(0, 1.45, -LAYOUT.cardDistance);
    this.prompt.mesh.position.set(0, 1.59, -LAYOUT.cardDistance - 0.02);
    this.prompt.mesh.lookAt(EYE);
    this.skip = ui.add(new Button3D({ width: 0.26, height: 0.06, label: 'Skip practice', color: 0xb6c1d8, onPress: () => actions.dispatch({ type: 'skipTutorial' }) }));
    this.skip.group.position.set(0.66, 1.58, -LAYOUT.cardDistance + 0.05);
    this.skip.group.lookAt(EYE);

    const toastGroup = new Group();
    toastGroup.position.set(0, 0.665, -0.95);
    toastGroup.lookAt(EYE);
    this.toast.mesh.position.x = -0.07;
    this.toastUndo = ui.add(new Button3D({ width: 0.15, height: 0.084, label: 'Undo', icon: 'undo', color: PALETTE.magenta, fontMm: 22, onPress: () => actions.dispatch({ type: 'undo' }) }));
    this.toastUndo.group.position.x = 0.37;
    toastGroup.add(this.toast.mesh, this.toastUndo.group);
    this.toastGroup = toastGroup;
    toastGroup.visible = false;

    this.group.add(this.console, this.counter.mesh, this.prompt.mesh, this.skip.group, toastGroup);
  }

  private toastGroup: Group;

  private toggleRead(): void {
    const c = this.ctx.controller;
    this.ctx.actions.dispatch(c.ui.reading ? { type: 'closeRead' } : { type: 'read' });
  }

  showToast(text: string, tone: 'info' | 'warn'): void {
    const key = `${tone}:${text}`;
    this.toastTimer = TIMING.toast * (tone === 'warn' ? 1.6 : 1);
    this.toastGroup.visible = true;
    if (key === this.keys.toast) return;
    this.keys.toast = key;
    this.toast.draw((ctx, w, h) => {
      drawFace(ctx, w, h, tone === 'warn' ? C.coral : '#3A4668', 12, 3);
      ctx.font = font(24, 600);
      ctx.fillStyle = PALETTE.text;
      ctx.textBaseline = 'middle';
      const rows = clampLines(ctx, wrapText(ctx, text, w - 44), 2, w - 44);
      rows.forEach((t, i) => ctx.fillText(t, (w - ctx.measureText(t).width) / 2, h / 2 + 1 + (i - (rows.length - 1) / 2) * 31));
    });
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastGroup.visible = false;
    }
  }

  sync(): void {
    const c = this.ctx.controller;
    const phase = c.phase;
    const triaging = phase === 'tutorial' || phase === 'triage';
    const menu = c.ui.menuOpen;
    const hasCard = triaging && c.currentId !== null;
    const reading = c.ui.reading !== null;

    this.group.visible = phase !== 'setup' && !c.ui.paused;
    this.console.visible = !menu;
    for (const b of [this.read, this.archive, this.keep, this.tomorrow]) b.group.visible = triaging;
    this.read.setEnabled(hasCard);
    this.read.setLabel(reading ? 'Close' : 'Read');
    for (const b of [this.archive, this.keep, this.tomorrow]) b.setEnabled(hasCard && !c.ui.busy);
    this.undo.setEnabled(c.canUndo && !c.ui.busy);
    this.toastUndo.group.visible = c.canUndo;
    if (menu) this.toastGroup.visible = false;

    // Counter: always real numbers, never a slogan.
    let text = '';
    let icon: IconName = 'mail';
    if (phase === 'tutorial') {
      const deck = c.state!.tutorial;
      const done = deck.queue.filter((id) => deck.items[id].disposition !== 'pending').length;
      text = `PRACTICE ${Math.min(done + 1, deck.queue.length)} OF ${deck.queue.length}`;
    } else if (phase === 'triage') {
      text = `${c.counts.pending} LEFT`;
    } else if (phase === 'review') {
      text = `${c.counts.kept} TO HANDLE`;
      icon = 'keep';
    }
    this.counter.mesh.visible = text !== '' && !reading && !menu;
    if (text && text !== this.keys.counter) {
      this.keys.counter = text;
      this.counter.draw((ctx, w, h) => {
        drawFace(ctx, w, h, C.cyan, 16, 4);
        ctx.font = font(40, 800);
        const tw = ctx.measureText(text).width;
        const x = (w - tw - 58) / 2;
        drawIcon(ctx, icon, x, h / 2 - 21, 42, C.cyan);
        ctx.fillStyle = PALETTE.text;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 58, h / 2 + 2);
      });
    }

    const step = c.tutorialStep;
    const prompts: Record<string, [string, string]> = {
      archive: ['Hold the blade trigger and slash through the card', 'That archives it. Nothing is ever deleted.'],
      keep: ['Squeeze the grip on your other hand to grab the card', 'Release it toward KEEP on your left.'],
      defer: ['Grab the card and release it toward TOMORROW', 'On your right. It sets a reminder for the morning.'],
      undo: ['Changed your mind? Press UNDO', 'It brings back the last card. It works all session.'],
    };
    const p = step ? prompts[step] : null;
    this.prompt.mesh.visible = !!p && !reading && !menu;
    this.skip.group.visible = phase === 'tutorial' && !menu && !reading;
    if (p && step !== this.keys.prompt) {
      this.keys.prompt = step!;
      this.prompt.draw((ctx, w, h) => {
        drawFace(ctx, w, h, C.magenta, 18, 4);
        ctx.textBaseline = 'middle';
        ctx.font = font(36, 700);
        ctx.fillStyle = PALETTE.text;
        const a = fitText(ctx, p[0], w - 60);
        ctx.fillText(a, (w - ctx.measureText(a).width) / 2, h * 0.36);
        ctx.font = font(27, 500);
        ctx.fillStyle = PALETTE.textDim;
        const b = fitText(ctx, p[1], w - 60);
        ctx.fillText(b, (w - ctx.measureText(b).width) / 2, h * 0.72);
      });
    }
  }
}

// ---------------------------------------------------------------------------

const READ = { w: 1.24, h: 0.82, pad: 50, size: 29, line: 41 };

/** Expanded message. Long bodies are split into pages; text is never shrunk to fit. */
export class ReadingPanel {
  readonly group = new Group();
  private panel = new Panel(READ.w, READ.h);
  private prev: Button3D;
  private next: Button3D;
  private close: Button3D;
  private messageId: string | null = null;
  private pages: string[][] = [[]];
  private page = 0;
  private headerH = 0;
  private drawnKey = '';

  constructor(private ctx: PanelContext) {
    const { ui, actions } = ctx;
    this.panel.mesh.position.set(0, 1.16, -1.16);
    this.prev = ui.add(new Button3D({ width: 0.2, height: 0.07, label: 'Back', icon: 'prev', color: 0xf3f7ff, onPress: () => this.turn(-1) }));
    this.next = ui.add(new Button3D({ width: 0.2, height: 0.07, label: 'More', icon: 'next', color: 0xf3f7ff, onPress: () => this.turn(1) }));
    this.close = ui.add(new Button3D({ width: 0.2, height: 0.07, label: 'Close', icon: 'close', color: PALETTE.cyan, onPress: () => actions.dispatch({ type: 'closeRead' }) }));
    row([this.prev, this.next, this.close], 1.16 - READ.h / 2 - 0.05, -1.15);
    this.group.add(this.panel.mesh, this.prev.group, this.next.group, this.close.group);
    this.group.visible = false;
  }

  /** Move by pages (thumbstick, keys, buttons). Returns true if the page changed. */
  turn(delta: number): boolean {
    const to = Math.max(0, Math.min(this.pages.length - 1, this.page + delta));
    if (to === this.page) return false;
    this.page = to;
    this.redraw();
    return true;
  }

  sync(): void {
    const c = this.ctx.controller;
    const msg = c.message(c.ui.reading);
    this.group.visible = !!msg && !c.ui.menuOpen && !c.ui.paused;
    if (!msg) {
      this.messageId = null;
      return;
    }
    if (msg.id !== this.messageId) {
      this.messageId = msg.id;
      this.page = 0;
      this.paginate(msg);
      this.redraw();
    }
  }

  private paginate(msg: Message): void {
    const m = measureCtx();
    const inner = READ.w * 1000 - READ.pad * 2;
    m.font = font(36, 700);
    const subject = clampLines(m, wrapText(m, msg.subject || '(no subject)', inner), 3, inner);
    this.headerH = READ.pad + 42 + 14 + subject.length * 45 + 26 + (msg.attachmentMetadata.length ? 38 : 0);
    m.font = font(READ.size, 400);
    const body = wrapText(m, msg.bodyText.trim() || '(This message has no body text.)', inner);
    const perPage = Math.max(3, Math.floor((READ.h * 1000 - this.headerH - 62) / READ.line));
    this.pages = [];
    for (let i = 0; i < body.length; i += perPage) {
      // Do not start a page with the blank line between paragraphs.
      const start = body[i] === '' && i + 1 < body.length ? i + 1 : i;
      this.pages.push(body.slice(start, i + perPage));
    }
    if (this.pages.length === 0) this.pages = [[]];
  }

  private redraw(): void {
    const c = this.ctx.controller;
    const msg = c.message(this.messageId);
    if (!msg) return;
    this.prev.setEnabled(this.page > 0);
    this.next.setEnabled(this.page < this.pages.length - 1);
    const key = `${msg.id}:${this.page}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const time = formatReceived(msg.receivedAt, c.settings.timezone, new Date());
    this.panel.draw((ctx, w, h) => {
      drawFace(ctx, w, h, '#4B587C', 22, 5);
      const pad = READ.pad;
      const inner = w - pad * 2;
      let y = pad;
      ctx.textBaseline = 'middle';
      ctx.font = font(26, 500);
      ctx.fillStyle = PALETTE.textDim;
      const tw = ctx.measureText(time).width;
      ctx.fillText(time, w - pad - tw, y + 20);
      ctx.font = font(31, 600);
      ctx.fillStyle = PALETTE.text;
      const name = fitText(ctx, msg.senderName, inner * 0.45);
      ctx.fillText(name, pad, y + 20);
      const nameW = ctx.measureText(name).width;
      ctx.font = font(25, 400);
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(fitText(ctx, msg.senderEmail, inner - nameW - tw - 60), pad + nameW + 22, y + 21);
      y += 42 + 14;
      ctx.font = font(36, 700);
      ctx.fillStyle = PALETTE.text;
      const subject = clampLines(ctx, wrapText(ctx, msg.subject || '(no subject)', inner), 3, inner);
      y = lines(ctx, subject, pad, y, 36, 45);
      if (msg.attachmentMetadata.length) {
        drawIcon(ctx, 'clip', pad, y + 4, 28, PALETTE.textDim);
        ctx.font = font(23, 500);
        ctx.fillStyle = PALETTE.textDim;
        ctx.textBaseline = 'middle';
        const list = msg.attachmentMetadata.map((a) => `${a.name} (${formatBytes(a.sizeBytes)})`).join('   ');
        ctx.fillText(fitText(ctx, `${list}   not downloadable in this demo`, inner - 40), pad + 40, y + 19);
        y += 38;
      }
      y += 8;
      ctx.fillStyle = 'rgba(182,193,216,0.28)';
      ctx.fillRect(pad, y, inner, 2);
      y += 18;
      ctx.font = font(READ.size, 400);
      ctx.fillStyle = '#E2E8F6';
      lines(ctx, this.pages[this.page], pad, y, READ.size, READ.line);
      ctx.font = font(23, 600);
      ctx.fillStyle = PALETTE.textDim;
      ctx.textBaseline = 'middle';
      const label = this.pages.length > 1 ? `Page ${this.page + 1} of ${this.pages.length}` : 'End of message';
      ctx.fillText(label, w - pad - ctx.measureText(label).width, h - 32);
    });
  }
}

// ---------------------------------------------------------------------------

const ROWS_PER_PAGE = 4;
const QUICK = ['Yes, confirmed.', 'No, that will not work.', 'Looks good, thank you.', 'I will reply properly tomorrow.'];
const SAMPLE_TRANSCRIPT = 'Thanks for sending this over. I have read it and I will come back to you with a proper answer shortly.';

/** After triage: the kept messages on a rack, then one at a time with clear ways to finish each. */
export class ReviewStation {
  readonly group = new Group();
  private list = new Group();
  private detail = new Group();
  private compose = new Group();
  private remind = new Group();
  private rows: Button3D[] = [];
  private pagePrev: Button3D;
  private pageNext: Button3D;
  private finish: Button3D;
  private note = new Panel(0.9, 0.06);
  private detailPanel = new Panel(1.04, 0.5);
  private composePanel = new Panel(1.04, 0.32);
  private remindPanel = new Panel(0.9, 0.3);
  private key = '';

  constructor(private ctx: PanelContext) {
    const { ui, actions, controller: c } = ctx;
    const Z = -1.15;
    const btn = (o: ButtonOptions) => ui.add(new Button3D(o));
    const current = () => c.ui.review.messageId ?? '';

    // List
    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const b = btn({ width: 0.96, height: 0.125, label: '', sub: '', icon: 'mail', color: PALETTE.cyan, fontMm: 31, onPress: () => {} });
      b.group.position.set(0, 1.27 - i * 0.137, Z);
      this.rows.push(b);
      this.list.add(b.group);
    }
    this.pagePrev = btn({ width: 0.2, height: 0.07, label: 'Previous', icon: 'prev', color: 0xf3f7ff, onPress: () => actions.dispatch({ type: 'reviewPage', delta: -1 }) });
    this.pageNext = btn({ width: 0.2, height: 0.07, label: 'More', icon: 'next', color: 0xf3f7ff, onPress: () => actions.dispatch({ type: 'reviewPage', delta: 1 }) });
    this.finish = btn({ width: 0.34, height: 0.07, label: 'Finish session', icon: 'check', color: PALETTE.magenta, onPress: () => actions.dispatch({ type: 'finish' }) });
    row([this.pagePrev, this.pageNext, this.finish], 0.765, Z);
    this.note.mesh.position.set(0, 1.37, Z);
    this.note.draw((ctx2, w, h) => {
      ctx2.clearRect(0, 0, w, h);
      ctx2.fillStyle = '#080D1C';
      ctx2.fillRect(0, 0, w, h);
      ctx2.font = font(27, 500);
      ctx2.fillStyle = PALETTE.textDim;
      ctx2.textBaseline = 'middle';
      const t = 'Open each message you kept and decide how to finish it.';
      ctx2.fillText(t, (w - ctx2.measureText(t).width) / 2, h / 2);
    });
    this.list.add(this.pagePrev.group, this.pageNext.group, this.finish.group, this.note.mesh);

    // Detail
    this.detailPanel.mesh.position.set(0, 1.13, Z);
    const d1 = [
      btn({ width: 0.3, height: 0.085, label: 'Draft reply', icon: 'pencil', color: PALETTE.cyan, onPress: () => actions.dispatch({ type: 'composeOpen', id: current() }) }),
      btn({ width: 0.36, height: 0.085, label: 'Remind tomorrow', icon: 'calendar', color: PALETTE.coral, onPress: () => actions.dispatch({ type: 'remindOpen', id: current() }) }),
      btn({ width: 0.36, height: 0.085, label: 'Handled, archive', icon: 'check', color: PALETTE.magenta, onPress: () => actions.dispatch({ type: 'handle', id: current() }) }),
    ];
    row(d1, 0.82, Z);
    const d2 = [
      btn({ width: 0.26, height: 0.07, label: 'Read all', icon: 'read', color: 0xf3f7ff, onPress: () => actions.dispatch({ type: 'read', id: current() }) }),
      btn({ width: 0.26, height: 0.07, label: 'Back to list', icon: 'back', color: 0xf3f7ff, onPress: () => actions.dispatch({ type: 'reviewBack' }) }),
    ];
    row(d2, 0.73, Z);
    this.detail.add(this.detailPanel.mesh, ...[...d1, ...d2].map((b) => b.group));

    // Compose
    this.composePanel.mesh.position.set(0, 1.225, Z);
    const append = (text: string) => {
      const cur = c.ui.review.text.trim();
      actions.dispatch({ type: 'composeSetText', text: cur ? `${cur} ${text}` : text });
    };
    const chips = QUICK.map((qk) => btn({ width: 0.51, height: 0.062, label: qk, color: 0xb6c1d8, fontMm: 24, onPress: () => append(qk) }));
    row(chips.slice(0, 2), 1.022, Z);
    row(chips.slice(2), 0.95, Z);
    const tools = [
      btn({ width: 0.62, height: 0.08, label: 'Insert sample text', sub: 'Demo text. This is not live dictation.', icon: 'mic', color: 0xb6c1d8, onPress: () => append(SAMPLE_TRANSCRIPT) }),
      btn({ width: 0.2, height: 0.08, label: 'Clear', icon: 'close', color: 0xb6c1d8, onPress: () => actions.dispatch({ type: 'composeSetText', text: '' }) }),
    ];
    row(tools, 0.872, Z);
    const saves = [
      btn({ width: 0.42, height: 0.1, label: 'Save draft & finish', sub: 'Saves the draft, then archives the message', icon: 'check', color: PALETTE.cyan, onPress: () => actions.dispatch({ type: 'draftFinish', id: current() }) }),
      btn({ width: 0.44, height: 0.1, label: 'Save draft & remind', sub: 'Saves the draft and a reminder for tomorrow', icon: 'calendar', color: PALETTE.coral, onPress: () => actions.dispatch({ type: 'draftRemind', id: current() }) }),
      btn({ width: 0.18, height: 0.1, label: 'Cancel', color: 0xb6c1d8, onPress: () => actions.dispatch({ type: 'reviewBack' }) }),
    ];
    row(saves, 0.77, Z);
    this.compose.add(this.composePanel.mesh, ...[...chips, ...tools, ...saves].map((b) => b.group));

    // Remind
    this.remindPanel.mesh.position.set(0, 1.2, Z);
    const hour = (delta: number) => c.updateSettings({ reminderHour: c.settings.reminderHour + delta });
    const r = [
      btn({ width: 0.2, height: 0.08, label: 'Earlier', icon: 'prev', color: 0xf3f7ff, onPress: () => hour(-1) }),
      btn({ width: 0.2, height: 0.08, label: 'Later', icon: 'next', color: 0xf3f7ff, onPress: () => hour(1) }),
      btn({ width: 0.3, height: 0.08, label: 'Set reminder', icon: 'check', color: PALETTE.coral, onPress: () => actions.dispatch({ type: 'remindConfirm', id: current() }) }),
      btn({ width: 0.2, height: 0.08, label: 'Cancel', color: 0xb6c1d8, onPress: () => actions.dispatch({ type: 'reviewBack' }) }),
    ];
    row(r, 0.97, Z);
    this.remind.add(this.remindPanel.mesh, ...r.map((b) => b.group));

    this.group.add(this.list, this.detail, this.compose, this.remind);
    this.group.visible = false;
  }

  sync(): void {
    const c = this.ctx.controller;
    const shown = c.phase === 'review' && !c.ui.reading && !c.ui.menuOpen && !c.ui.paused;
    this.group.visible = shown;
    if (!shown) return;
    const r = c.ui.review;
    const msg = c.message(r.messageId);
    const mode = msg ? r.mode : 'list';
    this.list.visible = mode === 'list';
    this.detail.visible = mode === 'detail';
    this.compose.visible = mode === 'compose';
    this.remind.visible = mode === 'remind';

    if (mode === 'list') {
      const kept = c.keptIds;
      const pages = Math.max(1, Math.ceil(kept.length / ROWS_PER_PAGE));
      const page = Math.min(r.page, pages - 1);
      this.rows.forEach((b, i) => {
        const id = kept[page * ROWS_PER_PAGE + i];
        const m = c.message(id ?? null);
        b.group.visible = !!m;
        if (!m || !id) return;
        const status = c.state!.main.items[id].reviewStatus;
        b.setLabel(`${m.senderName}:  ${m.subject}`, status === 'unopened' ? 'Not opened yet' : 'Opened, still to handle');
        b.onPress = () => this.ctx.actions.dispatch({ type: 'reviewOpen', id });
      });
      this.pagePrev.group.visible = this.pageNext.group.visible = pages > 1;
      this.pagePrev.setEnabled(page > 0);
      this.pageNext.setEnabled(page < pages - 1);
      return;
    }
    if (!msg) return;

    const key = `${mode}:${msg.id}:${r.text}:${c.settings.reminderHour}:${this.ctx.actions.inVR()}`;
    if (key === this.key) return;
    this.key = key;
    const time = formatReceived(msg.receivedAt, c.settings.timezone, new Date());

    if (mode === 'detail') {
      this.detailPanel.draw((ctx, w, h) => {
        drawFace(ctx, w, h, C.cyan, 22, 5);
        const pad = 46;
        const inner = w - pad * 2;
        ctx.textBaseline = 'middle';
        ctx.font = font(26, 500);
        ctx.fillStyle = PALETTE.textDim;
        ctx.fillText(time, w - pad - ctx.measureText(time).width, pad + 18);
        ctx.font = font(31, 600);
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(fitText(ctx, msg.senderName, inner * 0.6), pad, pad + 18);
        let y = pad + 50;
        ctx.font = font(37, 700);
        y = lines(ctx, clampLines(ctx, wrapText(ctx, msg.subject, inner), 2, inner), pad, y, 37, 46) + 14;
        ctx.font = font(28, 400);
        ctx.fillStyle = '#D9E1F2';
        const room = Math.max(2, Math.floor((h - y - pad - (msg.attachmentMetadata.length ? 40 : 0)) / 39));
        const body = wrapText(ctx, msg.bodyText.trim() || '(This message has no body text.)', inner).filter((l, i, a) => l !== '' || a[i - 1] !== '');
        y = lines(ctx, clampLines(ctx, body, room, inner), pad, y, 28, 39);
        if (msg.attachmentMetadata.length) {
          drawIcon(ctx, 'clip', pad, h - pad - 26, 28, PALETTE.textDim);
          ctx.font = font(23, 500);
          ctx.fillStyle = PALETTE.textDim;
          ctx.textBaseline = 'middle';
          ctx.fillText(fitText(ctx, msg.attachmentMetadata.map((a) => a.name).join(', '), inner - 40), pad + 40, h - pad - 11);
        }
      });
    } else if (mode === 'compose') {
      this.composePanel.draw((ctx, w, h) => {
        drawFace(ctx, w, h, C.cyan, 22, 5);
        titleBar(ctx, w, `Reply to ${msg.senderName}`, C.cyan, 'pencil', 50);
        ctx.font = font(23, 500);
        ctx.fillStyle = PALETTE.textDim;
        ctx.textBaseline = 'middle';
        const hint = this.ctx.actions.inVR()
          ? 'Saved as a draft in this app. Never sent. Typing is available on desktop.'
          : 'Saved as a draft in this app. Never sent. Type in the box below the scene.';
        ctx.fillText(fitText(ctx, hint, w - 80), 40, 96);
        ctx.fillStyle = '#0E1630';
        ctx.fillRect(36, 122, w - 72, h - 122 - 36);
        const inner = w - 72 - 40;
        if (r.text.trim()) {
          ctx.font = font(30, 400);
          ctx.fillStyle = PALETTE.text;
          const all = wrapText(ctx, r.text, inner);
          const room = Math.floor((h - 122 - 36 - 24) / 41);
          // Show the end of a long draft, where new text lands.
          lines(ctx, all.slice(Math.max(0, all.length - room)), 56, 136, 30, 41);
        } else {
          ctx.font = font(30, 400, true);
          ctx.fillStyle = PALETTE.textDim;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText('Your draft is empty.', 56, 136 + 30);
        }
      });
    } else {
      this.remindPanel.draw((ctx, w, h) => {
        drawFace(ctx, w, h, C.coral, 22, 5);
        titleBar(ctx, w, 'Remind tomorrow', C.coral, 'calendar', 52);
        ctx.font = font(50, 800);
        ctx.fillStyle = PALETTE.text;
        ctx.textBaseline = 'middle';
        ctx.fillText(c.reminderPreview(), 40, 140);
        ctx.font = font(25, 500);
        ctx.fillStyle = PALETTE.textDim;
        const subj = fitText(ctx, `${msg.senderName}: ${msg.subject}`, w - 80);
        ctx.fillText(subj, 40, 204);
        ctx.fillText('Shown when you reopen this app. It is not a background notification.', 40, 246);
      });
    }
  }
}

// ---------------------------------------------------------------------------

/** End of session: honest totals, and a way back. */
export class SummaryPanel {
  readonly group = new Group();
  private panel = new Panel(1.06, 0.66);
  private undo: Button3D;
  private back: Button3D;
  private key = '';

  constructor(private ctx: PanelContext) {
    const { ui, actions } = ctx;
    const Z = -1.15;
    this.panel.mesh.position.set(0, 1.2, Z);
    this.undo = ui.add(new Button3D({ width: 0.24, height: 0.08, label: 'Undo last', icon: 'undo', color: PALETTE.magenta, onPress: () => actions.dispatch({ type: 'undo' }) }));
    this.back = ui.add(new Button3D({ width: 0.3, height: 0.08, label: 'Back to review', icon: 'back', color: PALETTE.cyan, onPress: () => actions.dispatch({ type: 'resumeReview' }) }));
    const again = ui.add(new Button3D({ width: 0.24, height: 0.08, label: 'New demo', icon: 'mail', color: 0xf3f7ff, onPress: () => actions.newDemo() }));
    const exit = ui.add(new Button3D({ width: 0.2, height: 0.08, label: 'Exit', icon: 'exit', color: PALETTE.coral, onPress: () => actions.exit() }));
    row([this.undo, this.back, again, exit], 0.8, Z);
    this.group.add(this.panel.mesh, this.undo.group, this.back.group, again.group, exit.group);
    this.group.visible = false;
  }

  sync(): void {
    const c = this.ctx.controller;
    const shown = c.phase === 'complete' && !c.ui.menuOpen && !c.ui.paused && !c.ui.reading;
    this.group.visible = shown;
    if (!shown) return;
    const n = c.counts;
    this.undo.setEnabled(c.canUndo);
    this.back.setEnabled(n.kept > 0);
    const key = JSON.stringify([n, c.wholeInboxCleared]);
    if (key === this.key) return;
    this.key = key;
    const title = c.wholeInboxCleared ? 'INBOX ZERO' : 'SESSION CLEARED';
    const stats: [number, string, string][] = [
      [n.archived + n.handled, 'Archived', C.coral],
      [n.deferred, 'Deferred to tomorrow', C.coral],
      [n.drafts, n.drafts === 1 ? 'Draft saved' : 'Drafts saved', C.cyan],
      [n.kept, 'Still needing attention', n.kept > 0 ? C.magenta : '#4B587C'],
    ];
    this.panel.draw((ctx, w, h) => {
      drawFace(ctx, w, h, C.cyan, 24, 6);
      ctx.textBaseline = 'middle';
      ctx.font = font(64, 800, true);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(title, (w - ctx.measureText(title).width) / 2, 92);
      ctx.font = font(27, 500);
      ctx.fillStyle = PALETTE.textDim;
      const sub = `${c.state?.batchLabel ?? 'This batch'}. This is not your real inbox.`;
      ctx.fillText(sub, (w - ctx.measureText(sub).width) / 2, 152);
      const tileW = (w - 100 - 3 * 18) / 4;
      stats.forEach(([value, label, color], i) => {
        const x = 50 + i * (tileW + 18);
        ctx.fillStyle = '#0E1630';
        ctx.fillRect(x, 200, tileW, 250);
        ctx.fillStyle = color;
        ctx.fillRect(x, 200, tileW, 6);
        ctx.font = font(110, 800);
        ctx.fillStyle = PALETTE.text;
        const v = String(value);
        ctx.fillText(v, x + (tileW - ctx.measureText(v).width) / 2, 310);
        ctx.font = font(25, 600);
        ctx.fillStyle = PALETTE.textDim;
        const ls = wrapText(ctx, label, tileW - 24);
        ls.forEach((l, j) => ctx.fillText(l, x + (tileW - ctx.measureText(l).width) / 2, 392 + j * 32));
      });
      ctx.font = font(24, 500);
      ctx.fillStyle = PALETTE.textDim;
      const foot = [
        n.deferred > 0 ? 'Reminders appear when you reopen this app. They are not background notifications.' : '',
        n.drafts > 0 ? 'Drafts are stored on this device. Nothing was sent.' : '',
        n.kept > 0 ? `${n.kept} kept ${n.kept === 1 ? 'message is' : 'messages are'} still waiting.` : '',
      ].filter(Boolean);
      foot.slice(0, 3).forEach((l, i) => {
        const t = fitText(ctx, l, w - 80);
        ctx.fillText(t, (w - ctx.measureText(t).width) / 2, 500 + i * 36);
      });
    });
  }
}

// ---------------------------------------------------------------------------

/** In-scene settings, reachable from the console's Menu button in every phase. */
export class MenuPanel {
  readonly group = new Group();
  private title = new Panel(0.9, 0.09);
  private hand: Button3D;
  private effects: Button3D;
  private sound: Button3D;
  private music: Button3D;
  private reminder: Button3D;
  private exit: Button3D;

  constructor(private ctx: PanelContext) {
    const { ui, actions, controller: c } = ctx;
    const Z = -1.05;
    const btn = (label: string, icon: IconName | undefined, onPress: () => void, color = 0xf3f7ff) =>
      ui.add(new Button3D({ width: 0.44, height: 0.09, label, icon, color, onPress }));
    this.hand = btn('', undefined, () => c.updateSettings({ bladeHand: c.settings.bladeHand === 'right' ? 'left' : 'right' }), PALETTE.cyan);
    this.effects = btn('', undefined, () => c.updateSettings({ effects: c.settings.effects === 'full' ? 'reduced' : 'full' }), PALETTE.cyan);
    this.sound = btn('', undefined, () => c.updateSettings({ sound: !c.settings.sound }), PALETTE.cyan);
    this.music = btn('', undefined, () => c.updateSettings({ music: !c.settings.music }), PALETTE.cyan);
    this.reminder = btn('', 'calendar', () => c.updateSettings({ reminderHour: (c.settings.reminderHour + 1) % 24 }), PALETTE.coral);
    const recenter = btn('Recenter seat', undefined, () => actions.recenter(), PALETTE.magenta);
    this.exit = btn('Exit', 'exit', () => actions.exit(), PALETTE.coral);
    const close = btn('Close menu', 'close', () => actions.dispatch({ type: 'setMenu', open: false }));
    const grid = [
      [this.hand, this.effects],
      [this.sound, this.music],
      [this.reminder, recenter],
      [this.exit, close],
    ];
    grid.forEach((pair, i) => row(pair, 1.34 - i * 0.11, Z));
    this.title.mesh.position.set(0, 1.47, Z);
    this.title.draw((ctx2, w, h) => {
      drawFace(ctx2, w, h, '#4B587C', 16, 4);
      titleBar(ctx2, w, 'Settings', C.cyan, 'gear', h / 2);
    });
    this.group.add(this.title.mesh, ...grid.flat().map((b) => b.group));
    this.group.visible = false;
  }

  sync(): void {
    const c = this.ctx.controller;
    this.group.visible = c.ui.menuOpen && !c.ui.paused;
    if (!this.group.visible) return;
    const s = c.settings;
    this.hand.setLabel(`Blade hand: ${s.bladeHand === 'right' ? 'Right' : 'Left'}`);
    this.effects.setLabel(`Effects: ${s.effects === 'full' ? 'Full' : 'Reduced'}`);
    this.sound.setLabel(`Sound: ${s.sound ? 'On' : 'Off'}`);
    this.music.setLabel(`Music: ${s.music ? 'On' : 'Off'}`);
    this.reminder.setLabel(`Remind at ${formatHour(s.reminderHour)}`);
    this.exit.setLabel(this.ctx.actions.inVR() ? 'Exit VR' : 'Exit to start');
  }
}

/** Shown while the headset has lost focus or the tab is hidden. */
export class PausedPanel {
  readonly group = new Group();
  constructor() {
    const p = new Panel(0.6, 0.16, (ctx, w, h) => {
      drawFace(ctx, w, h, '#4B587C', 18, 4);
      ctx.textBaseline = 'middle';
      ctx.font = font(44, 800);
      ctx.fillStyle = PALETTE.text;
      const t = 'Paused';
      ctx.fillText(t, (w - ctx.measureText(t).width) / 2, h * 0.38);
      ctx.font = font(24, 500);
      ctx.fillStyle = PALETTE.textDim;
      const s = 'Your place is saved.';
      ctx.fillText(s, (w - ctx.measureText(s).width) / 2, h * 0.72);
    });
    p.mesh.position.set(0, 1.15, -1.1);
    this.group.add(p.mesh);
    this.group.visible = false;
  }
}
