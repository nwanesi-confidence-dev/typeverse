import {GRAPHICS_THRESHOLDS} from '@/src/graphics/thresholds';
import type {ResolvedGraphicsMode} from '@/src/types/app';

export const CANONICAL_PLAY_WIDTH = 640;
export const CANONICAL_PLAY_HEIGHT = 360;
export const CANONICAL_PLAY_ASPECT = CANONICAL_PLAY_WIDTH / CANONICAL_PLAY_HEIGHT; // 16:9
export const MAX_EXTENDED_ASPECT = 21 / 9;
export const MAX_2D_CANVAS_PIXELS = GRAPHICS_THRESHOLDS.REALISTIC_MAX_PIXELS; // ~8M px

export interface PlayZoneViewport {
  canvasW: number;
  canvasH: number;
  aspect: number;
  playX: number;
  playY: number;
  playW: number;
  playH: number;
  scale: number;
  isExtendedWide: boolean;
  isTall: boolean;
  /** Width of visual extension zone (clamped at 21:9 max) centered on play zone */
  extendedW: number;
  extendedX: number;
}

export interface Canvas2DBackingSize {
  cssWidth: number;
  cssHeight: number;
  width: number;
  height: number;
  effectiveDpr: number;
  scaleX: number;
  scaleY: number;
  totalPixels: number;
  clampedByPixelBudget: boolean;
}

export interface SafeZoneHudInsets {
  topPx: number;
  leftPx: number;
  rightPx: number;
  bottomPx: number;
  playW: number;
  playH: number;
}

/**
 * Computes a centered canonical 16:9 play zone inside any canvas CSS size.
 * Interactive entities always live in CANONICAL_PLAY_WIDTH x CANONICAL_PLAY_HEIGHT (640x360),
 * so difficulty, travel times, and scoring are identical on every monitor.
 */
export function computePlayZoneViewport(
  cssWidth: number,
  cssHeight: number,
): PlayZoneViewport {
  const canvasW = Math.max(1, cssWidth);
  const canvasH = Math.max(1, cssHeight);
  const aspect = canvasW / canvasH;

  const scale = Math.min(
    canvasW / CANONICAL_PLAY_WIDTH,
    canvasH / CANONICAL_PLAY_HEIGHT,
  );
  const playW = CANONICAL_PLAY_WIDTH * scale;
  const playH = CANONICAL_PLAY_HEIGHT * scale;
  const playX = (canvasW - playW) * 0.5;
  const playY = (canvasH - playH) * 0.5;

  const extendedW = Math.min(canvasW, playH * MAX_EXTENDED_ASPECT);
  const extendedX = (canvasW - extendedW) * 0.5;

  return {
    canvasW,
    canvasH,
    aspect,
    playX,
    playY,
    playW,
    playH,
    scale,
    isExtendedWide: aspect > CANONICAL_PLAY_ASPECT + 0.05,
    isTall: aspect < CANONICAL_PLAY_ASPECT - 0.05,
    extendedW,
    extendedX,
  };
}

/**
 * Computes 2D canvas backing pixel dimensions:
 * CSS size * devicePixelRatio, capped by Graphics mode/hardware capability (1x on low/software, 2x otherwise)
 * and strictly capped at ~8 million pixels to protect memory/fill-rate on 4K/ultrawide screens.
 */
export function computeCanvas2DBackingSize(params: {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  resolvedMode?: ResolvedGraphicsMode;
  isSoftwareRenderer?: boolean;
}): Canvas2DBackingSize {
  const cssW = Math.max(1, Math.round(params.cssWidth));
  const cssH = Math.max(1, Math.round(params.cssHeight));
  const dpr = Math.max(0.5, params.devicePixelRatio || 1);

  const modeDprCap =
    params.isSoftwareRenderer || params.resolvedMode === '3d-light' ? 1 : 2;
  let effectiveDpr = Math.min(dpr, modeDprCap);

  const rawW = Math.max(1, Math.round(cssW * effectiveDpr));
  const rawH = Math.max(1, Math.round(cssH * effectiveDpr));
  let width = rawW;
  let height = rawH;
  let clampedByPixelBudget = false;

  if (rawW * rawH > MAX_2D_CANVAS_PIXELS) {
    const budgetScale = Math.sqrt(MAX_2D_CANVAS_PIXELS / (cssW * cssH));
    effectiveDpr = Math.max(0.25, budgetScale);
    width = Math.max(1, Math.floor(cssW * effectiveDpr));
    height = Math.max(1, Math.floor(cssH * effectiveDpr));
    clampedByPixelBudget = true;
  }

  return {
    cssWidth: cssW,
    cssHeight: cssH,
    width,
    height,
    effectiveDpr,
    scaleX: width / cssW,
    scaleY: height / cssH,
    totalPixels: width * height,
    clampedByPixelBudget,
  };
}

/**
 * Computes DOM overlay safe insets anchored to the canonical 16:9 play zone
 * so 3D game HUD badges never drift into far 21:9/32:9 corners or get clipped.
 */
export function computeSafeZoneHudInsets(
  containerWidth: number,
  containerHeight: number,
): SafeZoneHudInsets {
  const vp = computePlayZoneViewport(containerWidth, containerHeight);
  const padX = Math.max(10, Math.min(18, Math.round(12 * vp.scale)));
  const padY = Math.max(10, Math.min(16, Math.round(12 * vp.scale)));

  const leftPx = Math.max(10, Math.round(vp.playX + padX));
  const rightPx = Math.max(10, Math.round(vp.playX + padX));
  // On portrait canvases where playY can be large, keep HUD near upper rim or play-zone top
  const topPx = Math.max(10, Math.min(Math.round(vp.playY + padY), Math.round(vp.canvasH * 0.16)));
  const bottomPx = Math.max(10, Math.round(vp.playY + padY));

  return {
    topPx,
    leftPx,
    rightPx,
    bottomPx,
    playW: vp.playW,
    playH: vp.playH,
  };
}
