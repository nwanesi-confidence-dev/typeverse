import * as THREE from 'three';
import {getDetailConstants, REALISTIC_VISUAL_TUNING} from '@/src/graphics/detail';
import {GRAPHICS_THRESHOLDS} from '@/src/graphics/thresholds';
import {
  addRealisticStudioLights,
  disposeSessionEnvironmentIfRenderer,
  getOrCreateSessionEnvironment,
} from '@/src/three/core';
import {createPostPipeline} from '@/src/three/postPipeline';
import {
  acquireSessionPbrTextures,
  releaseSessionPbrTextures,
} from '@/src/three/proceduralTextures';

export interface SpeedTestSampleResult {
  medianFps: number;
  onePercentLowFps: number;
  frameCount: number;
  durationMs: number;
  abortedHidden: boolean;
}

const SCRATCH_VEC3 = new THREE.Vector3();
const SCRATCH_QUAT = new THREE.Quaternion();
const SCRATCH_EULER = new THREE.Euler();
const SCRATCH_SCALE = new THREE.Vector3(1, 1, 1);
const SCRATCH_MAT4 = new THREE.Matrix4();

function createRadialGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(34, 211, 238, 0.95)');
  grad.addColorStop(0.45, 'rgba(56, 189, 248, 0.42)');
  grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Lazy-loaded Three.js speed test (~0.5s warm-up + ~3s measurement):
 * renders 2,000 instanced cubes, glow sprites, and 1 dynamic light
 * with a clean WebGLRenderer, returning median & 1% low FPS.
 * Aborts immediately if skipped or if the tab becomes hidden.
 */
export async function runStandardHardwareSpeedTest(options: {
  container: HTMLElement;
  signal: AbortSignal;
  onProgress?: (phase: 'warmup' | 'measuring', pct: number) => void;
}): Promise<SpeedTestSampleResult> {
  const {container, signal, onProgress} = options;
  const cubeCount = GRAPHICS_THRESHOLDS.SPEED_TEST_CUBE_COUNT;
  const warmupMs = GRAPHICS_THRESHOLDS.SPEED_TEST_WARMUP_MS;
  const measureMs = GRAPHICS_THRESHOLDS.SPEED_TEST_MEASURE_MS;

  const width = Math.max(240, container.clientWidth || 320);
  const height = Math.max(140, container.clientHeight || 180);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b14);
  scene.fog = new THREE.FogExp2(0x080b14, 0.025);

  const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 120);
  camera.position.set(0, 5.5, 22);
  camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.7);
  scene.add(hemi);
  const keyLight = new THREE.PointLight(0x22d3ee, 4.5, 60, 1.4);
  keyLight.position.set(6, 8, 12);
  scene.add(keyLight);

  const cubeGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const cubeMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.32,
    metalness: 0.45,
  });
  const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, cubeCount);
  cubes.frustumCulled = false;

  const cols = 20;
  const rows = 10;
  const basePositions = new Float32Array(cubeCount * 3);
  for (let i = 0; i < cubeCount; i++) {
    const layer = Math.floor(i / (cols * rows));
    const rem = i % (cols * rows);
    const r = Math.floor(rem / cols);
    const c = rem % cols;
    const x = (c - (cols - 1) / 2) * 1.15;
    const y = (r - (rows - 1) / 2) * 1.05;
    const z = (layer - 4.5) * 1.4;
    basePositions[i * 3] = x;
    basePositions[i * 3 + 1] = y;
    basePositions[i * 3 + 2] = z;

    SCRATCH_VEC3.set(x, y, z);
    SCRATCH_QUAT.identity();
    SCRATCH_MAT4.compose(SCRATCH_VEC3, SCRATCH_QUAT, SCRATCH_SCALE);
    cubes.setMatrixAt(i, SCRATCH_MAT4);
  }
  cubes.instanceMatrix.needsUpdate = true;
  scene.add(cubes);

  const glowTex = createRadialGlowTexture();
  const spriteMat = new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const spriteCoords: Array<[number, number, number]> = [
    [-7, 3, 2],
    [7, -2.5, 1],
    [0, 4.2, -3],
    [-4.5, -3.5, 4],
    [5.2, 3.2, -2],
  ];
  for (const [sx, sy, sz] of spriteCoords) {
    const sp = new THREE.Sprite(spriteMat);
    sp.position.set(sx, sy, sz);
    sp.scale.set(4.5, 4.5, 1);
    scene.add(sp);
  }

  renderer.compile(scene, camera);

  const frameDtsMs: number[] = [];
  let rafId = 0;
  let abortedHidden = false;

  const cleanup = () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    scene.clear();
    cubeGeo.dispose();
    cubeMat.dispose();
    glowTex.dispose();
    spriteMat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };

  try {
    const result = await new Promise<SpeedTestSampleResult>((resolve) => {
      const startTime = performance.now();
      let lastFrame = startTime;
      let measureStartTime: number | null = null;

      const finishNow = (hiddenAbort: boolean) => {
        if (hiddenAbort || frameDtsMs.length < 5) {
          resolve({
            medianFps: 0,
            onePercentLowFps: 0,
            frameCount: frameDtsMs.length,
            durationMs: Math.round(performance.now() - (measureStartTime ?? startTime)),
            abortedHidden: hiddenAbort,
          });
          return;
        }
        const sortedDts = [...frameDtsMs].sort((a, b) => a - b);
        const midIdx = Math.floor(sortedDts.length / 2);
        const medianDt = sortedDts[midIdx] || 16.67;
        const p99Idx = Math.min(sortedDts.length - 1, Math.floor(sortedDts.length * 0.99));
        const p99Dt = sortedDts[p99Idx] || medianDt;
        const medianFps = Math.max(1, Math.round(1000 / medianDt));
        const onePercentLowFps = Math.max(1, Math.round(1000 / p99Dt));

        resolve({
          medianFps,
          onePercentLowFps,
          frameCount: frameDtsMs.length,
          durationMs: Math.round(performance.now() - (measureStartTime ?? startTime)),
          abortedHidden: false,
        });
      };

      const step = (now: number) => {
        if (signal.aborted) {
          finishNow(false);
          return;
        }
        if (document.hidden) {
          abortedHidden = true;
          finishNow(true);
          return;
        }

        const dtMs = now - lastFrame;
        lastFrame = now;
        const elapsedTotal = now - startTime;
        const t = elapsedTotal * 0.001;

        keyLight.position.x = Math.cos(t * 1.4) * 9;
        keyLight.position.z = Math.sin(t * 1.4) * 9 + 4;
        cubes.rotation.y = t * 0.35;
        cubes.rotation.x = Math.sin(t * 0.5) * 0.14;

        const stride = 5;
        for (let i = 0; i < cubeCount; i += stride) {
          const x = basePositions[i * 3];
          const y = basePositions[i * 3 + 1] + Math.sin(t * 2.2 + i * 0.1) * 0.18;
          const z = basePositions[i * 3 + 2];
          SCRATCH_VEC3.set(x, y, z);
          SCRATCH_EULER.set(t + i * 0.02, t * 0.7, 0);
          SCRATCH_QUAT.setFromEuler(SCRATCH_EULER);
          SCRATCH_MAT4.compose(SCRATCH_VEC3, SCRATCH_QUAT, SCRATCH_SCALE);
          cubes.setMatrixAt(i, SCRATCH_MAT4);
        }
        cubes.instanceMatrix.needsUpdate = true;

        renderer.render(scene, camera);

        if (elapsedTotal < warmupMs) {
          onProgress?.('warmup', Math.round((elapsedTotal / warmupMs) * 15));
        } else {
          if (measureStartTime === null) {
            measureStartTime = now;
          } else if (dtMs > 0.5 && dtMs < 500) {
            frameDtsMs.push(dtMs);
          }
          const measureElapsed = now - measureStartTime;
          const pct = Math.min(100, 15 + Math.round((measureElapsed / measureMs) * 85));
          onProgress?.('measuring', pct);

          if (measureElapsed >= measureMs) {
            finishNow(false);
            return;
          }
        }

        rafId = window.requestAnimationFrame(step);
      };

      rafId = window.requestAnimationFrame(step);
    });

    return {
      ...result,
      abortedHidden: result.abortedHidden || abortedHidden,
    };
  } finally {
    cleanup();
  }
}

/**
 * Heavier Realistic verification benchmark (shadows + EffectComposer post effects +
 * IBL studio lighting + procedural PBR normal/roughness maps + 100% scale).
 * Only executed when standard benchmark qualifies for 3D Full.
 */
export async function runRealisticHeavySpeedTest(options: {
  container: HTMLElement;
  signal: AbortSignal;
  onProgress?: (phase: 'warmup' | 'measuring', pct: number) => void;
}): Promise<SpeedTestSampleResult> {
  const {container, signal, onProgress} = options;
  const warmupMs = 400;
  const measureMs = GRAPHICS_THRESHOLDS.REALISTIC_SPEED_TEST_MEASURE_MS;
  const width = Math.max(240, container.clientWidth || 320);
  const height = Math.max(140, container.clientHeight || 180);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = REALISTIC_VISUAL_TUNING.toneMappingExposure;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2); // 100% render scale
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060913);
  scene.fog = new THREE.FogExp2(0x060913, 0.022);
  scene.environment = getOrCreateSessionEnvironment(renderer, true);

  const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
  camera.position.set(0, 4.2, 11.5);
  camera.lookAt(0, 0.8, 0);

  const {keyLight} = addRealisticStudioLights(scene, {
    shadows: true,
    accentColor: 0x22d3ee,
    surfaceColor: 0x0f172a,
    shadowExtent: 7,
  });

  const pbr = await acquireSessionPbrTextures(renderer, 512);
  const realisticConsts = getDetailConstants('realistic');

  const floorGeo = new THREE.PlaneGeometry(24, 24);
  const floorMat = new THREE.MeshStandardMaterial({
    map: pbr.asphaltMap,
    normalMap: pbr.asphaltNormal,
    roughnessMap: pbr.asphaltRoughness,
    roughness: 0.85,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  floor.receiveShadow = true;
  scene.add(floor);

  const heroGeo = new THREE.TorusKnotGeometry(1.1, 0.34, realisticConsts.latheSegments, 28);
  const heroMat = new THREE.MeshPhysicalMaterial({
    color: 0xfbbf24,
    metalness: 0.9,
    roughness: 0.22,
    normalMap: pbr.metalNormal,
    roughnessMap: pbr.metalRoughness,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
  });
  const hero = new THREE.Mesh(heroGeo, heroMat);
  hero.position.set(0, 1.35, 0);
  hero.castShadow = true;
  hero.receiveShadow = true;
  scene.add(hero);

  // Ring of shadowed clearcoat spheres & keycaps using PBR maps
  const sphereGeo = new THREE.SphereGeometry(0.45, realisticConsts.sphereSegments / 2, 24);
  const sphereMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.35,
    roughness: 0.28,
    normalMap: pbr.keycapNormal,
    roughnessMap: pbr.keycapRoughness,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const orbitCount = 240;
  const spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, orbitCount);
  spheres.castShadow = true;
  spheres.receiveShadow = true;
  for (let i = 0; i < orbitCount; i++) {
    const angle = (i / orbitCount) * Math.PI * 2;
    const ring = 2.6 + (i % 6) * 0.72;
    SCRATCH_VEC3.set(Math.cos(angle) * ring, ((i % 5) - 2) * 0.45 + 0.6, Math.sin(angle) * ring);
    SCRATCH_QUAT.identity();
    SCRATCH_MAT4.compose(SCRATCH_VEC3, SCRATCH_QUAT, SCRATCH_SCALE);
    spheres.setMatrixAt(i, SCRATCH_MAT4);
  }
  spheres.instanceMatrix.needsUpdate = true;
  scene.add(spheres);

  const post = createPostPipeline(renderer, scene, camera, {
    width,
    height,
    pixelRatio,
    multisampleSamples: 4,
    enableBloom: true,
    enableVignette: true,
  });

  const frameDtsMs: number[] = [];
  let rafId = 0;
  let abortedHidden = false;

  const cleanup = () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    post.dispose();
    releaseSessionPbrTextures(pbr.sizeTier);
    disposeSessionEnvironmentIfRenderer(renderer);
    scene.environment = null;
    scene.clear();
    floorGeo.dispose();
    floorMat.dispose();
    heroGeo.dispose();
    heroMat.dispose();
    sphereGeo.dispose();
    sphereMat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };

  try {
    const result = await new Promise<SpeedTestSampleResult>((resolve) => {
      const startTime = performance.now();
      let lastFrame = startTime;
      let measureStartTime: number | null = null;

      const finishNow = (hiddenAbort: boolean) => {
        if (hiddenAbort || frameDtsMs.length < 5) {
          resolve({
            medianFps: 0,
            onePercentLowFps: 0,
            frameCount: frameDtsMs.length,
            durationMs: Math.round(performance.now() - (measureStartTime ?? startTime)),
            abortedHidden: hiddenAbort,
          });
          return;
        }
        const sorted = [...frameDtsMs].sort((a, b) => a - b);
        const medianDt = sorted[Math.floor(sorted.length / 2)] || 16.67;
        const p99Dt =
          sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] || medianDt;
        resolve({
          medianFps: Math.max(1, Math.round(1000 / medianDt)),
          onePercentLowFps: Math.max(1, Math.round(1000 / p99Dt)),
          frameCount: frameDtsMs.length,
          durationMs: Math.round(performance.now() - (measureStartTime ?? startTime)),
          abortedHidden: false,
        });
      };

      const step = (now: number) => {
        if (signal.aborted) {
          finishNow(false);
          return;
        }
        if (document.hidden) {
          abortedHidden = true;
          finishNow(true);
          return;
        }

        const dtMs = now - lastFrame;
        lastFrame = now;
        const elapsedTotal = now - startTime;
        const t = elapsedTotal * 0.001;

        hero.rotation.y = t * 0.8;
        hero.rotation.x = Math.sin(t * 0.6) * 0.25;
        spheres.rotation.y = -t * 0.35;
        keyLight.position.x = Math.cos(t * 0.8) * 6;

        post.render(dtMs * 0.001);

        if (elapsedTotal < warmupMs) {
          onProgress?.('warmup', Math.round((elapsedTotal / warmupMs) * 15));
        } else {
          if (measureStartTime === null) {
            measureStartTime = now;
          } else if (dtMs > 0.5 && dtMs < 500) {
            frameDtsMs.push(dtMs);
          }
          const measureElapsed = now - measureStartTime;
          const pct = Math.min(100, 15 + Math.round((measureElapsed / measureMs) * 85));
          onProgress?.('measuring', pct);

          if (measureElapsed >= measureMs) {
            finishNow(false);
            return;
          }
        }

        rafId = window.requestAnimationFrame(step);
      };

      rafId = window.requestAnimationFrame(step);
    });

    return {
      ...result,
      abortedHidden: result.abortedHidden || abortedHidden,
    };
  } finally {
    cleanup();
  }
}
