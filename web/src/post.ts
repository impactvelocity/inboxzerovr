import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GRADE_GLSL, globals } from './kyoto/shaders';

/**
 * On a monitor: the courtyard is drawn in linear light, bloomed (the sun, the
 * lamps and the paper windows spread over the picture, as the Unity volume
 * does), then graded. A headset skips all of this and grades in each shader.
 */
export class Post {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.24, 0.7, 0.9);
    for (const tint of this.bloom.bloomTintColors) tint.set(1, 0.8, 0.72);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uGrade: globals.uGrade, uVignette: { value: new THREE.Vector4(0.3, 0.4, 0, 0) }, uVignetteColor: { value: new THREE.Color(0x241c5c) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec4 uGrade;
        uniform vec4 uVignette;
        uniform vec3 uVignetteColor;
        varying vec2 vUv;
        ${GRADE_GLSL}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 c = kyotoGrade(texture2D(tDiffuse, vUv).rgb);
          vec2 d = (vUv - 0.5) * 2.0;
          float edge = smoothstep(1.0 - uVignette.y * 1.6, 1.6, length(d) * (0.75 + uVignette.x));
          c = mix(c, c * uVignetteColor * 2.2, edge * uVignette.x * 2.2);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
          gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.composer.addPass(this.grade);
  }

  /** Bloom deepens as night comes on (the Unity volumes: 0.95 at dusk to 2.4 at night, on a lower threshold). */
  setNight(t: number): void {
    this.bloom.strength = 0.24 + 0.3 * t;
    this.bloom.threshold = 0.9 - 0.18 * t;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
