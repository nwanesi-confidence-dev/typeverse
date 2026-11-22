import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {
  computeRenderResolution,
  REALISTIC_VISUAL_TUNING,
} from '@/src/graphics/detail';
import type {RenderSpec3D} from '@/src/graphics/decision';
import {graphicsModeService} from '@/src/graphics/graphicsModeService';
import {getCachedPbrTextureMemoryMb} from '@/src/three/proceduralTextures';

let activeManagedRenderer: THREE.WebGLRenderer | null = null;
let activeRenderSpec: RenderSpec3D | null = null;

// Pre-allocated scratch math instances so loops allocate ZERO objects per frame
export const SCRATCH_VEC2 = new THREE.Vector2();
export const SCRATCH_VEC3_A = new THREE.Vector3();
export const SCRATCH_VEC3_B = new THREE.Vector3();
export const SCRATCH_VEC3_C = new THREE.Vector3();
export const SCRATCH_QUAT = new THREE.Quaternion();
export const SCRATCH_EULER = new THREE.Euler();
export const SCRATCH_MAT4 = new THREE.Matrix4();
export const SCRATCH_COLOR = new THREE.Color();

export class ObjectPool<T> {
  private free: T[] = [];
  private active = new Set<T>();
  private readonly factory: () => T;
  private readonly onReset?: (item: T) => void;

  constructor(initialSize: number, factory: () => T, onReset?: (item: T) => void) {
    this.factory = factory;
    this.onReset = onReset;
    for (let i = 0; i < initialSize; i++) {
      this.free.push(factory());
    }
  }

  public acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.active.add(item);
    return item;
  }

  public release(item: T): void {
    if (!this.active.delete(item)) return;
    this.onReset?.(item);
    this.free.push(item);
  }

  public releaseAll(): void {
    this.active.forEach((item) => {
      this.onReset?.(item);
      this.free.push(item);
    });
    this.active.clear();
  }

  public forEachAll(fn: (item: T) => void): void {
    this.active.forEach(fn);
    this.free.forEach(fn);
  }

  public get activeCount(): number {
    return this.active.size;
  }
}

export interface ThemePalette3D {
  bg: number;
  surface: number;
  accent: number;
  accentSecondary: number;
  success: number;
  error: number;
  warning: number;
  text: number;
  isDark: boolean;
}

function parseCssColorToHex(raw: string, fallback: number): number {
  const clean = raw.trim();
  if (!clean) return fallback;
  try {
    SCRATCH_COLOR.set(clean);
    return SCRATCH_COLOR.getHex();
  } catch {
    return fallback;
  }
}

export function readThemePalette3D(): ThemePalette3D {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      bg: 0x080b14,
      surface: 0x0f1629,
      accent: 0x22d3ee,
      accentSecondary: 0x10b981,
      success: 0x34d399,
      error: 0xfb7185,
      warning: 0xfbbf24,
      text: 0xf1f5f9,
      isDark: true,
    };
  }
  const styles = window.getComputedStyle(document.documentElement);
  const isDark = document.documentElement.classList.contains('dark');
  return {
    bg: parseCssColorToHex(styles.getPropertyValue('--tv-bg'), 0x080b14),
    surface: parseCssColorToHex(styles.getPropertyValue('--tv-surface'), 0x0f1629),
    accent: parseCssColorToHex(styles.getPropertyValue('--tv-accent'), 0x22d3ee),
    accentSecondary: parseCssColorToHex(
      styles.getPropertyValue('--tv-accent-secondary'),
      0x10b981,
    ),
    success: parseCssColorToHex(styles.getPropertyValue('--tv-success'), 0x34d399),
    error: parseCssColorToHex(styles.getPropertyValue('--tv-error'), 0xfb7185),
    warning: parseCssColorToHex(styles.getPropertyValue('--tv-warning'), 0xfbbf24),
    text: parseCssColorToHex(styles.getPropertyValue('--tv-text'), 0xf1f5f9),
    isDark,
  };
}

// ---------------------------------------------------------------------------
// Shared procedural studio environment generator (created once per session & reused)
// ---------------------------------------------------------------------------
interface CachedStudioEnv {
  pmrem: THREE.PMREMGenerator;
  target: THREE.WebGLRenderTarget;
  rendererRef: THREE.WebGLRenderer;
}

let sharedSessionEnv: CachedStudioEnv | null = null;

function createProceduralStudioScene(isDark: boolean): THREE.Scene {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(isDark ? 0x090d1a : 0x1e293b);

  // Soft overhead dome bounce
  const domeGeo = new THREE.SphereGeometry(28, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({
    color: isDark ? 0x0f172a : 0x334155,
    side: THREE.BackSide,
  });
  studio.add(new THREE.Mesh(domeGeo, domeMat));

  // Emissive softbox light panels for rich specular highlights on metallic & clearcoat surfaces
  const panelGeo = new THREE.PlaneGeometry(14, 7);
  const keyPanel = new THREE.Mesh(
    panelGeo,
    new THREE.MeshBasicMaterial({color: 0xf8fafc, side: THREE.DoubleSide}),
  );
  keyPanel.position.set(8, 12, 9);
  keyPanel.lookAt(0, 0, 0);
  studio.add(keyPanel);

  const rimPanel = new THREE.Mesh(
    panelGeo,
    new THREE.MeshBasicMaterial({color: 0x38bdf8, side: THREE.DoubleSide}),
  );
  rimPanel.position.set(-11, 6, -8);
  rimPanel.lookAt(0, 0, 0);
  studio.add(rimPanel);

  const fillPanel = new THREE.Mesh(
    panelGeo,
    new THREE.MeshBasicMaterial({color: 0xa5f3fc, side: THREE.DoubleSide}),
  );
  fillPanel.position.set(0, -10, 8);
  fillPanel.lookAt(0, 0, 0);
  studio.add(fillPanel);

  return studio;
}

export function getOrCreateSessionEnvironment(
  renderer: THREE.WebGLRenderer,
  isRealistic: boolean,
): THREE.Texture {
  // Re-bake only if uninitialized or created against another WebGL context
  if (!sharedSessionEnv || sharedSessionEnv.rendererRef !== renderer) {
    if (sharedSessionEnv) {
      sharedSessionEnv.target.dispose();
      sharedSessionEnv.pmrem.dispose();
      sharedSessionEnv = null;
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    if (isRealistic) {
      const studio = createProceduralStudioScene(true);
      const target = pmrem.fromScene(studio, 0.035);
      disposeThreeScene(studio);
      sharedSessionEnv = {pmrem, target, rendererRef: renderer};
    } else {
      const room = new RoomEnvironment();
      const target = pmrem.fromScene(room, 0.04);
      room.dispose();
      sharedSessionEnv = {pmrem, target, rendererRef: renderer};
    }
  }
  return sharedSessionEnv.target.texture;
}

export function disposeSessionEnvironment(): void {
  if (!sharedSessionEnv) return;
  sharedSessionEnv.target.dispose();
  sharedSessionEnv.pmrem.dispose();
  sharedSessionEnv = null;
}

/**
 * Configures balanced three-point Realistic studio lighting with tight-frustum 2048px soft shadows.
 */
export function addRealisticStudioLights(
  scene: THREE.Scene,
  options: {
    shadows: boolean;
    accentColor: number;
    surfaceColor: number;
    shadowExtent?: number;
  },
): {
  hemi: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  rimLight: THREE.PointLight;
} {
  const hemi = new THREE.HemisphereLight(0xf1f5f9, options.surfaceColor, 0.72);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.15);
  keyLight.position.set(5, 8.5, 6);
  if (options.shadows) {
    const ext = options.shadowExtent ?? 6;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(
      REALISTIC_VISUAL_TUNING.shadowMapSize,
      REALISTIC_VISUAL_TUNING.shadowMapSize,
    );
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 26;
    keyLight.shadow.camera.left = -ext;
    keyLight.shadow.camera.right = ext;
    keyLight.shadow.camera.top = ext;
    keyLight.shadow.camera.bottom = -ext;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.025;
  }
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(options.accentColor, 2.2, 24, 1.4);
  rimLight.position.set(-4.5, 3.2, -3.5);
  scene.add(rimLight);

  return {hemi, keyLight, rimLight};
}

export interface LODLevelEntry {
  object: THREE.Object3D;
  distance: number;
  hysteresis?: number;
}

/**
 * Helper to wrap close/mid/far meshes in THREE.LOD so high-polygon hero geometry
 * only renders near the camera while maintaining clean silhouettes further away.
 */
export function createDetailLOD(levels: LODLevelEntry[]): THREE.LOD {
  const lod = new THREE.LOD();
  const sorted = [...levels].sort((a, b) => a.distance - b.distance);
  for (const level of sorted) {
    lod.addLevel(level.object, level.distance, level.hysteresis ?? 0.08);
  }
  return lod;
}

export interface ManagedRendererContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  pmremGenerator: THREE.PMREMGenerator | null;
  envRenderTarget: THREE.WebGLRenderTarget | null;
  pixelRatio: number;
  resize: (width: number, height: number, camera?: THREE.PerspectiveCamera, baseFov?: number) => void;
  dispose: () => void;
}

export function fitPerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  baseFov: number = 50,
): void {
  const safeH = Math.max(1, height);
  const aspect = Math.max(0.5, width / safeH);
  camera.aspect = aspect;
  if (aspect > 2.0) {
    camera.fov = Math.max(baseFov - 6, baseFov * (1.85 / aspect));
  } else if (aspect < 1.25) {
    camera.fov = Math.min(68, baseFov + (1.25 - aspect) * 18);
  } else {
    camera.fov = baseFov;
  }
  camera.updateProjectionMatrix();
}

export function createManagedRenderer(
  container: HTMLElement,
  preset: RenderSpec3D,
  options?: {
    alpha?: boolean;
    useEnvironment?: boolean;
    clearAlpha?: number;
  },
): ManagedRendererContext {
  const renderer = new THREE.WebGLRenderer({
    antialias: preset.antialias,
    alpha: options?.alpha ?? true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  activeManagedRenderer = renderer;
  activeRenderSpec = preset;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = REALISTIC_VISUAL_TUNING.toneMappingExposure;

  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const realisticOptions = graphicsModeService.getSnapshot().persistedState.realisticOptions;
  const computedRes = computeRenderResolution({
    cssWidth: width,
    cssHeight: height,
    devicePixelRatio: window.devicePixelRatio || 1,
    resolvedMode: preset.mode,
    realisticOptions,
  });

  renderer.setPixelRatio(computedRes.pixelRatio);
  renderer.shadowMap.enabled = preset.shadows;
  if (preset.shadows) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  if (options?.clearAlpha !== undefined) {
    renderer.setClearColor(0x000000, options.clearAlpha);
  }

  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const isRealistic = preset.mode === '3d-realistic';
  const palette = readThemePalette3D();
  if (options?.useEnvironment !== false && preset.useEnvironment) {
    scene.environment = getOrCreateSessionEnvironment(renderer, isRealistic);
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = palette.isDark
        ? REALISTIC_VISUAL_TUNING.darkEnvIntensity
        : REALISTIC_VISUAL_TUNING.lightEnvIntensity;
    }
  }

  let currentPixelRatio = computedRes.pixelRatio;

  const resize = (
    w: number,
    h: number,
    camera?: THREE.PerspectiveCamera,
    baseFov?: number,
  ) => {
    const safeW = Math.max(1, w);
    const safeH = Math.max(1, h);
    const currentRealisticOpts = graphicsModeService.getSnapshot().persistedState.realisticOptions;
    const nextRes = computeRenderResolution({
      cssWidth: safeW,
      cssHeight: safeH,
      devicePixelRatio: window.devicePixelRatio || 1,
      resolvedMode: preset.mode,
      realisticOptions: currentRealisticOpts,
    });
    currentPixelRatio = nextRes.pixelRatio;
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setSize(safeW, safeH, false);
    if (camera) {
      fitPerspectiveCamera(camera, safeW, safeH, baseFov);
    }
  };

  const dispose = () => {
    if (activeManagedRenderer === renderer) {
      activeManagedRenderer = null;
      activeRenderSpec = null;
      graphicsModeService.clearLiveStats();
    }
    if (sharedSessionEnv && sharedSessionEnv.rendererRef === renderer) {
      disposeSessionEnvironment();
    }
    scene.environment = null;
    disposeThreeScene(scene);
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    renderer,
    scene,
    pmremGenerator: sharedSessionEnv?.pmrem ?? null,
    envRenderTarget: sharedSessionEnv?.target ?? null,
    get pixelRatio() {
      return currentPixelRatio;
    },
    resize,
    dispose,
  };
}

function disposeMaterialAndTextures(material: THREE.Material): void {
  const matRecord = material as unknown as Record<string, unknown>;
  const textureKeys = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'alphaMap',
    'aoMap',
    'envMap',
    'bumpMap',
    'specularMap',
  ];
  for (const key of textureKeys) {
    const val = matRecord[key];
    // Preserve shared cached procedural textures (destroyed centrally by clearSessionPbrTextureCache)
    if (
      val &&
      typeof (val as THREE.Texture).dispose === 'function' &&
      !(val as THREE.Texture).userData?.sharedSessionTexture
    ) {
      (val as THREE.Texture).dispose();
    }
  }
  material.dispose();
}

export function disposeThreeScene(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach(disposeMaterialAndTextures);
    } else if (mat) {
      disposeMaterialAndTextures(mat);
    }
  });
  scene.clear();
}

export interface LoopController {
  start: () => void;
  stop: () => void;
  setTargetFps: (fps: number) => void;
}

export function createCappedLoop(options: {
  targetFps: number;
  isSoftwareGl: boolean;
  onFrame: (dtSec: number, elapsedSec: number) => void;
  onSampleDtMs?: (dtMs: number) => void;
}): LoopController {
  let running = false;
  let rafId = 0;
  let timerId = 0;
  let targetFps = Math.max(10, options.targetFps);
  let lastNow = performance.now();
  let lastRender = lastNow;
  let elapsedSec = 0;

  const scheduleNext = (fn: () => void) => {
    if (!running) return;
    if (options.isSoftwareGl) {
      rafId = window.requestAnimationFrame(() => {
        if (!running) return;
        timerId = window.setTimeout(() => {
          if (running) fn();
        }, 4);
      });
    } else {
      rafId = window.requestAnimationFrame(fn);
    }
  };

  const tick = () => {
    if (!running) return;
    const now = performance.now();
    if (document.hidden) {
      lastNow = now;
      lastRender = now;
      scheduleNext(tick);
      return;
    }

    const minIntervalMs = 1000 / Math.max(10, targetFps);
    const sinceRender = now - lastRender;
    if (sinceRender + 1.2 < minIntervalMs) {
      scheduleNext(tick);
      return;
    }

    const rawDtMs = now - lastNow;
    lastNow = now;
    lastRender = now;

    const clampedDtSec = Math.min(0.05, Math.max(0.001, rawDtMs / 1000));
    elapsedSec += clampedDtSec;

    const frameStart = performance.now();
    options.onFrame(clampedDtSec, elapsedSec);
    const frameWorkMs = performance.now() - frameStart;

    const drawCalls = activeManagedRenderer ? activeManagedRenderer.info.render.calls : null;
    const triangles = activeManagedRenderer ? activeManagedRenderer.info.render.triangles : null;
    const glTexCount = activeManagedRenderer ? activeManagedRenderer.info.memory.textures : 0;
    const approxTexMb =
      Math.round((getCachedPbrTextureMemoryMb() + glTexCount * 0.45) * 10) / 10;

    let renderResolution: {width: number; height: number; totalPixels: number} | null = null;
    if (activeManagedRenderer) {
      const buf = activeManagedRenderer.getDrawingBufferSize(SCRATCH_VEC2);
      const rw = Math.max(1, Math.round(buf.x));
      const rh = Math.max(1, Math.round(buf.y));
      renderResolution = {width: rw, height: rh, totalPixels: rw * rh};
    }

    graphicsModeService.recordLiveStats(rawDtMs, drawCalls, {
      targetFps,
      frameWorkMs,
      triangles,
      textureMemoryMb: approxTexMb,
      renderResolution,
      shadowsActive: activeRenderSpec?.shadows ?? false,
      postEffectsActive: activeRenderSpec?.postEffects ?? false,
    });
    options.onSampleDtMs?.(rawDtMs);

    scheduleNext(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastNow = performance.now();
      lastRender = lastNow;
      scheduleNext(tick);
    },
    stop() {
      running = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (timerId) {
        window.clearTimeout(timerId);
        timerId = 0;
      }
    },
    setTargetFps(fps: number) {
      targetFps = Math.max(10, fps);
    },
  };
}
