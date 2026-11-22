import {GRAPHICS_THRESHOLDS} from '@/src/graphics/thresholds';
import type {
  GraphicsDetailLevel,
  RealisticOptions,
  ResolvedGraphicsMode,
} from '@/src/types/app';

export interface DetailTierGeometryConstants {
  sphereSegments: number;
  keycapBevelSegments: number;
  latheSegments: number;
  asteroidIcosaDetail: number;
  carBevelSegments: number;
  roadSubdivisions: number;
  triangleBudget: number;
  drawCallBudget: number;
  textureSize: number;
  heroTextureSize: number;
}

/**
 * Single source of truth for per-tier geometry detail, polygon budgets,
 * draw-call budgets, and procedural texture dimensions across Light / Full / Realistic.
 * Kept Three-free so 2D Classic / main app bundles never import Three.js statically.
 */
export const DETAIL_CONSTANTS: Record<GraphicsDetailLevel, DetailTierGeometryConstants> = {
  light: {
    sphereSegments: 16,
    keycapBevelSegments: 2,
    latheSegments: 32,
    asteroidIcosaDetail: 2,
    carBevelSegments: 1,
    roadSubdivisions: 40,
    triangleBudget: 60_000,
    drawCallBudget: 50,
    textureSize: 256,
    heroTextureSize: 512,
  },
  full: {
    sphereSegments: 32,
    keycapBevelSegments: 4,
    latheSegments: 64,
    asteroidIcosaDetail: 4,
    carBevelSegments: 3,
    roadSubdivisions: 80,
    triangleBudget: 150_000,
    drawCallBudget: 100,
    textureSize: 512,
    heroTextureSize: 1024,
  },
  realistic: {
    sphereSegments: 64,
    keycapBevelSegments: 8,
    latheSegments: 128,
    asteroidIcosaDetail: 6,
    carBevelSegments: 6,
    roadSubdivisions: 160,
    triangleBudget: 400_000,
    drawCallBudget: 150,
    textureSize: 1024,
    heroTextureSize: 2048,
  },
};

export interface LightingColorConstants {
  toneMappingExposure: number;
  darkEnvIntensity: number;
  lightEnvIntensity: number;
  shadowMapSize: number;
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  vignetteOffset: number;
  vignetteDarkness: number;
}

export const REALISTIC_VISUAL_TUNING: LightingColorConstants = {
  toneMappingExposure: 1.06,
  darkEnvIntensity: 0.72,
  lightEnvIntensity: 0.92,
  shadowMapSize: 2048,
  // Only crisp emissive highlights (>0.92 linear luminance) trigger bloom
  bloomThreshold: 0.92,
  bloomStrength: 0.32,
  bloomRadius: 0.28,
  vignetteOffset: 1.05,
  vignetteDarkness: 0.42,
};

export function detailFromResolvedMode(mode: ResolvedGraphicsMode): GraphicsDetailLevel {
  if (mode === '3d-realistic') return 'realistic';
  if (mode === '3d-full') return 'full';
  return 'light';
}

export function getDetailConstants(
  modeOrDetail: ResolvedGraphicsMode | GraphicsDetailLevel,
): DetailTierGeometryConstants {
  if (modeOrDetail === 'light' || modeOrDetail === 'full' || modeOrDetail === 'realistic') {
    return DETAIL_CONSTANTS[modeOrDetail];
  }
  return DETAIL_CONSTANTS[detailFromResolvedMode(modeOrDetail)];
}

export interface ComputedRenderResolution {
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
  renderWidth: number;
  renderHeight: number;
  totalPixels: number;
  clampedByPixelBudget: boolean;
}

/**
 * Computes effective WebGL pixel ratio & backing buffer resolution.
 * For Realistic, multiplies devicePixelRatio (up to 2) by manual renderScale
 * while strictly capping total rendered pixels at GRAPHICS_THRESHOLDS.REALISTIC_MAX_PIXELS (~8M px).
 */
export function computeRenderResolution(params: {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  resolvedMode: ResolvedGraphicsMode;
  realisticOptions?: RealisticOptions;
}): ComputedRenderResolution {
  const safeW = Math.max(1, Math.round(params.cssWidth));
  const safeH = Math.max(1, Math.round(params.cssHeight));
  const dpr = Math.max(1, params.devicePixelRatio || 1);

  if (params.resolvedMode === '2d' || params.resolvedMode === '3d-light') {
    const pixelRatio = 1;
    const renderWidth = safeW;
    const renderHeight = safeH;
    return {
      cssWidth: safeW,
      cssHeight: safeH,
      pixelRatio,
      renderWidth,
      renderHeight,
      totalPixels: renderWidth * renderHeight,
      clampedByPixelBudget: false,
    };
  }

  if (params.resolvedMode === '3d-full') {
    const pixelRatio = Math.min(dpr, 2);
    const renderWidth = Math.round(safeW * pixelRatio);
    const renderHeight = Math.round(safeH * pixelRatio);
    return {
      cssWidth: safeW,
      cssHeight: safeH,
      pixelRatio,
      renderWidth,
      renderHeight,
      totalPixels: renderWidth * renderHeight,
      clampedByPixelBudget: false,
    };
  }

  const scale = params.realisticOptions?.renderScale ?? 1;
  const baseDpr = Math.min(dpr, 2);
  let effectiveRatio = baseDpr * scale;
  const rawPixels = safeW * safeH * effectiveRatio * effectiveRatio;
  let clampedByPixelBudget = false;

  if (rawPixels > GRAPHICS_THRESHOLDS.REALISTIC_MAX_PIXELS) {
    const ratioCeiling = Math.sqrt(GRAPHICS_THRESHOLDS.REALISTIC_MAX_PIXELS / (safeW * safeH));
    effectiveRatio = Math.max(0.5, ratioCeiling);
    clampedByPixelBudget = true;
  }

  const renderWidth = Math.max(1, Math.round(safeW * effectiveRatio));
  const renderHeight = Math.max(1, Math.round(safeH * effectiveRatio));

  return {
    cssWidth: safeW,
    cssHeight: safeH,
    pixelRatio: effectiveRatio,
    renderWidth,
    renderHeight,
    totalPixels: renderWidth * renderHeight,
    clampedByPixelBudget,
  };
}
