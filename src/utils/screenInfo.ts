import {useSyncExternalStore} from 'react';
import type {InterfaceSizePreference, LayoutPreference} from '@/src/types/app';

export type ScreenSizeClass = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type ScreenAspectClass =
  | 'portrait'
  | 'standard'
  | 'wide'
  | 'ultrawide'
  | 'super-ultrawide';
export type ScreenOrientation = 'portrait' | 'landscape';
export type LayoutProfile =
  | 'compact'
  | 'portrait'
  | 'standard'
  | 'wide'
  | 'super-ultrawide'
  | 'focus';

export interface EmulatedScreenSize {
  width: number;
  height: number;
  label: string;
}

export interface LayoutTesterPreset extends EmulatedScreenSize {
  id: string;
  tag: string;
}

export const BASELINE_WIDTH = 1366;
export const BASELINE_HEIGHT = 768;
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 2.2;

export const INTERFACE_SIZE_MULTIPLIERS: Record<InterfaceSizePreference, number> = {
  auto: 1.0,
  small: 0.85,
  medium: 1.0,
  large: 1.18,
  'extra-large': 1.35,
};

export const LAYOUT_TESTER_PRESETS: LayoutTesterPreset[] = [
  {id: '1366x768', label: '1366×768', tag: 'Baseline', width: 1366, height: 768},
  {id: '1920x1080', label: '1920×1080', tag: 'FHD', width: 1920, height: 1080},
  {id: '2560x1440', label: '2560×1440', tag: 'QHD', width: 2560, height: 1440},
  {id: '3440x1440', label: '3440×1440', tag: '34" 21:9', width: 3440, height: 1440},
  {id: '3840x1600', label: '3840×1600', tag: '38" UW', width: 3840, height: 1600},
  {id: '5120x1440', label: '5120×1440', tag: '32:9 SUW', width: 5120, height: 1440},
  {id: '3840x2160', label: '3840×2160', tag: '4K', width: 3840, height: 2160},
  {id: '1080x1920', label: '1080×1920', tag: 'Portrait', width: 1080, height: 1920},
];

export interface ScreenInfoState {
  width: number;
  height: number;
  aspectRatio: number;
  devicePixelRatio: number;
  orientation: ScreenOrientation;
  sizeClass: ScreenSizeClass;
  aspectClass: ScreenAspectClass;
  layoutProfile: LayoutProfile;
  showSidePanels: boolean;
  uiScale: number;
  baseScale: number;
  layoutPreference: LayoutPreference;
  interfaceSize: InterfaceSizePreference;
  widePanels: boolean;
  emulatedSize: EmulatedScreenSize | null;
  fitToWindow: boolean;
  hostWindowWidth: number;
  hostWindowHeight: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function classifySize(width: number): ScreenSizeClass {
  if (width < 768) return 'xs';
  if (width < 1024) return 'sm';
  if (width < 1280) return 'md';
  if (width < 1600) return 'lg';
  if (width < 2400) return 'xl';
  return '2xl';
}

export function classifyAspect(aspectRatio: number): ScreenAspectClass {
  if (aspectRatio < 1.0) return 'portrait';
  if (aspectRatio < 2.0) return 'standard';
  if (aspectRatio < 2.3) return 'wide';
  if (aspectRatio < 2.8) return 'ultrawide';
  return 'super-ultrawide';
}

export function resolveLayoutProfile(params: {
  width: number;
  height: number;
  aspectRatio: number;
  layoutPreference: LayoutPreference;
}): LayoutProfile {
  const {width, height, aspectRatio, layoutPreference} = params;
  if (layoutPreference === 'focus') return 'focus';
  if (layoutPreference === 'standard') return 'standard';
  if (layoutPreference === 'wide') {
    return aspectRatio >= 2.8 ? 'super-ultrawide' : 'wide';
  }
  // Auto resolution
  if (aspectRatio < 1.0) return 'portrait';
  if (width < 1100 || height < 650) return 'compact';
  if (aspectRatio >= 2.8) return 'super-ultrawide';
  if (aspectRatio >= 2.0) return 'wide';
  return 'standard';
}

export function computeUiScale(params: {
  width: number;
  height: number;
  interfaceSize: InterfaceSizePreference;
}): {baseScale: number; uiScale: number} {
  const w = Math.max(320, params.width);
  const h = Math.max(240, params.height);
  const baseRaw = Math.min(w / BASELINE_WIDTH, h / BASELINE_HEIGHT);
  const baseScale = Math.round(clamp(baseRaw, UI_SCALE_MIN, UI_SCALE_MAX) * 1000) / 1000;
  const multiplier = INTERFACE_SIZE_MULTIPLIERS[params.interfaceSize] ?? 1;
  const uiScale =
    Math.round(clamp(baseScale * multiplier, UI_SCALE_MIN, UI_SCALE_MAX) * 1000) / 1000;
  return {baseScale, uiScale};
}

export function computeScreenInfoSnapshot(params: {
  width: number;
  height: number;
  devicePixelRatio: number;
  layoutPreference: LayoutPreference;
  interfaceSize: InterfaceSizePreference;
  widePanels: boolean;
  emulatedSize: EmulatedScreenSize | null;
  fitToWindow: boolean;
  hostWindowWidth: number;
  hostWindowHeight: number;
}): ScreenInfoState {
  const width = Math.max(1, Math.round(params.width));
  const height = Math.max(1, Math.round(params.height));
  const aspectRatio = Math.round((width / height) * 1000) / 1000;
  const orientation: ScreenOrientation = height > width ? 'portrait' : 'landscape';
  const sizeClass = classifySize(width);
  const aspectClass = classifyAspect(aspectRatio);
  const layoutProfile = resolveLayoutProfile({
    width,
    height,
    aspectRatio,
    layoutPreference: params.layoutPreference,
  });
  const showSidePanels =
    params.widePanels &&
    (layoutProfile === 'wide' || layoutProfile === 'super-ultrawide');
  const {baseScale, uiScale} = computeUiScale({
    width,
    height,
    interfaceSize: params.interfaceSize,
  });

  return {
    width,
    height,
    aspectRatio,
    devicePixelRatio: Math.max(0.5, params.devicePixelRatio || 1),
    orientation,
    sizeClass,
    aspectClass,
    layoutProfile,
    showSidePanels,
    uiScale,
    baseScale,
    layoutPreference: params.layoutPreference,
    interfaceSize: params.interfaceSize,
    widePanels: params.widePanels,
    emulatedSize: params.emulatedSize,
    fitToWindow: params.fitToWindow,
    hostWindowWidth: Math.max(1, Math.round(params.hostWindowWidth)),
    hostWindowHeight: Math.max(1, Math.round(params.hostWindowHeight)),
  };
}

function getInitialDimensions() {
  if (typeof window === 'undefined') {
    return {
      width: BASELINE_WIDTH,
      height: BASELINE_HEIGHT,
      dpr: 1,
    };
  }
  return {
    width: window.innerWidth || BASELINE_WIDTH,
    height: window.innerHeight || BASELINE_HEIGHT,
    dpr: window.devicePixelRatio || 1,
  };
}

const initDims = getInitialDimensions();

let currentState: ScreenInfoState = computeScreenInfoSnapshot({
  width: initDims.width,
  height: initDims.height,
  devicePixelRatio: initDims.dpr,
  layoutPreference: 'auto',
  interfaceSize: 'auto',
  widePanels: true,
  emulatedSize: null,
  fitToWindow: true,
  hostWindowWidth: initDims.width,
  hostWindowHeight: initDims.height,
});

const listeners = new Set<() => void>();
let rootElement: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let rafId: number | null = null;
let dprMediaCleanup: (() => void) | null = null;
let windowListenersAttached = false;

let pendingMetrics = {
  width: initDims.width,
  height: initDims.height,
  dpr: initDims.dpr,
  hostWindowWidth: initDims.width,
  hostWindowHeight: initDims.height,
};

function applyScreenTokensToDom(state: ScreenInfoState): void {
  if (typeof document === 'undefined') return;
  const docEl = document.documentElement;
  docEl.style.setProperty('--ui-scale', String(state.uiScale));
  docEl.style.setProperty('--tv-root-width', `${state.width}px`);
  docEl.style.setProperty('--tv-root-height', `${state.height}px`);
  docEl.setAttribute('data-size-class', state.sizeClass);
  docEl.setAttribute('data-aspect-class', state.aspectClass);
  docEl.setAttribute('data-orientation', state.orientation);
  docEl.setAttribute('data-layout-profile', state.layoutProfile);
  docEl.setAttribute('data-wide-panels', String(state.showSidePanels));
}

function commitState(next: ScreenInfoState): void {
  const unchanged =
    next.width === currentState.width &&
    next.height === currentState.height &&
    next.devicePixelRatio === currentState.devicePixelRatio &&
    next.layoutProfile === currentState.layoutProfile &&
    next.showSidePanels === currentState.showSidePanels &&
    next.uiScale === currentState.uiScale &&
    next.layoutPreference === currentState.layoutPreference &&
    next.interfaceSize === currentState.interfaceSize &&
    next.widePanels === currentState.widePanels &&
    next.emulatedSize?.width === currentState.emulatedSize?.width &&
    next.emulatedSize?.height === currentState.emulatedSize?.height &&
    next.fitToWindow === currentState.fitToWindow &&
    next.hostWindowWidth === currentState.hostWindowWidth &&
    next.hostWindowHeight === currentState.hostWindowHeight;

  if (unchanged) return;
  currentState = next;
  applyScreenTokensToDom(next);
  listeners.forEach((fn) => fn());
}

function recomputeImmediate(): void {
  const next = computeScreenInfoSnapshot({
    width: pendingMetrics.width,
    height: pendingMetrics.height,
    devicePixelRatio: pendingMetrics.dpr,
    layoutPreference: currentState.layoutPreference,
    interfaceSize: currentState.interfaceSize,
    widePanels: currentState.widePanels,
    emulatedSize: currentState.emulatedSize,
    fitToWindow: currentState.fitToWindow,
    hostWindowWidth: pendingMetrics.hostWindowWidth,
    hostWindowHeight: pendingMetrics.hostWindowHeight,
  });
  commitState(next);
}

function scheduleUpdate(): void {
  if (typeof window === 'undefined') {
    recomputeImmediate();
    return;
  }
  if (rafId !== null) return;
  rafId = window.requestAnimationFrame(() => {
    rafId = null;
    recomputeImmediate();
  });
}

function bindDprListener(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  if (dprMediaCleanup) {
    dprMediaCleanup();
    dprMediaCleanup = null;
  }
  const dpr = window.devicePixelRatio || 1;
  pendingMetrics.dpr = dpr;
  const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
  const onDprChange = () => {
    pendingMetrics.dpr = window.devicePixelRatio || 1;
    pendingMetrics.hostWindowWidth = window.innerWidth || pendingMetrics.hostWindowWidth;
    pendingMetrics.hostWindowHeight = window.innerHeight || pendingMetrics.hostWindowHeight;
    scheduleUpdate();
    bindDprListener();
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onDprChange);
    dprMediaCleanup = () => mq.removeEventListener('change', onDprChange);
  }
}

function ensureGlobalListeners(): void {
  if (typeof window === 'undefined' || windowListenersAttached) return;
  windowListenersAttached = true;
  bindDprListener();

  const onHostResize = () => {
    pendingMetrics.hostWindowWidth = window.innerWidth || pendingMetrics.hostWindowWidth;
    pendingMetrics.hostWindowHeight = window.innerHeight || pendingMetrics.hostWindowHeight;
    pendingMetrics.dpr = window.devicePixelRatio || 1;
    scheduleUpdate();
  };
  window.addEventListener('resize', onHostResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onHostResize);
  }
  if (window.desktop?.onDisplayMetricsChanged) {
    window.desktop.onDisplayMetricsChanged((info) => {
      pendingMetrics.dpr = window.devicePixelRatio || info.scaleFactor || 1;
      pendingMetrics.hostWindowWidth = window.innerWidth || pendingMetrics.hostWindowWidth;
      pendingMetrics.hostWindowHeight = window.innerHeight || pendingMetrics.hostWindowHeight;
      if (!currentState.emulatedSize && rootElement) {
        pendingMetrics.width = rootElement.clientWidth || window.innerWidth || pendingMetrics.width;
        pendingMetrics.height = rootElement.clientHeight || window.innerHeight || pendingMetrics.height;
      }
      bindDprListener();
      recomputeImmediate();
    });
  }
}

export function attachScreenRoot(el: HTMLElement | null): void {
  if (el === rootElement) return;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  rootElement = el;
  if (!el || typeof window === 'undefined') return;

  ensureGlobalListeners();

  const rectWidth = el.clientWidth || currentState.emulatedSize?.width || window.innerWidth;
  const rectHeight = el.clientHeight || currentState.emulatedSize?.height || window.innerHeight;
  pendingMetrics = {
    width: rectWidth,
    height: rectHeight,
    dpr: window.devicePixelRatio || 1,
    hostWindowWidth: window.innerWidth || rectWidth,
    hostWindowHeight: window.innerHeight || rectHeight,
  };
  recomputeImmediate();

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w > 0 && h > 0) {
        pendingMetrics.width = w;
        pendingMetrics.height = h;
      }
      pendingMetrics.dpr = window.devicePixelRatio || 1;
      pendingMetrics.hostWindowWidth = window.innerWidth || pendingMetrics.hostWindowWidth;
      pendingMetrics.hostWindowHeight = window.innerHeight || pendingMetrics.hostWindowHeight;
      scheduleUpdate();
    });
    resizeObserver.observe(el);
  }
}

export const screenInfoService = {
  getSnapshot(): ScreenInfoState {
    return currentState;
  },
  setPreferences(params: {
    layoutPreference: LayoutPreference;
    interfaceSize: InterfaceSizePreference;
    widePanels: boolean;
  }): void {
    const next = computeScreenInfoSnapshot({
      width: pendingMetrics.width,
      height: pendingMetrics.height,
      devicePixelRatio: pendingMetrics.dpr,
      layoutPreference: params.layoutPreference,
      interfaceSize: params.interfaceSize,
      widePanels: params.widePanels,
      emulatedSize: currentState.emulatedSize,
      fitToWindow: currentState.fitToWindow,
      hostWindowWidth: pendingMetrics.hostWindowWidth,
      hostWindowHeight: pendingMetrics.hostWindowHeight,
    });
    commitState(next);
  },
  setEmulatedSize(preset: EmulatedScreenSize | null): void {
    if (preset) {
      pendingMetrics.width = preset.width;
      pendingMetrics.height = preset.height;
    } else if (rootElement && typeof window !== 'undefined') {
      pendingMetrics.width = window.innerWidth || pendingMetrics.width;
      pendingMetrics.height = window.innerHeight || pendingMetrics.height;
    }
    const next = computeScreenInfoSnapshot({
      width: pendingMetrics.width,
      height: pendingMetrics.height,
      devicePixelRatio: pendingMetrics.dpr,
      layoutPreference: currentState.layoutPreference,
      interfaceSize: currentState.interfaceSize,
      widePanels: currentState.widePanels,
      emulatedSize: preset,
      fitToWindow: currentState.fitToWindow,
      hostWindowWidth: pendingMetrics.hostWindowWidth,
      hostWindowHeight: pendingMetrics.hostWindowHeight,
    });
    commitState(next);
  },
  setFitToWindow(fitToWindow: boolean): void {
    const next = computeScreenInfoSnapshot({
      width: pendingMetrics.width,
      height: pendingMetrics.height,
      devicePixelRatio: pendingMetrics.dpr,
      layoutPreference: currentState.layoutPreference,
      interfaceSize: currentState.interfaceSize,
      widePanels: currentState.widePanels,
      emulatedSize: currentState.emulatedSize,
      fitToWindow,
      hostWindowWidth: pendingMetrics.hostWindowWidth,
      hostWindowHeight: pendingMetrics.hostWindowHeight,
    });
    commitState(next);
  },
  buildDisplayReport(info: ScreenInfoState = currentState): string {
    return [
      'TypeVerse Display Report',
      `Root container: ${info.width}x${info.height} CSS px`,
      `Host window: ${info.hostWindowWidth}x${info.hostWindowHeight} CSS px`,
      `Aspect ratio: ${info.aspectRatio.toFixed(3)}:1 (${info.aspectClass})`,
      `Orientation: ${info.orientation}`,
      `Device pixel ratio: ${info.devicePixelRatio.toFixed(2)}x`,
      `Size class: ${info.sizeClass}`,
      `Layout profile: ${info.layoutProfile} (setting: ${info.layoutPreference}, wide panels: ${info.showSidePanels ? 'On' : 'Off'})`,
      `UI scale (--ui-scale): ${info.uiScale.toFixed(3)} (base ${info.baseScale.toFixed(3)}, interface size: ${info.interfaceSize})`,
      `Layout tester: ${info.emulatedSize ? `${info.emulatedSize.label} (fit=${info.fitToWindow})` : 'Off'}`,
    ].join('\n');
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useScreenInfo(): ScreenInfoState {
  return useSyncExternalStore(
    subscribe,
    screenInfoService.getSnapshot,
    screenInfoService.getSnapshot,
  );
}
