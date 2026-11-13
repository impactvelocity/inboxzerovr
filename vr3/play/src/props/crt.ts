import * as THREE from 'three';
import type { BladeTracker } from '../blade';
import type { RoundProgress, StageContext } from '../levels/backdrop';
import * as PixelFont from '../mail/pixelFont';
import { propEnvironment } from '../weapons/held';
import { Soup, type P3 } from '../weapons/parts';
import { createPuffs } from './puffs';

/**
 * The second office's monitor: a chunky beige CRT on a tilt stand, a real model standing on the
 * painted desk (design: design/office-seated-v3/props/crt-monitor-angles.png).
 *
 * The email of the moment is shown on its screen (letters.ts docks the letter at `pose`), and the
 * keyboard is brought down on it: every blow that deletes an email cracks the glass where it
 * landed, dents and scorches the case, rocks the head on its stand and leaves it a little more
 * askew; the picture tears and loses rows, the light goes amber and then red, smoke comes out of
 * the vents. When the last email is gone it says INBOX ZERO and switches itself off, the picture
 * closing to a line and a dot. A new day is a new monitor.
 *
 * Everything is measured in metres. The stand's foot is at the group's origin; the head (case and
 * tube) turns about `PIVOT`, on top of the stand's neck, and its own numbers are measured from there.
 */
const BASE_H = 0.034, NECK_H = 0.03, PIVOT = BASE_H + NECK_H;
const BW = 0.51, BH = 0.43, FRONT = 0.2, BLOCK = 0.105, DEPTH = 0.43;      // the case: wide, tall, where its face is, how deep its front block and the whole of it are
const SW = 0.40, SH = 0.30, SY = 0.235, RECESS = 0.034;                    // the glass: wide, tall, its middle above the pivot, how far it is set in
const TILT = 7 * Math.PI / 180;                                            // leaned back to face a seated player
const CRACKS = 8;
/** A letter shown on the screen: its size (a letter is half a metre wide) and its middle, from the head's pivot. */
const PANE = { scale: 0.72, at: new THREE.Vector3(0, SY, FRONT - 0.021) };
/** The front of the glass, where its cracks are: in front of the letter, behind the case's face. */
const FACE = FRONT - 0.006;
/** For letters.ts: a blow anywhere in the case counts, this far behind the letter and this far past its edges. */
export const CRT_BOX = { behind: DEPTH, margin: 0.075 };
/** How it feels: change these after a try on the headset. */
export const crtTune = {
  spring: 140, damping: 9,       // the head on its stand: how hard it comes back, how soon it settles
  kick: 10,                      // how far a blow rocks it
  dent: 0.016,                   // metres a hard blow pushes the plastic in
  hitsToWreck: 14,               // blows from new to as battered as it gets
  zeroSeconds: 1.0,              // INBOX ZERO stays up this long before it switches off
};

const rect8 = (w: number, h: number, c: number, cy: number, z: number): P3[] => [
  [-w / 2 + c, cy - h / 2, z], [w / 2 - c, cy - h / 2, z], [w / 2, cy - h / 2 + c, z], [w / 2, cy + h / 2 - c, z],
  [w / 2 - c, cy + h / 2, z], [-w / 2 + c, cy + h / 2, z], [-w / 2, cy + h / 2 - c, z], [-w / 2, cy - h / 2 + c, z]];
const flat8 = (w: number, d: number, c: number, y: number): P3[] => rect8(w, d, c, 0, 0).map(([x, z]) => [x, y, z] as P3);

function buildCase() {
  const head = new Soup(), stand = new Soup();
  const face = '#f2d2ad', body = '#ecc9a3', taper = '#e3bf99', dark = '#d6b18b', lip = '#35504a', slot = '#5b4636';
  // the front: a chamfered face with the screen's opening in it, and the dark lip down to the glass
  const F = rect8(BW - 0.03, BH - 0.03, 0.022, BH / 2, FRONT), S = rect8(BW, BH, 0.03, BH / 2, FRONT - 0.015);
  const O = rect8(SW + 0.034, SH + 0.034, 0.03, SY, FRONT), R = rect8(SW, SH, 0.018, SY, FRONT - RECESS);
  head.paint(face).band(O, F).paint(lip).band(R, O).paint(body).band(F, S);
  // the front block, a step in, and the tube's housing narrowing to the back
  const B1 = rect8(BW, BH, 0.03, BH / 2, FRONT - BLOCK), B2 = rect8(BW - 0.05, BH - 0.05, 0.03, BH / 2, FRONT - BLOCK - 0.014);
  const B3 = rect8(0.31, 0.27, 0.05, BH / 2 - 0.012, FRONT - DEPTH + 0.03), B4 = rect8(0.25, 0.21, 0.04, BH / 2 - 0.012, FRONT - DEPTH);
  head.band(S, B1).paint(dark).band(B1, B2).paint(taper).band(B2, B3).paint(dark).band(B3, B4).fan(B4);
  const plate = (x0: number, y0: number, x1: number, y1: number, z: number) => head.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]);
  // under the screen: a grille, three buttons, the light's bezel
  head.paint(slot);
  for (let i = 0; i < 7; i++) plate(-0.215 + i * 0.011, 0.024, -0.209 + i * 0.011, 0.052, FRONT + 0.001);
  plate(0.186, 0.027, 0.212, 0.049, FRONT + 0.001);
  head.paint('#dcb891');
  for (const x of [0.085, 0.115, 0.145]) head.block(x, 0.038, FRONT + 0.003, 0.021, 0.016, 0.006, 0.002);
  // slits along the top of the housing, and two rows of them on the back
  head.paint(slot);
  const y2 = BH / 2 + (BH - 0.05) / 2, z2 = FRONT - BLOCK - 0.014, y3 = BH / 2 - 0.012 + 0.135, z3 = FRONT - DEPTH + 0.03;
  const on = (x: number, t: number): P3 => [x, y2 + (y3 - y2) * t + 0.002, z2 + (z3 - z2) * t];
  for (let i = 0; i < 9; i++) { const x = (i - 4) * 0.026; head.quad(on(x - 0.007, 0.12), on(x + 0.007, 0.12), on(x + 0.007, 0.5), on(x - 0.007, 0.5)); }
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { const y = BH / 2 + 0.03 + i * 0.016; head.quad([side * 0.02, y, FRONT - DEPTH - 0.001], [side * 0.1, y, FRONT - DEPTH - 0.001], [side * 0.1, y + 0.007, FRONT - DEPTH - 0.001], [side * 0.02, y + 0.007, FRONT - DEPTH - 0.001]); }
  // the stand: a wide foot with its edges taken off, and a short neck
  const foot = flat8(0.31, 0.27, 0.05, 0), mid = flat8(0.31, 0.27, 0.05, BASE_H - 0.012), top = flat8(0.27, 0.23, 0.045, BASE_H);
  stand.paint(dark).fan(foot).band(foot, mid).paint(body).band(mid, top).fan(top);
  stand.paint('#cfa983').lathe([[0.092, BASE_H], [0.076, PIVOT + 0.006]], 10);
  return { head: head.geometry(), stand: stand.geometry() };
}

// ---------------------------------------------------------------- what is on the screen

const UI_W = 512, UI_H = 384, INK = '#0a3a2b', DEEP = '#0f4d3a', BAR = '#63d6ab';
function pixel(g: CanvasRenderingContext2D, text: string, x: number, yMid: number, cell: number, colour: string, align: 'left' | 'center' | 'right' = 'left') {
  const upper = text.toUpperCase(), wide = PixelFont.width(upper, cell);
  const left = Math.round(align === 'center' ? x - wide / 2 : align === 'right' ? x - wide : x), top = Math.round(yMid - PixelFont.Rows * cell / 2);
  g.fillStyle = colour; PixelFont.cells(upper, left, top, cell, (cx, cy, cw, ch) => g.fillRect(cx, cy, cw, ch));
}
function envelope(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string, line: number) {
  g.strokeStyle = colour; g.lineWidth = line; g.lineJoin = 'miter';
  g.strokeRect(x, y, w, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + w / 2, y + h * 0.55); g.lineTo(x + w, y); g.stroke();
}
/** The desktop behind the email: a menu bar, a status bar with the count, and in between whatever there is to say. */
function drawScreen(g: CanvasRenderingContext2D, mode: 'boot' | 'inbox' | 'zero', round: number, total: number, left: number, beat: number) {
  const glass = g.createLinearGradient(0, 0, 0, UI_H); glass.addColorStop(0, '#a9f9d8'); glass.addColorStop(1, '#7eedc2');
  g.fillStyle = glass; g.fillRect(0, 0, UI_W, UI_H);
  // (the bars are the eighth of the screen above and below where an email sits)
  g.fillStyle = BAR; g.fillRect(0, 0, UI_W, 46); g.fillRect(0, UI_H - 46, UI_W, 46);
  g.fillStyle = DEEP; g.fillRect(0, 44, UI_W, 4); g.fillRect(0, UI_H - 48, UI_W, 4);
  envelope(g, 16, 13, 30, 20, INK, 3);
  pixel(g, 'MAIL', 58, 23, 3, INK); pixel(g, 'FILE  EDIT  VIEW', 142, 23, 3, '#1c7a5c');
  pixel(g, `ROUND ${round}`, UI_W - 16, 23, 3, INK, 'right');
  const what = round === 2 ? 'TO ANSWER' : 'UNREAD';
  pixel(g, mode === 'boot' ? 'STARTING' : `${left} ${what}`, 16, UI_H - 23, 3, INK);
  pixel(g, mode === 'zero' ? 'ALL DONE' : 'ONLINE', UI_W - 16, UI_H - 23, 3, '#1c7a5c', 'right');
  const mid = UI_H / 2;
  if (mode === 'boot') {
    // starting up: the count, and a bar that fills as the countdown goes
    envelope(g, UI_W / 2 - 46, mid - 108, 92, 62, INK, 7);
    pixel(g, `${total} ${what}`, UI_W / 2, mid + 8, 6, INK, 'center');
    g.strokeStyle = DEEP; g.lineWidth = 4; g.strokeRect(UI_W / 2 - 150, mid + 56, 300, 28);
    g.fillStyle = INK; for (let i = 0; i < Math.min(12, Math.max(0, beat) * 3); i++) g.fillRect(UI_W / 2 - 144 + i * 24.2, mid + 62, 20, 16);
  } else if (mode === 'zero') {
    pixel(g, 'INBOX ZERO', UI_W / 2, mid - 14, 8, INK, 'center');
    g.fillStyle = DEEP; g.fillRect(UI_W / 2 - 150, mid + 30, 300, 4);
    pixel(g, 'NOTHING LEFT', UI_W / 2, mid + 62, 4, '#1c7a5c', 'center');
  } else {
    // between emails: an empty window waiting
    g.globalAlpha = 0.35; envelope(g, UI_W / 2 - 52, mid - 36, 104, 72, DEEP, 8); g.globalAlpha = 1;
  }
}

const crackGlsl = /* glsl */ `
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      // One blow: c.xy where it landed, c.z its seed, c.w how hard. x: the cracks' lines, y: the crazed glass round it.
      vec2 crack(vec2 uv, vec4 c){
        if(c.w<=0.) return vec2(0.);
        vec2 rel=(uv-c.xy)*vec2(${(SW / SH).toFixed(4)},1.);
        float r=length(rel), a=atan(rel.y,rel.x), n=7.;
        float u=a*n/6.28318+c.z*10., k=floor(u);
        // spokes, each a little off its place, a little crooked, each its own length
        float off=(u-k-.5-(hash(vec2(k,c.z*91.))-.5)*.6)*6.28318/n+.05*sin(r*46.+k*3.);
        float reach=c.w*(.13+.34*hash(vec2(k+7.,c.z*53.)));
        float width=.0032+.004*r;
        float line=(1.-smoothstep(0.,width,r*abs(sin(off))))*(1.-smoothstep(reach*.85,reach,r));
        // two broken rings joining them, at a different distance in each gap between spokes
        float ring=c.w*(.045+.04*hash(vec2(k,c.z*17.)));
        line=max(line,(1.-smoothstep(0.,width,abs(r-ring)))*step(.3,hash(vec2(k+3.,c.z*29.))));
        line=max(line,(1.-smoothstep(0.,width,abs(r-ring*2.3)))*step(.55,hash(vec2(k+11.,c.z*37.))));
        // and where it landed, crushed white
        line=max(line,1.-smoothstep(.006,.018,r/c.w));
        return vec2(line,(1.-smoothstep(0.,.16*c.w,r)));
      }
`;

/**
 * The front of the glass, drawn over the email: the cracks, the crazing round each blow, rows of the
 * picture that have died, the static a blow throws across it, and its flash.
 */
function faceMaterial(cracks: { value: THREE.Vector4[] }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { cracks, time: { value: 0 }, glitch: { value: 0 }, damage: { value: 0 }, flash: { value: 0 }, room: { value: 1 }, lit: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform float time,glitch,damage,flash,room,lit; uniform vec4 cracks[${CRACKS}]; varying vec2 vUv;
      ${crackGlsl}
      vec3 c=vec3(0.); float a=0.;
      void over(vec3 colour, float alpha){ alpha=clamp(alpha,0.,1.); c=c*(1.-alpha)+colour*alpha; a=a+alpha*(1.-a); }
      void main(){
        vec2 uv=vUv, hurt=vec2(0.);
        for(int i=0;i<${CRACKS};i++){ vec2 one=crack(uv,cracks[i]); hurt=vec2(max(hurt.x,one.x),hurt.y+one.y*cracks[i].w); }
        float tick=floor(time*24.), row=floor(uv.y*28.), line=floor(uv.y*46.);
        float snow=hash(uv*vec2(310.,240.)+tick*7.3);
        // rows that have died, more as it is beaten (never so many that the email cannot be read)
        over(vec3(.01,.05,.04),lit*.5*step(hash(vec2(line,3.)),damage*.16)*(.5+.5*step(.4,hash(vec2(line,floor(time*6.))))));
        // a blow throws static across the picture, in torn bands
        over(vec3(.55,1.,.8)*snow,lit*glitch*(.3+.45*step(.5,hash(vec2(row*1.7,tick+3.)))));
        over(vec3(.5,.62,.58)*(.3+.7*room),clamp(hurt.y,0.,1.)*.16);
        over(vec3(.82,.97,.92)*(.35+.65*room)+vec3(.2,.5,.4)*lit,hurt.x*.8);
        over(vec3(.75,1.,.9),flash);
        gl_FragColor=vec4(c/max(a,1e-4),a);
        #include <colorspace_fragment>
      }`,
  });
}

function glassMaterial(ui: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ui: { value: ui }, time: { value: 0 }, collapse: { value: 1 }, warm: { value: 0 }, glitch: { value: 0 }, damage: { value: 0 }, flash: { value: 0 }, room: { value: 1 },
      cracks: { value: Array.from({ length: CRACKS }, () => new THREE.Vector4()) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D ui; uniform float time,collapse,warm,glitch,damage,flash,room; uniform vec4 cracks[${CRACKS}]; varying vec2 vUv;
      ${crackGlsl}
      void main(){
        vec2 uv=vUv;
        // switched off, the picture closes to a line and the line to a dot
        float sy=mix(1.,.012,smoothstep(0.,.5,collapse)), sx=mix(1.,.012,smoothstep(.45,.85,collapse));
        vec2 q=(uv-.5)/vec2(sx,sy)+.5;
        // a blow tears rows of it sideways for a moment; a battered tube never holds quite still again
        float row=floor(uv.y*28.), tick=floor(time*24.);
        float tear=(hash(vec2(row,tick))-.5)*step(.5,hash(vec2(row*1.7,tick+3.)));
        q.x+=tear*glitch*.24+damage*.004*sin(uv.y*40.+time*9.);
        q.y+=glitch*.05*sin(time*50.);
        float inside=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);
        float split=.004*(glitch*2.+damage);
        vec3 pic=vec3(texture2D(ui,q+vec2(split,0.)).r,texture2D(ui,q).g,texture2D(ui,q-vec2(split,0.)).b);
        float snow=hash(uv*vec2(310.,240.)+tick*7.3);
        pic=mix(pic,vec3(.55,1.,.8)*snow,clamp(glitch*.75,0.,.85));
        // rows that have died, more as it is beaten
        float line=floor(uv.y*46.);
        pic*=1.-.6*step(hash(vec2(line,3.)),damage*.2)*(.5+.5*step(.4,hash(vec2(line,floor(time*6.)))));
        // scan lines (soft: fine ones shimmer in a headset), the refresh rolling down, the tube's dim corners
        pic*=.95+.05*sin(uv.y*603.);
        pic*=1.+.07*exp(-pow(fract(uv.y*.5-time*.21)-.5,2.)*90.);
        vec2 e=(uv-.5)*2.; pic*=1.-.2*dot(e*e,e*e);
        float dropout=1.-damage*.3*step(.93,hash(vec2(floor(time*14.),5.)));
        float closing=smoothstep(.08,.5,collapse);
        pic=mix(pic,vec3(.75,1.,.9),closing);
        pic*=inside*warm*dropout*(1.+.03*sin(time*38.))*(1.+2.5*closing)*(1.-smoothstep(.82,1.,collapse));
        // the glass itself: dark, with the strip lights lying across it
        vec3 glass=vec3(.03,.055,.05)*(.4+room);
        float lie=uv.y+uv.x*.35;
        glass+=vec3(.85,1.,.98)*smoothstep(.62,.68,lie)*(1.-smoothstep(.7,.9,lie))*.075*(.25+room);
        vec3 col=glass+pic;
        vec2 hurt=vec2(0.);
        for(int i=0;i<${CRACKS};i++){ vec2 one=crack(uv,cracks[i]); hurt=vec2(max(hurt.x,one.x),hurt.y+one.y*cracks[i].w); }
        // round a blow the picture is stained (a magnet has been at it), the glass crazed, and the cracks catch the light
        float stain=clamp(hurt.y,0.,1.);
        col=mix(col,col.brg*vec3(1.15,.8,1.25),stain*.55);
        col=mix(col,vec3(.5,.62,.58)*(.3+.7*room)+pic*.35,stain*.16);
        col+=(vec3(.8,.95,.9)*(.3+.7*room)+pic*.5)*hurt.x*.85;
        col+=vec3(.75,1.,.9)*flash;
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`,
  });
}

export function createCrt(context: StageContext) {
  const group = new THREE.Group(); group.name = 'CRT monitor';
  const root = new THREE.Group(); root.name = 'Monitor on its stand'; group.add(root);
  const head = new THREE.Group(); head.name = 'Monitor head'; head.position.y = PIVOT; root.add(head);

  const shapes = buildCase();
  const environment = propEnvironment(context.renderer, [[0, '#f6f8fc'], [0.45, '#d5dbe8'], [0.55, '#8f96a8'], [1, '#69738d']], [[20, 8, 70, 10, '#ffffff'], [150, 14, 60, 8, '#ffffff']]);
  const plastic = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, envMap: environment.texture, envMapIntensity: 0.3 });
  const shell = new THREE.Mesh(shapes.head, plastic); shell.name = 'Beige case'; head.add(shell);
  const stand = new THREE.Mesh(shapes.stand, plastic); stand.name = 'Tilt stand'; root.add(stand);
  // (for dents and scorches: the case as it left the factory)
  const points = shapes.head.getAttribute('position') as THREE.BufferAttribute, colours = shapes.head.getAttribute('color') as THREE.BufferAttribute;
  const newPoints = Float32Array.from(points.array), newColours = Float32Array.from(colours.array);

  // the screen
  const canvas = document.createElement('canvas'); canvas.width = UI_W; canvas.height = UI_H;
  const g = canvas.getContext('2d')!;
  const ui = new THREE.CanvasTexture(canvas); ui.colorSpace = THREE.SRGBColorSpace; ui.anisotropy = 4;
  const glassGeometry = new THREE.PlaneGeometry(SW + 0.004, SH + 0.004, 10, 8);
  { const p = glassGeometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, x, y + SY, FRONT - RECESS + 0.001 + 0.006 * Math.max(0, 1 - (2 * x / SW) ** 2) * Math.max(0, 1 - (2 * y / SH) ** 2)); } }
  const glass = glassMaterial(ui), gu = glass.uniforms;
  const tube = new THREE.Mesh(glassGeometry, glass); tube.name = 'Screen'; head.add(tube);
  const face = faceMaterial(gu.cracks as { value: THREE.Vector4[] }), fu = face.uniforms;
  const faceGeometry = new THREE.PlaneGeometry(SW, SH).translate(0, SY, FACE);
  const front = new THREE.Mesh(faceGeometry, face); front.name = 'Front of the glass: cracks'; front.renderOrder = 3; head.add(front);
  // the power light, bottom right
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#3a3a30', toneMapped: false });
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.004), lightMaterial); light.name = 'Power light'; light.position.set(0.199, 0.038, FRONT + 0.003); head.add(light);
  // its shadow on the desk
  const blot = document.createElement('canvas'); blot.width = blot.height = 64;
  { const b = blot.getContext('2d')!, fall = b.createRadialGradient(32, 32, 4, 32, 32, 32); fall.addColorStop(0, 'rgba(0,0,0,1)'); fall.addColorStop(0.55, 'rgba(0,0,0,.55)'); fall.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = fall; b.fillRect(0, 0, 64, 64); }
  const blotMap = new THREE.CanvasTexture(blot);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: blotMap, color: '#1a1420', transparent: true, depthWrite: false, opacity: 0.4 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.7).rotateX(-Math.PI / 2), shadowMaterial); shadow.name = 'Monitor shadow'; shadow.position.set(0, 0.002, -0.03); shadow.renderOrder = -2; root.add(shadow);
  // sparks, bits of glass and smoke: in the room, not on the monitor
  const sparks = createPuffs(96, 'spark', '#fff1b0'), shards = createPuffs(48, 'shard', '#d8fff0'), smoke = createPuffs(36, 'smoke', '#8f8a86');
  group.add(sparks.points, shards.points, smoke.points);

  // ---------------------------------------------------------------- its state

  const swing = { angle: new THREE.Vector3(), speed: new THREE.Vector3(), rest: new THREE.Vector3(), shove: 0, shoveSpeed: 0 };
  let clock = 0, hits = 0, damage = 0, glitch = 0, flash = 0, on = false, collapse = 1, warm = 0, zero = 0, drawn = '', smokeDue = 0, crackle = 2, nextCrack = 0;
  let phase: RoundProgress['phase'] = 'ready', round = 1, blade: BladeTracker | undefined;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), m1 = new THREE.Matrix4(), tint = new THREE.Color();
  const rand = (spread: number) => (Math.random() - 0.5) * 2 * spread;
  const world = (x: number, y: number, z: number, out: THREE.Vector3) => out.set(x, y, z).applyMatrix4(head.matrixWorld);

  function show(mode: 'boot' | 'inbox' | 'zero', total: number, left: number, beat: number) {
    const key = `${mode} ${round} ${total} ${left} ${mode === 'boot' ? beat : 0}`;
    if (key === drawn) return;
    drawn = key; drawScreen(g, mode, round, total, left, beat); ui.needsUpdate = true;
  }
  function power(next: boolean) {
    if (next === on) return;
    on = next;
    head.updateWorldMatrix(true, false);
    const at = world(0, SY, FRONT, v1);
    context.play(next ? 'crton' : 'crtoff', 0.97 + Math.random() * 0.06, 0.7, at);
    if (next) warm = 0;
    else if (damage > 0.25) {
      // a battered one goes out with a bang
      for (let i = 0; i < 18; i++) sparks.emit(world(rand(SW / 2), SY + rand(SH / 2), FRONT, v2), v3.set(rand(1.2), 0.6 + Math.random() * 1.4, 0.6 + Math.random() * 1.2), 0.3 + Math.random() * 0.4, 0.7 + Math.random());
      for (let i = 0; i < 8; i++) smoke.emit(world(rand(0.12), BH - 0.03, rand(0.08) - 0.02, v2), v3.set(rand(0.08), 0.25 + Math.random() * 0.2, rand(0.05)), 1.8 + Math.random(), 0.8 + Math.random() * 0.6);
    }
  }
  /** A new day, a new monitor. */
  function repair() {
    hits = 0; damage = 0; nextCrack = 0; glitch = 0;
    for (const crack of gu.cracks.value as THREE.Vector4[]) crack.set(0, 0, 0, 0);
    (points.array as Float32Array).set(newPoints); (colours.array as Float32Array).set(newColours); points.needsUpdate = true; colours.needsUpdate = true;
    swing.rest.set(0, 0, 0);
  }

  /**
   * A blow that deleted the email on the screen. Where the keyboard is and how it is moving is
   * read from the blade; with none (a key on a monitor), it lands somewhere on the glass.
   */
  function strike() {
    head.updateWorldMatrix(true, false);
    m1.copy(head.matrixWorld).invert();
    const at = v1.set(rand(SW * 0.3), SY + rand(SH * 0.3), FRONT), way = v2.set(rand(0.3), rand(0.3), -1);
    let strength = 0.6;
    if (blade?.moving && blade.speed > 0.4) {
      const base = v3.copy(blade.base).applyMatrix4(m1), tip = at.copy(blade.tip).applyMatrix4(m1);
      // where the keyboard's line meets the glass (it reaches on past its end), else where its end is
      const t = (FACE - base.z) / (tip.z - base.z);
      if (Number.isFinite(t) && t > 0 && t < 4) at.lerpVectors(base, tip, t);
      way.copy(blade.velocity).transformDirection(m1);
      strength = 0.35 + 0.65 * Math.min(1, Math.max(0, (blade.speed - 1) / 6));
    }
    way.normalize();
    hits++; damage = Math.min(1, hits / crtTune.hitsToWreck);
    // the glass cracks where it landed (the nearest place on the glass, for a blow on the case)
    const gx = Math.max(-SW / 2 + 0.02, Math.min(SW / 2 - 0.02, at.x)), gy = Math.max(SY - SH / 2 + 0.02, Math.min(SY + SH / 2 - 0.02, at.y));
    const onGlass = Math.abs(at.x - gx) < 0.03 && Math.abs(at.y - gy) < 0.03 && at.z > FRONT - 0.12;
    (gu.cracks.value as THREE.Vector4[])[nextCrack++ % CRACKS].set(gx / SW + 0.5, (gy - SY) / SH + 0.5, Math.random(), (onGlass ? 0.5 : 0.3) + 0.4 * strength);
    glitch = 1; flash = 0.55 + 0.3 * strength;
    // the plastic gives where it was hit, and is left marked
    const cx = Math.max(-BW / 2, Math.min(BW / 2, at.x)), cy = Math.max(0, Math.min(BH, at.y)), cz = Math.max(FRONT - DEPTH, Math.min(FRONT, at.z));
    const reach = 0.15, deep = crtTune.dent * (0.5 + strength), p = points.array as Float32Array, c = colours.array as Float32Array;
    for (let i = 0; i < p.length; i += 3) {
      const d = Math.hypot(p[i] - cx, p[i + 1] - cy, p[i + 2] - cz);
      if (d > reach) continue;
      const f = (1 - d / reach) ** 2;
      p[i] += way.x * deep * f; p[i + 1] += way.y * deep * f; p[i + 2] += way.z * deep * f;
      // (never more than a couple of centimetres from where it was made, however often it is hit there)
      const ox = p[i] - newPoints[i], oy = p[i + 1] - newPoints[i + 1], oz = p[i + 2] - newPoints[i + 2], far = Math.hypot(ox, oy, oz);
      if (far > 0.024) { const k = 0.024 / far; p[i] = newPoints[i] + ox * k; p[i + 1] = newPoints[i + 1] + oy * k; p[i + 2] = newPoints[i + 2] + oz * k; }
      // (scorched, but never black: it is still a beige monitor at the end)
      const soot = 1 - 0.3 * f;
      c[i] = Math.max(newColours[i] * 0.5, c[i] * soot); c[i + 1] = Math.max(newColours[i + 1] * 0.47, c[i + 1] * soot * 0.97); c[i + 2] = Math.max(newColours[i + 2] * 0.44, c[i + 2] * soot * 0.95);
    }
    points.needsUpdate = true; colours.needsUpdate = true;
    // it rocks on its stand, the way the blow turns it, and is left a little more askew
    const turn = v3.set(cx, cy, cz).cross(way).multiplyScalar(crtTune.kick * (0.5 + strength));
    swing.speed.add(turn); swing.shoveSpeed += 0.5 + 0.9 * strength;
    swing.rest.x = Math.max(-0.07, swing.rest.x - 0.005 - 0.004 * Math.random());
    swing.rest.y = Math.max(-0.13, Math.min(0.13, swing.rest.y + turn.y * 0.012 + rand(0.012)));
    swing.rest.z = Math.max(-0.06, Math.min(0.06, swing.rest.z + rand(0.014)));
    // sparks and bits of glass out of the front
    const from = world(gx, gy, FRONT - 0.01, v1), out = v2.set(0, 0, 1).transformDirection(head.matrixWorld);
    for (let i = 0, n = 10 + Math.round(14 * strength + 10 * damage); i < n; i++)
      sparks.emit(from, v3.set(rand(1.6), rand(1.4) + 0.6, rand(0.8)).addScaledVector(out, 0.6 + Math.random() * 1.6), 0.25 + Math.random() * 0.45, 0.6 + Math.random());
    for (let i = 0, n = 5 + Math.round(6 * strength); i < n; i++)
      shards.emit(from, v3.set(rand(1.1), rand(0.9) + 0.9, rand(0.5)).addScaledVector(out, 0.5 + Math.random() * 1.3), 0.6 + Math.random() * 0.5, 0.6 + Math.random() * 0.9);
    context.play('glass', 0.9 + Math.random() * 0.25, 0.45 + 0.4 * strength, from);
    if (damage > 0.45 && Math.random() < 0.6) context.play('zap', 0.9 + Math.random() * 0.3, 0.4, from);
    return strength;
  }

  function update(dt: number, c: { blend: number; pixelRatio: number; blade?: BladeTracker }) {
    clock += dt; blade = c.blade;
    // the head on its stand: a spring back to where it has been left, and a shove back along the desk
    const s = swing;
    s.speed.addScaledVector(v1.copy(s.angle), -crtTune.spring * dt).multiplyScalar(Math.exp(-crtTune.damping * dt));
    s.angle.addScaledVector(s.speed, dt).clampScalar(-0.3, 0.3);
    s.shoveSpeed += (-220 * s.shove - 17 * s.shoveSpeed) * dt; s.shove = Math.max(-0.01, Math.min(0.05, s.shove + s.shoveSpeed * dt));
    head.rotation.set(-TILT + s.rest.x + s.angle.x, s.rest.y + s.angle.y, s.rest.z + s.angle.z);
    head.position.set(0, PIVOT, -s.shove);
    // the picture
    collapse = on ? Math.max(0, collapse - dt / 0.4) : Math.min(1, collapse + dt / 0.55);
    warm = on ? Math.min(1, warm + dt / 0.9) : warm;
    glitch *= Math.exp(-dt * (5.5 - 3 * damage)); flash *= Math.exp(-dt * 12);
    gu.time.value = clock; gu.collapse.value = collapse; gu.warm.value = 0.25 + 0.75 * warm * warm; gu.glitch.value = Math.min(1, glitch + (damage > 0.6 && Math.random() < dt * 0.5 ? 0.35 : 0));
    gu.damage.value = damage; gu.flash.value = flash; gu.room.value = 1 - 0.65 * c.blend;
    if (gu.glitch.value > glitch) glitch = gu.glitch.value;
    fu.time.value = clock; fu.glitch.value = gu.glitch.value; fu.damage.value = damage; fu.flash.value = flash; fu.room.value = gu.room.value; fu.lit.value = 1 - Math.min(1, collapse * 2);
    // the power light: green, amber when it has taken a beating, red and blinking near the end
    const lit = collapse < 0.9;
    tint.set(!lit ? '#3a3a30' : damage < 0.45 ? '#7dff5a' : damage < 0.8 ? '#ffb23a' : Math.sin(clock * 14) > 0 ? '#ff4630' : '#5a1810');
    lightMaterial.color.copy(tint);
    shadowMaterial.opacity = 0.42 - 0.14 * c.blend;
    // smoke out of the vents once it is hurt, and now and then a crackle by itself
    head.updateWorldMatrix(true, false);
    if (damage > 0.35 && (smokeDue -= dt) < 0) {
      smokeDue = 0.5 - 0.38 * damage + Math.random() * 0.15;
      smoke.emit(world(rand(0.11), BH - 0.035, -0.02 + rand(0.07), v1), v2.set(rand(0.04), 0.16 + Math.random() * 0.12, rand(0.03)), 1.7 + Math.random() * 0.9, 0.5 + Math.random() * 0.5);
    }
    if (damage > 0.6 && lit && (crackle -= dt) < 0) {
      crackle = 1.2 + Math.random() * 3.5 * (1.4 - damage);
      const from = world(rand(BW / 2), rand(0.1) + BH * 0.6, FRONT - 0.05, v1);
      for (let i = 0; i < 7; i++) sparks.emit(from, v2.set(rand(0.9), 0.4 + Math.random() * 0.9, 0.3 + Math.random() * 0.7), 0.2 + Math.random() * 0.3, 0.5 + Math.random() * 0.6);
      context.play('zap', 1 + Math.random() * 0.4, 0.22, from); glitch = Math.max(glitch, 0.6);
    }
    sparks.update(dt, 4.5, 1.2, 0, c.pixelRatio, context.renderer); shards.update(dt, 6.5, 0.6, 0, c.pixelRatio, context.renderer); smoke.update(dt, -0.05, 0.6, 0.9, c.pixelRatio, context.renderer);
  }

  /** The rounds, every frame: on for a round, off when its last email is gone. */
  function game(p: RoundProgress, dt: number) {
    const fresh = p.phase !== phase; phase = p.phase; round = p.round;
    const left = Math.max(0, p.total - p.marks.length);
    if (p.phase === 'ready' || p.phase === 'summary') { power(false); zero = 0; return; }
    if (p.phase === 'intro') {
      if (fresh && p.round === 1) repair();
      show('boot', p.total, p.total, p.beat); power(true); zero = 0;
    } else if (left > 0 || p.total === 0) { show('inbox', p.total, left, 0); power(true); zero = 0; }
    else {
      // the last one is gone: it says so, and then it goes out
      if (zero === 0) show('zero', p.total, 0, 0);
      if ((zero += dt) > crtTune.zeroSeconds) power(false);
    }
  }

  return {
    group, root, update, game, strike,
    /** Where a letter shown on the screen is (world space); returns its size there. */
    pose(position: THREE.Vector3, quaternion: THREE.Quaternion) {
      head.updateWorldMatrix(true, false);
      position.copy(PANE.at).applyMatrix4(head.matrixWorld); head.getWorldQuaternion(quaternion);
      return PANE.scale;
    },
    /** How much light the screen is giving just now, 0 to about 1.5. */
    glow: () => (0.25 + 0.75 * warm * warm) * (1 - Math.min(1, collapse * 1.4)) * (1 - 0.5 * Math.min(1, glitch)) + flash,
    damage: () => damage,
    diagnostics: () => ({ on, collapse: +collapse.toFixed(2), hits, damage: +damage.toFixed(2), screen: drawn }),
    dispose() { shapes.head.dispose(); shapes.stand.dispose(); plastic.dispose(); environment.dispose(); glassGeometry.dispose(); glass.dispose(); faceGeometry.dispose(); face.dispose(); ui.dispose(); light.geometry.dispose(); lightMaterial.dispose(); shadow.geometry.dispose(); shadowMaterial.dispose(); blotMap.dispose(); sparks.dispose(); shards.dispose(); smoke.dispose(); },
  };
}
export type Crt = ReturnType<typeof createCrt>;
