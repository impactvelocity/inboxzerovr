import * as THREE from 'three';

/**
 * A small pool of things thrown off by a prop: sparks, bits of glass, puffs of smoke. One draw
 * each. Positions are in the space of whatever `points` is added to; sizes are in metres (the
 * point size is worked out from the view's real height, so they are the same size on a monitor
 * and in a headset).
 */
const KINDS = { spark: { metres: 0.014, additive: true }, shard: { metres: 0.016, additive: false }, smoke: { metres: 0.13, additive: false } } as const;

export function createPuffs(count: number, kind: keyof typeof KINDS, colour: THREE.ColorRepresentation) {
  const position = new Float32Array(count * 3), fade = new Float32Array(count), scale = new Float32Array(count), seed = new Float32Array(count);
  const speed = new Float32Array(count * 3), age = new Float32Array(count).fill(1), life = new Float32Array(count).fill(1);
  for (let i = 0; i < count; i++) seed[i] = Math.random();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('fade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('scale', new THREE.BufferAttribute(scale, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: KINDS[kind].additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { colour: { value: new THREE.Color(colour) }, metres: { value: KINDS[kind].metres }, viewHalf: { value: 400 } },
    defines: { [kind.toUpperCase()]: 1 },
    vertexShader: /* glsl */ `
      attribute float fade,scale,seed; uniform float metres,viewHalf; varying float vFade; varying float vSeed;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=fade>0.?clamp(metres*scale*projectionMatrix[1][1]*viewHalf/max(.05,gl_Position.w),1.,320.):0.;
        vFade=fade; vSeed=seed;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour; varying float vFade; varying float vSeed;
      void main(){
        vec2 p=(gl_PointCoord-.5)*2.; float r=length(p);
        #if defined(SPARK)
          float glow=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r))*.6+exp(-r*r*40.);
          gl_FragColor=vec4(mix(colour,vec3(1.),exp(-r*r*30.)*.8)*glow*min(1.,vFade*2.5),1.);
        #elif defined(SHARD)
          // a splinter of glass: a thin diamond, each turned its own way, catching the light on one side
          float turn=vSeed*6.283, c=cos(turn), s=sin(turn); vec2 q=vec2(p.x*c-p.y*s,p.x*s+p.y*c);
          if(abs(q.x)*2.6+abs(q.y)>.95) discard;
          gl_FragColor=vec4(colour*(.75+.5*step(0.,q.x)),min(1.,vFade*3.)*.9);
        #else
          float body=exp(-r*r*2.6)*(1.-smoothstep(.75,1.,r));
          gl_FragColor=vec4(colour*(.85+.3*vSeed),body*.34*vFade*(1.-vFade*.4));
        #endif
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material); points.name = `${count} ${kind}s`; points.frustumCulled = false; points.renderOrder = 6;
  let next = 0;
  const size = new THREE.Vector2();
  return {
    points,
    /** One more, from `at`, going `velocity` (m/s), for `seconds`, `big` times the usual size. */
    emit(at: THREE.Vector3, velocity: THREE.Vector3, seconds: number, big = 1) {
      const i = next; next = (next + 1) % count;
      position[i * 3] = at.x; position[i * 3 + 1] = at.y; position[i * 3 + 2] = at.z;
      speed[i * 3] = velocity.x; speed[i * 3 + 1] = velocity.y; speed[i * 3 + 2] = velocity.z;
      age[i] = 0; life[i] = seconds; scale[i] = big; fade[i] = 1;
    },
    /** `gravity` m/s2 downwards (less than nothing: it rises), `drag` per second, `grow` how much bigger each gets per second. */
    update(dt: number, gravity: number, drag: number, grow: number, _pixelRatio: number, renderer?: THREE.WebGLRenderer) {
      const slow = Math.exp(-drag * dt);
      let alive = false;
      for (let i = 0; i < count; i++) {
        if (age[i] >= life[i]) { if (fade[i] !== 0) { fade[i] = 0; alive = true; } continue; }
        alive = true; age[i] += dt;
        speed[i * 3] *= slow; speed[i * 3 + 1] = speed[i * 3 + 1] * slow - gravity * dt; speed[i * 3 + 2] *= slow;
        position[i * 3] += speed[i * 3] * dt; position[i * 3 + 1] += speed[i * 3 + 1] * dt; position[i * 3 + 2] += speed[i * 3 + 2] * dt;
        scale[i] *= 1 + grow * dt; fade[i] = Math.max(0, 1 - age[i] / life[i]);
      }
      points.visible = alive;
      if (!alive) return;
      geometry.attributes.position.needsUpdate = true; geometry.attributes.fade.needsUpdate = true; geometry.attributes.scale.needsUpdate = true;
      if (renderer) {
        // half the height of what is being drawn into, in real pixels: one eye's view in a headset, the canvas otherwise
        const eye = renderer.xr.isPresenting ? renderer.xr.getCamera().cameras[0]?.viewport : null;
        material.uniforms.viewHalf.value = (eye ? eye.w : renderer.getDrawingBufferSize(size).y) / 2;
      }
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
