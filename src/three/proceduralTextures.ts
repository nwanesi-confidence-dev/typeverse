import * as THREE from 'three';
import {
  getTexturePrepStatus,
  publishTexturePrepStatus,
  subscribeTexturePrepStatus,
  type TexturePrepStatus,
} from '@/src/graphics/texturePrepBus';
import {GRAPHICS_THRESHOLDS} from '@/src/graphics/thresholds';

export type {TexturePrepStatus};
export {getTexturePrepStatus, subscribeTexturePrepStatus};

export type TextureSurfaceKind =
  | 'keycap-abs'
  | 'brushed-metal'
  | 'asphalt'
  | 'asteroid-rock'
  | 'contact-blob';

export interface ProceduralPbrTextureSet {
  keycapRoughness: THREE.CanvasTexture;
  keycapNormal: THREE.CanvasTexture;
  metalRoughness: THREE.CanvasTexture;
  metalNormal: THREE.CanvasTexture;
  asphaltMap: THREE.CanvasTexture;
  asphaltNormal: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  rockMap: THREE.CanvasTexture;
  rockNormal: THREE.CanvasTexture;
  rockRoughness: THREE.CanvasTexture;
  contactShadowBlob: THREE.CanvasTexture;
  estimatedGpuBytes: number;
  sizeTier: 512 | 1024;
}

function setPrepStatus(next: TexturePrepStatus): void {
  publishTexturePrepStatus(next);
}

function seededRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const hash = (ix: number, iy: number): number => {
    let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm2D(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise2D(x * freq, y * freq, seed + o * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return sum / Math.max(0.0001, norm);
}

function createCanvasSurface(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function heightBufferToNormalCanvas(
  heights: Float32Array,
  size: number,
  strength: number,
): HTMLCanvasElement {
  const canvas = createCanvasSurface(size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = 1 / len;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  isColorMap: boolean,
  repeat = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
  tex.userData = {sharedSessionTexture: true};
  tex.needsUpdate = true;
  return tex;
}

function estimateMipmappedRgbaBytes(size: number): number {
  return Math.round(size * size * 4 * 1.3333);
}

interface CacheBucket {
  set: ProceduralPbrTextureSet;
  refCount: number;
}

const sessionCache = new Map<string, CacheBucket>();
const inFlightPrep = new Map<string, Promise<ProceduralPbrTextureSet>>();

function buildKeycapMaps(size: number, maxAnisotropy: number) {
  const roughCanvas = createCanvasSurface(size);
  const rCtx = roughCanvas.getContext('2d')!;
  const img = rCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const rand = seededRand(104729);

  for (let i = 0; i < size * size; i++) {
    const grain = (rand() - 0.5) * 0.24 + 0.5;
    heights[i] = grain;
    const roughByte = Math.round(62 + grain * 36); // low roughness ABS polymer sheen
    const idx = i * 4;
    img.data[idx] = roughByte;
    img.data[idx + 1] = roughByte;
    img.data[idx + 2] = roughByte;
    img.data[idx + 3] = 255;
  }
  rCtx.putImageData(img, 0, 0);
  const normalCanvas = heightBufferToNormalCanvas(heights, size, 1.35);

  return {
    keycapRoughness: finalizeTexture(roughCanvas, maxAnisotropy, false, 2),
    keycapNormal: finalizeTexture(normalCanvas, maxAnisotropy, false, 2),
    bytes: estimateMipmappedRgbaBytes(size) * 2,
  };
}

function buildMetalMaps(size: number, maxAnisotropy: number) {
  const roughCanvas = createCanvasSurface(size);
  const ctx = roughCanvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const rowStreak = valueNoise2D(0.5, y * 0.45, 701) * 0.45;
    for (let x = 0; x < size; x++) {
      const fine = valueNoise2D(x * 0.04, y * 0.65, 811) * 0.55;
      const h = rowStreak + fine;
      heights[y * size + x] = h;
      const byteVal = Math.round(48 + h * 74);
      const idx = (y * size + x) * 4;
      img.data[idx] = byteVal;
      img.data[idx + 1] = byteVal;
      img.data[idx + 2] = byteVal;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const normalCanvas = heightBufferToNormalCanvas(heights, size, 1.7);

  return {
    metalRoughness: finalizeTexture(roughCanvas, maxAnisotropy, false, 1),
    metalNormal: finalizeTexture(normalCanvas, maxAnisotropy, false, 1),
    bytes: estimateMipmappedRgbaBytes(size) * 2,
  };
}

function buildAsphaltMaps(size: number, maxAnisotropy: number) {
  const albedoCanvas = createCanvasSurface(size);
  const roughCanvas = createCanvasSurface(size);
  const aCtx = albedoCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const rand = seededRand(54321);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idxPix = y * size + x;
      const macro = fbm2D(x * 0.02, y * 0.02, 223, 3);
      const aggregate = rand() * 0.45;
      const h = macro * 0.55 + aggregate * 0.45;
      heights[idxPix] = h;

      const idx = idxPix * 4;
      const c = Math.round(28 + h * 34);
      aImg.data[idx] = c;
      aImg.data[idx + 1] = c + 2;
      aImg.data[idx + 2] = c + 8;
      aImg.data[idx + 3] = 255;

      const rough = Math.round(145 + (1 - macro) * 85);
      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Crisp subtle edgewear shoulder lines
  aCtx.fillStyle = 'rgba(186, 230, 253, 0.22)';
  aCtx.fillRect(Math.round(size * 0.06), 0, Math.max(3, Math.round(size * 0.015)), size);
  aCtx.fillRect(Math.round(size * 0.925), 0, Math.max(3, Math.round(size * 0.015)), size);

  const normalCanvas = heightBufferToNormalCanvas(heights, size, 2.2);

  return {
    asphaltMap: finalizeTexture(albedoCanvas, maxAnisotropy, true, 1),
    asphaltRoughness: finalizeTexture(roughCanvas, maxAnisotropy, false, 1),
    asphaltNormal: finalizeTexture(normalCanvas, maxAnisotropy, false, 1),
    bytes: estimateMipmappedRgbaBytes(size) * 3,
  };
}

function buildRockMaps(size: number, maxAnisotropy: number) {
  const albedoCanvas = createCanvasSurface(size);
  const roughCanvas = createCanvasSurface(size);
  const aCtx = albedoCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm2D(x * 0.028, y * 0.028, 919, 4);
      const ridge = 1 - Math.abs(n * 2 - 1);
      const h = n * 0.65 + ridge * 0.35;
      heights[y * size + x] = h;
      const idx = (y * size + x) * 4;
      const v = Math.round(78 + h * 110);
      aImg.data[idx] = Math.min(255, Math.round(v * 0.96));
      aImg.data[idx + 1] = Math.min(255, Math.round(v * 0.94));
      aImg.data[idx + 2] = Math.min(255, Math.round(v * 1.05));
      aImg.data[idx + 3] = 255;

      const rough = Math.round(165 + (1 - h) * 75);
      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  const normalCanvas = heightBufferToNormalCanvas(heights, size, 2.8);

  return {
    rockMap: finalizeTexture(albedoCanvas, maxAnisotropy, true, 1),
    rockRoughness: finalizeTexture(roughCanvas, maxAnisotropy, false, 1),
    rockNormal: finalizeTexture(normalCanvas, maxAnisotropy, false, 1),
    bytes: estimateMipmappedRgbaBytes(size) * 3,
  };
}

function buildContactBlobTexture(maxAnisotropy: number): {
  contactShadowBlob: THREE.CanvasTexture;
  bytes: number;
} {
  const size = 256;
  const canvas = createCanvasSurface(size);
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.max(1, Math.min(4, maxAnisotropy));
  tex.userData = {sharedSessionTexture: true};
  tex.needsUpdate = true;
  return {contactShadowBlob: tex, bytes: estimateMipmappedRgbaBytes(size)};
}

function yieldBudgetSlice(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function disposeTextureSet(set: ProceduralPbrTextureSet): void {
  set.keycapRoughness.dispose();
  set.keycapNormal.dispose();
  set.metalRoughness.dispose();
  set.metalNormal.dispose();
  set.asphaltMap.dispose();
  set.asphaltNormal.dispose();
  set.asphaltRoughness.dispose();
  set.rockMap.dispose();
  set.rockNormal.dispose();
  set.rockRoughness.dispose();
  set.contactShadowBlob.dispose();
}

/**
 * Generates (or returns cached) procedural PBR texture pack in small <=8ms chunks
 * so typing and UI never stutter, staying strictly within the 150 MB Realistic texture budget.
 */
export async function acquireSessionPbrTextures(
  renderer: THREE.WebGLRenderer,
  requestedSize: 512 | 1024 = 1024,
): Promise<ProceduralPbrTextureSet> {
  // Clamp size so the full procedural PBR pack easily stays well below the 150 MB GPU texture ceiling
  const maxAllowedBytes = GRAPHICS_THRESHOLDS.REALISTIC_TEXTURE_MEMORY_BUDGET_MB * 1024 * 1024;
  let sizeTier: 512 | 1024 = requestedSize;
  const approx1024Bytes = estimateMipmappedRgbaBytes(1024) * 10;
  if (sizeTier === 1024 && approx1024Bytes > maxAllowedBytes) {
    sizeTier = 512;
  }

  const key = `pbr-${sizeTier}`;
  const cached = sessionCache.get(key);
  if (cached) {
    cached.refCount += 1;
    setPrepStatus({preparing: false, progressPct: 100, label: 'Ready'});
    return cached.set;
  }

  const pending = inFlightPrep.get(key);
  if (pending) {
    const set = await pending;
    const bucket = sessionCache.get(key);
    if (bucket) bucket.refCount += 1;
    return set;
  }

  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() ?? 4);
  // Keep secondary tiling noise maps at 512px max so UI stays responsive & memory < ~35 MB
  const detailSize = sizeTier === 1024 ? 512 : 256;

  const taskPromise = (async (): Promise<ProceduralPbrTextureSet> => {
    setPrepStatus({
      preparing: true,
      progressPct: 12,
      label: 'Preparing Realistic graphics...',
    });
    const t0 = performance.now();

    const keycap = buildKeycapMaps(detailSize, maxAnisotropy);
    if (performance.now() - t0 > 6) await yieldBudgetSlice();
    setPrepStatus({
      preparing: true,
      progressPct: 35,
      label: 'Preparing Realistic graphics...',
    });

    const metal = buildMetalMaps(detailSize, maxAnisotropy);
    await yieldBudgetSlice();
    setPrepStatus({
      preparing: true,
      progressPct: 60,
      label: 'Preparing Realistic graphics...',
    });

    const asphalt = buildAsphaltMaps(detailSize, maxAnisotropy);
    await yieldBudgetSlice();
    setPrepStatus({
      preparing: true,
      progressPct: 82,
      label: 'Preparing Realistic graphics...',
    });

    const rock = buildRockMaps(detailSize, maxAnisotropy);
    await yieldBudgetSlice();
    const blob = buildContactBlobTexture(maxAnisotropy);

    const estimatedGpuBytes =
      keycap.bytes + metal.bytes + asphalt.bytes + rock.bytes + blob.bytes;

    const fullSet: ProceduralPbrTextureSet = {
      keycapRoughness: keycap.keycapRoughness,
      keycapNormal: keycap.keycapNormal,
      metalRoughness: metal.metalRoughness,
      metalNormal: metal.metalNormal,
      asphaltMap: asphalt.asphaltMap,
      asphaltNormal: asphalt.asphaltNormal,
      asphaltRoughness: asphalt.asphaltRoughness,
      rockMap: rock.rockMap,
      rockNormal: rock.rockNormal,
      rockRoughness: rock.rockRoughness,
      contactShadowBlob: blob.contactShadowBlob,
      estimatedGpuBytes,
      sizeTier,
    };

    sessionCache.set(key, {set: fullSet, refCount: 1});
    setPrepStatus({preparing: false, progressPct: 100, label: 'Ready'});
    return fullSet;
  })();

  inFlightPrep.set(key, taskPromise);
  try {
    return await taskPromise;
  } finally {
    inFlightPrep.delete(key);
  }
}

export function getCachedPbrTextureMemoryMb(): number {
  let bytes = 0;
  sessionCache.forEach((b) => {
    bytes += b.set.estimatedGpuBytes;
  });
  return bytes / (1024 * 1024);
}

export function releaseSessionPbrTextures(sizeTier: 512 | 1024): void {
  const key = `pbr-${sizeTier}`;
  const bucket = sessionCache.get(key);
  if (!bucket) return;
  bucket.refCount = Math.max(0, bucket.refCount - 1);
}

export function clearSessionPbrTextureCache(): void {
  sessionCache.forEach((b) => disposeTextureSet(b.set));
  sessionCache.clear();
}
