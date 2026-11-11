import type { Email } from './emails.js';

/** 2D drawing for the email card, the scoreboard and the small labels. */

export const INK = {
  face: '#0b1226',
  faceEdge: '#20e7f2',
  text: '#f3f7ff',
  dim: '#a9b6d3',
  cyan: '#20e7f2',
  coral: '#ff5e7e',
  gold: '#ffd24a',
  green: '#5dffa1',
  magenta: '#c864ff',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function cardFace(ctx: CanvasRenderingContext2D, edge: string): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 8, 8, w - 16, h - 16, 44);
  ctx.fillStyle = INK.face;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

function hueOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/** An email. Nothing on it gives away junk or real: reading it is the game. */
export function drawEmailCard(ctx: CanvasRenderingContext2D, email: Email): void {
  const { width: w } = ctx.canvas;
  cardFace(ctx, INK.faceEdge);

  // Sender avatar and name.
  ctx.fillStyle = `hsl(${hueOf(email.from)} 70% 55%)`;
  ctx.beginPath();
  ctx.arc(112, 120, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#081020';
  ctx.font = `700 64px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(email.from.charAt(0).toUpperCase(), 112, 124);

  ctx.textAlign = 'left';
  ctx.fillStyle = INK.dim;
  ctx.font = `600 50px ${FONT}`;
  ctx.fillText(wrap(ctx, email.from, w - 260, 1)[0], 200, 122);

  // Subject: the line that has to be read at a glance.
  ctx.fillStyle = INK.text;
  ctx.font = `800 84px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, email.subject, w - 120, 3);
  let y = 290;
  for (const line of lines) {
    ctx.fillText(line, 60, y);
    y += 96;
  }

  ctx.fillStyle = INK.dim;
  ctx.font = `500 46px ${FONT}`;
  ctx.fillText(wrap(ctx, email.snippet, w - 120, 1)[0], 60, 590);
}

/** The title and results cards. */
export function drawMessageCard(
  ctx: CanvasRenderingContext2D,
  eyebrow: string,
  title: string,
  lines: string[],
  footer: string,
): void {
  const { width: w } = ctx.canvas;
  cardFace(ctx, INK.gold);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK.gold;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(eyebrow, w / 2, 96);
  ctx.fillStyle = INK.text;
  ctx.font = `900 112px ${FONT}`;
  ctx.fillText(title, w / 2, 220);
  ctx.fillStyle = INK.dim;
  ctx.font = `600 50px ${FONT}`;
  let y = 310;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += 68;
  }
  ctx.fillStyle = INK.cyan;
  ctx.font = `700 48px ${FONT}`;
  ctx.fillText(footer, w / 2, 588);
}

/** Round intro and end-of-day summary: plain text floating in the dark. */
export function drawIntro(
  ctx: CanvasRenderingContext2D,
  eyebrow: string,
  title: string,
  lines: string[],
  count: string,
): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK.gold;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(eyebrow, w / 2, 56);
  ctx.fillStyle = INK.text;
  ctx.font = `900 104px ${FONT}`;
  ctx.fillText(title, w / 2, 160);
  ctx.fillStyle = INK.dim;
  ctx.font = `600 44px ${FONT}`;
  let y = 236;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += 58;
  }
  if (count) {
    ctx.fillStyle = INK.cyan;
    ctx.font = `900 110px ${FONT}`;
    ctx.fillText(count, w / 2, h - 24);
  }
}

/** A home screen button. `primary` is the big start button. */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  text: string,
  primary: boolean,
): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, h / 2 - 6);
  ctx.fillStyle = primary ? INK.cyan : INK.face;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = primary ? INK.cyan : '#3a4a78';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = primary ? '#04121c' : INK.dim;
  ctx.font = `${primary ? 900 : 700} ${Math.round(h * (primary ? 0.46 : 0.36))}px ${FONT}`;
  ctx.fillText(text, w / 2, h / 2 + 4);
}

/** One of the two ready-made replies under the email in round 2. */
export function drawReplyChip(
  ctx: CanvasRenderingContext2D,
  text: string,
): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, 36);
  ctx.fillStyle = INK.face;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK.green;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK.dim;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText('REPLY', w / 2, 50);
  ctx.fillStyle = INK.text;
  ctx.font = `700 46px ${FONT}`;
  const lines = wrap(ctx, text, w - 60, 2);
  let y = lines.length === 1 ? 128 : 104;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += 54;
  }
}

/** The dictation target: a microphone in a circle. */
export function drawMic(ctx: CanvasRenderingContext2D, listening: boolean): void {
  const { width: w, height: h } = ctx.canvas;
  const color = listening ? INK.coral : INK.magenta;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 - 22;
  ctx.beginPath();
  ctx.arc(cx, cy, 84, 0, Math.PI * 2);
  ctx.fillStyle = listening ? '#3a1020' : INK.face;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = color;
  ctx.stroke();
  // Capsule, cradle and stand.
  roundRect(ctx, cx - 17, cy - 50, 34, 62, 17);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 4, 31, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + 27);
  ctx.lineTo(cx, cy + 46);
  ctx.moveTo(cx - 18, cy + 46);
  ctx.lineTo(cx + 18, cy + 46);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = listening ? INK.coral : INK.dim;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(listening ? 'LISTENING…' : 'DICTATE', cx, h - 12);
}

/** A short floating label: "+300", "KEEP", "TOMORROW". */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(h * 0.62)}px ${FONT}`;
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(4, 8, 20, 0.85)';
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
}
