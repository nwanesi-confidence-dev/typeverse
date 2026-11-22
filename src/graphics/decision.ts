import {computeRenderResolution, detailFromResolvedMode} from '@/src/graphics/detail';
import {GRAPHICS_THRESHOLDS} from '@/src/graphics/thresholds';
import {
  DEFAULT_REALISTIC_OPTIONS,
  type GraphicsDetailLevel,
  type GraphicsModePreference,
  type HardwareReport,
  type PersistedGraphicsState,
  type RealisticOptions,
  type RealisticRenderScale,
  type ResolvedGraphicsMode,
  type SpeedTestResult,
} from '@/src/types/app';

export interface GraphicsDecisionOutcome {
  mode: ResolvedGraphicsMode;
  recommendedDetail: GraphicsDetailLevel;
  reason: string;
  skipped: boolean;
}

export interface RenderSpec3D {
  mode: ResolvedGraphicsMode;
  label: string;
  pixelRatioCap: number;
  renderScale: RealisticRenderScale;
  antialias: boolean;
  multisampleSamples: number;
  shadows: boolean;
  fog: boolean;
  postEffects: boolean;
  particleScale: number;
  drawDistanceScale: number;
  bloom: boolean;
  sceneFrameCap: number;
  typingFrameCap: number;
  maxDrawCalls: number;
  useEnvironment: boolean;
  enableDepthUi: boolean;
}

export const RENDER_SPECS: Record<ResolvedGraphicsMode, RenderSpec3D> = {
  '2d': {
    mode: '2d',
    label: '2D Classic',
    pixelRatioCap: 1,
    renderScale: 1,
    antialias: false,
    multisampleSamples: 0,
    shadows: false,
    fog: false,
    postEffects: false,
    particleScale: 0,
    drawDistanceScale: 0,
    bloom: false,
    sceneFrameCap: 0,
    typingFrameCap: 0,
    maxDrawCalls: 0,
    useEnvironment: false,
    enableDepthUi: false,
  },
  '3d-light': {
    mode: '3d-light',
    label: '3D Light',
    pixelRatioCap: 1,
    renderScale: 1,
    antialias: false,
    multisampleSamples: 0,
    shadows: false,
    fog: false,
    postEffects: false,
    particleScale: 0.45,
    drawDistanceScale: 0.72,
    bloom: false,
    sceneFrameCap: 45,
    typingFrameCap: 24,
    maxDrawCalls: 50,
    useEnvironment: false,
    enableDepthUi: true,
  },
  '3d-full': {
    mode: '3d-full',
    label: '3D Full',
    pixelRatioCap: 2,
    renderScale: 1,
    antialias: true,
    multisampleSamples: 0,
    shadows: false,
    fog: true,
    postEffects: false,
    particleScale: 1.0,
    drawDistanceScale: 1.0,
    bloom: true,
    sceneFrameCap: 60,
    typingFrameCap: 30,
    maxDrawCalls: 100,
    useEnvironment: true,
    enableDepthUi: true,
  },
  '3d-realistic': {
    mode: '3d-realistic',
    label: '3D Realistic',
    pixelRatioCap: 2,
    renderScale: 1,
    antialias: true,
    multisampleSamples: 4,
    shadows: true,
    fog: true,
    postEffects: true,
    particleScale: 1.35,
    drawDistanceScale: 1.25,
    bloom: true,
    sceneFrameCap: 60,
    typingFrameCap: 30,
    maxDrawCalls: 150,
    useEnvironment: true,
    enableDepthUi: true,
  },
};

export function modeFromDetail3D(detail: GraphicsDetailLevel): ResolvedGraphicsMode {
  if (detail === 'realistic') return '3d-realistic';
  if (detail === 'full') return '3d-full';
  return '3d-light';
}

export function buildRenderSpecForMode(
  mode: ResolvedGraphicsMode,
  realisticOptions: RealisticOptions = DEFAULT_REALISTIC_OPTIONS,
): RenderSpec3D {
  const base = RENDER_SPECS[mode];
  if (mode !== '3d-realistic') {
    return base;
  }
  const postOn = realisticOptions.postEffects;
  return {
    ...base,
    renderScale: realisticOptions.renderScale,
    shadows: realisticOptions.shadows,
    postEffects: postOn,
    bloom: postOn,
    multisampleSamples: postOn ? 4 : 0,
    antialias: !postOn,
  };
}

export function formatResolvedModeLabel(mode: ResolvedGraphicsMode): string {
  return RENDER_SPECS[mode].label;
}

export function isGpuFeatureStatusSoftwareOnly(
  status: Record<string, string> | null | undefined,
): boolean {
  if (!status || typeof status !== 'object') return false;
  const webgl2 = String(status.webgl2 ?? '').toLowerCase();
  const webgl = String(status.webgl ?? '').toLowerCase();
  const target = webgl2 || webgl;
  if (!target) return false;
  return (
    target.includes('software') ||
    target.includes('unavailable') ||
    target.includes('disabled')
  );
}

/**
 * Pure deterministic Auto decision function.
 * Resolves to 3D Realistic ONLY when hardware passes WebGL2/no-software checks AND
 * both standard and heavier Realistic speed tests meet GRAPHICS_THRESHOLDS.
 */
export function decideGraphicsModeFromReport(
  hardware: HardwareReport,
  speedTest: SpeedTestResult | null,
  heavySpeedTest?: Pick<
    SpeedTestResult,
    'medianFps' | 'onePercentLowFps' | 'frameCount' | 'durationMs' | 'skipped'
  > | null,
): GraphicsDecisionOutcome {
  if (!hardware.webglSupported || !hardware.webgl2Supported) {
    return {
      mode: '2d',
      recommendedDetail: 'light',
      reason: 'Auto chose 2D because WebGL 2 is not available on this computer.',
      skipped: false,
    };
  }

  if (hardware.desktopHwAccelDisabled) {
    return {
      mode: '2d',
      recommendedDetail: 'light',
      reason: 'Auto chose 2D because hardware acceleration is turned off in desktop settings.',
      skipped: false,
    };
  }

  if (hardware.isSoftwareRenderer || hardware.gpuFeatureSoftwareOnly) {
    return {
      mode: '2d',
      recommendedDetail: 'light',
      reason: 'Auto chose 2D because this computer is using software graphics.',
      skipped: false,
    };
  }

  if (!speedTest || speedTest.skipped) {
    return {
      mode: '2d',
      recommendedDetail: 'light',
      reason: 'Not checked yet (speed test was skipped; defaulting to 2D).',
      skipped: true,
    };
  }

  if (
    speedTest.medianFps >= GRAPHICS_THRESHOLDS.FULL_MIN_MEDIAN_FPS &&
    speedTest.onePercentLowFps >= GRAPHICS_THRESHOLDS.FULL_MIN_ONE_PERCENT_LOW_FPS
  ) {
    // Only consider 3D Realistic when the heavier Realistic pass ran cleanly and cleared >=58 med / >=45 1% low
    const heavyMedian = heavySpeedTest?.medianFps ?? speedTest.heavyMedianFps;
    const heavyLow = heavySpeedTest?.onePercentLowFps ?? speedTest.heavyOnePercentLowFps;
    const heavySkipped = heavySpeedTest?.skipped ?? false;

    if (
      !heavySkipped &&
      typeof heavyMedian === 'number' &&
      typeof heavyLow === 'number' &&
      heavyMedian >= GRAPHICS_THRESHOLDS.REALISTIC_MIN_MEDIAN_FPS &&
      heavyLow >= GRAPHICS_THRESHOLDS.REALISTIC_MIN_ONE_PERCENT_LOW_FPS
    ) {
      return {
        mode: '3d-realistic',
        recommendedDetail: 'realistic',
        reason: `Auto chose 3D Realistic because the heavy graphics test reached ${heavyMedian} FPS median and ${heavyLow} FPS 1% low.`,
        skipped: false,
      };
    }

    const heavyNote =
      typeof heavyMedian === 'number' && typeof heavyLow === 'number'
        ? ` (Realistic stress test measured ${heavyMedian} FPS med / ${heavyLow} 1% low)`
        : '';

    return {
      mode: '3d-full',
      recommendedDetail: 'full',
      reason: `Auto chose 3D Full because the speed test reached ${speedTest.medianFps} FPS median and ${speedTest.onePercentLowFps} FPS 1% low${heavyNote}.`,
      skipped: false,
    };
  }

  if (speedTest.medianFps >= GRAPHICS_THRESHOLDS.LIGHT_MIN_MEDIAN_FPS) {
    return {
      mode: '3d-light',
      recommendedDetail: 'light',
      reason: `Auto chose 3D Light because the speed test measured ${speedTest.medianFps} FPS median and ${speedTest.onePercentLowFps} FPS 1% low.`,
      skipped: false,
    };
  }

  return {
    mode: '2d',
    recommendedDetail: 'light',
    reason: `Auto chose 2D because the speed test measured ${speedTest.medianFps} FPS median (${speedTest.onePercentLowFps} FPS 1% low), below the ${GRAPHICS_THRESHOLDS.LIGHT_MIN_MEDIAN_FPS} FPS threshold.`,
    skipped: false,
  };
}

export function computeHardwareFingerprint(parts: {
  renderer: string;
  vendor: string;
  logicalCores: number;
  deviceMemoryGb: number | null;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  desktopMode: boolean;
  desktopHwAccelDisabled: boolean;
}): string {
  return [
    parts.renderer || 'unknown',
    parts.vendor || 'unknown',
    String(parts.logicalCores),
    parts.deviceMemoryGb === null ? 'unknown-mem' : String(parts.deviceMemoryGb),
    `${parts.screenWidth}x${parts.screenHeight}`,
    String(Math.round(parts.devicePixelRatio * 100) / 100),
    parts.desktopMode ? 'desktop' : 'web',
    parts.desktopHwAccelDisabled ? 'hw-off' : 'hw-on',
  ].join('|');
}

function isMaskedOrEmptyRendererString(raw: string): boolean {
  const clean = raw.trim();
  if (!clean) return true;
  const lower = clean.toLowerCase();
  return (
    lower === 'webkit' ||
    lower === 'webkit webgl' ||
    lower === 'mozilla' ||
    lower === 'webgl' ||
    lower === 'unknown'
  );
}

export async function probeHardwareReport(): Promise<HardwareReport> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const emptyFingerprint = computeHardwareFingerprint({
      renderer: 'Unavailable',
      vendor: 'Unavailable',
      logicalCores: 4,
      deviceMemoryGb: null,
      screenWidth: 1280,
      screenHeight: 720,
      devicePixelRatio: 1,
      desktopMode: false,
      desktopHwAccelDisabled: false,
    });
    return {
      webglSupported: false,
      webgl2Supported: false,
      webglVersion: 'Unavailable',
      renderer: 'Unavailable',
      vendor: 'Unavailable',
      rendererKnown: false,
      isSoftwareRenderer: false,
      logicalCores: 4,
      deviceMemoryGb: null,
      screenWidth: 1280,
      screenHeight: 720,
      devicePixelRatio: 1,
      pixelCount: 1280 * 720,
      desktopMode: false,
      desktopHwAccelDisabled: false,
      gpuFeatureStatus: null,
      gpuFeatureSoftwareOnly: false,
      fingerprint: emptyFingerprint,
      prefersReducedMotion: false,
    };
  }

  let webglSupported = false;
  let webgl2Supported = false;
  let renderer = '';
  let vendor = '';
  let rendererKnown = false;
  let isSoftwareRenderer = false;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl2 = canvas.getContext('webgl2', {
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    const gl =
      gl2 ||
      canvas.getContext('webgl', {
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      });

    if (gl) {
      webglSupported = true;
      webgl2Supported = Boolean(gl2);
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const unmaskedRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '').trim();
        const unmaskedVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? '').trim();
        if (!isMaskedOrEmptyRendererString(unmaskedRenderer)) {
          renderer = unmaskedRenderer;
          rendererKnown = true;
        }
        if (!isMaskedOrEmptyRendererString(unmaskedVendor)) {
          vendor = unmaskedVendor;
        }
      }

      if (!renderer) {
        const maskedRenderer = String(gl.getParameter(gl.RENDERER) ?? '').trim();
        renderer = isMaskedOrEmptyRendererString(maskedRenderer) ? 'Unknown (masked)' : maskedRenderer;
      }
      if (!vendor) {
        const maskedVendor = String(gl.getParameter(gl.VENDOR) ?? '').trim();
        vendor = isMaskedOrEmptyRendererString(maskedVendor) ? 'Unknown' : maskedVendor;
      }

      isSoftwareRenderer =
        rendererKnown && GRAPHICS_THRESHOLDS.SOFTWARE_RENDERER_PATTERN.test(renderer);

      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webglSupported = false;
    webgl2Supported = false;
  }

  const nav = navigator as Navigator & {deviceMemory?: number};
  const logicalCores = nav.hardwareConcurrency || 4;
  const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const screenWidth = Math.max(1, window.screen?.width || window.innerWidth || 1280);
  const screenHeight = Math.max(1, window.screen?.height || window.innerHeight || 720);
  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const pixelCount = Math.round(screenWidth * screenHeight * devicePixelRatio * devicePixelRatio);
  const desktopMode = Boolean(window.desktop?.isDesktop);
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let desktopHwAccelDisabled = false;
  let gpuFeatureStatus: Record<string, string> | null = null;
  if (desktopMode && window.desktop?.hwAccel) {
    try {
      const [disabled, status] = await Promise.all([
        window.desktop.hwAccel.getDisabled(),
        window.desktop.hwAccel.getGpuFeatureStatus?.() ?? Promise.resolve(null),
      ]);
      desktopHwAccelDisabled = Boolean(disabled);
      gpuFeatureStatus = status;
    } catch {
      // Keep safe defaults if IPC unavailable
    }
  }

  const gpuFeatureSoftwareOnly = isGpuFeatureStatusSoftwareOnly(gpuFeatureStatus);
  const webglVersion: HardwareReport['webglVersion'] = webgl2Supported
    ? 'WebGL 2.0'
    : webglSupported
      ? 'WebGL 1.0'
      : 'Unavailable';

  const fingerprint = computeHardwareFingerprint({
    renderer: renderer || 'Unknown',
    vendor: vendor || 'Unknown',
    logicalCores,
    deviceMemoryGb,
    screenWidth,
    screenHeight,
    devicePixelRatio,
    desktopMode,
    desktopHwAccelDisabled,
  });

  return {
    webglSupported,
    webgl2Supported,
    webglVersion,
    renderer: renderer || 'Unavailable',
    vendor: vendor || 'Unknown',
    rendererKnown,
    isSoftwareRenderer,
    logicalCores,
    deviceMemoryGb,
    screenWidth,
    screenHeight,
    devicePixelRatio,
    pixelCount,
    desktopMode,
    desktopHwAccelDisabled,
    gpuFeatureStatus,
    gpuFeatureSoftwareOnly,
    fingerprint,
    prefersReducedMotion,
  };
}

export function resolveEffectiveMode(
  preference: GraphicsModePreference,
  detail3D: GraphicsDetailLevel,
  autoResolvedMode: ResolvedGraphicsMode,
  hardware: HardwareReport,
): ResolvedGraphicsMode {
  if (!hardware.webglSupported || !hardware.webgl2Supported) {
    return '2d';
  }
  if (preference === '2d') return '2d';
  if (preference === '3d') return modeFromDetail3D(detail3D);
  return autoResolvedMode;
}

export function buildGraphicsSupportReportText(params: {
  state: PersistedGraphicsState;
  hardware: HardwareReport;
  effectiveMode: ResolvedGraphicsMode;
  effectiveReason: string;
  liveFps: number | null;
  liveDrawCalls: number | null;
  liveTriangles: number | null;
  liveTextureMemoryMb: number | null;
  liveRenderResolution: {width: number; height: number; totalPixels: number} | null;
  shadowsActive: boolean;
  postEffectsActive: boolean;
}): string {
  const {
    state,
    hardware,
    effectiveMode,
    effectiveReason,
    liveFps,
    liveDrawCalls,
    liveTriangles,
    liveTextureMemoryMb,
    liveRenderResolution,
    shadowsActive,
    postEffectsActive,
  } = params;

  const featureSummary = hardware.gpuFeatureStatus
    ? Object.entries(hardware.gpuFeatureStatus)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')
    : `  Web platform (${hardware.webglVersion})`;

  const speedText = state.speedTestResult
    ? state.speedTestResult.skipped
      ? 'Skipped ("Not checked yet")'
      : `${state.speedTestResult.medianFps} FPS median / ${state.speedTestResult.onePercentLowFps} FPS 1% low (${state.speedTestResult.frameCount} frames over ${(state.speedTestResult.durationMs / 1000).toFixed(1)}s at ${new Date(state.speedTestResult.timestamp).toISOString()})`
    : 'Not tested yet';

  const heavyText =
    state.speedTestResult && typeof state.speedTestResult.heavyMedianFps === 'number'
      ? `${state.speedTestResult.heavyMedianFps} FPS median / ${state.speedTestResult.heavyOnePercentLowFps} FPS 1% low`
      : 'Not run';

  const estimatedRes = computeRenderResolution({
    cssWidth: hardware.screenWidth,
    cssHeight: hardware.screenHeight,
    devicePixelRatio: hardware.devicePixelRatio,
    resolvedMode: effectiveMode,
    realisticOptions: state.realisticOptions,
  });

  const activeResStr = liveRenderResolution
    ? `${liveRenderResolution.width}x${liveRenderResolution.height} (${liveRenderResolution.totalPixels.toLocaleString()} px)`
    : `${estimatedRes.renderWidth}x${estimatedRes.renderHeight} (${estimatedRes.totalPixels.toLocaleString()} px est.)`;

  return [
    'TypeVerse Graphics Diagnostics Report',
    '=====================================',
    `Generated: ${new Date().toISOString()}`,
    `Environment: ${hardware.desktopMode ? 'Desktop (Electron)' : 'Web Browser'}`,
    `Preference: ${state.preference.toUpperCase()} (3D detail: ${state.detail3D}, Render scale: ${Math.round(state.realisticOptions.renderScale * 100)}%)`,
    `Effective Mode: ${formatResolvedModeLabel(effectiveMode)} (${detailFromResolvedMode(effectiveMode)})`,
    `Reason: ${effectiveReason}`,
    `Renderer: ${hardware.renderer}${hardware.rendererKnown ? '' : ' (masked/unknown)'}`,
    `Vendor: ${hardware.vendor}`,
    `WebGL Version: ${hardware.webglVersion}`,
    `Software Renderer Flag: ${hardware.isSoftwareRenderer ? 'Yes' : 'No'}`,
    `Desktop Hardware Accel Disabled: ${hardware.desktopHwAccelDisabled ? 'Yes' : 'No'}`,
    `CPU Cores: ${hardware.logicalCores}`,
    `Device Memory: ${hardware.deviceMemoryGb !== null ? `${hardware.deviceMemoryGb} GB` : 'Not reported'}`,
    `Display: ${hardware.screenWidth}x${hardware.screenHeight} @ ${hardware.devicePixelRatio}x`,
    `Render Resolution: ${activeResStr}`,
    `Shadows: ${shadowsActive ? 'On (PCFSoft 2048)' : 'Off'} | Post Effects: ${postEffectsActive ? 'On (EffectComposer)' : 'Off'}`,
    `Speed Test (Standard): ${speedText}`,
    `Speed Test (Realistic Heavy): ${heavyText}`,
    `Live FPS: ${liveFps !== null ? liveFps : 'Idle / 2D'}`,
    `Live Triangles: ${liveTriangles !== null ? liveTriangles.toLocaleString() : 'Idle / 2D'}`,
    `Live Draw Calls: ${liveDrawCalls !== null ? liveDrawCalls : 'Idle / 2D'}`,
    `Estimated GPU Texture Memory: ${liveTextureMemoryMb !== null ? `${liveTextureMemoryMb.toFixed(1)} MB` : '0.0 MB'}`,
    `Fingerprint: ${hardware.fingerprint}`,
    'GPU Feature Status:',
    featureSummary,
  ].join('\n');
}
