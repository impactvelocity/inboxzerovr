import * as THREE from 'three';

/**
 * Meshes and materials shared by the game (Unity: Look.cs and the Neon, Unlit and Ink shaders).
 *
 * Everything here is built in Unity space, for a parent under `ctx.unity`: a quad faces -z,
 * toward the seat, with u running left to right as the player sees it. Triangle order is
 * Unity's (clockwise from the front); the mirrored group makes that three's front face.
 *
 * The materials are the ones `ctx.ui.material` cannot express: per-vertex colour and alpha for
 * the glows, paper and ink for the letters, premultiplied canvases for the labels. All of them
 * ignore fog and tone mapping and never write depth, as their Unity shaders do.
 */

// ---------------------------------------------------------------- meshes

function build(points: number[], indices: number[], colors?: number[], uvs?: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  if (colors !== undefined) geometry.setAttribute('vcolor', new THREE.Float32BufferAttribute(colors, 4));
  if (uvs !== undefined) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A flat rectangle facing -z. `pivotLeft` puts the origin on the left edge, for bars that grow
 * to the right. It carries white vertex colours too, so any material here can draw it.
 */
export function quad(width: number, height: number, pivotLeft = false): THREE.BufferGeometry {
  const x0 = pivotLeft ? 0 : -width / 2;
  const x1 = x0 + width;
  const y = height / 2;
  return build(
    [x0, -y, 0, x1, -y, 0, x0, y, 0, x1, y, 0],
    [0, 2, 1, 1, 2, 3],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0, 1, 1, 1],
  );
}

/** Collects glowing strokes: positions, RGBA and triangles. */
class Strokes {
  points: number[] = [];
  colors: number[] = [];
  triangles: number[] = [];

  /**
   * One stroke from a to b: `across` is the direction of its width, `offsets` the cross-section
   * and `alphas` the strength at each offset (white). `tail` scales the alpha at the b end.
   */
  stroke(ax: number, ay: number, bx: number, by: number, acrossX: number, acrossY: number, offsets: number[], alphas: number[], tail = 1): void {
    const first = this.points.length / 3;
    for (let i = 0; i < offsets.length; i++) {
      this.points.push(ax + acrossX * offsets[i], ay + acrossY * offsets[i], 0);
      this.colors.push(1, 1, 1, alphas[i]);
      this.points.push(bx + acrossX * offsets[i], by + acrossY * offsets[i], 0);
      this.colors.push(1, 1, 1, alphas[i] * tail);
    }
    for (let i = 0; i < offsets.length - 1; i++) {
      const k = first + i * 2;
      this.triangles.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }

  build(): THREE.BufferGeometry {
    return build(this.points, this.triangles, this.colors);
  }
}

/** Loops of points joined into bands. `rows[r]` is loop r as x, y pairs; `alphas[r]` its strength. */
function bands(rows: number[][], alphas: number[]): THREE.BufferGeometry {
  const points: number[] = [];
  const colors: number[] = [];
  const triangles: number[] = [];
  const n = rows[0].length / 2;
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < n; i++) {
      points.push(rows[r][i * 2], rows[r][i * 2 + 1], 0);
      colors.push(1, 1, 1, alphas[r]);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = a + n;
      const d = b + n;
      triangles.push(a, b, d, a, d, c);
    }
  }
  return build(points, triangles, colors);
}

/**
 * The glow around a rounded card: brightest on its edge, fading `inner` metres inward and
 * `halo` metres outward. White; tint it with the material.
 */
export function neonRoundRect(halfW: number, halfH: number, radius: number, inner: number, halo: number): THREE.BufferGeometry {
  const steps = 8;
  const cx = halfW - radius;
  const cy = halfH - radius;
  const centres = [cx, cy, -cx, cy, -cx, -cy, cx, -cy];
  const inside: number[] = [];
  const edge: number[] = [];
  const outside: number[] = [];
  for (let corner = 0; corner < 4; corner++) {
    for (let i = 0; i <= steps; i++) {
      const a = ((corner + i / steps) * Math.PI) / 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const ex = centres[corner * 2] + nx * radius;
      const ey = centres[corner * 2 + 1] + ny * radius;
      edge.push(ex, ey);
      inside.push(ex - nx * inner, ey - ny * inner);
      outside.push(ex + nx * halo, ey + ny * halo);
    }
  }
  return bands([inside, edge, outside], [0, 1, 0]);
}

/** A glowing circle outline of radius 1. White; scale and tint it. */
export function neonRing(core: number, halo: number, segments: number): THREE.BufferGeometry {
  const radii = [1 - halo, 1 - core / 2, 1 + core / 2, 1 + halo];
  const rows: number[][] = [[], [], [], []];
  for (let i = 0; i < segments; i++) {
    const a = (i * Math.PI * 2) / segments;
    for (let r = 0; r < 4; r++) rows[r].push(Math.cos(a) * radii[r], Math.sin(a) * radii[r]);
  }
  return bands(rows, [0, 1, 1, 0]);
}

/**
 * The flash of a cut: a bright line along X, one unit long, tapering to nothing at both ends.
 * White; scale and tint it.
 */
export function neonSlash(width: number): THREE.BufferGeometry {
  const s = new Strokes();
  s.stroke(0, 0, 0.5, 0, 0, 1, [-width, 0, width], [0, 1, 0], 0);
  s.stroke(0, 0, -0.5, 0, 0, 1, [-width, 0, width], [0, 1, 0], 0);
  return s.build();
}

/** A four-pointed star of light, one unit from tip to tip. White. */
export function twinkle(width: number): THREE.BufferGeometry {
  const s = new Strokes();
  const offsets = [-width, 0, width];
  const alphas = [0, 1, 0];
  s.stroke(0, 0, 0.5, 0, 0, 1, offsets, alphas, 0);
  s.stroke(0, 0, -0.5, 0, 0, 1, offsets, alphas, 0);
  s.stroke(0, 0, 0, 0.5, 1, 0, offsets, alphas, 0);
  s.stroke(0, 0, 0, -0.5, 1, 0, offsets, alphas, 0);
  return s.build();
}

/** A solid disc of radius 1. White; scale and tint it. */
export function hardDisc(segments: number): THREE.BufferGeometry {
  return disc(1, segments, 1);
}

/** A disc that is brightest in the middle and fades to nothing at the rim. */
export function softDisc(radius: number, segments: number): THREE.BufferGeometry {
  return disc(radius, segments, 0);
}

function disc(radius: number, segments: number, rimAlpha: number): THREE.BufferGeometry {
  const points = [0, 0, 0];
  const colors = [1, 1, 1, 1];
  const triangles: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i * Math.PI * 2) / segments;
    points.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    colors.push(1, 1, 1, rimAlpha);
    triangles.push(0, 1 + ((i + 1) % segments), 1 + i);
  }
  return build(points, triangles, colors);
}

// ------------------------------------------------------------- materials

const common = {
  fog: false,
  toneMapped: false,
  depthWrite: false,
  depthTest: true,
  transparent: true,
} as const;

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/**
 * Light (Unity: the Neon shader, and Sheer when `additive` is false). Brightness comes from the
 * `vcolor` attribute, so meshes carry their own soft edges; `tint` and `opacity` are the
 * material's colour. Additive leaves the framebuffer's alpha alone.
 */
export class GlowMaterial extends THREE.ShaderMaterial {
  constructor(additive = true) {
    super({
      ...common,
      side: THREE.DoubleSide,
      uniforms: { tint: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 vcolor;
        varying vec4 vTint;
        void main() {
          vTint = vcolor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 tint;
        uniform float opacity;
        varying vec4 vTint;
        void main() {
          gl_FragColor = vec4(vTint.rgb * tint, vTint.a * opacity);
          ${OUTPUT}
        }
      `,
    });
    if (additive) {
      this.blending = THREE.CustomBlending;
      this.blendEquation = THREE.AddEquation;
      this.blendSrc = THREE.SrcAlphaFactor;
      this.blendDst = THREE.OneFactor;
      this.blendSrcAlpha = THREE.ZeroFactor;
      this.blendDstAlpha = THREE.OneFactor;
    } else {
      this.blending = THREE.NormalBlending;
    }
  }

  /** The material colour, in linear working space (see color.ts: toLinear). */
  get tint(): THREE.Color {
    return this.uniforms.tint.value as THREE.Color;
  }

  setOpacity(value: number): void {
    this.uniforms.opacity.value = value;
  }
}

/**
 * A flat see-through colour that can be drawn many times over as an InstancedMesh (the joints
 * and bones of a tracked hand).
 */
export class SkinMaterial extends THREE.ShaderMaterial {
  constructor(color: THREE.Color, opacity: number) {
    super({
      ...common,
      side: THREE.DoubleSide,
      uniforms: { tint: { value: color }, opacity: { value: opacity } },
      vertexShader: /* glsl */ `
        void main() {
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 tint;
        uniform float opacity;
        void main() {
          gl_FragColor = vec4(tint, opacity);
          ${OUTPUT}
        }
      `,
    });
  }
}

/**
 * Shows a canvas painted by Painter (Unity: Look.Label). The texture arrives premultiplied and
 * still sRGB-encoded (see makeSurface); un-multiplying and decoding here, after the sampler has
 * filtered it, keeps text edges clean at any size.
 */
export class LabelMaterial extends THREE.ShaderMaterial {
  constructor(map: THREE.Texture) {
    super({
      ...common,
      side: THREE.DoubleSide,
      uniforms: { map: { value: map }, opacity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(map, vUv);
          if (t.a < 0.002) discard;
          vec3 painted = clamp(t.rgb / t.a, 0.0, 1.0);
          vec3 light = sRGBTransferEOTF(vec4(painted, 1.0)).rgb; // Unity's own number
          float a = t.a * opacity;
          // Unity lays a label over the scene in linear light; the game's layer here is blended
          // as encoded values, which makes faint fills (the block behind the countdown, the
          // glass of a chip) come out fainter and darker. Find the encoded colour and alpha
          // whose encoded blend equals the linear one over a dark (10%) and a mid (50%)
          // background. Solid pixels are untouched.
          const float B1 = 0.1, B2 = 0.5, E1 = 0.3492, E2 = 0.7354;
          vec3 over1 = sRGBTransferOETF(vec4(light * a + B1 * (1.0 - a), 1.0)).rgb;
          vec3 over2 = sRGBTransferOETF(vec4(light * a + B2 * (1.0 - a), 1.0)).rgb;
          float through = clamp(dot((over2 - over1) / (E2 - E1), vec3(1.0 / 3.0)), 0.0, 1.0);
          float a2 = 1.0 - through;
          vec3 c2 = a2 > 0.002 ? clamp((over1 - E1 * through) / a2, 0.0, 1.0) : painted;
          gl_FragColor = vec4(sRGBTransferEOTF(vec4(c2, 1.0)).rgb, a2);
          ${OUTPUT}
        }
      `,
    });
  }

  setOpacity(value: number): void {
    this.uniforms.opacity.value = value;
  }
}

export interface InkOptions {
  /** The Painter texture (an `ink` surface): light writing on dark glass. */
  map: THREE.Texture | null;
  /** The washi under the writing. */
  paperMap: THREE.Texture;
  /** True draws the sheet as well as the ink; false only the ink, for a window laid over a sheet. */
  paper: boolean;
  /** Unity's _Cull: Back for the letter (a closed shell), Off for flat things. */
  side: THREE.Side;
}

/**
 * An email on paper (Unity: Ink.shader). It reads the same drawing as a card of light would
 * (light writing on dark glass) and turns it into ink: the brighter the texel, the darker the
 * mark. Coloured labels keep a trace of their hue.
 *
 *   window > 0    show a window onto a tall texture that scrolls (offset), fading at the
 *                 window's top and bottom edges
 *   dissolve > 0  burn away in square cells, edged in `burn`: the halves of a cut letter
 *
 * Left out: Unity tints the sheet by a blurred panorama taken at the seat (KyotoEnv). The v2
 * courtyard never binds one, so there the tint is neutral; only the dimming with night is kept.
 */
export class InkMaterial extends THREE.ShaderMaterial {
  constructor(options: InkOptions) {
    super({
      ...common,
      side: options.side,
      blending: THREE.NormalBlending,
      uniforms: {
        map: { value: options.map },
        paperMap: { value: options.paperMap },
        paper: { value: options.paper ? 1 : 0 },
        sheet: { value: new THREE.Color().setRGB(0.96, 0.92, 0.83, THREE.SRGBColorSpace) },
        inkColor: { value: new THREE.Color().setRGB(0.1, 0.09, 0.13, THREE.SRGBColorSpace) },
        window: { value: 0 },
        offset: { value: 0 },
        edgeFade: { value: 0.14 },
        dissolve: { value: 0 },
        cells: { value: new THREE.Vector2(44, 28) },
        burn: { value: new THREE.Color(1, 0.5, 0.2) },
        night: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          // Uniform scale and a mirror: the model matrix turns normals as it turns points.
          vNormalW = mat3(modelMatrix) * normal;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform sampler2D paperMap;
        uniform float paper;
        uniform vec3 sheet;
        uniform vec3 inkColor;
        uniform float window;
        uniform float offset;
        uniform float edgeFade;
        uniform float dissolve;
        uniform vec2 cells;
        uniform vec3 burn;
        uniform float night;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vWorld;
        void main() {
          vec3 t;
          float fade = 1.0;
          if (window > 0.0) {
            // Top of the window first, the content moving up as offset grows (the map repeats).
            vec2 at = vec2(vUv.x, 1.0 - offset - (1.0 - vUv.y) * window);
            t = texture2D(map, at).rgb;
            fade = smoothstep(0.0, edgeFade, vUv.y) * smoothstep(0.0, edgeFade, 1.0 - vUv.y);
          } else {
            t = texture2D(map, vUv).rgb;
          }

          // Light writing becomes dark ink; the card's neon frame is left off.
          float bright = max(t.r, max(t.g, t.b));
          float dull = min(t.r, min(t.g, t.b));
          float ink = smoothstep(0.2, 0.62, bright);
          vec2 rim = min(vUv, 1.0 - vUv);
          ink *= smoothstep(0.018, 0.04, min(rim.x, rim.y * 1.6));
          float hue = clamp((bright - dull) * 1.6, 0.0, 1.0);
          vec3 inkColour = mix(inkColor, t * 0.42, hue * 0.85);
          ink *= fade;

          vec4 c;
          if (paper > 0.5) {
            // The sheet: washi, shaded a little by its folds, cooler as night comes. A flat
            // piece has no normals; it is simply lit evenly.
            vec3 n = dot(vNormalW, vNormalW) > 0.01 ? normalize(vNormalW) : vec3(0.0, 0.0, 1.0);
            if (dot(n, vWorld - cameraPosition) > 0.0) n = -n;
            n.z = -n.z; // three's world to Unity's
            float shade = 0.9 + 0.1 * clamp(dot(n, normalize(vec3(-0.35, 0.5, -0.8))), 0.0, 1.0) + 0.06 * n.y;
            vec3 washi = sheet * texture2D(paperMap, vUv).rgb / 0.94 * shade;
            washi *= mix(1.0, 0.9, night);
            c = vec4(mix(washi, inkColour, ink), 1.0);
          } else {
            c = vec4(inkColour, ink);
          }

          if (dissolve > 0.0) {
            vec2 cell = floor(vUv * cells);
            float n2 = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
            if (n2 < dissolve) discard;
            if (n2 < dissolve + 0.12) c = vec4(burn, 1.0);
          }
          gl_FragColor = c;
          ${OUTPUT}
        }
      `,
    });
  }

  /** The drawing to ink (not called `map`: three reads that name on any material). */
  set face(texture: THREE.Texture | null) {
    this.uniforms.map.value = texture;
  }

  get face(): THREE.Texture | null {
    return this.uniforms.map.value as THREE.Texture | null;
  }

  get burn(): THREE.Color {
    return this.uniforms.burn.value as THREE.Color;
  }

  set night(value: number) {
    this.uniforms.night.value = value;
  }

  set window(value: number) {
    this.uniforms.window.value = value;
  }

  set offset(value: number) {
    this.uniforms.offset.value = value;
  }

  set dissolve(value: number) {
    this.uniforms.dissolve.value = value;
  }
}
