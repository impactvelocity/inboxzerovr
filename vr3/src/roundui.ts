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
 *                      The mic records instead: the words typed out above, then KEEP and REDO
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
  const bar = card('Progress', 1024, 110, 0.7);
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
    const along = (22 + (index + 0.5) * ((1024 - 44) / Math.max(1, total))) / 1024;
    const x = (along - 0.5) * 0.7;
    const colour = new THREE.Color(barColours[0]).lerp(new THREE.Color(barColours[1]), along);
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
  const title = card('Round title', 1024, 230, 0.64), subtitle = card('Round subtitle', 1280, 168, 0.86), count = card('Ready count', 256, 256, 0.15);
  for (const part of [title, subtitle, count]) { root.remove(part.mesh); intro.add(part.mesh); part.mesh.renderOrder = 8; }
  title.mesh.position.y = 0.235; subtitle.mesh.position.y = 0.065; count.mesh.position.set(0, -0.16, 0.002);
  const ringMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { fill: { value: 0 }, accent: { value: new THREE.Color(accent) }, shown: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, tick: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform float fill,shown,flash,time,tick; uniform vec3 accent; varying vec2 vUv;
      void main(){
        vec2 p=(vUv-.5)*2.;
        float r=length(p);
        // how far round from the top, clockwise, 0 to 1
        float around=fract(atan(p.x,p.y)/6.2831853+1.);
        float aa=fwidth(r)*1.2;
        // Five chunky segments, one for each second, with gaps between them (a stylised countdown:
        // asked for on 2026-11-11). Each lights as its second passes; the one being counted fills.
        float seg=floor(around*5.), within=fract(around*5.);
        float gap=smoothstep(.0,.035,within)*(1.-smoothstep(.965,1.,within));
        float band=smoothstep(.66-aa,.66+aa,r)*(1.-smoothstep(.86-aa,.86+aa,r))*gap;
        float done=step(seg+1.,fill*5.+.0001);
        float filling=step(seg,fill*5.)*(1.-done)*step(within,fract(fill*5.));
        float lit=band*max(done,filling);
        // a thin outer rim with a tick mark at each segment's start, and a dark disc inside for the number
        float rim=smoothstep(.92-aa,.92+aa,r)*(1.-smoothstep(.95-aa,.95+aa,r));
        float marks=(1.-smoothstep(.0,.012,min(within,1.-within)))*smoothstep(.88,.9,r)*(1.-smoothstep(.99,1.,r));
        float disc=(1.-smoothstep(.58,.64,r))*.85;
        // a ring of light that runs outwards each time a second goes, and a glow off what is lit
        float wave=exp(-pow((r-(.62+tick*.45))/.05,2.))*(1.-tick)*step(tick,.999);
        float glow=exp(-pow((r-.76)/.16,2.))*max(done,filling)*gap*.45;
        vec3 col=accent*(lit*1.15+glow)+mix(accent,vec3(1.),.5)*wave*.8+vec3(1.)*flash*(band+glow)+mix(vec3(1.),accent,.5)*(rim+marks)*.55;
        float alpha=max(max(lit,band*.28),max(disc,max(glow*.8,(rim+marks)*.55)))+wave*.6+flash*band;
        // the segments not yet reached, a pale grey; inside, dark
        vec3 base=mix(vec3(.04,.03,.09),vec3(.7,.7,.78),band*(1.-lit));
        gl_FragColor=vec4(mix(base,col,clamp(lit+glow+wave+flash+rim+marks,0.,1.)),clamp(alpha,0.,1.)*shown);
        #include <colorspace_fragment>
      }`,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.29), ringMaterial); ring.name = 'Ready ring'; ring.position.y = -0.16; ring.renderOrder = 7; ring.frustumCulled = false;
  intro.add(ring);
  /** The intro's moments, in seconds since each began (-1: not yet). */
  const show = { titleAt: -1, readyAt: -1, goAt: -1, outAt: -1, countPop: 0, fill: 0, tick: 1 };
  const chips = [card('Reply, left', 640, 360, 0.46), card('Reply, right', 640, 360, 0.46)];
  const mic = card('Mic', 440, 460, 0.3);
  const toast = card('Word', 640, 150, 0.5);
  // Round two's words: what is being dictated, typed out as it is "heard"; and under the bar, the
  // word for an email left for tomorrow.
  const dictation = card('Dictation', 1024, 300, 0.7);
  const later = card('Tomorrow', 640, 96, 0.36); root.remove(later.mesh); bar.mesh.add(later.mesh); later.mesh.position.set(0, -0.088, 0.001);
  /** Where a letter is held to answer it in round two: the left reply, the right reply, the mic. World space. */
  const targets = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const radius = [0.26, 0.26, 0.2];
  let toastAge = 9, introSize = 1, laterAge = 9;
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
  function holdRing(w: number, h: number, corner: number) {
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { colour: { value: new THREE.Color() }, fill: { value: 0 }, shown: { value: 0 }, size: { value: new THREE.Vector2(w, h) }, corner: { value: corner }, stroke: { value: 0.014 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: /* glsl */ `
        uniform vec3 colour; uniform float fill, shown, corner, stroke; uniform vec2 size; varying vec2 vUv;
        ${roundBox}
        void main(){
          vec2 p=(vUv-.5)*size;
          float d=roundBox(p, size*.5-vec2(stroke*2.2), corner);
          float aa=fwidth(d)*1.3;
          float band=1.-smoothstep(stroke*.5-aa, stroke*.5+aa, abs(d));
          // how far round from the top, clockwise
          float around=fract(atan(p.x,p.y)/6.2831853+1.);
          float on=step(around, fill)*step(.0005, fill);
          float lit=band*on;
          float head=band*exp(-pow((around-fill)*34.,2.))*step(.0005,fill)*step(fill,.999);
          float glow=exp(-pow(d/(stroke*2.6),2.))*on*.55;
          vec3 col=mix(colour,vec3(1.),.45)*(lit*1.3+glow)+vec3(1.)*head*1.6;
          float a=max(lit, band*.3)+glow*.8+head;
          gl_FragColor=vec4(mix(vec3(.92,.92,1.),col,clamp(lit+glow+head,0.,1.)), clamp(a,0.,1.)*shown);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); mesh.renderOrder = 8; mesh.frustumCulled = false; mesh.position.z = 0.003;
    return { mesh, material };
  }
  const chipW = 0.46, chipH = 0.46 * 360 / 640;
  const glows = [glowPlane(chipW * 0.92, chipH * 0.86, 0.05), glowPlane(chipW * 0.92, chipH * 0.86, 0.05), glowPlane(0.17, 0.17, 0.085)];
  const rings = [holdRing(chipW + 0.085, chipH + 0.085, 0.075), holdRing(chipW + 0.085, chipH + 0.085, 0.075), holdRing(0.25, 0.25, 0.0975)];
  // (the mic's disc is a little above the middle of its card: 230 against 200 of 460 pixels)
  const micUp = (230 - 200) / 460 * 0.3 * 460 / 440;
  [chips[0], chips[1], mic].forEach((c, i) => { c.mesh.add(glows[i].mesh); c.mesh.add(rings[i].mesh); if (i === 2) { glows[i].mesh.position.y = micUp; rings[i].mesh.position.y = micUp; } });

  // ---------------------------------------------------------------- pictures

  function drawBar(marks: readonly string[], total: number) {
    const { g, w, h } = bar;
    g.clearRect(0, 0, w, h);
    // A dark pill, and in it a band per email done, filling left to right through the level's own
    // two colours. What was done with each shows only a little: one gone past is dimmed, one kept
    // has a gold line along its top.
    const x0 = 22, x1 = w - 22, y = h / 2 - 24, tall = 48, step = (x1 - x0) / Math.max(1, total);
    rounded(g, x0 - 12, y - 12, x1 - x0 + 24, tall + 24, (tall + 24) / 2); g.fillStyle = 'rgba(6,4,14,.86)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.16)'; g.stroke();
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
    const cell = Math.max(4, Math.min(24, Math.floor(200 / Math.max(1, PixelFont.widthCells(text.toUpperCase())))));
    // a block of the level's colour round each lit cell, then the number in white over it: chunky, arcade-like
    const upper = text.toUpperCase(), wide = PixelFont.width(upper, cell);
    const left = Math.round(w / 2 - wide / 2), top = Math.round(h / 2 - PixelFont.Rows * cell / 2), edge = Math.max(3, Math.round(cell * 0.35));
    g.fillStyle = 'rgba(0,0,0,.7)'; PixelFont.cells(upper, left, top + edge, cell, (x, y, cw, ch) => g.fillRect(x - edge, y - edge, cw + 2 * edge, ch + 2 * edge));
    g.fillStyle = accent; PixelFont.cells(upper, left, top, cell, (x, y, cw, ch) => g.fillRect(x - edge, y - edge, cw + 2 * edge, ch + 2 * edge));
    g.fillStyle = text === 'GO' ? '#ffffff' : '#ffffff'; PixelFont.cells(upper, left, top, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
    count.texture.needsUpdate = true;
  }
  /** The chip colours: a reply, keeping a dictated one, and doing it again. */
  const CHIP = { reply: ['#5dffa1', '#2fd5ff'], send: ['#5dffa1', '#b6ff4a'], redo: ['#ffb347', '#ff6f91'] } as const;
  /**
   * A reply, as a speech bubble: a fat two-colour rim, a tail pointing in at the email, a tag stuck on
   * its corner, and up to three lines. Or, after dictating, KEEP (left) and REDO (right) in the same places.
   */
  function drawChip(which: number, text: string, kind: 'reply' | 'send' | 'redo' = 'reply') {
    const { g, w, h } = chips[which], [c0, c1] = CHIP[kind], left = which === 0;
    g.clearRect(0, 0, w, h);
    const x = 16, y = 30, bw = w - 32, bh = h - 74, r = 40;
    // the bubble with its tail, low on the side towards the middle
    const tailX = left ? x + bw - 110 : x + 110, tip = left ? x + bw - 40 : x + 40;
    const shape = () => { rounded(g, x, y, bw, bh, r); g.moveTo(tailX - 34, y + bh - 2); g.lineTo(tip, h - 8); g.lineTo(tailX + 34, y + bh - 2); g.closePath(); };
    const rim = g.createLinearGradient(0, y, w, h); rim.addColorStop(0, c0); rim.addColorStop(1, c1);
    g.save(); g.shadowColor = c0; g.shadowBlur = 18; shape(); g.fillStyle = rim; g.fill(); g.restore();
    g.save(); g.translate(w / 2, h / 2); g.scale((bw - 18) / bw, (bh - 18) / bh); g.translate(-w / 2, -h / 2);
    const inside = g.createLinearGradient(0, y, 0, y + bh); inside.addColorStop(0, '#1f1438'); inside.addColorStop(1, '#0c0818');
    shape(); g.fillStyle = inside; g.fill(); g.restore();
    // a soft shine across the top
    g.save(); rounded(g, x + 14, y + 12, bw - 28, bh * 0.4, r - 12); g.clip();
    const shine = g.createLinearGradient(0, y, 0, y + bh * 0.4); shine.addColorStop(0, 'rgba(255,255,255,.13)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine; g.fillRect(x, y, bw, bh); g.restore();
    // the tag, stuck on a little crooked
    const tag = kind === 'reply' ? (left ? 'REPLY A' : 'REPLY B') : kind === 'send' ? 'SEND IT' : 'TRY AGAIN';
    const tw = PixelFont.width(tag, 5) + 40;
    g.save(); g.translate(left ? x + 36 + tw / 2 : x + bw - 36 - tw / 2, y + 2); g.rotate(left ? -0.06 : 0.06);
    rounded(g, -tw / 2, -24, tw, 48, 14); g.fillStyle = c0; g.fill();
    pixel(g, tag, 0, 0, 5, '#0d0a1c', 'center', null); g.restore();
    if (kind === 'reply') {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
      g.font = `800 44px ${SANS}`;
      let lines = wrap(g, text, bw - 80, 3);
      if (lines.length === 3) { g.font = `800 38px ${SANS}`; lines = wrap(g, text, bw - 76, 3); }
      const lh = lines.length === 3 ? 46 : 54, mid = y + bh / 2 + 14;
      lines.forEach((line, i) => g.fillText(line, w / 2, mid + (i - (lines.length - 1) / 2) * lh));
    } else {
      // KEEP or REDO big in the pixel letters, and what it means under it
      pixel(g, kind === 'send' ? 'KEEP' : 'REDO', w / 2, y + bh / 2 - 6, 14, c0);
      g.font = `700 32px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.78)';
      g.fillText(kind === 'send' ? 'send this reply' : 'say it again', w / 2, y + bh / 2 + 76);
    }
    chips[which].texture.needsUpdate = true;
    rings[which].material.uniforms.colour.value.set(c0); glows[which].material.uniforms.colour.value.set(c0);
  }
  /** The mic: a microphone on a disc; recording, it goes red and a ring of level bars dances round it. */
  function drawMic(on: boolean) {
    const { g, w, h } = mic, colour = on ? '#ff4d6d' : MARKS.mic, cx = w / 2, cy = 200, R = 120;
    g.clearRect(0, 0, w, h);
    if (on) {
      g.lineCap = 'round'; g.lineWidth = 9; g.strokeStyle = colour;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, n = 0.5 + 0.5 * Math.sin(clock * 11 + i * 1.7) * Math.sin(clock * 6.3 + i * 0.9);
        const len = 10 + 50 * n * n;
        g.globalAlpha = 0.45 + 0.55 * n;
        g.beginPath(); g.moveTo(cx + Math.sin(a) * (R + 12), cy - Math.cos(a) * (R + 12)); g.lineTo(cx + Math.sin(a) * (R + 12 + len), cy - Math.cos(a) * (R + 12 + len)); g.stroke();
      }
      g.globalAlpha = 1;
    }
    const disc = g.createRadialGradient(cx, cy - 40, 10, cx, cy, R); disc.addColorStop(0, on ? '#5a1430' : '#2b1a4a'); disc.addColorStop(1, on ? '#2a0816' : '#110a20');
    g.save(); g.shadowColor = colour; g.shadowBlur = on ? 30 : 16;
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fillStyle = disc; g.fill(); g.restore();
    g.lineWidth = 9; g.strokeStyle = colour; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    const s = on ? 1 + 0.06 * Math.sin(clock * 14) : 1;
    g.save(); g.translate(cx, cy); g.scale(s, s); g.translate(-cx, -cy);
    rounded(g, cx - 24, cy - 72, 48, 90, 24); g.fillStyle = colour; g.fill();
    g.lineWidth = 10; g.lineCap = 'round'; g.strokeStyle = colour; g.beginPath(); g.arc(cx, cy - 6, 45, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx, cy + 40); g.lineTo(cx, cy + 66); g.moveTo(cx - 26, cy + 66); g.lineTo(cx + 26, cy + 66); g.stroke();
    g.restore();
    const label = on ? 'RECORDING' : 'SAY IT';
    if (!on || Math.sin(clock * 6) > -0.3) pixel(g, label, cx, h - 36, 5, on ? colour : '#e3dcff');
    mic.texture.needsUpdate = true;
  }
  /** What has been "heard" so far, typed out: a red dot while it records, YOUR REPLY once it is done. */
  function drawDictation() {
    const { g, w, h } = dictation, recording = stage === 'recording', colour = recording ? '#ff4d6d' : MARKS.mic;
    g.clearRect(0, 0, w, h);
    rounded(g, 10, 10, w - 20, h - 20, 34); g.fillStyle = 'rgba(14,9,28,.9)'; g.fill(); g.lineWidth = 5; g.strokeStyle = colour; g.stroke();
    if (recording && Math.sin(clock * 6) > -0.3) { g.beginPath(); g.arc(58, 58, 13, 0, 7); g.fillStyle = colour; g.fill(); }
    pixel(g, recording ? 'LISTENING' : 'YOUR REPLY', recording ? 84 : 48, 58, 4, colour, 'left', null);
    const words = heardText.split(' '), said = words.slice(0, heardWords).join(' ');
    g.font = `700 42px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    const lines = wrap(g, said + (recording && Math.sin(clock * 9) > 0 ? ' |' : ''), w - 110, 3);
    lines.forEach((line, i) => { g.fillStyle = i === lines.length - 1 && recording ? '#ffffff' : 'rgba(240,236,255,.92)'; g.fillText(line, 52, 126 + i * 54); });
    dictation.texture.needsUpdate = true;
  }
  function drawLater() {
    const { g, w, h } = later;
    g.clearRect(0, 0, w, h);
    const cell = 7, text = 'TOMORROW', wide = PixelFont.width(text, cell) + 70;
    rounded(g, (w - wide) / 2, 6, wide, h - 12, (h - 12) / 2); g.fillStyle = 'rgba(10,8,22,.82)'; g.fill();
    pixel(g, text, w / 2, h / 2, cell, MARKS.tomorrow);
    later.texture.needsUpdate = true;
  }
  drawLater();
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
    face(bar, x, head.y + 0.55, head.z - 2.35);
    // (a level with something standing where the intro would be moves it: up, nearer, and smaller)
    face(intro, x, head.y - 0.14 + (introAt?.up ?? 0), head.z - 1.6 + (introAt?.nearer ?? 0)); introSize = introAt?.size ?? 1;
    // (round two's replies a little nearer than they were, so a letter held out can be taken to them;
    // the mic low and close, under the hands: asked for on 2026-11-11)
    face(chips[0], x - 0.5, head.y - 0.16, head.z - 1.02);
    face(chips[1], x + 0.5, head.y - 0.16, head.z - 1.02);
    face(mic, x, head.y - 0.66, head.z - 0.7);
    face(dictation, x, head.y + 0.08, head.z - 1.25); dictBase.copy(dictation.mesh.position);
    [chips[0], chips[1], mic].forEach((c, i) => { base[i].at.copy(c.mesh.position); base[i].turn.copy(c.mesh.quaternion); });
    targets[0].copy(chips[0].mesh.position); targets[1].copy(chips[1].mesh.position);
    targets[2].copy(v0.set(0, micUp, 0).applyQuaternion(mic.mesh.quaternion).add(mic.mesh.position));
  }
  const v0 = new THREE.Vector3();

  // ---------------------------------------------------------------- every frame

  function update(dt: number) {
    clock += dt;
    const ease = 1 - Math.exp(-dt * 9);
    bar.shown += (bar.want - bar.shown) * ease; bar.pop *= Math.exp(-dt * 7);
    bar.mesh.visible = bar.shown > 0.01; bar.material.opacity = bar.shown; bar.mesh.scale.setScalar(1 + bar.pop * 0.06);
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
    // TOMORROW, under the bar: pops in, stays a moment, goes
    laterAge += dt;
    {
      const t = laterAge / 1.6;
      later.material.opacity = t >= 1 ? 0 : (t < 0.08 ? t / 0.08 : 1 - Math.pow(clamp01((t - 0.6) / 0.4), 2)) * bar.shown;
      later.mesh.visible = later.material.opacity > 0.01;
      later.mesh.scale.setScalar(1 + 0.4 * Math.exp(-laterAge * 12) * Math.cos(laterAge * 30));
    }
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
      ring.visible = ringMaterial.uniforms.shown.value > 0.005;
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
      toast.mesh.scale.setScalar(1 + 0.5 * Math.exp(-toastAge * 9) * Math.cos(toastAge * 22));
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
      ringMaterial.uniforms.accent.value.set(accent);
    },
    /** The ring under the title: how full it is (0 to 1), and the seconds left, shown inside it. */
    ready(fill: number, left: number) {
      if (show.readyAt < 0) show.readyAt = 0;
      show.fill = clamp01(fill);
      const text = String(left);
      if (count.mesh.userData.text !== text) { count.mesh.userData.text = text; drawCount(text); show.countPop = 1; show.tick = 0; }
    },
    /** The ring is full: GO. */
    go() { show.fill = 1; show.goAt = 0; count.mesh.userData.text = 'GO'; drawCount('GO'); show.countPop = 1; },
    hideIntro() { if (show.titleAt >= 0 && show.outAt < 0) show.outAt = 0; },
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
    /** Which target the letter is being held at (-1: none), and how far round its ring has got (0 to 1). */
    aim(which: number, fill: number) { aimAt = which; aimFill = clamp01(fill); },
    /** The mic was held long enough: it records, and what is said comes up word by word. */
    record(text: string) {
      stage = 'recording'; heardText = text; heardWords = 0; aimAt = -1;
      chips[0].want = chips[1].want = 0; mic.pop = 1; dictation.want = 1; dictLeave = -1; drawMic(true); drawDictation();
    },
    /** How many of the words have been "heard" so far. */
    heard(words: number) { if (words !== heardWords) { heardWords = words; drawDictation(); } },
    /** Done recording: KEEP on the left, REDO on the right, where the replies were. */
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
      drawToast('SENT', MARKS.reply); toastAge = 0; toastFrom.copy(base[which].at).lerp(seat, 0.15); toastFrom.y += 0.02;      // (a little nearer, in front of the bubble as it goes)
      look.position.copy(toastFrom); look.lookAt(seat); toast.mesh.quaternion.copy(look.quaternion);
    },
    /** An email left for tomorrow: the word, in pixels, under the bar. */
    later() { laterAge = 0; },
    /** A word where something was decided. */
    say(text: string, colour: string, at: THREE.Vector3) {
      drawToast(text, colour); toastAge = 0; toastFrom.copy(at);
      look.position.copy(at); look.lookAt(seat); toast.mesh.quaternion.copy(look.quaternion);
    },
    /** Everything away (the home screen, a change of level). */
    clear() {
      show.titleAt = -1; show.readyAt = -1; show.goAt = -1; show.outAt = -1; intro.visible = false;
      for (const c of [bar, chips[0], chips[1], mic, dictation]) { c.want = 0; c.shown = 0; c.mesh.visible = false; }
      toastAge = 9; toast.mesh.visible = false; laterAge = 9; later.mesh.visible = false;
      stage = 'off'; aimAt = -1; aimFill = 0; leave.fill(-1); dictLeave = -1; ringFill.fill(0); hoverAmount.fill(0); drawMic(false);
    },
    diagnostics: () => ({ bar: +bar.shown.toFixed(2), intro: intro.visible ? 1 : 0, ring: +show.fill.toFixed(2), replies: +chips[0].shown.toFixed(2), stage, aimAt, aimFill: +aimFill.toFixed(2), heardWords }),
    dispose() {
      flashMaterial.dispose(); flash.geometry.dispose(); sparkMaterial.dispose(); sparkGeometry.dispose();
      for (const c of [bar, title, subtitle, count, chips[0], chips[1], mic, toast, dictation, later]) { c.texture.dispose(); c.material.dispose(); c.mesh.geometry.dispose(); }
      for (const p of [...glows, ...rings]) { p.material.dispose(); p.mesh.geometry.dispose(); }
      ringMaterial.dispose(); ring.geometry.dispose(); root.removeFromParent();
    },
  };
}
export type RoundUi = ReturnType<typeof createRoundUi>;
