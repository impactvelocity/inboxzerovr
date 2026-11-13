import * as THREE from 'three';

/**
 * What the three held weapons are built from (keyboard.ts, knightsword.ts, sprayer.ts): a soup of
 * flat-shaded triangles with a colour and a "glow" weight on every corner, a few faceted shapes to
 * pour into it, and the small shader addition that lets the glow weight light the model up while
 * its trigger is held. Everything a weapon does not need to move ends up in one soup, one draw.
 *
 * Triangles are drawn from both sides and shaded flat from the screen, so which way round a
 * triangle is wound never matters here.
 */
export type P3 = [number, number, number];
export type P2 = [number, number];

export class Soup {
  readonly position: number[] = [];
  readonly color: number[] = [];
  readonly glow: number[] = [];
  private matrix: THREE.Matrix4 | null = null;
  private readonly v = new THREE.Vector3();
  private c = new THREE.Color('#ffffff');
  private g = 0;

  /** From here on, everything added is moved by `matrix` (null: left where it is given). */
  place(matrix: THREE.Matrix4 | null) { this.matrix = matrix; return this; }
  /** From here on, everything added is this colour, with this much glow (0 none, 1 full). */
  paint(colour: THREE.ColorRepresentation, glow = 0) { this.c = new THREE.Color(colour); this.g = glow; return this; }
  get triangles() { return this.position.length / 9; }

  private corner(p: P3, colour: THREE.Color, glow: number) {
    this.v.set(p[0], p[1], p[2]);
    if (this.matrix) this.v.applyMatrix4(this.matrix);
    this.position.push(this.v.x, this.v.y, this.v.z);
    this.color.push(colour.r, colour.g, colour.b);
    this.glow.push(glow);
  }
  /** One triangle. `colours` and `glows` override the current paint corner by corner. */
  tri(a: P3, b: P3, c: P3, colours?: THREE.Color[], glows?: number[]) {
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) this.corner(pts[i], colours?.[i] ?? this.c, glows?.[i] ?? this.g);
    return this;
  }
  /** A four-sided face, corners in order round it. */
  quad(a: P3, b: P3, c: P3, d: P3, colours?: THREE.Color[], glows?: number[]) {
    this.tri(a, b, c, colours && [colours[0], colours[1], colours[2]], glows && [glows[0], glows[1], glows[2]]);
    this.tri(a, c, d, colours && [colours[0], colours[2], colours[3]], glows && [glows[0], glows[2], glows[3]]);
    return this;
  }
  /** A flat face with any number of corners in order round it (it must not be dented). */
  fan(points: P3[]) { for (let i = 1; i < points.length - 1; i++) this.tri(points[0], points[i], points[i + 1]); return this; }

  /** Two rings of the same number of points, joined by a band of faces all the way round. */
  band(lower: P3[], upper: P3[]) {
    for (let i = 0; i < lower.length; i++) { const j = (i + 1) % lower.length; this.quad(lower[i], lower[j], upper[j], upper[i]); }
    return this;
  }

  /**
   * A faceted shape turned about +Y: `profile` is [radius, height] from one end to the other. A
   * radius of 0 closes that end. `squash` flattens it along z.
   */
  lathe(profile: P2[], sides: number, phase = 0, squash = 1) {
    const ring = (r: number, h: number): P3[] => Array.from({ length: sides }, (_, i) => {
      const a = phase + i / sides * Math.PI * 2; return [Math.cos(a) * r, h, Math.sin(a) * r * squash] as P3;
    });
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, h0] = profile[k], [r1, h1] = profile[k + 1];
      if (r0 <= 0 && r1 <= 0) continue;
      if (r0 <= 0) this.fan(ring(r1, h1));
      else if (r1 <= 0) this.fan(ring(r0, h0));
      else this.band(ring(r0, h0), ring(r1, h1));
    }
    return this;
  }

  /**
   * A slab cut to `profile` (points [z, y], in order round it) and as thick as 2 * halfWidth along
   * x, with its edges taken off: the two side faces are the profile drawn in by `inset`, and they
   * meet the full profile `chamfer` in from each side. A chunky, faceted hull.
   */
  hull(profile: P2[], halfWidth: number, chamfer: number, inset: number) {
    const small = insetPolygon(profile, inset);
    const at = (points: P2[], x: number): P3[] => points.map(([z, y]) => [x, y, z] as P3);
    const w = halfWidth, c = Math.min(chamfer, halfWidth);
    this.band(at(small, -w), at(profile, -w + c));
    if (w - c > 1e-6) this.band(at(profile, -w + c), at(profile, w - c));
    this.band(at(profile, w - c), at(small, w));
    const faces = THREE.ShapeUtils.triangulateShape(small.map(([z, y]) => new THREE.Vector2(z, y)), []);
    for (const x of [-w, w]) { const ring = at(small, x); for (const [i, j, k] of faces) this.tri(ring[i], ring[j], ring[k]); }
    return this;
  }

  /** A box with every edge taken off by `chamfer`: centre, then size along x, y, z. */
  block(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, chamfer: number) {
    const c = Math.min(chamfer, sy / 2 - 1e-5, sz / 2 - 1e-5), y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const profile: P2[] = [[z0 + c, y0], [z1 - c, y0], [z1, y0 + c], [z1, y1 - c], [z1 - c, y1], [z0 + c, y1], [z0, y1 - c], [z0, y0 + c]];
    const before = this.matrix;
    const shift = new THREE.Matrix4().makeTranslation(cx, 0, 0);
    this.matrix = before ? before.clone().multiply(shift) : shift;
    this.hull(profile, sx / 2, c, c);
    this.matrix = before;
    return this;
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.setAttribute('glow', new THREE.Float32BufferAttribute(this.glow, 1));
    geometry.computeVertexNormals();
    return geometry;
  }
}

/** A polygon drawn in by `d` all the way round (points in order round it, either way). */
export function insetPolygon(points: P2[], d: number): P2[] {
  if (d === 0) return points.map(p => [p[0], p[1]] as P2);
  let area = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const turn = area > 0 ? 1 : -1;                      // which side of each edge is inside
  return points.map((p, i) => {
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const n1 = [-e1[1] / l1 * turn, e1[0] / l1 * turn], n2 = [-e2[1] / l2 * turn, e2[0] / l2 * turn];
    const k = d / Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k] as P2;
  });
}

/**
 * Let a material's `glow` attribute light it from within: wherever a corner has glow, `colour`
 * (towards `dim` where the glow is weak) is added, scaled by level. `ripple` (0 to 1) sends a
 * wave of it running along the model's +Y. Returns the uniforms to set each frame.
 */
export function liveGlow(material: THREE.MeshStandardMaterial, colour: THREE.ColorRepresentation, dim: THREE.ColorRepresentation = colour) {
  const uniforms = { liveLevel: { value: 0 }, liveTime: { value: 0 }, liveRipple: { value: 0 },
    liveColour: { value: new THREE.Color(colour) }, liveDim: { value: new THREE.Color(dim) } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying float vAlong;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvAlong = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nvarying float vAlong;\nuniform float liveLevel, liveTime, liveRipple;\nuniform vec3 liveColour, liveDim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += mix(liveDim, liveColour, vGlow) * (liveLevel * vGlow * (1. - liveRipple * (.5 + .5 * sin(vAlong * 30. - liveTime * 8.))));`);
  };
  material.customProgramCacheKey = () => 'vr3-live-glow';
  return uniforms;
}
