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
  float shimmer(float seed) {
    return 1. + .055*sin(time*1.7+seed) + .025*sin(time*3.1+seed*2.);
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
  float skyMask(vec2 uv) {
    return smoothstep(.46,.48,uv.x)*(1.-smoothstep(.59,.615,uv.x))
      *smoothstep(.535,.56,uv.y)*(1.-smoothstep(.645,.675,uv.y));
  }
  vec2 skyOffset(vec2 uv) {
    // Only the clear sky opening moves; the mountain edge and roof stay put.
    return vec2(.0045*sin(time*.095),.00025*sin(time*.07)) * skyMask(uv);
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
  vec3 addAtmosphere(vec3 col, vec2 uv) {
    vec3 haze=mix(vec3(.35,.37,.48),vec3(.13,.12,.26),blend);
    // Narrow distant sky opening: kept off the tree, roof and right-hand temple.
    float sky=skyMask(uv);
    float cloud=softNoise(uv*vec2(49.,92.)+vec2(-time*.16,0.));
    float cloudHigh=softNoise(uv*vec2(83.,155.)+vec2(-time*.065,1.7));
    cloud=smoothstep(.30,.78,cloud*.72+cloudHigh*.28);
    col=mix(col,haze*1.40,sky*cloud*.43);
    // Separate drifting bands: thin wall-distance haze and low ground mist.
    float garden=smoothstep(.32,.37,uv.x)*(1.-smoothstep(.60,.65,uv.x));
    float nearMist=oval(uv,vec2(.50,.315),vec2(.145,.037));
    float farMist=oval(uv,vec2(.51,.395),vec2(.105,.022));
    float drift=softNoise(uv*vec2(65.,115.)+vec2(-time*.025,time*.006));
    float driftFar=softNoise(uv*vec2(85.,130.)+vec2(time*.011,0.));
    float fog=garden*(nearMist*(.18+.22*drift)+farMist*(.10+.16*driftFar));
    col=mix(col,haze,fog*(1.+blend*.30));
    // Broad low-energy halos and narrower cores, anchored to painted lamps.
    float lamp=oval(uv,vec2(.414,.417),vec2(.022,.055))*shimmer(.6);
    float left=oval(uv,vec2(.081,.385),vec2(.022,.070))*shimmer(2.4);
    float right=oval(uv,vec2(.918,.385),vec2(.022,.070))*shimmer(4.3);
    float windows=oval(uv,vec2(.656,.444),vec2(.036,.055))*shimmer(1.8);
    float reflection=oval(uv,vec2(.414,.315),vec2(.009,.045))*shimmer(.6);
    vec3 amber=vec3(1.,.43,.12);
    col+=amber*(lamp+left+right+windows*.40+reflection*.30)*(.065+.075*blend);
    return col;
  }
`;

export function createLightMotes() {
  const positions = new Float32Array(28 * 3);
  for (let i = 0; i < 28; i++) {
    // Deterministic scatter with no per-frame allocations or texture downloads.
    positions[i*3] = Math.sin(i*127.1)*7.5;
    positions[i*3+1] = .6+(Math.sin(i*311.7)*.5+.5)*2.8;
    positions[i*3+2] = -7-(Math.cos(i*74.7)*.5+.5)*10;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  const material = new ShaderMaterial({
    transparent:true, depthWrite:false, blending:AdditiveBlending,
    uniforms:{time:{value:0},blend:{value:0},pixelRatio:{value:1},breeze:{value:.35}},
    vertexShader:/* glsl */ `
      uniform float time,blend,pixelRatio,breeze;
      varying float intensity;
      void main(){
        vec3 p=position;
        p.x+=sin(time*.17+position.z)*(.25+breeze*.35);
        p.y+=sin(time*.24+position.x)*.22;
        p.z+=cos(time*.13+position.y)*.20;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(150.*pixelRatio/-mv.z,2.,16.*pixelRatio);
        intensity=(.42+.38*blend)*(.5+.5*sin(time*.65+position.x*3.));
      }
    `,
    fragmentShader:/* glsl */ `
      varying float intensity;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float halo=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r));
        float core=exp(-r*r*45.);
        gl_FragColor=vec4(vec3(1.,.69,.30),intensity*(halo*.45+core*.55));
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new Points(geometry,material);
  points.name = '28 warm drifting light motes';
  // Vertex-shader drift extends beyond the original bounding sphere.
  points.frustumCulled=false;
  return {points,material,geometry};
}
