import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from '@iwsdk/core';

// All distant effects share the panorama pass and its UVs, so they stay
// registered with both source images in stereo. No fullscreen bloom buffer.
export const atmosphereFunctions = /* glsl */ `
  float softNoise(vec2 p) {
    return .5 + .22*sin(p.x + sin(p.y*1.3))
      + .16*sin(p.y*1.7 + sin(p.x*.6)) + .10*sin(p.x*2.3+p.y*.9);
  }
  float oval(vec2 uv, vec2 center, vec2 radius) {
    vec2 p=(uv-center)/radius;
    return exp(-dot(p,p)*2.);
  }
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  // A flame's brightness about 1: a slow breathing, a quick flutter, and now and then a gutter.
  // flame() in TypeScript below is the same sum, for the lights that are not painted.
  float flame(float seed) {
    float slow=sin(time*1.3+seed)*.5+sin(time*2.7+seed*1.7)*.3;
    float quick=sin(time*11.+seed*3.1)*sin(time*7.3+seed)*.5;
    float gutter=smoothstep(.72,1.,sin(time*.61+seed*5.)*sin(time*.37+seed*2.));
    return 1.+.10*slow+.08*quick-.24*gutter*(.6+.4*sin(time*23.+seed));
  }
  // Lamplight through paper: the same flame, steadier.
  float paperGlow(float seed) { return 1.+.55*(flame(seed)-1.); }
  // The painted lights flicker: whatever is already lit warm near a lamp brightens and dims with
  // its flame (the flame itself, its pool on the wet stones, its streak on the boards).
  vec3 flickerLight(vec3 col, vec2 uv) {
    float warm=smoothstep(.05,.28,col.r-col.b)*smoothstep(.22,.55,col.r);
    float lantern=oval(uv,vec2(.414,.385),vec2(.040,.110));
    float room=oval(uv,vec2(.645,.405),vec2(.080,.115))*(1.-smoothstep(.485,.51,uv.y));
    float leftSide=1.-smoothstep(.13,.23,uv.x), rightSide=smoothstep(.77,.87,uv.x);
    float nearLeft=oval(uv,vec2(.081,.30),vec2(.060,.240)), nearRight=oval(uv,vec2(.918,.30),vec2(.060,.240));
    float f=lantern*(flame(.6)-1.)*1.9+room*(paperGlow(1.8)-1.)*2.6
      +leftSide*(mix(paperGlow(7.3),flame(2.4),nearLeft)-1.)
      +rightSide*(mix(paperGlow(9.1),flame(4.3),nearRight)-1.);
    return col*(1.+clamp(warm*f*2.,-.5,.42));
  }
  float puddleMask(vec2 uv) {
    // Conservative islands of open water in the v2 painting. Compact masks
    // reach exactly zero before the veranda, planting and central stone path.
    vec2 right=(uv-vec2(.563,.326))/vec2(.050,.037);
    vec2 left=(uv-vec2(.448,.313))/vec2(.019,.021);
    float water=max(1.-smoothstep(.35,1.,dot(right,right)),
                    1.-smoothstep(.25,1.,dot(left,left)));
    float stones=smoothstep(.465,.476,uv.x)*(1.-smoothstep(.520,.531,uv.x));
    return water*(1.-stones);
  }
  vec2 puddleOffset(vec2 uv) {
    // Phase travels along X: sideways ripples, not the previous vertical flow.
    float waveA=sin(uv.x*780.+uv.y*24.-time*1.45);
    float waveB=sin(uv.x*430.-uv.y*36.-time*.85);
    return vec2(waveA*.7+waveB*.3,0.)
      *puddleMask(uv)*(.00085+.0009*breeze);
  }
  // How far the evening has gone decides how many stars there are; cloud (anything bright) hides them.
  vec3 stars(vec3 col, vec2 uv, float sky) {
    float dark=smoothstep(.40,1.,blend)*sky;
    if(dark<=.001) return col;
    float clear=1.-smoothstep(.20,.42,dot(col,vec3(.3,.5,.2)));
    vec2 grid=uv*vec2(560.,187.);                 // square cells: the picture is 270 degrees by 90
    vec2 cell=floor(grid), within=fract(grid);
    float pick=hash(cell);
    vec2 at=vec2(hash(cell+7.1),hash(cell+13.7))*.6+.2;
    float star=step(.93,pick)*smoothstep(.16,.02,length(within-at));
    float twinkle=.55+.45*sin(time*(1.3+pick*37.)+pick*90.);
    col+=vec3(.86,.90,1.)*star*twinkle*dark*clear*(.35+.65*hash(cell+3.3));
    // Now and then one falls: a short streak, heading down and to one side.
    float slot=floor(time/29.), since=(time-slot*29.)/.85;
    if(since<1.&&blend>.55){
      vec2 from=vec2(.36+.30*hash(vec2(slot,1.)),.615+.035*hash(vec2(slot,2.)));
      vec2 way=vec2((hash(vec2(slot,3.))<.5?-1.:1.)*.050,-.034);
      vec2 head=from+way*since, rel=(uv-head)*vec2(3.,1.), back=-way*vec2(3.,1.)*.45;
      float alongTail=clamp(dot(rel,back)/dot(back,back),0.,1.);
      float streak=exp(-dot(rel-back*alongTail,rel-back*alongTail)*9.0e5)*(1.-alongTail)*sin(since*3.14159);
      col+=vec3(1.,.95,.9)*streak*sky*clear*.9;
    }
    return col;
  }
  vec3 waterShading(vec3 col, vec2 uv) {
    // Analytic wave slope acts as a tiny normal map. Low-contrast specular
    // bands give reflections relief without treating painted shadows as depth.
    float slope=.7*cos(uv.x*780.+uv.y*24.-time*1.45)
               +.3*cos(uv.x*430.-uv.y*36.-time*.85);
    float glint=pow(max(0.,slope),8.);
    float mask=puddleMask(uv);
    col*=1.+mask*slope*.025;
    col+=mix(vec3(.11,.13,.18),vec3(.13,.09,.17),blend)*glint*mask*.20;
    return col;
  }
  vec3 addAtmosphere(vec3 col, vec2 uv, float sky) {
    vec3 haze=mix(vec3(.35,.37,.48),vec3(.13,.12,.26),blend);
    // Thin veils crossing the whole sky (the mask keeps them off the tree, roofs and mountains),
    // over the painted clouds, which drift on their own (see the panorama's main).
    float cloud=softNoise(uv*vec2(49.,92.)+vec2(-time*.16,0.));
    float cloudHigh=softNoise(uv*vec2(83.,155.)+vec2(-time*.065,1.7));
    cloud=smoothstep(.30,.78,cloud*.72+cloudHigh*.28);
    col=mix(col,haze*1.40,sky*cloud*.26);
    // The last light along the ridge breathes a little.
    float ridge=sky*(1.-smoothstep(.535,.60,uv.y))*(1.-blend*.6);
    col*=1.+ridge*.07*sin(time*.21+uv.x*9.);
    // Separate drifting bands: thin wall-distance haze and low ground mist.
    float garden=smoothstep(.32,.37,uv.x)*(1.-smoothstep(.60,.65,uv.x));
    float nearMist=oval(uv,vec2(.50,.315),vec2(.145,.037));
    float farMist=oval(uv,vec2(.51,.395),vec2(.105,.022));
    float drift=softNoise(uv*vec2(65.,115.)+vec2(-time*.025,time*.006));
    float driftFar=softNoise(uv*vec2(85.,130.)+vec2(time*.011,0.));
    float fog=garden*(nearMist*(.18+.22*drift)+farMist*(.10+.16*driftFar));
    col=mix(col,haze,fog*(1.+blend*.30));
    // Broad low-energy halos and narrower cores, anchored to painted lamps.
    float lamp=oval(uv,vec2(.414,.417),vec2(.022,.055))*flame(.6);
    float left=oval(uv,vec2(.081,.385),vec2(.022,.070))*flame(2.4);
    float right=oval(uv,vec2(.918,.385),vec2(.022,.070))*flame(4.3);
    float windows=oval(uv,vec2(.656,.444),vec2(.036,.055))*paperGlow(1.8);
    float reflection=oval(uv,vec2(.414,.315),vec2(.009,.045))*flame(.6);
    vec3 amber=vec3(1.,.43,.12);
    col+=amber*(lamp+left+right+windows*.40+reflection*.30)*(.065+.075*blend);
    return col;
  }
`;

/**
 * A flame's brightness about 1: a slow breathing, a quick flutter, and now and then a gutter.
 * The same sum as flame() in the shader above, for lights that are not painted.
 */
export function flame(time: number, seed: number) {
  const slow = Math.sin(time*1.3+seed)*.5 + Math.sin(time*2.7+seed*1.7)*.3;
  const quick = Math.sin(time*11.+seed*3.1)*Math.sin(time*7.3+seed)*.5;
  const g = Math.sin(time*.61+seed*5.)*Math.sin(time*.37+seed*2.);
  const gutter = Math.min(1, Math.max(0, (g-.72)/.28));
  return 1 + .10*slow + .08*quick - .24*gutter*gutter*(3-2*gutter)*(.6+.4*Math.sin(time*23.+seed));
}

const MOTES = 60;
export function createLightMotes() {
  const positions = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    // Deterministic scatter with no per-frame allocations or texture downloads. Every third one
    // is nearer, over the pond and the veranda's edge, so they are not all one distant layer.
    const close = i % 3 === 2;
    positions[i*3] = Math.sin(i*127.1)*(close?4.5:7.5);
    positions[i*3+1] = (close?.35:.6)+(Math.sin(i*311.7)*.5+.5)*(close?2.:2.8);
    positions[i*3+2] = (close?-3.2:-7)-(Math.cos(i*74.7)*.5+.5)*(close?4.:10.);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  const material = new ShaderMaterial({
    transparent:true, depthWrite:false, blending:AdditiveBlending,
    uniforms:{time:{value:0},blend:{value:0},pixelRatio:{value:1},breeze:{value:.35}},
    vertexShader:/* glsl */ `
      uniform float time,blend,pixelRatio,breeze;
      varying float intensity;
      varying float firefly;
      void main(){
        vec3 p=position;
        // As it gets dark, two in five turn out to be fireflies: they wander further and blink.
        float kind=fract(position.x*7.31+position.z*3.17);
        firefly=step(.6,kind)*smoothstep(.35,.85,blend);
        float roam=1.+firefly*1.6;
        p.x+=sin(time*.17*roam+position.z)*(.25+breeze*.35)*roam;
        p.y+=sin(time*.24*roam+position.x)*.22*roam;
        p.z+=cos(time*.13*roam+position.y)*.20*roam;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(150.*pixelRatio/-mv.z,2.,16.*pixelRatio);
        float glow=.5+.5*sin(time*.65+position.x*3.);
        float blink=pow(.5+.5*sin(time*(1.1+kind*.9)+position.x*9.),5.);
        intensity=(.42+.38*blend)*mix(glow,.15+1.5*blink,firefly);
      }
    `,
    fragmentShader:/* glsl */ `
      varying float intensity;
      varying float firefly;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float halo=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r));
        float core=exp(-r*r*45.);
        gl_FragColor=vec4(mix(vec3(1.,.69,.30),vec3(.74,1.,.36),firefly),intensity*(halo*.45+core*.55));
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new Points(geometry,material);
  points.name = `${MOTES} warm drifting light motes and fireflies`;
  // Vertex-shader drift extends beyond the original bounding sphere.
  points.frustumCulled=false;
  return {points,material,geometry,count:MOTES};
}
