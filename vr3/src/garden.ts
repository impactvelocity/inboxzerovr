import { BackSide, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, LinearFilter, Mesh, MeshBasicMaterial, Object3D, PointLight, Points, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3 } from '@iwsdk/core';
import { atmosphereFunctions, createLightMotes, flame } from './atmosphere';
import type { BladeTracker } from './blade';

export const settings = { blend: 0, elapsed: 0, duration: 180,    // the lighting transition: three minutes by default in every level (asked for on 2026-11-11)
  playing: true, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, wind: 0.35, depth: 0.6, quality: 'high' };
const TAU = Math.PI * 2;
// Drifting petals and leaves. The first NEAR petals are small ones blown in under the roof, within
// reach of the sword; the rest fall across the garden.
const PETALS = 132, LEAVES = 30, NEAR = 30, DRIFTERS = PETALS + LEAVES;
const DUST = 260;
const dummy = new Object3D();
const skyDusk = new Color('#b6b1dc'), skyNight = new Color('#5b519d');
const glowDusk = new Color('#ffd8ad'), glowNight = new Color('#d5a4ce');
const petalDusk = new Color('#ffd3e2'), petalNight = new Color('#b99fe0'), leafDusk = new Color('#b9c58c'), leafNight = new Color('#66728c');

export async function createGarden() {
  const loader = new TextureLoader();
  const [dusk, twilight, skyMap] = await Promise.all([loader.loadAsync(`${import.meta.env.BASE_URL}garden/dusk-v2.webp`), loader.loadAsync(`${import.meta.env.BASE_URL}garden/twilight-v2.webp`),
    // Where the open sky is in those two (tools/skymask.py makes it): clouds and stars keep to it, and it has no depth.
    loader.loadAsync(`${import.meta.env.BASE_URL}garden/sky-v2.webp`)]);
  skyMap.generateMipmaps = false; skyMap.minFilter = LinearFilter;
  for (const texture of [dusk, twilight]) { texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; }
  const group = new Group(); group.name = 'Kyoto — lightweight atmosphere';
  const uniforms = { dusk: { value: dusk }, twilight: { value: twilight }, skyMap: { value: skyMap }, blend: { value: 0 }, time: { value: 0 }, breeze: { value: 0.35 }, depthScale: { value: 0.6 }, headLean: {value: new Vector3()} };
  const panorama = new Mesh(new SphereGeometry(45, 64, 32), new ShaderMaterial({
    side: BackSide, depthWrite: false, uniforms,
    vertexShader: `
      varying vec3 direction; varying vec3 eyeShift;
      void main(){
        direction=position;
        // Where this eye is from the sphere's centre, which follows the head: nothing on a monitor,
        // a few centimetres to one side for each eye in a headset. That is what gives the painting depth.
        // Only its sideways part is kept: the camera the sphere follows sits some centimetres
        // behind the eyes in a headset, and that must not read as a lean.
        mat3 toWorld=transpose(mat3(viewMatrix));
        vec3 eye=-(toWorld*viewMatrix[3].xyz);
        vec3 right=toWorld[0];
        eyeShift=right*dot(right,eye-modelMatrix[3].xyz);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D dusk,twilight,skyMap; uniform float blend,time,breeze,depthScale; uniform vec3 headLean; varying vec3 direction; varying vec3 eyeShift;
      ${atmosphereFunctions}
      // Continuous 270-degree shelter. The redesigned texture places the entire courtyard
      // centrally; smooth angular redistribution gives it more room in a seated forward view
      // without a panel edge.
      vec2 panoUv(vec3 d){
        float longitude=atan(d.x,-d.z)/4.71238898;
        float u=0.5+longitude+0.065*sin(6.2831853*clamp(longitude,-0.5,0.5));
        return vec2(u,0.48+asin(clamp(d.y,-1.0,1.0))/1.57079633);
      }
      float band(float x,float from,float to){ return smoothstep(from-.004,from+.002,x)*(1.-smoothstep(to-.002,to+.004,x)); }
      // One over the distance (1/m) to what the painting shows in direction d. Not measured: built
      // from what the picture is of. The deck and the garden's ground are one plane 1.2 m under the
      // eye; the roof another 1.45 m over it; the four posts stand at the deck's edge; the rooms at
      // either side are a few metres off; whatever stands in the garden is about ten metres away;
      // the sky is not there at all.
      float inverseDepthAt(vec3 d, vec2 uv, float sky){
        float level=sqrt(max(0.,1.-d.y*d.y));
        float beam=.682-1.2*(uv.x-.5)*(uv.x-.5);
        float opening=band(uv.x,.245,.755)*(1.-smoothstep(beam-.012,beam+.004,uv.y));
        float inv=max(max(-d.y,0.)/1.2, max(d.y,0.)/1.45*(1.-opening));
        float garden=opening*smoothstep(.375,.395,uv.y)*(1.-sky);
        inv=max(inv,garden*level/10.);
        float upright=smoothstep(.295,.31,uv.y)*(1.-smoothstep(beam,beam+.03,uv.y));
        float posts=band(uv.x,.2915,.3075)+band(uv.x,.6925,.7090);
        float bigPosts=band(uv.x,.2238,.2450)+band(uv.x,.7550,.7762);
        inv=max(inv,upright*level*max(posts/4.27,bigPosts/3.7));
        float rooms=1.-band(uv.x,.215,.785);
        inv=max(inv,rooms*level/5.5);
        return inv;
      }
      vec3 paint(vec2 uv, vec2 gx, vec2 gy){
        uv=clamp(uv,0.,1.);
        return mix(textureGrad(dusk,uv,gx,gy).rgb,textureGrad(twilight,uv,gx,gy).rgb,blend);
      }
      void main(){
        vec3 d=normalize(direction);
        vec2 painted=panoUv(d);
        float sky=texture2D(skyMap,clamp(painted,0.,1.)).r;
        // Depth. Seen from a little to one side, what is near slides further across the view than
        // what is far: look for each point where it would be seen from the sphere's centre. Leaning
        // (headLean) and the two eyes (eyeShift) are the same thing here. Zero shift is the painting as painted.
        vec3 shift=(headLean+eyeShift*depthScale)*inverseDepthAt(d,painted,sky);
        shift*=min(1.,.075/max(length(shift),1e-5));
        vec2 uv=panoUv(normalize(d+shift));
        vec2 gx=dFdx(uv), gy=dFdy(uv);
        // Only the cherry canopy moves; roof, gate, horizon and veranda remain still.
        float canopy=smoothstep(.30,.33,uv.x)*(1.-smoothstep(.44,.47,uv.x))*smoothstep(.47,.52,uv.y)*(1.-smoothstep(.64,.68,uv.y));
        uv+=vec2(sin(time*.65+uv.y*14.),cos(time*.49+uv.x*19.)*.45)*(.00075*breeze*canopy);
        vec2 waterUv=uv+puddleOffset(uv);
        vec3 col;
        if(sky>.004){
          // The painted clouds drift with the wind. Two copies of the sky slide along it, half a
          // turn apart; each fades out before it has slid far and comes back in where it began,
          // so the sky keeps moving and is never pulled out of shape.
          float turn=fract(time*.0125);
          vec2 slide=vec2(.034,.0024)*sky*(.5+breeze);
          col=mix(paint(waterUv-slide*(turn-.5),gx,gy),paint(waterUv-slide*(fract(turn+.5)-.5),gx,gy),abs(1.-2.*turn));
          col=stars(col,uv,sky);
        } else col=paint(waterUv,gx,gy);
        col=waterShading(col,uv);
        col=flickerLight(col,uv);
        col=addAtmosphere(col,uv,sky);
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
  // Painted, not lit: lit by the scene's two lights they came out as dark specks against the sky.
  // Their colour follows the evening instead (see update).
  const petalMaterial = new MeshBasicMaterial({ color: '#ffd3e2', side: DoubleSide });
  const petals = new InstancedMesh(petalGeometry, petalMaterial, PETALS); petals.name = `${PETALS} drifting cherry petals`; petals.instanceMatrix.setUsage(DynamicDrawUsage); petals.frustumCulled = false; group.add(petals);
  const leafMaterial = new MeshBasicMaterial({ color: '#b9c58c', side: DoubleSide });
  const leaves = new InstancedMesh(petalGeometry, leafMaterial, LEAVES); leaves.name = `${LEAVES} drifting leaves`; leaves.instanceMatrix.setUsage(DynamicDrawUsage); leaves.frustumCulled = false; group.add(leaves);
  const ambient = new HemisphereLight(skyDusk, new Color('#4b3546'), 2); group.add(ambient);
  const lantern = new PointLight('#ffc18b', 8, 14, 2); lantern.position.set(-5, 2, -6); group.add(lantern);

  const dustGeometry = new BufferGeometry();
  const dustPositions = new Float32Array(DUST * 3);
  // Stable seeds make quality changes and reloads reproducible.
  let seed = 98127;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const seeds = Array.from({ length: DRIFTERS }, () => ({ x: random(), y: random(), z: random(), spin: random() * TAU, scale: .035 + random() * .055 }));
  // No two petals quite the same pink, nor two leaves the same green.
  const tint = new Color();
  for (let i=0;i<PETALS;i++) petals.setColorAt(i, tint.setRGB(.92+random()*.16, .84+random()*.2, .9+random()*.16));
  for (let i=0;i<LEAVES;i++) leaves.setColorAt(i, tint.setRGB(.8+random()*.5, .85+random()*.3, .7+random()*.4));
  // What the sword has done to each drifter: knocked aside, it eases back to its own path.
  const pushed = new Float32Array(DRIFTERS * 3), pushing = new Float32Array(DRIFTERS * 3);
  const drifter = new Vector3(), nearest = new Vector3(), along = new Vector3();
  for (let i=0;i<DUST;i++) { dustPositions[i*3]=(random()-.5)*19; dustPositions[i*3+1]=random()*6; dustPositions[i*3+2]=(i%4===0?-.9:-2)-random()*14; }
  dustGeometry.setAttribute('position', new Float32BufferAttribute(dustPositions,3));
  const dustMaterial = new ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, tint: { value: glowDusk.clone() }, breeze: { value: .35 }, pixelRatio: { value: 1 } },
    vertexShader: `uniform float time,breeze,pixelRatio; varying float fade; void main(){vec3 p=position; p.x+=sin(time*.15+position.y)*.35*breeze; p.y+=sin(time*.12+position.x)*.15; vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(20.*pixelRatio/-mv.z,1.,4.*pixelRatio); fade=.12+.16*(.5+.5*sin(position.x*8.+time*.3));}`,
    fragmentShader: `uniform vec3 tint;varying float fade;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(tint,a*fade); #include <colorspace_fragment> }`.replace(' #include', '\n#include').replace('> }','>\n}'),
  });
  const dust = new Points(dustGeometry,dustMaterial); dust.name = `${DUST} airborne dust motes`; group.add(dust);
  const lightMotes=createLightMotes();group.add(lightMotes.points);
  const viewPosition = new Vector3();
  const seatedOrigin = new Vector3();
  let settleOriginFrames = 1;
  // Let the first native head poses arrive before establishing seated height.
  function recenterDepth() { settleOriginFrames = 12; }
  let animationTime = 0;
  function update(dt: number, eye: Vector3, pixelRatio: number, blade?: BladeTracker) {
    if (settings.motion) animationTime += dt;
    uniforms.time.value = animationTime; uniforms.blend.value = settings.blend; uniforms.breeze.value = settings.motion ? settings.wind : 0;
    // Follow translation only: artwork has no invented stereo depth/parallax, particles do.
    panorama.position.copy(eye);
    if(settleOriginFrames>0){seatedOrigin.copy(eye);settleOriginFrames--;}
    uniforms.headLean.value.copy(eye).sub(seatedOrigin).clampLength(0,.18)
      .multiplyScalar(settings.motion?settings.depth:0);
    uniforms.depthScale.value = settings.depth;
    ambient.color.copy(skyDusk).lerp(skyNight, settings.blend); ambient.intensity = 2 - settings.blend * .7;
    // The same flame the painted lantern flickers with (atmosphere.ts), on the petals that pass it.
    lantern.intensity = (8 + settings.blend * 3)*flame(animationTime,.6);
    petalMaterial.color.copy(petalDusk).lerp(petalNight, settings.blend); leafMaterial.color.copy(leafDusk).lerp(leafNight, settings.blend);
    const light = settings.quality === 'low'; petals.count = light ? 48 : PETALS; leaves.count = light ? 9 : LEAVES; dustGeometry.setDrawRange(0, light ? 80 : DUST);
    lightMotes.geometry.setDrawRange(0,light?20:lightMotes.count);
    const swinging = !!blade && blade.moving && blade.speed > 1.2 && settings.motion;
    const settle = Math.exp(-dt*1.6), ease = Math.exp(-dt*.3);
    lightMotes.material.uniforms.time.value=animationTime;
    lightMotes.material.uniforms.blend.value=settings.blend;
    lightMotes.material.uniforms.pixelRatio.value=pixelRatio;
    lightMotes.material.uniforms.breeze.value=settings.wind;
    for (let i=0;i<DRIFTERS;i++) {
      const s=seeds[i], t=animationTime;
      const wind=settings.wind, near=i<NEAR;
      // Each wraps round its own box; it shrinks to nothing at the box's ends so none pops in or out.
      const wide=near?5.2:22, tall=near?2.7:8;
      const across=(s.x*wide+t*(near?.03+wind*.09:.065+wind*.20))%wide, down=(s.y*tall+t*(near?.035+s.z*.04:.065+s.z*.08))%tall;
      const x=across-wide/2, y=(near?2.75:7)-down;
      const z=near?-.55-s.z*1.9:-2-s.z*13;
      const edge=Math.min(1,across/(wide*.06),(wide-across)/(wide*.06),down/(tall*.08),(tall-down)/(tall*.08));
      drifter.set(x+Math.sin(t*.45+s.spin)*(near?.05+wind*.12:.12+wind*.38),y,z);
      const k=i*3;
      if (near || z>-3.5) {
        drifter.x+=pushed[k];drifter.y+=pushed[k+1];drifter.z+=pushed[k+2];
        if (swinging) {
          // how close did the blade come?
          along.copy(blade!.tip).sub(blade!.base);
          const reach=Math.max(0,Math.min(1,nearest.copy(drifter).sub(blade!.base).dot(along)/Math.max(1e-4,along.lengthSq())));
          nearest.copy(blade!.base).addScaledVector(along,reach);
          const gap=nearest.distanceTo(drifter);
          if (gap<.42) {
            // swept along with the blade, and blown off it
            const hit=(1-gap/.42)*reach*Math.min(1,blade!.speed/6);
            along.copy(drifter).sub(nearest).multiplyScalar(1.6/Math.max(.05,gap));
            pushing[k]+=(blade!.velocity.x*.5+along.x)*hit;pushing[k+1]+=(blade!.velocity.y*.5+along.y+.4)*hit;pushing[k+2]+=(blade!.velocity.z*.5+along.z)*hit;
          }
        }
        pushed[k]=(pushed[k]+pushing[k]*dt)*ease;pushed[k+1]=(pushed[k+1]+pushing[k+1]*dt)*ease;pushed[k+2]=(pushed[k+2]+pushing[k+2]*dt)*ease;
        const spun=Math.abs(pushing[k])+Math.abs(pushing[k+1])+Math.abs(pushing[k+2]);
        pushing[k]*=settle;pushing[k+1]*=settle;pushing[k+2]*=settle;
        dummy.rotation.set(s.spin+t*.32+spun*2.4, s.spin+t*.21+spun*1.7, s.spin+Math.sin(t*.6+s.spin)*.7);
      } else dummy.rotation.set(s.spin+t*.32, s.spin+t*.21, s.spin+Math.sin(t*.6+s.spin)*.7);
      dummy.position.copy(drifter);
      const size=(near?s.scale*.36:s.scale*1.2)*Math.max(0,edge);
      dummy.scale.set(size,i<PETALS?size:size*1.8,size);dummy.updateMatrix();
      if(i<PETALS) petals.setMatrixAt(i,dummy.matrix);else leaves.setMatrixAt(i-PETALS,dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate=true;leaves.instanceMatrix.needsUpdate=true;
    dustMaterial.uniforms.time.value=animationTime;dustMaterial.uniforms.breeze.value=settings.wind;
    dustMaterial.uniforms.pixelRatio.value=pixelRatio;dustMaterial.uniforms.tint.value.copy(glowDusk).lerp(glowNight,settings.blend);
  }
  return { group, update, viewPosition, recenterDepth };
}
