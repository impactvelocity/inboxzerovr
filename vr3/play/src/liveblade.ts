import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial, type MeshStandardMaterial } from '@iwsdk/core';
import type { BladeTracker } from './blade';

/**
 * The sword made ready. While the trigger is held the blade is live (it cuts: letters.ts), and it
 * shows: the steel takes on a glow of its own, and a soft light runs the length of the blade,
 * brightest along the edge, shimmering a little the way the hum does.
 *
 * It dresses the katana from outside (it finds the blade through blade.ts and lights the blade's
 * own two materials), so sword.ts needs no hooks. One extra draw while the blade is live.
 */
export function createLiveBlade() {
  let dressed: Mesh | null = null;
  let glow: Mesh | null = null;
  let level = 0, clock = 0;
  const steelGlow = new Color('#8f6fe0'), edgeGlow = new Color('#ffd9ec');
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: { level: { value: 0 }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 direction; attribute vec2 place; varying vec2 at;
      void main(){
        at=place;
        // A ribbon along the blade that always turns its face to the eye: each point is pushed out
        // sideways, across both the blade and the line of sight.
        vec4 mv=modelViewMatrix*vec4(position,1.);
        vec3 run=normalize((modelViewMatrix*vec4(direction,0.)).xyz);
        vec3 out_=cross(run,normalize(mv.xyz));
        mv.xyz+=normalize(out_)*place.x*.06;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float level,time; varying vec2 at;
      void main(){
        float across=at.x, along=at.y;
        float ends=smoothstep(0.,.08,along)*(1.-smoothstep(.93,1.,along));
        float shimmer=.82+.18*sin(along*26.-time*11.)*sin(along*7.+time*3.);
        float halo=exp(-across*across*5.)*.6, core=exp(-across*across*80.)*.85;
        gl_FragColor=vec4(mix(vec3(.80,.58,1.),vec3(1.,.90,.96),core),(halo+core)*ends*shimmer*level);
        #include <colorspace_fragment>
      }`,
  });

  /** A ribbon down the middle of the blade, built from the blade's own shape so it follows its curve. */
  function ribbon(blade: Mesh) {
    const points = blade.geometry.getAttribute('position');
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < points.count; i++) { low = Math.min(low, points.getY(i)); high = Math.max(high, points.getY(i)); }
    const rings = 14, mid: number[][] = [];
    for (let r = 0; r <= rings; r++) {
      // the middle of the blade at this height: the average of the vertices nearest it
      const y = low + (high - low) * r / rings, band = (high - low) / rings * 0.75;
      let x = 0, z = 0, n = 0;
      for (let i = 0; i < points.count; i++) if (Math.abs(points.getY(i) - y) <= band) { x += points.getX(i); z += points.getZ(i); n++; }
      mid.push(n > 0 ? [x / n, y, z / n] : [mid[r - 1]?.[0] ?? 0, y, mid[r - 1]?.[2] ?? 0]);
    }
    const position: number[] = [], direction: number[] = [], place: number[] = [], index: number[] = [];
    for (let r = 0; r <= rings; r++) {
      const a = mid[Math.max(0, r - 1)], b = mid[Math.min(rings, r + 1)];
      for (const side of [-1, 1]) {
        position.push(...mid[r]); direction.push(b[0] - a[0], b[1] - a[1], b[2] - a[2]); place.push(side, r / rings);
      }
      if (r < rings) index.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
    geometry.setAttribute('direction', new Float32BufferAttribute(direction, 3));
    geometry.setAttribute('place', new Float32BufferAttribute(place, 2));
    geometry.setIndex(index);
    return geometry;
  }

  function undress() {
    if (dressed) for (const m of [dressed.material].flat() as MeshStandardMaterial[]) m.emissive?.setScalar(0);
    if (glow) { glow.removeFromParent(); glow.geometry.dispose(); }
    dressed = null; glow = null;
  }

  /** Every frame. `live` is 1 while the blade is cutting-ready, 0 while it is not. */
  function update(dt: number, live: number, blade: BladeTracker) {
    clock += dt;
    level += (live - level) * (1 - Math.exp(-dt * (live > level ? 16 : 6)));
    const mesh = blade.mesh;
    if (mesh !== dressed) {
      undress();
      if (mesh) {
        dressed = mesh;
        glow = new Mesh(ribbon(mesh), material); glow.name = 'Live blade glow'; glow.frustumCulled = false; glow.renderOrder = 3;
        mesh.add(glow);
      }
    }
    if (!dressed || !glow) return;
    glow.visible = level > 0.01;
    material.uniforms.level.value = level; material.uniforms.time.value = clock;
    // the steel itself: [body, edge] as sword.ts builds them
    const [steel, edge] = [dressed.material].flat() as MeshStandardMaterial[];
    const beat = 0.9 + 0.1 * Math.sin(clock * 9);
    steel?.emissive?.copy(steelGlow).multiplyScalar(level * 0.45 * beat);
    edge?.emissive?.copy(edgeGlow).multiplyScalar(level * 0.9 * beat);
  }

  return { update, level: () => level, dispose: () => { undress(); material.dispose(); } };
}
