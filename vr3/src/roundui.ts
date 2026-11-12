import * as THREE from 'three';
import type { World } from '@iwsdk/core';
import * as PixelFont from './mail/pixelFont';

/**
 * What a round shows besides the letters themselves:
 *
 *   the progress bar   top centre: only a slim bar that fills a band per email in the colour of
 *                      what was done with it (no title, no count: it explains without asking to be read)
 *   the intro          the round's name and a line under it, which come in once and then stay
 *                      still, and under them a ring that fills over the five seconds before play,
 *                      the seconds left inside it, then GO; the summary at the end uses the same title
 *   round two          a ready-made reply to either side as a speech bubble (up to three lines),
 *                      the mic low and close; held at one, it glows, swells a little, and a ring
 *                      runs round it (slow, then fast); full, the letter goes in, both fly off, SENT.
 *                      The mic records instead: the words typed out above, then SEND IT and REDO
 *                      where the replies were. TOMORROW under the bar for one left for later.
 *
 * All of it is a few flat cards with canvas pictures, placed from where the player is sitting
 * when a round begins. letters.ts runs the rounds and tells this what to show.
 */

const SANS = '"Helvetica Neue", Arial, Roboto, "Noto Sans", sans-serif';
const GLASS = 'rgba(17,10,32,.82)';
/** The colour of each thing that can happen to an email, on the bar and in the pop-up words. */
export const MARKS: Record<string, string> = { cut: '#ff5e7e', kept: '#ffd24a', missed: '#77738f', reply: '#5dffa1', mic: '#c864ff', tomorrow: '#ffd24a' };

interface Card { g: CanvasRenderingContext2D; w: number; h: number; texture: THREE.CanvasTexture; mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; shown: number; want: number; pop: number }

function pixel(g: CanvasRenderingContext2D, text: string, x: number, yMid: number, cell: number, colour: string, align: 'left' | 'center' | 'right' = 'center', shadow: string | null = 'rgba(8,6,16,.85)') {
  const upper = text.toUpperCase(), wide = PixelFont.width(upper, cell);
  const left = Math.round(align === 'center' ? x - wide / 2 : align === 'right' ? x - wide : x), top = Math.round(yMid - PixelFont.Rows * cell / 2);
  if (shadow) { g.fillStyle = shadow; const d = Math.max(2, Math.round(cell * 0.5)); PixelFont.cells(upper, left, top + d, cell, (cx, cy, cw, ch) => g.fillRect(cx - d / 2, cy - d / 2, cw + d, ch + d)); }
  g.fillStyle = colour;
  PixelFont.cells(upper, left, top, cell, (cx, cy, cw, ch) => g.fillRect(cx, cy, cw, ch));
  return wide;
}
function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = []; let line = '';
  for (const word of text.split(' ')) { const next = line ? `${line} ${word}` : word; if (g.measureText(next).width <= maxWidth || !line) line = next; else { lines.push(line); line = word; } }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{2}$/, '')}…`; }
  return lines;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (g.measureText(text).width <= maxWidth) return text;
  let t = text; while (t.length > 1 && g.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export function createRoundUi(world: World) {
  const root = new THREE.Group(); root.name = 'Round: progress, intro, replies';
  world.createTransformEntity(root);
  let accent = '#f6b3cc', clock = 0, barColours: [string, string] = ['#ff5fa2', '#ffc46b'];

  function card(name: string, w: number, h: number, metres: number): Card {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(metres, metres * h / w), material); mesh.name = name; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 7;
    root.add(mesh);
    return { g: canvas.getContext('2d')!, w, h, texture, mesh, material, shown: 0, want: 0, pop: 0 };
  }
  // The bar: a wide canvas, the bar itself in the middle and the count and percentage either side of it.
  const BAR = { w: 1500, h: 120, x0: 300, x1: 1200, metres: 1.2 };
  const bar = card('Progress', BAR.w, BAR.h, BAR.metres);
  // A little life when a band is added: a soft flash of light over it and a few sparks off it.
  const flashMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { colour: { value: new THREE.Color() }, fade: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform vec3 colour; uniform float fade; varying vec2 vUv;
      void main(){
        vec2 p=(vUv-.5)*vec2(2.,2.);
        float glow=exp(-dot(p,p)*3.)*.8+exp(-dot(p,p)*18.)*.6;
        gl_FragColor=vec4(mix(colour,vec3(1.),.45)*glow*fade,1.);
        #include <colorspace_fragment>
      }`,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), flashMaterial); flash.name = 'Progress flash'; flash.visible = false; flash.renderOrder = 9; flash.frustumCulled = false;
  bar.mesh.add(flash); flash.position.z = 0.003;
  const SPARKS = 28, sparkPos = new Float32Array(SPARKS * 3), sparkVel = new Float32Array(SPARKS * 3), sparkAge = new Float32Array(SPARKS).fill(9), sparkFade = new Float32Array(SPARKS);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute('fade', new THREE.BufferAttribute(sparkFade, 1).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { colour: { value: new THREE.Color() }, pixelRatio: { value: 1 } },
    vertexShader: 'attribute float fade; uniform float pixelRatio; varying float vFade; void main(){ vFade=fade; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(14.*pixelRatio/-mv.z,1.5,10.*pixelRatio); }',
    fragmentShader: /* glsl */ `
      uniform vec3 colour; varying float vFade;
      void main(){ float r=length(gl_PointCoord-.5)*2.; float g=exp(-r*r*4.)*(1.-smoothstep(.7,1.,r))+exp(-r*r*30.)*.6;
        gl_FragColor=vec4(mix(colour,vec3(1.),.35)*g*vFade,1.);
        #include <colorspace_fragment>
      }`,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.name = 'Progress sparks'; sparks.frustumCulled = false; sparks.visible = false; sparks.renderOrder = 9;
  bar.mesh.add(sparks);
  let flashAge = 9, nextSpark = 0, shownMarks = 0;
  /** A band has just been added at `index` of `total`: flash it, and throw a few sparks off it. */
  function celebrate(index: number, total: number) {
    const along = (BAR.x0 + (index + 0.5) * ((BAR.x1 - BAR.x0) / Math.max(1, total))) / BAR.w;
    const x = (along - 0.5) * BAR.metres;
    const colour = new THREE.Color(barColours[0]).lerp(new THREE.Color(barColours[1]), (along * BAR.w - BAR.x0) / (BAR.x1 - BAR.x0));
    flashMaterial.uniforms.colour.value.copy(colour); sparkMaterial.uniforms.colour.value.copy(colour);
    flash.position.x = x; flashAge = 0;
    for (let n = 0; n < 9; n++) {
      const i = nextSpark; nextSpark = (nextSpark + 1) % SPARKS;
      sparkPos[i * 3] = x + (Math.random() - 0.5) * 0.02; sparkPos[i * 3 + 1] = (Math.random() - 0.5) * 0.02; sparkPos[i * 3 + 2] = 0.004;
      const a = Math.random() * Math.PI * 2, v = 0.05 + Math.random() * 0.08;
      sparkVel[i * 3] = Math.cos(a) * v; sparkVel[i * 3 + 1] = Math.abs(Math.sin(a)) * v * 0.9 + 0.03; sparkVel[i * 3 + 2] = 0.02 * Math.random();
      sparkAge[i] = 0;
    }
  }
  // The intro, in parts that move on their own: title, the line under it, the ring and what is in it.
  const intro = new THREE.Group(); intro.name = 'Round intro'; intro.visible = false; root.add(intro);
  const title = card('Round title', 1024, 230, 0.64), subtitle = card('Round subtitle', 1280, 168, 0.86), count = card('Ready count', 512, 256, 0.4);      // (wide enough for FIGHT!; a number is the size it was)
  for (const part of [title, subtitle, count]) { root.remove(part.mesh); intro.add(part.mesh); part.mesh.renderOrder = 8; }
  title.mesh.position.y = 0.235; subtitle.mesh.position.y = 0.065; count.mesh.position.set(0, -0.11, 0.002);      // (nearer the line above it, now there is no ring)
  const ringMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { fill: { value: 0 }, accent: { value: new THREE.Color(accent) }, c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, shown: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, tick: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform float fill,shown,flash,time,tick; uniform vec3 accent,c0,c1; varying vec2 vUv;
      void main(){
        // In square pixels, 64 across the ring, like the rest of the game's words and bars; the ring fills
        // r < 1, and the margin past it is room for its shadow (2026-11-11: "more fun like the progress bar").
        const float N=32.;
        vec2 p=(floor((vUv-.5)*2.*1.14*N)+.5)/N;
        float r=length(p);
        // how far round from the top, clockwise, 0 to 1
        float around=fract(atan(p.x,p.y)/6.2831853+1.);
        // Five chunky segments, one for each second, with gaps between them. Each lights as its second
        // passes; the one being counted fills. Lit, they run through the level's two colours as they go round.
        float seg=floor(around*5.), within=fract(around*5.);
        float gap=step(.03,within)*step(within,.97);
        float band=step(.6,r)*step(r,.88)*gap;
        float done=step(seg+1.,fill*5.+.0001);
        float filling=step(seg,fill*5.)*(1.-done)*step(within,fract(fill*5.));
        float lit=band*max(done,filling);
        vec3 hue=mix(c0,c1,around);
        // Kept simple (2026-11-11): one disc, the segments on it, its hard pixel shadow two pixels down and to
        // the right. Like the progress bar, each segment has a light border round it; the middle is a soft dark,
        // not black, and a little see-through.
        float body=step(r,.9);
        float shadow=step(length(p-vec2(2.,-2.)/N),.9)*(1.-body);
        float inner=step(.63,r)*step(r,.85)*step(.055,within)*step(within,.945);
        float border=band*(1.-inner);
        vec3 colour=vec3(.035,.03,.055);
        colour=mix(colour,vec3(.012,.01,.02),inner);                 // a segment not yet reached: darker than the middle, like the bar's empty part
        colour=mix(colour,hue*1.1,lit*inner);
        colour=mix(colour,vec3(.55,.55,.6),border);                  // the light border round each one
        colour=mix(colour,vec3(1.),flash*band);
        float a=mix(.78,.97,band);
        gl_FragColor=vec4(colour*body,max(body*a,shadow*.6)*shown);
        #include <colorspace_fragment>
      }`,
  });
  // (the ring itself 0.28 across, smaller since 2026-11-11: the rest of the plane is room for its shadow)
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), ringMaterial); ring.name = 'Ready ring'; ring.position.y = -0.16; ring.renderOrder = 7; ring.frustumCulled = false;
  // (the ring is no longer shown: the countdown is just its number, 2026-11-11. It is kept here, unadded, in case it comes back.)
  /** The intro's moments, in seconds since each began (-1: not yet). */
  const show = { titleAt: -1, readyAt: -1, goAt: -1, outAt: -1, countPop: 0, fill: 0, tick: 1 };
  const chips = [card('Reply, left', 640, 360, 0.46), card('Reply, right', 640, 360, 0.46)];
  const mic = card('Mic', 440, 460, 0.3);
  const toast = card('Word', 640, 150, 0.5);
  // Round two's words: what is being dictated, typed out as it is "heard". Fixed just above the mic.
  const dictation = card('Dictation', 1024, 340, 0.42);
  /** Where a letter is held to answer it in round two: the left reply, the right reply, the mic. World space. */
  const targets = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const radius = [0.26, 0.26, 0.2];
  let toastAge = 9, introSize = 1, toastSize = 1;
  const toastFrom = new THREE.Vector3();
  /**
   * Round two goes: 'pick' (two replies and the mic), 'recording' (words typed out as they are
   * said), 'choose' (keep it or redo it, where the replies were), and 'off'.
   */
  type Stage = 'off' | 'pick' | 'recording' | 'choose';
  let stage: Stage = 'off', aimAt = -1, aimFill = 0, heardWords = 0, heardText = '', micRedraw = 0, dictLeave = -1;
  const hoverAmount = [0, 0, 0], ringFill = [0, 0, 0], leave = [-1, -1, -1];
  const base = [0, 1, 2].map(() => ({ at: new THREE.Vector3(), turn: new THREE.Quaternion() }));
  const dictBase = new THREE.Vector3();
  // Held near a target, it glows from behind, and a ring runs round it: slow at first, then fast to finish.
  const roundBox = /* glsl */ `float roundBox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }`;
  function glowPlane(w: number, h: number, corner: number) {
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { colour: { value: new THREE.Color() }, strength: { value: 0 }, size: { value: new THREE.Vector2(w + 0.3, h + 0.3) }, inner: { value: new THREE.Vector2(w / 2, h / 2) }, corner: { value: corner } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: /* glsl */ `
        uniform vec3 colour; uniform float strength, corner; uniform vec2 size, inner; varying vec2 vUv;
        ${roundBox}
        void main(){
          float d=max(roundBox((vUv-.5)*size, inner, corner),0.);
          // soft all the way out, and nothing at all by the plane's own edge
          float g=(exp(-d*d/.0009)*.7+exp(-d*d/.004)*.3)*(1.-smoothstep(.09,.15,d));
          gl_FragColor=vec4(colour*g*strength,1.);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h + 0.3), material); mesh.renderOrder = 6; mesh.frustumCulled = false; mesh.position.z = -0.004;
    return { mesh, material };
  }
  /** A ring round a box w by h metres; its plane is bigger by a margin, so the glow off it fades to nothing well inside. */
  function holdRing(w: number, h: number, corner: number) {
    const margin = 0.16;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { colour: { value: new THREE.Color() }, fill: { value: 0 }, shown: { value: 0 }, size: { value: new THREE.Vector2(w + margin, h + margin) }, box: { value: new THREE.Vector2(w / 2, h / 2) }, corner: { value: corner }, stroke: { value: 0.013 }, px: { value: 0.0065 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: /* glsl */ `
        uniform vec3 colour; uniform float fill, shown, corner, stroke, px; uniform vec2 size, box; varying vec2 vUv;
        ${roundBox}
        void main(){
          // in square pixels, like everything else in round two (2026-11-11)
          vec2 p=(floor((vUv-.5)*size/px)+.5)*px;
          float d=roundBox(p, box, corner);
          float aa=.0002;
          float band=1.-smoothstep(stroke*.5-aa, stroke*.5+aa, abs(d));
          // how far round from the top, clockwise
          float around=fract(atan(p.x,p.y)/6.2831853+1.);
          float on=(1.-smoothstep(fill-.012, fill, around))*step(.0005, fill);
          float lit=band*on;
          float head=band*exp(-pow((around-fill)*30.,2.))*step(.0005,fill)*step(fill,.999);
          // a soft glow either side of the lit part, gone long before the plane's edge
          float glow=exp(-pow(d/(stroke*2.4),2.))*.4*on*(1.-step(.05,abs(d)));
          vec3 col=mix(colour,vec3(1.),.3)*(lit*1.3+glow)+vec3(1.)*head*1.4;
          float a=max(lit, band*.35)+glow*.8+head;
          gl_FragColor=vec4(mix(vec3(.92,.92,1.),col,clamp(lit+glow+head,0.,1.)), clamp(a,0.,1.)*shown);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + margin, h + margin), material); mesh.renderOrder = 8; mesh.frustumCulled = false; mesh.position.z = 0.003;
    return { mesh, material };
  }
  const chipW = 0.46, chipH = 0.46 * 360 / 640;
  const glows = [glowPlane(chipW * 0.92, chipH * 0.86, 0.05), glowPlane(chipW * 0.92, chipH * 0.86, 0.05), glowPlane(0.17, 0.17, 0.085)];
  const rings = [holdRing(chipW + 0.035, chipH + 0.035, 0.06), holdRing(chipW + 0.035, chipH + 0.035, 0.06), holdRing(0.2, 0.2, 0.1)];
  // (the mic's disc is a little above the middle of its card: 230 against 200 of 460 pixels)
  const micUp = (230 - 200) / 460 * 0.3 * 460 / 440;
  [chips[0], chips[1], mic].forEach((c, i) => { c.mesh.add(glows[i].mesh); c.mesh.add(rings[i].mesh); if (i === 2) { glows[i].mesh.position.y = micUp; rings[i].mesh.position.y = micUp; } });

  // ---------------------------------------------------------------- pictures

  function drawBar(marks: readonly string[], total: number, plain = false) {
    const { g, w, h } = bar;
    g.clearRect(0, 0, w, h);
    // A dark pill, and in it a band per email done, filling left to right through the level's own
    // two colours. What was done with each shows only a little: one gone past is dimmed, one kept
    // has a gold line along its top.
    const x0 = BAR.x0, x1 = BAR.x1, tall = 56, y = h / 2 - tall / 2, step = (x1 - x0) / Math.max(1, total);
    // (its rim bolder since 2026-11-11: thicker, and brighter)
    rounded(g, x0 - 15, y - 15, x1 - x0 + 30, tall + 30, (tall + 30) / 2); g.fillStyle = 'rgba(6,4,14,.88)'; g.fill();
    g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
    g.save(); rounded(g, x0, y, x1 - x0, tall, tall / 2); g.clip();
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0, y, x1 - x0, tall);
    const sweep = g.createLinearGradient(x0, 0, x1, 0); sweep.addColorStop(0, barColours[0]); sweep.addColorStop(1, barColours[1]);
    for (let i = 0; i < total && i <= marks.length; i++) {
      const left = x0 + i * step + 2, wide = Math.max(1, step - 4);
      if (i === marks.length) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(left, y, wide, tall); continue; }
      g.globalAlpha = marks[i] === 'missed' ? 0.35 : 1;
      g.fillStyle = sweep; g.fillRect(left, y, wide, tall);
      if (marks[i] === 'kept' || marks[i] === 'tomorrow') { g.fillStyle = MARKS.kept; g.fillRect(left, y, wide, 9); }
      g.globalAlpha = 1;
    }
    // a gloss along the top of it all
    const gloss = g.createLinearGradient(0, y, 0, y + tall); gloss.addColorStop(0, 'rgba(255,255,255,.32)'); gloss.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = gloss; g.fillRect(x0, y, (marks.length / Math.max(1, total)) * (x1 - x0), tall);
    g.restore();
    // either side, outside it, in white pixel letters: how many are done of how many, and the percentage
    if (plain) { bar.texture.needsUpdate = true; return; }       // (the end of a game: just the bar, full)
    const done = Math.min(marks.length, total), share = `${Math.round(100 * done / Math.max(1, total))}%`, count = `${done} / ${total}`;
    // (a clear gap between them and the bar's rim)
    // (the percentage a little more spaced out, a cell more between its letters: 2026-11-11)
    const gap = 62, spread = 1.2, fit = (text: string, extra = 0) => Math.max(3, Math.min(7, Math.floor((x0 - gap - 20) / Math.max(1, PixelFont.widthCells(text) + extra * (text.length - 1)))));
    const cell = Math.min(fit(count), fit(share, spread));
    pixel(g, count, x0 - gap, h / 2, cell, '#ffffff', 'right');
    let at = x1 + gap;
    for (const letter of share) at += pixel(g, letter, at, h / 2, cell, '#ffffff', 'left') + (1 + spread) * cell;
    bar.texture.needsUpdate = true;
  }
  /** The title, big in the pixel letters, and the line under it: drawn once each, as a round begins. */
  function drawTitle(text: string, line: string) {
    {
      const { g, w, h } = title;
      g.clearRect(0, 0, w, h);
      // something dark behind it, so it reads in a bright room as well as a dark one: an oval that
      // has faded to nothing well inside the canvas, so no edge of it shows
      g.save(); g.translate(w / 2, h / 2); g.scale(1, (h * 0.5) / (w * 0.4));
      const shade = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.4); shade.addColorStop(0, 'rgba(10,8,22,.42)'); shade.addColorStop(0.6, 'rgba(10,8,22,.2)'); shade.addColorStop(1, 'rgba(10,8,22,0)');
      g.fillStyle = shade; g.fillRect(-w / 2, -w * 0.4, w, w * 0.8); g.restore();
      const cell = Math.max(6, Math.min(20, Math.floor(900 / Math.max(1, PixelFont.widthCells(text.toUpperCase())))));
      pixel(g, text, w / 2, h / 2, cell, '#ffffff');
      title.texture.needsUpdate = true;
    }
    {
      const { g, w, h } = subtitle;
      g.clearRect(0, 0, w, h);
      // In the pixel letters too, short and in the level's colour, on a dark pill of its own (asked for
      // on 2026-11-11: "more fun, maybe also pixel and simpler like 20 Unread Emails").
      const cell = Math.max(4, Math.min(9, Math.floor((w - 260) / Math.max(1, PixelFont.widthCells(line.toUpperCase())))));
      const wide = PixelFont.width(line.toUpperCase(), cell) + 130;
      rounded(g, (w - wide) / 2, 4, wide, h - 8, (h - 8) / 2); g.fillStyle = 'rgba(10,8,22,.72)'; g.fill();
      pixel(g, line, w / 2, h / 2 + 1, cell, accent);
      subtitle.texture.needsUpdate = true;
    }
  }
  /** What is in the ring: the seconds left, or GO. */
  function drawCount(text: string) {
    const { g, w, h } = count;
    g.clearRect(0, 0, w, h);
    const cell = Math.max(4, Math.min(24, Math.floor(440 / Math.max(1, PixelFont.widthCells(text.toUpperCase())))));
    // a block of the level's colour round each lit cell, then the number in white over it: chunky, arcade-like
    const upper = text.toUpperCase(), wide = PixelFont.width(upper, cell);
    const left = Math.round(w / 2 - wide / 2), top = Math.round(h / 2 - PixelFont.Rows * cell / 2), edge = Math.max(3, Math.round(cell * 0.35));
    // a hard pixel shadow down and to the right, then the block in the level's two colours top to bottom (like the bar)
    const drop = Math.max(4, Math.round(cell * 0.45));
    g.fillStyle = 'rgba(0,0,0,.8)'; PixelFont.cells(upper, left + drop, top + drop, cell, (x, y, cw, ch) => g.fillRect(x - edge, y - edge, cw + 2 * edge, ch + 2 * edge));
    const sweep = g.createLinearGradient(0, top - edge, 0, top + PixelFont.Rows * cell + edge); sweep.addColorStop(0, barColours[0]); sweep.addColorStop(1, barColours[1]);
    g.fillStyle = sweep; PixelFont.cells(upper, left, top, cell, (x, y, cw, ch) => g.fillRect(x - edge, y - edge, cw + 2 * edge, ch + 2 * edge));
    g.fillStyle = '#ffffff'; PixelFont.cells(upper, left, top, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
    count.texture.needsUpdate = true;
  }
  /** A colour mixed towards another: `t` of the way. */
  const mixColour = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
  /** A box with its corners rounded in two square steps of `s`, as on the home screen's buttons. */
  function stepped(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number) {
    const r = x + w, b = y + h, d = 2 * s;
    g.beginPath();
    g.moveTo(x + d, y); g.lineTo(r - d, y); g.lineTo(r - d, y + s); g.lineTo(r - s, y + s); g.lineTo(r - s, y + d); g.lineTo(r, y + d);
    g.lineTo(r, b - d); g.lineTo(r - s, b - d); g.lineTo(r - s, b - s); g.lineTo(r - d, b - s); g.lineTo(r - d, b);
    g.lineTo(x + d, b); g.lineTo(x + d, b - s); g.lineTo(x + s, b - s); g.lineTo(x + s, b - d); g.lineTo(x, b - d);
    g.lineTo(x, y + d); g.lineTo(x + s, y + d); g.lineTo(x + s, y + s); g.lineTo(x + d, y + s); g.closePath();
  }
  /** A pixel panel: an outline the shape of the box, a dark face one step in, a light line along its top and a dark one along its foot. */
  function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number, edge: string, face: string) {
    stepped(g, x, y, w, h, s); g.fillStyle = edge; g.fill();
    // (the inside cut out first, so a see-through face shows what is behind it, not the outline's colour)
    g.save(); g.globalCompositeOperation = 'destination-out'; stepped(g, x + s, y + s, w - 2 * s, h - 2 * s, s); g.fill(); g.restore();
    stepped(g, x + s, y + s, w - 2 * s, h - 2 * s, s); g.fillStyle = face; g.fill();
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x + 3 * s, y + s, w - 6 * s, s);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 3 * s, y + h - 2 * s, w - 6 * s, s);
  }
  /** Words wrapped into lines of the pixel letters at a size, at most `most` lines (the last cut short if need be). */
  function pixelLines(text: string, cell: number, width: number, most: number) {
    const lines: string[] = []; let line = '';
    for (const word of text.toUpperCase().split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (!line || PixelFont.widthCells(next) * cell <= width) line = next; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length > most) { lines.length = most; lines[most - 1] = `${lines[most - 1].replace(/.{2}$/, '')}..`; }
    return lines;
  }
  /** The face colour of round two's panels: near black, a little of the level in it. */
  const faceColour = () => mixColour('#06050b', accent, 0.035);      // (the mix is in linear light: a little goes a long way)
  /**
   * A reply: a pixel panel outlined in the level's colour, a tag on its corner (REPLY A, REPLY B), and up
   * to six lines in the pixel letters. Or, after dictating, SEND IT (left) and REDO (right) in the same places: a plain panel and the word.
   * (Pixel style and the level's colours since 2026-11-11; before, speech bubbles in greens.)
   */
  function drawChip(which: number, text: string, kind: 'reply' | 'send' | 'redo' = 'reply') {
    const { g, w, h } = chips[which], left = which === 0;
    const edge = kind === 'redo' ? mixColour(accent, '#ffffff', 0.55) : left ? barColours[0] : barColours[1];
    g.clearRect(0, 0, w, h);
    const x = 12, y = 34, bw = w - 24, bh = h - 46, s = 8;
    panel(g, x, y, bw, bh, s, edge, 'rgba(6,5,12,.62)');      // (dark and a little see-through: 2026-11-11)
    if (kind === 'reply') {
      // the tag on its top corner, the side away from the middle
      const tag = left ? 'REPLY A' : 'REPLY B';
      const tw = PixelFont.width(tag, 5) + 36, tx = left ? x + 30 : x + bw - 30 - tw;
      stepped(g, tx, y - 26, tw, 50, 5); g.fillStyle = edge; g.fill();
      pixel(g, tag, tx + tw / 2, y - 1, 5, '#0d0a1c', 'center', null);
      // as big as it fits: three lines large, up to five a size down, up to six smaller still
      let cell = 6, lines = pixelLines(text, cell, bw - 70, 99);
      if (lines.length > 3) { cell = 5; lines = pixelLines(text, cell, bw - 60, 99); }
      if (lines.length > 5) { cell = 4; lines = pixelLines(text, cell, bw - 50, 6); }
      const lh = (PixelFont.Rows + 3.4) * cell, mid = y + bh / 2 + 12;
      lines.forEach((line, i) => pixel(g, line, w / 2, mid + (i - (lines.length - 1) / 2) * lh, cell, '#ffffff'));
    } else {
      // just the word, big, in the middle of a plain panel (2026-11-11: "just a simple area")
      const word = kind === 'send' ? 'SEND IT' : 'REDO';
      pixel(g, word, w / 2, y + bh / 2, Math.min(13, Math.floor((bw - 90) / PixelFont.widthCells(word))), '#ffffff');      // (white, as the replies' words are)
    }
    chips[which].texture.needsUpdate = true;
    rings[which].material.uniforms.colour.value.set(edge); glows[which].material.uniforms.colour.value.set(edge);
  }
  /** The microphone, as pixel art: 9 by 14. */
  const MIC_ART = ['..#####..', '.#######.', '.#######.', '.#######.', '.#######.', '.#######.', '#.#####.#', '#.#####.#', '#..###..#', '.#.....#.', '..#####..', '....#....', '....#....', '..#####..'];
  /**
   * The mic: a pixel disc outlined in the level's colour, a pixel microphone on it; recording, blocks of
   * light step out from it in the level's two colours like a level meter, and a red dot blinks.
   */
  function drawMic(on: boolean) {
    const { g, w, h } = mic, cx = w / 2, cy = 200, cell = 10, R = 11.5;
    g.clearRect(0, 0, w, h);
    const edge = barColours[0], face = faceColour();      // (the level's stronger colour, not its pale accent: more vibrant, 2026-11-11)
    if (on) {
      // the meter: sixteen spokes of blocks
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, n = 0.5 + 0.5 * Math.sin(clock * 11 + i * 1.7) * Math.sin(clock * 6.3 + i * 0.9), blocks = 1 + Math.round(4 * n * n);
        for (let k = 0; k < blocks; k++) {
          const r = (R + 1.4 + k * 1.3) * cell, bx = Math.round((cx + Math.sin(a) * r) / cell) * cell, by = Math.round((cy - Math.cos(a) * r) / cell) * cell;
          g.globalAlpha = 1 - k * 0.16; g.fillStyle = mixColour(barColours[0], barColours[1], k / 4);
          g.fillRect(bx - cell / 2, by - cell / 2, cell, cell);
        }
      }
      g.globalAlpha = 1;
    }
    // the disc, cell by cell
    for (let j = -13; j <= 13; j++) for (let i = -13; i <= 13; i++) {
      const d = Math.hypot(i, j);
      if (d > R) continue;
      g.fillStyle = d > R - 1.6 ? edge : d > R - 2.6 ? 'rgba(255,255,255,.08)' : face;
      if (d <= R - 1.6 && j < -R + 4) g.fillStyle = mixColour(face, '#ffffff', 0.07);
      g.fillRect(cx + i * cell - cell / 2, cy + j * cell - cell / 2, cell, cell);
    }
    // the microphone
    const mc = 8, left = cx - (MIC_ART[0].length * mc) / 2, top = cy - (MIC_ART.length * mc) / 2, bump = on ? Math.round(Math.sin(clock * 14) * 2) : 0;
    g.fillStyle = on ? '#ffffff' : edge;
    MIC_ART.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') g.fillRect(left + x * mc, top + y * mc - bump, mc, mc); }));
    if (on && Math.sin(clock * 6) > -0.3) { g.fillStyle = '#ff3b55'; g.fillRect(cx + 62, cy - 92, 20, 20); }
    // (no words under it any more: 2026-11-11)
    mic.texture.needsUpdate = true;
    rings[2].material.uniforms.colour.value.set(edge); glows[2].material.uniforms.colour.value.set(edge);
  }
  /** What has been "heard" so far, typed out in the pixel letters: LISTENING with a red dot while it records, YOUR REPLY once it is done. */
  function drawDictation() {
    const { g, w, h } = dictation, recording = stage === 'recording';
    g.clearRect(0, 0, w, h);
    panel(g, 8, 8, w - 16, h - 16, 8, accent, 'rgba(6,5,12,.62)');      // (dark and a little see-through, as the replies are)
    if (recording && Math.sin(clock * 6) > -0.3) { g.fillStyle = '#ff3b55'; g.fillRect(46, 44, 22, 22); }
    pixel(g, recording ? 'LISTENING' : 'YOUR REPLY', recording ? 84 : 46, 56, 4, accent, 'left', null);
    const said = heardText.split(' ').slice(0, heardWords).join(' ');
    // four lines at the usual size; a longer reply drops a size and gets five (sized for the whole reply, so it does not jump as it types)
    const whole = pixelLines(heardText, 5, w - 110, 99).length > 4, cell = whole ? 4 : 5, step = whole ? 44 : 54;
    const lines = pixelLines(said, cell, w - 110, whole ? 5 : 4);
    lines.forEach((line, i) => pixel(g, line, 48, 124 + i * step, cell, '#ffffff', 'left'));
    // a block caret after the last word, blinking
    if (recording && Math.sin(clock * 9) > 0) {
      const last = lines[lines.length - 1] ?? '', cx = 48 + PixelFont.width(last, cell) + (last ? cell * 2 : 0), row = Math.max(0, lines.length - 1);
      g.fillStyle = accent; g.fillRect(cx, 124 + row * step - (PixelFont.Rows * cell) / 2, cell * 3, PixelFont.Rows * cell);
    }
    dictation.texture.needsUpdate = true;
  }
  function drawToast(text: string, colour: string) {
    const { g, w, h } = toast;
    g.clearRect(0, 0, w, h);
    // chunky, like the countdown: a block of the colour round each cell, white on top, a dark drop under it all
    const upper = text.toUpperCase(), cell = Math.max(4, Math.min(16, Math.floor((w - 80) / Math.max(1, PixelFont.widthCells(upper)))));
    const wide = PixelFont.width(upper, cell), left = Math.round(w / 2 - wide / 2), top = Math.round(h / 2 - PixelFont.Rows * cell / 2), edge = Math.max(3, Math.round(cell * 0.35));
    g.fillStyle = 'rgba(0,0,0,.7)'; PixelFont.cells(upper, left, top + edge, cell, (x, y, cw, ch) => g.fillRect(x - edge, y - edge, cw + 2 * edge, ch + 2 * edge));
    g.fillStyle = colour; PixelFont.cells(upper, left, top, cell, (x, y, cw, ch) => g.fillRect(x - edge, y - edge, cw + 2 * edge, ch + 2 * edge));
    g.fillStyle = '#ffffff'; PixelFont.cells(upper, left, top, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
    toast.texture.needsUpdate = true;
  }
  drawMic(false);

  // ---------------------------------------------------------------- where it all is

  const look = new THREE.Object3D(), seat = new THREE.Vector3();
  function face(target: Card | THREE.Object3D, x: number, y: number, z: number) {
    const object = target instanceof THREE.Object3D ? target : target.mesh;
    look.position.set(x, y, z); look.lookAt(seat.x, seat.y - 0.04, seat.z);
    object.position.copy(look.position); object.quaternion.copy(look.quaternion);       // (lookAt turns an object's +z, where a plane's picture is, to the player)
  }
  /** Set everything out from where the player's head is now. Called as each round begins. */
  function place(head: THREE.Vector3, introAt?: { up: number; nearer: number; size: number }) {
    seat.copy(head);
    const x = head.x * 0.7;
    face(bar, x, head.y + 0.55, head.z - 2.35); barHome.copy(bar.mesh.position); barLeave = -1;
    // (a level with something standing where the intro would be moves it: up, nearer, and smaller)
    face(intro, x, head.y - 0.14 + (introAt?.up ?? 0), head.z - 1.6 + (introAt?.nearer ?? 0)); introSize = introAt?.size ?? 1;
    // (round two's replies a little nearer than they were, so a letter held out can be taken to them;
    // the mic low and close, under the hands: asked for on 2026-11-11)
    face(chips[0], x - 0.56, head.y - 0.16, head.z - 1.02);
    face(chips[1], x + 0.56, head.y - 0.16, head.z - 1.02);
    face(mic, x, head.y - 0.44, head.z - 0.74);       // (higher than it was, so it is not so far to look down: asked for on 2026-11-11)
    // what is dictated: just above the mic with a clear gap, and staying there (it followed the head for a while: too hard to read)
    face(dictation, x, head.y - 0.44 + 0.157 + 0.05 + 0.07, head.z - 0.78); dictBase.copy(dictation.mesh.position);
    [chips[0], chips[1], mic].forEach((c, i) => { base[i].at.copy(c.mesh.position); base[i].turn.copy(c.mesh.quaternion); });
    targets[0].copy(chips[0].mesh.position); targets[1].copy(chips[1].mesh.position);
    targets[2].copy(v0.set(0, micUp, 0).applyQuaternion(mic.mesh.quaternion).add(mic.mesh.position));
  }
  const v0 = new THREE.Vector3(), touchTurn = new THREE.Quaternion(), barHome = new THREE.Vector3();
  let barLeave = -1;

  // ---------------------------------------------------------------- every frame

  function update(dt: number) {
    clock += dt;
    const ease = 1 - Math.exp(-dt * 9);
    bar.shown += (bar.want - bar.shown) * ease; bar.pop *= Math.exp(-dt * 7);
    bar.mesh.visible = bar.shown > 0.01; bar.material.opacity = bar.shown; bar.mesh.scale.setScalar(1 + bar.pop * 0.06);
    // done with (the end of a game): a little swell, then up and away, fading
    if (barLeave >= 0) {
      const t = (barLeave += dt) / 0.9, out = clamp01((t - 0.25) / 0.75), e = out * out;
      bar.mesh.position.copy(barHome); bar.mesh.position.y += 0.35 * e;
      bar.mesh.scale.setScalar((1 + 0.12 * Math.sin(Math.min(1, t / 0.25) * Math.PI)) * (1 - 0.5 * e));
      bar.material.opacity = bar.shown * (1 - e); bar.mesh.visible = bar.material.opacity > 0.01;
      if (t >= 1) { barLeave = -1; bar.want = 0; bar.shown = 0; bar.mesh.visible = false; bar.mesh.position.copy(barHome); }
    }
    // Round two's targets. Held at, one swells a little and glows, and its ring runs round; sent, it
    // pops, then flies up and away and is gone.
    [chips[0], chips[1], mic].forEach((c, k) => {
      c.shown += (c.want - c.shown) * ease; c.pop *= Math.exp(-dt * 7);
      const at = aimAt === k ? 1 : 0;
      hoverAmount[k] += (at - hoverAmount[k]) * (1 - Math.exp(-dt * 12));
      ringFill[k] = at ? aimFill : ringFill[k] * Math.exp(-dt * 10);
      let scale = (0.86 + 0.14 * c.shown) * (1 + c.pop * 0.3 + hoverAmount[k] * 0.09 + at * aimFill * 0.05);
      if (k === 2 && stage === 'recording') scale *= 1 + 0.035 * Math.sin(clock * 9);
      c.mesh.position.copy(base[k].at); c.mesh.quaternion.copy(base[k].turn);
      let fade = 1;
      if (leave[k] >= 0) {
        const t = (leave[k] += dt) / 0.8, out = clamp01((t - 0.2) / 0.8), e = out * out;
        scale *= (1 + 0.25 * Math.sin(Math.min(1, t / 0.2) * Math.PI)) * (1 - 0.8 * e);
        c.mesh.position.y += 0.4 * e; c.mesh.position.add(v0.set(0, 0, -0.5 * e).applyQuaternion(base[k].turn));
        c.mesh.rotateZ((k === 0 ? 0.5 : -0.5) * e);
        fade = 1 - e;
        if (t >= 1) { leave[k] = -1; c.want = 0; c.shown = 0; }
      }
      c.mesh.scale.setScalar(scale);
      c.material.opacity = c.shown * fade; c.mesh.visible = c.material.opacity > 0.01;
      glows[k].material.uniforms.strength.value = (hoverAmount[k] * (0.3 + 0.45 * ringFill[k]) + c.pop * 0.3) * c.shown * fade;
      rings[k].material.uniforms.shown.value = Math.max(hoverAmount[k], ringFill[k] > 0.01 ? 1 : 0) * c.shown * fade;
      rings[k].material.uniforms.fill.value = ringFill[k];
    });
    // recording: the mic's bars move, and the words come up with a blinking caret
    if (stage === 'recording' && (micRedraw -= dt) <= 0) { micRedraw = 1 / 20; drawMic(true); drawDictation(); }
    dictation.shown += (dictation.want - dictation.shown) * ease;
    dictation.mesh.position.copy(dictBase); let dictFade = 1;
    if (dictLeave >= 0) {
      const t = (dictLeave += dt) / 0.8, out = clamp01((t - 0.15) / 0.85), e = out * out;
      dictation.mesh.position.y += 0.3 * e; dictation.mesh.position.add(v0.set(0, 0, -0.6 * e).applyQuaternion(dictation.mesh.quaternion));
      dictation.mesh.scale.setScalar(1 - 0.7 * e); dictFade = 1 - e;
      if (t >= 1) { dictLeave = -1; dictation.want = 0; dictation.shown = 0; dictation.mesh.scale.setScalar(1); }
    } else dictation.mesh.scale.setScalar(0.92 + 0.08 * dictation.shown);
    dictation.material.opacity = dictation.shown * dictFade; dictation.mesh.visible = dictation.material.opacity > 0.01;
    // the bar's flash and sparks
    flashAge += dt;
    flash.visible = flashAge < 0.45;
    if (flash.visible) { const k = flashAge / 0.45; flashMaterial.uniforms.fade.value = (1 - k) * (1 - k) * bar.shown; flash.scale.setScalar(0.7 + 0.6 * k); }
    let live = 0;
    for (let i = 0; i < SPARKS; i++) {
      const age = (sparkAge[i] += dt);
      if (age >= 0.7) { sparkFade[i] = 0; continue; }
      live++;
      sparkVel[i * 3 + 1] -= 0.12 * dt;
      for (let k = 0; k < 3; k++) { sparkVel[i * 3 + k] *= Math.exp(-dt * 2.5); sparkPos[i * 3 + k] += sparkVel[i * 3 + k] * dt; }
      sparkFade[i] = (1 - age / 0.7) * bar.shown;
    }
    sparks.visible = live > 0;
    if (live) { sparkGeometry.attributes.position.needsUpdate = true; sparkGeometry.attributes.fade.needsUpdate = true; sparkMaterial.uniforms.pixelRatio.value = world.renderer.getPixelRatio(); }
    // The intro: the title and its line come in once (up a little, out of a blur of scale, one after
    // the other) and then stay still; the ring comes in under them and fills; at GO the ring flashes
    // and opens out, and everything goes.
    for (const key of ['titleAt', 'readyAt', 'goAt', 'outAt'] as const) if (show[key] >= 0) show[key] += dt;
    const arrive = (since: number, delay: number, length: number) => clamp01((since - delay) / length);
    const back = (t: number) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };      // overshoots a little and settles
    const out = show.outAt >= 0 ? 1 - clamp01(show.outAt / 0.35) : 1;
    intro.visible = show.titleAt >= 0 && out > 0;
    if (intro.visible) {
      intro.scale.setScalar(introSize);
      [title, subtitle].forEach((part, i) => {
        const t = arrive(show.titleAt, i * 0.16, 0.6), e = back(t);
        part.material.opacity = Math.min(1, t * 1.8) * out;
        part.mesh.visible = part.material.opacity > 0.005;
        part.mesh.position.y = (i === 0 ? 0.235 : 0.065) - (1 - e) * 0.05;
        part.mesh.scale.setScalar(0.9 + 0.1 * e);
      });
      const r = show.readyAt >= 0 ? arrive(show.readyAt, 0, 0.45) : 0;
      const go = show.goAt >= 0 ? show.goAt : -1;
      ringMaterial.uniforms.fill.value = show.fill;
      ringMaterial.uniforms.shown.value = Math.min(1, r * 1.6) * out * (go >= 0 ? 1 - clamp01(go / 0.5) : 1);
      ringMaterial.uniforms.flash.value = go >= 0 ? Math.exp(-go * 7) : 0;
      ringMaterial.uniforms.time.value = clock;
      ring.visible = false;
      ring.scale.setScalar((0.7 + 0.3 * back(r)) * (go >= 0 ? 1 + go * 0.9 : 1));
      show.countPop *= Math.exp(-dt * 9); show.tick = Math.min(1, show.tick + dt / 0.55); ringMaterial.uniforms.tick.value = show.tick;
      count.material.opacity = Math.min(1, r * 1.6) * out;
      count.mesh.visible = count.material.opacity > 0.005;
      // the number lands: big, a little overshoot, and settles; GO bursts bigger
      count.mesh.scale.setScalar(1 + show.countPop * 0.45 * Math.cos((1 - show.countPop) * 2.2) + (go >= 0 ? 0.35 * Math.exp(-go * 5) : 0));
      count.mesh.rotation.z = show.countPop * 0.12 * Math.sin(clock * 30);
    }
    // the word: up a little and gone
    toastAge += dt;
    const t = toastAge / 1.4;
    toast.mesh.visible = t < 1;
    if (t < 1) {
      toast.material.opacity = t < 0.08 ? t / 0.08 : 1 - Math.pow(clamp01((t - 0.45) / 0.55), 2);
      toast.mesh.position.copy(toastFrom); toast.mesh.position.y += 0.04 + t * 0.12;
      toast.mesh.scale.setScalar(toastSize * (1 + 0.5 * Math.exp(-toastAge * 9) * Math.cos(toastAge * 22)));
    }
  }

  return {
    update, place, targets, radius,
    /** The level's colour, for the bar's rim and the intro. */
    setAccent(colour: string, bar?: [string, string]) {
      accent = colour;
      // (a level that names no colours for its bar gets its accent, and the same a quarter turn round the colour wheel)
      barColours = bar ?? [colour, `#${new THREE.Color(colour).offsetHSL(0.12, 0.2, 0).getHexString()}`];
    },
    /** The bar: what has happened to each email so far, and how many there are. */
    progress(marks: readonly string[], total: number) {
      drawBar(marks, total); bar.want = 1;
      if (marks.length > shownMarks) { bar.pop = Math.max(bar.pop, 0.35); celebrate(marks.length - 1, total); }
      shownMarks = marks.length;
    },
    /** The intro's title and the line under it. They come in, then stay as they are. */
    intro(text: string, line: string) {
      drawTitle(text, line); show.titleAt = 0; show.readyAt = -1; show.goAt = -1; show.outAt = -1; show.fill = 0;
      ringMaterial.uniforms.accent.value.set(accent); ringMaterial.uniforms.c0.value.set(barColours[0]); ringMaterial.uniforms.c1.value.set(barColours[1]);
    },
    /** The ring under the title: how full it is (0 to 1), and the seconds left, shown inside it. */
    ready(fill: number, left: number) {
      if (show.readyAt < 0) show.readyAt = 0;
      show.fill = clamp01(fill);
      const text = String(left);
      if (count.mesh.userData.text !== text) { count.mesh.userData.text = text; drawCount(text); show.countPop = 1; show.tick = 0; }
    },
    /** The ring is full: GO. */
    go(word = 'FIGHT!') { show.fill = 1; show.goAt = 0; count.mesh.userData.text = word; drawCount(word); show.countPop = 1; },      // (FIGHT! or REPLY!, with the voice: 2026-11-12; it said GO)
    hideIntro() { if (show.titleAt >= 0 && show.outAt < 0) show.outAt = 0; },
    /** The end of a game, once it has been seen full: the bar goes, up and away. */
    dismissBar() { if (bar.mesh.visible) barLeave = 0; },
    /** The end of a game: the bar full, every band lit, and nothing either side of it. */
    complete(total: number) { drawBar(Array.from({ length: total }, () => 'cut'), total, true); bar.want = 1; bar.pop = 0.6; celebrate(Math.floor(total / 2), total); },
    /**
     * Hand a card over to be cut up (the end of a game): its picture (a copy), its size in metres and
     * where it is in the world; it is hidden here from now on. 'bar' is the progress bar, 'line' the
     * line under the round's title.
     */
    handOver(which: 'bar' | 'line') {
      const part = which === 'bar' ? bar : subtitle;
      if (!part.mesh.visible) return null;
      part.mesh.updateMatrixWorld(true);
      const at = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3();
      part.mesh.matrixWorld.decompose(at, turn, size);
      const plane = part.mesh.geometry as THREE.PlaneGeometry;
      const canvas = document.createElement('canvas'); canvas.width = part.w; canvas.height = part.h; canvas.getContext('2d')!.drawImage(part.g.canvas, 0, 0);
      if (which === 'bar') { bar.want = 0; bar.shown = 0; bar.mesh.visible = false; }
      else { intro.visible = false; show.titleAt = -1; }
      return { canvas, width: plane.parameters.width * size.x, height: plane.parameters.height * size.y, at, turn };
    },
    /** Round two's targets: on with this email's two replies and the mic, or off. */
    replies(a: string | null, b: string | null) {
      const on = a !== null && b !== null;
      if (on) {
        stage = 'pick'; drawChip(0, a); drawChip(1, b); drawMic(false);
        for (let k = 0; k < 3; k++) { leave[k] = -1; const c = k === 2 ? mic : chips[k]; c.pop = 0.5; }
      } else stage = 'off';
      chips[0].want = chips[1].want = mic.want = on ? 1 : 0;
      if (dictLeave < 0) dictation.want = 0;
      aimAt = -1; aimFill = 0;
    },
    /**
     * Is a letter at `at`, half `halfW` by `halfH` metres, touching target k (a reply, KEEP or REDO, the mic)?
     * Its outline over the target's, in the target's own plane, by `extra` metres or more.
     */
    touching(k: number, at: THREE.Vector3, halfW: number, halfH: number, extra = 0) {
      const local = v0.copy(at).sub(k === 2 ? targets[2] : base[k].at).applyQuaternion(touchTurn.copy(base[k].turn).invert());
      if (Math.abs(local.z) > 0.3) return false;
      if (k === 2) return Math.hypot(local.x, local.y) < 0.09 + Math.max(halfW, halfH) * 0.8 + extra;
      return Math.abs(local.x) < chipW / 2 + halfW + extra && Math.abs(local.y) < chipH / 2 + halfH + extra;
    },
    /** Which target the letter is being held at (-1: none), and how far round its ring has got (0 to 1). */
    aim(which: number, fill: number) { aimAt = which; aimFill = clamp01(fill); },
    /** The mic was held long enough: it records, and what is said comes up word by word. */
    record(text: string) {
      stage = 'recording'; heardText = text; heardWords = 0; aimAt = -1;
      chips[0].want = chips[1].want = 0; mic.pop = 1; dictation.want = 1; dictLeave = -1; drawMic(true); drawDictation();
    },
    /** How many of the words have been "heard" so far. */
    heard(words: number) { if (words !== heardWords) { heardWords = words; drawDictation(); } },
    /** Done recording: SEND IT on the left, REDO on the right, where the replies were. */
    choose() {
      stage = 'choose'; heardWords = heardText.split(' ').length; drawDictation(); drawMic(false);
      drawChip(0, '', 'send'); drawChip(1, '', 'redo');
      for (let k = 0; k < 2; k++) { leave[k] = -1; chips[k].want = 1; chips[k].pop = 0.8; }
      mic.want = 0; aimAt = -1;
    },
    /** The letter has gone into a target: it and the letter go, and SENT. (Kept after dictating, the words go with it.) */
    sent(which: number) {
      leave[which] = 0; (which === 2 ? mic : chips[which]).pop = 1.2;
      for (let k = 0; k < 3; k++) if (k !== which) (k === 2 ? mic : chips[k]).want = 0;
      if (stage === 'choose') dictLeave = 0; else dictation.want = 0;
      stage = 'off'; aimAt = -1;
      drawToast('SENT', accent); toastAge = 0; toastSize = 1; toastFrom.copy(base[which].at).lerp(seat, 0.15); toastFrom.y += 0.02;      // (a little nearer, in front of the bubble as it goes)
      look.position.copy(toastFrom); look.lookAt(seat); toast.mesh.quaternion.copy(look.quaternion);
    },
    /** A word where something was decided. */
    say(text: string, colour: string, at: THREE.Vector3, size = 1) {
      drawToast(text, colour); toastAge = 0; toastFrom.copy(at); toastSize = size;
      look.position.copy(at); look.lookAt(seat); toast.mesh.quaternion.copy(look.quaternion);
    },
    /** Everything away (the home screen, a change of level). */
    clear() {
      show.titleAt = -1; show.readyAt = -1; show.goAt = -1; show.outAt = -1; intro.visible = false;
      for (const c of [bar, chips[0], chips[1], mic, dictation]) { c.want = 0; c.shown = 0; c.mesh.visible = false; }
      toastAge = 9; toast.mesh.visible = false;
      stage = 'off'; aimAt = -1; aimFill = 0; leave.fill(-1); dictLeave = -1; ringFill.fill(0); hoverAmount.fill(0); drawMic(false); barLeave = -1;
    },
    diagnostics: () => ({ bar: +bar.shown.toFixed(2), intro: intro.visible ? 1 : 0, ring: +show.fill.toFixed(2), replies: +chips[0].shown.toFixed(2), stage, aimAt, aimFill: +aimFill.toFixed(2), heardWords }),
    dispose() {
      flashMaterial.dispose(); flash.geometry.dispose(); sparkMaterial.dispose(); sparkGeometry.dispose();
      for (const c of [bar, title, subtitle, count, chips[0], chips[1], mic, toast, dictation]) { c.texture.dispose(); c.material.dispose(); c.mesh.geometry.dispose(); }
      for (const p of [...glows, ...rings]) { p.material.dispose(); p.mesh.geometry.dispose(); }
      ringMaterial.dispose(); ring.geometry.dispose(); root.removeFromParent();
    },
  };
}
export type RoundUi = ReturnType<typeof createRoundUi>;
