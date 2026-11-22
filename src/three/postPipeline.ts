import * as THREE from 'three';
import {BokehPass} from 'three/addons/postprocessing/BokehPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {VignetteShader} from 'three/addons/shaders/VignetteShader.js';
import {REALISTIC_VISUAL_TUNING} from '@/src/graphics/detail';

const SpeedStreaksShader = {
  uniforms: {
    tDiffuse: {value: null as THREE.Texture | null},
    uStrength: {value: 0},
    uTime: {value: 0},
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.001) {
        gl_FragColor = base;
        return;
      }
      vec2 centered = vUv - vec2(0.5);
      float dist = length(centered);
      vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);
      float angle = atan(centered.y, centered.x);
      float rays = smoothstep(0.75, 1.0, sin(angle * 32.0 + uTime * 9.0) * 0.5 + 0.5);
      float mask = smoothstep(0.32, 0.78, dist) * rays * uStrength;
      vec3 streakColor = vec3(0.28, 0.88, 1.0) * mask * 0.35;
      gl_FragColor = vec4(base.rgb + streakColor, base.a);
    }
  `,
};

export interface PostPipelineOptions {
  enableBloom?: boolean;
  enableVignette?: boolean;
  enableDof?: boolean;
  enableSpeedStreaks?: boolean;
  multisampleSamples?: number;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface ManagedPostPipeline {
  composer: EffectComposer;
  renderTarget: THREE.WebGLRenderTarget;
  bloomPass: UnrealBloomPass | null;
  vignettePass: ShaderPass | null;
  bokehPass: BokehPass | null;
  streaksPass: ShaderPass | null;
  smaaPass: SMAAPass | null;
  outputPass: OutputPass;
  render: (dtSec?: number) => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  setSpeedStreakIntensity: (intensity01: number, elapsedSec: number) => void;
  dispose: () => void;
}

/**
 * Configurable Realistic-tier EffectComposer pipeline:
 * 1) Multisampled HalfFloat render target (4 samples when enabled)
 * 2) RenderPass
 * 3) Optional DOF BokehPass (OFF by default)
 * 4) Selective high-threshold UnrealBloomPass (0.92 threshold so typing text overlays stay sharp)
 * 5) Optional radial speed streaks pass (OFF by default)
 * 6) Subtle optical VignetteShader
 * 7) OutputPass (handles ACESFilmicToneMapping + sRGB once cleanly)
 * 8) SMAAPass fallback if MSAA samples === 0
 */
export function createPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: PostPipelineOptions,
): ManagedPostPipeline {
  const safeW = Math.max(1, Math.round(options.width));
  const safeH = Math.max(1, Math.round(options.height));
  const pr = Math.max(0.5, options.pixelRatio);
  const backingW = Math.max(1, Math.round(safeW * pr));
  const backingH = Math.max(1, Math.round(safeH * pr));
  const requestedSamples = options.multisampleSamples ?? 4;

  const renderTarget = new THREE.WebGLRenderTarget(backingW, backingH, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.isWebGL2 ? requestedSamples : 0,
  });

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(pr);
  composer.setSize(safeW, safeH);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let bokehPass: BokehPass | null = null;
  if (options.enableDof) {
    bokehPass = new BokehPass(scene, camera, {
      focus: 8.5,
      aspect: safeW / safeH,
      aperture: 0.00018,
      maxblur: 0.004,
    });
    composer.addPass(bokehPass);
  }

  let bloomPass: UnrealBloomPass | null = null;
  if (options.enableBloom !== false) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(safeW, safeH),
      REALISTIC_VISUAL_TUNING.bloomStrength,
      REALISTIC_VISUAL_TUNING.bloomRadius,
      REALISTIC_VISUAL_TUNING.bloomThreshold,
    );
    composer.addPass(bloomPass);
  }

  let streaksPass: ShaderPass | null = null;
  if (options.enableSpeedStreaks) {
    streaksPass = new ShaderPass(SpeedStreaksShader);
    composer.addPass(streaksPass);
  }

  let vignettePass: ShaderPass | null = null;
  if (options.enableVignette !== false) {
    vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms.offset.value = REALISTIC_VISUAL_TUNING.vignetteOffset;
    vignettePass.uniforms.darkness.value = REALISTIC_VISUAL_TUNING.vignetteDarkness;
    composer.addPass(vignettePass);
  }

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  let smaaPass: SMAAPass | null = null;
  if (!renderer.capabilities.isWebGL2 || requestedSamples === 0) {
    smaaPass = new SMAAPass();
    composer.addPass(smaaPass);
  }

  return {
    composer,
    renderTarget,
    bloomPass,
    vignettePass,
    bokehPass,
    streaksPass,
    smaaPass,
    outputPass,
    render(dtSec?: number) {
      composer.render(dtSec);
    },
    setSize(w: number, h: number, nextPr: number) {
      const rw = Math.max(1, Math.round(w));
      const rh = Math.max(1, Math.round(h));
      composer.setPixelRatio(Math.max(0.5, nextPr));
      composer.setSize(rw, rh);
      if (bloomPass) {
        bloomPass.resolution.set(rw, rh);
      }
    },
    setSpeedStreakIntensity(intensity01: number, elapsedSec: number) {
      if (!streaksPass) return;
      streaksPass.uniforms.uStrength.value = Math.max(0, Math.min(1, intensity01));
      streaksPass.uniforms.uTime.value = elapsedSec;
    },
    dispose() {
      composer.dispose();
      renderTarget.dispose();
    },
  };
}
