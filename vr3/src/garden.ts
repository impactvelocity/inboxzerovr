import { BackSide, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, Mesh, MeshLambertMaterial, Object3D, PointLight, Points, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3 } from '@iwsdk/core';
import { atmosphereFunctions, createLightMotes } from './atmosphere';

export const settings = { blend: 0, elapsed: 0, duration: 20, playing: true, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, wind: 0.35, depth: 0.6, quality: 'high' };
const TAU = Math.PI * 2;
const dummy = new Object3D();
const skyDusk = new Color('#b6b1dc'), skyNight = new Color('#5b519d');
const glowDusk = new Color('#ffd8ad'), glowNight = new Color('#d5a4ce');

export async function createGarden() {
  const loader = new TextureLoader();
  const [dusk, twilight] = await Promise.all([loader.loadAsync(`${import.meta.env.BASE_URL}garden/dusk-v2.webp`), loader.loadAsync(`${import.meta.env.BASE_URL}garden/twilight-v2.webp`)]);
  for (const texture of [dusk, twilight]) { texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; }
  const group = new Group(); group.name = 'Kyoto — lightweight atmosphere';
  const uniforms = { dusk: { value: dusk }, twilight: { value: twilight }, blend: { value: 0 }, time: { value: 0 }, breeze: { value: 0.35 }, headLean: {value: new Vector3()} };
  const panorama = new Mesh(new SphereGeometry(45, 64, 32), new ShaderMaterial({
    side: BackSide, depthWrite: false, uniforms,
    vertexShader: `varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D dusk,twilight; uniform float blend,time,breeze; uniform vec3 headLean; varying vec3 direction;
      ${atmosphereFunctions}
      void main(){
        vec3 d=normalize(direction);
        // Continuous 270-degree shelter. The redesigned texture places the
        // entire courtyard centrally; smooth angular redistribution gives
        // it more room in a seated forward view without a panel edge.
        float angle=atan(d.x,-d.z);
        float longitude=angle/4.71238898;
        float u=0.5+longitude+0.065*sin(6.2831853*clamp(longitude,-0.5,0.5));
        vec2 uv=vec2(u,0.48+asin(clamp(d.y,-1.0,1.0))/1.57079633);
        // Low-amplitude, translation-only relief. Zero lean preserves the
        // approved framing exactly. Near floor/roof shift more than the sky.
        float nearSurface=max(1.-smoothstep(.20,.34,uv.y),smoothstep(.68,.84,uv.y));
        float sideRoom=smoothstep(.23,.39,abs(uv.x-.5));
        float inverseDepth=mix(.015,.12,max(nearSurface,sideRoom));
        inverseDepth*=1.-skyMask(uv);
        float tangent=headLean.x*cos(angle)+headLean.z*sin(angle);
        float radial=headLean.x*sin(angle)-headLean.z*cos(angle);
        float elevation=asin(clamp(d.y,-1.,1.));
        vec2 relief=vec2(tangent*inverseDepth/4.71238898,
          (headLean.y*cos(elevation)-radial*sin(elevation))*inverseDepth/1.57079633);
        uv+=clamp(relief,vec2(-.002),vec2(.002));
        // Only the cherry canopy moves; roof, gate, horizon and veranda remain still.
        float canopy=smoothstep(.30,.33,uv.x)*(1.-smoothstep(.44,.47,uv.x))*smoothstep(.47,.52,uv.y)*(1.-smoothstep(.64,.68,uv.y));
        uv+=vec2(sin(time*.65+uv.y*14.),cos(time*.49+uv.x*19.)*.45)*(.00075*breeze*canopy);
        vec2 waterUv=uv+puddleOffset(uv)+skyOffset(uv);
        vec3 col=mix(texture2D(dusk,clamp(waterUv,0.,1.)).rgb,texture2D(twilight,clamp(waterUv,0.,1.)).rgb,blend);
        col=waterShading(col,uv);
        col=addAtmosphere(col,uv);
        float edges=smoothstep(-.025,.02,uv.x)*(1.-smoothstep(.98,1.025,uv.x));
        float vertical=smoothstep(-.14,.025,uv.y)*(1.-smoothstep(.975,1.14,uv.y));
        vec3 shelter=mix(vec3(.035,.026,.040),vec3(.010,.009,.023),blend);
        gl_FragColor=vec4(mix(shelter,col,edges*vertical),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  panorama.name = 'Centered courtyard with continuous wraparound veranda'; panorama.position.y = 1.2; panorama.renderOrder = -10; group.add(panorama);

  // A curved, six-triangle petal silhouette: real geometry, no model or alpha texture downloads.
  const petalGeometry = new BufferGeometry();
  petalGeometry.setAttribute('position', new Float32BufferAttribute([
    0,0,.12, -.44,.28,0, -.32,.70,0,
    0,0,.12, -.32,.70,0, -.08,1,0,
    0,0,.12, -.08,1,0, .07,.85,.04,
    0,0,.12, .07,.85,.04, .26,.99,0,
    0,0,.12, .26,.99,0, .48,.59,0,
    0,0,.12, .48,.59,0, .31,.19,0,
  ], 3));
  petalGeometry.computeVertexNormals();
  const petalMaterial = new MeshLambertMaterial({ color: '#eeb7cd', side: DoubleSide });
  const petals = new InstancedMesh(petalGeometry, petalMaterial, 72); petals.name = '72 drifting cherry petals'; petals.instanceMatrix.setUsage(DynamicDrawUsage); petals.frustumCulled = false; group.add(petals);
  const leafMaterial = new MeshLambertMaterial({ color: '#89946c', side: DoubleSide });
  const leaves = new InstancedMesh(petalGeometry, leafMaterial, 12); leaves.name = '12 drifting leaves'; leaves.instanceMatrix.setUsage(DynamicDrawUsage); leaves.frustumCulled = false; group.add(leaves);
  const ambient = new HemisphereLight(skyDusk, new Color('#4b3546'), 2); group.add(ambient);
  const lantern = new PointLight('#ffc18b', 8, 14, 2); lantern.position.set(-5, 2, -6); group.add(lantern);

  const dustGeometry = new BufferGeometry();
  const dustPositions = new Float32Array(120 * 3);
  // Stable seeds make quality changes and reloads reproducible.
  let seed = 98127;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const seeds = Array.from({ length: 84 }, () => ({ x: random(), y: random(), z: random(), spin: random() * TAU, scale: .035 + random() * .055 }));
  for (let i=0;i<120;i++) { dustPositions[i*3]=(random()-.5)*19; dustPositions[i*3+1]=random()*6; dustPositions[i*3+2]=-2-random()*14; }
  dustGeometry.setAttribute('position', new Float32BufferAttribute(dustPositions,3));
  const dustMaterial = new ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, tint: { value: glowDusk.clone() }, breeze: { value: .35 }, pixelRatio: { value: 1 } },
    vertexShader: `uniform float time,breeze,pixelRatio; varying float fade; void main(){vec3 p=position; p.x+=sin(time*.15+position.y)*.35*breeze; p.y+=sin(time*.12+position.x)*.15; vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(20.*pixelRatio/-mv.z,1.,4.*pixelRatio); fade=.12+.16*(.5+.5*sin(position.x*8.+time*.3));}`,
    fragmentShader: `uniform vec3 tint;varying float fade;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(tint,a*fade); #include <colorspace_fragment> }`.replace(' #include', '\n#include').replace('> }','>\n}'),
  });
  const dust = new Points(dustGeometry,dustMaterial); dust.name = '120 airborne dust motes'; group.add(dust);
  const lightMotes=createLightMotes();group.add(lightMotes.points);
  const viewPosition = new Vector3();
  const seatedOrigin = new Vector3();
  let settleOriginFrames = 1;
  // Let the first native head poses arrive before establishing seated height.
  function recenterDepth() { settleOriginFrames = 12; }
  let animationTime = 0;
  function update(dt: number, eye: Vector3, pixelRatio: number) {
    if (settings.motion) animationTime += dt;
    uniforms.time.value = animationTime; uniforms.blend.value = settings.blend; uniforms.breeze.value = settings.motion ? settings.wind : 0;
    // Follow translation only: artwork has no invented stereo depth/parallax, particles do.
    panorama.position.copy(eye);
    if(settleOriginFrames>0){seatedOrigin.copy(eye);settleOriginFrames--;}
    uniforms.headLean.value.copy(eye).sub(seatedOrigin).clampLength(0,.18)
      .multiplyScalar(settings.motion?settings.depth:0);
    ambient.color.copy(skyDusk).lerp(skyNight, settings.blend); ambient.intensity = 2 - settings.blend * .7;
    const flicker=1+.055*Math.sin(animationTime*1.7+.6)+.025*Math.sin(animationTime*3.1+1.2);
    lantern.intensity = (8 + settings.blend * 3)*flicker;
    const light = settings.quality === 'low'; petals.count = light ? 32 : 72; leaves.count = light ? 5 : 12; dustGeometry.setDrawRange(0, light ? 48 : 120);
    lightMotes.geometry.setDrawRange(0,light?12:28);
    lightMotes.material.uniforms.time.value=animationTime;
    lightMotes.material.uniforms.blend.value=settings.blend;
    lightMotes.material.uniforms.pixelRatio.value=pixelRatio;
    lightMotes.material.uniforms.breeze.value=settings.wind;
    for (let i=0;i<84;i++) {
      const s=seeds[i], t=animationTime;
      const wind=settings.wind;
      const x=((s.x*22+t*(.065+wind*.20))%22)-11;
      const y=7-((s.y*8+t*(.065+s.z*.08))%8);
      const z=-2-s.z*13;
      dummy.position.set(x+Math.sin(t*.45+s.spin)*(.12+wind*.38),y,z);
      dummy.rotation.set(s.spin+t*.32, s.spin+t*.21, s.spin+Math.sin(t*.6+s.spin)*.7);
      dummy.scale.set(s.scale,i<72?s.scale:s.scale*1.8,s.scale);dummy.updateMatrix();
      if(i<72) petals.setMatrixAt(i,dummy.matrix);else leaves.setMatrixAt(i-72,dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate=true;leaves.instanceMatrix.needsUpdate=true;
    dustMaterial.uniforms.time.value=animationTime;dustMaterial.uniforms.breeze.value=settings.wind;
    dustMaterial.uniforms.pixelRatio.value=pixelRatio;dustMaterial.uniforms.tint.value.copy(glowDusk).lerp(glowNight,settings.blend);
  }
  return { group, update, viewPosition, recenterDepth };
}
