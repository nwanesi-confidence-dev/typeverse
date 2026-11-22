import {useEffect, useState} from 'react';
import {
  buildGraphicsSupportReportText,
  buildRenderSpecForMode,
  decideGraphicsModeFromReport,
  modeFromDetail3D,
  probeHardwareReport,
  resolveEffectiveMode,
  type RenderSpec3D,
} from '@/src/graphics/decision';
import {emitSystemToast} from '@/src/graphics/toastBus';
import {GRAPHICS_THRESHOLDS} from '@/src/graphics/thresholds';
import {loadGraphicsState, saveGraphicsState} from '@/src/db/storage';
import {
  DEFAULT_GRAPHICS_STATE,
  DEFAULT_REALISTIC_OPTIONS,
  type GameGraphicsOverride,
  type GraphicsDetailLevel,
  type GraphicsGameId,
  type GraphicsModePreference,
  type HardwareReport,
  type PersistedGraphicsState,
  type RealisticOptions,
  type ResolvedGraphicsMode,
  type SpeedTestResult,
} from '@/src/types/app';

export interface SpeedTestUiStatus {
  running: boolean;
  phase: 'idle' | 'warmup' | 'measuring' | 'realistic';
  progressPct: number;
}

export interface GraphicsModeSnapshot {
  initialized: boolean;
  preference: GraphicsModePreference;
  detail3D: GraphicsDetailLevel;
  realisticOptions: RealisticOptions;
  autoResolvedMode: ResolvedGraphicsMode;
  effectiveMode: ResolvedGraphicsMode;
  spec: RenderSpec3D;
  reasonText: string;
  autoChecked: boolean;
  autoSkipped: boolean;
  firstRunDismissed: boolean;
  suggest2DWhenSlow: boolean;
  suggestFullWhenRealisticSlow: boolean;
  gameOverrides: Partial<Record<GraphicsGameId, GameGraphicsOverride>>;
  hardwareReport: HardwareReport;
  speedTestResult: SpeedTestResult | null;
  speedTestStatus: SpeedTestUiStatus;
  liveFps: number | null;
  liveDrawCalls: number | null;
  liveTriangles: number | null;
  liveTextureMemoryMb: number | null;
  liveRenderResolution: {width: number; height: number; totalPixels: number} | null;
  shadowsActive: boolean;
  postEffectsActive: boolean;
  contextLostActive: boolean;
  slow3DPromptVisible: boolean;
  slowRealisticPromptVisible: boolean;
  persistedState: PersistedGraphicsState;
}

const FALLBACK_HARDWARE_REPORT: HardwareReport = {
  webglSupported: false,
  webgl2Supported: false,
  webglVersion: 'Unavailable',
  renderer: 'Detecting...',
  vendor: 'Unknown',
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
  fingerprint: '',
  prefersReducedMotion: false,
};

class GraphicsModeService {
  private state: PersistedGraphicsState = {...DEFAULT_GRAPHICS_STATE};
  private hardware: HardwareReport = {...FALLBACK_HARDWARE_REPORT};
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private fingerprintCheckedThisSession = false;

  private speedTestStatus: SpeedTestUiStatus = {
    running: false,
    phase: 'idle',
    progressPct: 0,
  };
  private speedTestContainer: HTMLElement | null = null;
  private activeAbortController: AbortController | null = null;
  private speedTestSkippedByUser = false;

  // Live stats strictly for diagnostics (Settings -> Advanced -> Show graphics info)
  private liveFps: number | null = null;
  private liveDrawCalls: number | null = null;
  private liveTriangles: number | null = null;
  private liveTextureMemoryMb: number | null = null;
  private liveRenderResolution: {width: number; height: number; totalPixels: number} | null = null;
  private shadowsActive = false;
  private postEffectsActive = false;
  private telemetryWindowMs = 0;
  private telemetryFrames = 0;
  private contextLostActive = false;

  // Optional non-blocking slow-3D / slow-Realistic suggestion prompts (max once per session)
  private active3DGameId: GraphicsGameId | null = null;
  private slow3DSuggestedThisSession = false;
  private slow3DPromptVisible = false;
  private slowDurationAccumMs = 0;

  private slowRealisticSuggestedThisSession = false;
  private slowRealisticPromptVisible = false;
  private slowRealisticAccumMs = 0;

  private listeners = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  public registerSpeedTestContainer(el: HTMLElement | null): void {
    this.speedTestContainer = el;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const [loadedState, report] = await Promise.all([
        loadGraphicsState(),
        probeHardwareReport(),
      ]);
      this.hardware = report;
      this.state = {
        ...DEFAULT_GRAPHICS_STATE,
        ...loadedState,
        realisticOptions: {
          ...DEFAULT_REALISTIC_OPTIONS,
          ...(loadedState.realisticOptions ?? {}),
        },
        gameOverrides: {...(loadedState.gameOverrides ?? {})},
      };

      if (
        !report.webglSupported ||
        !report.webgl2Supported ||
        report.isSoftwareRenderer ||
        report.gpuFeatureSoftwareOnly ||
        report.desktopHwAccelDisabled
      ) {
        const outcome = decideGraphicsModeFromReport(report, this.state.speedTestResult);
        this.state = {
          ...this.state,
          autoResolvedMode: outcome.mode,
          autoReason: outcome.reason,
          autoChecked: true,
          autoSkipped: false,
          hardwareFingerprint: report.fingerprint,
          hardwareReport: report,
          lastUpdatedAt: Date.now(),
        };
        await saveGraphicsState(this.state);
      } else {
        this.state = {
          ...this.state,
          hardwareReport: report,
        };
      }

      this.initialized = true;
      this.notify();
    })();

    return this.initPromise;
  }

  public async reloadFromStorage(): Promise<void> {
    const loaded = await loadGraphicsState();
    const report = await probeHardwareReport();
    this.hardware = report;
    this.state = {
      ...DEFAULT_GRAPHICS_STATE,
      ...loaded,
      realisticOptions: {
        ...DEFAULT_REALISTIC_OPTIONS,
        ...(loaded.realisticOptions ?? {}),
      },
      gameOverrides: {...(loaded.gameOverrides ?? {})},
      hardwareReport: report,
    };
    this.notify();
  }

  public getResolvedMode(gameId?: GraphicsGameId): ResolvedGraphicsMode {
    if (!this.hardware.webglSupported || !this.hardware.webgl2Supported) {
      return '2d';
    }
    if (this.contextLostActive) {
      return '2d';
    }

    if (gameId) {
      const override = this.state.gameOverrides[gameId] ?? 'default';
      if (override === '2d') return '2d';
      if (override === '3d') {
        return modeFromDetail3D(this.state.detail3D);
      }
    }

    return resolveEffectiveMode(
      this.state.preference,
      this.state.detail3D,
      this.state.autoResolvedMode,
      this.hardware,
    );
  }

  private getEffectiveReason(gameId?: GraphicsGameId): string {
    if (!this.hardware.webglSupported || !this.hardware.webgl2Supported) {
      return "3D isn't available on this computer (WebGL 2 is unsupported).";
    }
    if (gameId) {
      const ov = this.state.gameOverrides[gameId] ?? 'default';
      if (ov === '2d') return 'Overridden to 2D Classic for this game.';
      if (ov === '3d') {
        const label =
          this.state.detail3D === 'realistic'
            ? '3D Realistic'
            : this.state.detail3D === 'full'
              ? '3D Full'
              : '3D Light';
        return `Overridden to ${label} for this game.`;
      }
    }
    if (this.state.preference === '2d') {
      return 'You selected 2D Classic mode.';
    }
    if (this.state.preference === '3d') {
      const label =
        this.state.detail3D === 'realistic'
          ? 'Realistic'
          : this.state.detail3D === 'full'
            ? 'Full'
            : 'Light';
      return `You selected 3D mode (${label} detail).`;
    }
    return this.state.autoReason || 'Not checked yet';
  }

  public getSnapshot(gameId?: GraphicsGameId): GraphicsModeSnapshot {
    const effectiveMode = this.getResolvedMode(gameId);
    const spec = buildRenderSpecForMode(effectiveMode, this.state.realisticOptions);
    return {
      initialized: this.initialized,
      preference: this.state.preference,
      detail3D: this.state.detail3D,
      realisticOptions: this.state.realisticOptions,
      autoResolvedMode: this.state.autoResolvedMode,
      effectiveMode,
      spec,
      reasonText: this.getEffectiveReason(gameId),
      autoChecked: this.state.autoChecked,
      autoSkipped: this.state.autoSkipped,
      firstRunDismissed: this.state.firstRunDismissed,
      suggest2DWhenSlow: this.state.suggest2DWhenSlow,
      suggestFullWhenRealisticSlow: this.state.suggestFullWhenRealisticSlow,
      gameOverrides: this.state.gameOverrides,
      hardwareReport: this.hardware,
      speedTestResult: this.state.speedTestResult,
      speedTestStatus: this.speedTestStatus,
      liveFps: this.liveFps,
      liveDrawCalls: this.liveDrawCalls,
      liveTriangles: this.liveTriangles,
      liveTextureMemoryMb: this.liveTextureMemoryMb,
      liveRenderResolution: this.liveRenderResolution,
      shadowsActive: this.shadowsActive || spec.shadows,
      postEffectsActive: this.postEffectsActive || spec.postEffects,
      contextLostActive: this.contextLostActive,
      slow3DPromptVisible: this.slow3DPromptVisible,
      slowRealisticPromptVisible: this.slowRealisticPromptVisible,
      persistedState: this.state,
    };
  }

  public async setPreference(next: GraphicsModePreference): Promise<void> {
    if (next === '3d' && (!this.hardware.webglSupported || !this.hardware.webgl2Supported)) {
      emitSystemToast(
        '3D Unavailable',
        "3D isn't available on this computer (WebGL 2 unsupported).",
        'warning',
      );
      return;
    }

    let nextDetail = this.state.detail3D;
    if (next === '3d' && this.state.speedTestResult && !this.state.speedTestResult.skipped) {
      const rec = this.state.speedTestResult.recommendedMode;
      nextDetail =
        rec === '3d-realistic' ? 'realistic' : rec === '3d-full' ? 'full' : 'light';
    } else if (next === '3d' && this.state.autoResolvedMode !== '2d') {
      nextDetail =
        this.state.autoResolvedMode === '3d-realistic'
          ? 'realistic'
          : this.state.autoResolvedMode === '3d-full'
            ? 'full'
            : 'light';
    }

    this.contextLostActive = false;
    this.state = {
      ...this.state,
      preference: next,
      detail3D: nextDetail,
      firstRunDismissed: true,
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();
  }

  public async setDetail3D(detail: GraphicsDetailLevel): Promise<void> {
    this.slowRealisticAccumMs = 0;
    this.slowDurationAccumMs = 0;
    this.state = {
      ...this.state,
      detail3D: detail,
      ...(this.state.preference === 'auto' && this.state.autoResolvedMode !== '2d'
        ? {
            autoResolvedMode: modeFromDetail3D(detail),
          }
        : {}),
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();
  }

  public async setRealisticOption<K extends keyof RealisticOptions>(
    key: K,
    value: RealisticOptions[K],
  ): Promise<void> {
    this.state = {
      ...this.state,
      realisticOptions: {
        ...this.state.realisticOptions,
        [key]: value,
      },
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();
  }

  public async setGameOverride(
    gameId: GraphicsGameId,
    override: GameGraphicsOverride,
  ): Promise<void> {
    this.state = {
      ...this.state,
      gameOverrides: {
        ...this.state.gameOverrides,
        [gameId]: override,
      },
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();
  }

  public async setSuggest2DWhenSlow(enabled: boolean): Promise<void> {
    this.state = {
      ...this.state,
      suggest2DWhenSlow: enabled,
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();
  }

  public async setSuggestFullWhenRealisticSlow(enabled: boolean): Promise<void> {
    this.state = {
      ...this.state,
      suggestFullWhenRealisticSlow: enabled,
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();
  }

  public async dismissFirstRun(choice?: GraphicsModePreference): Promise<void> {
    if (choice) {
      await this.setPreference(choice);
      return;
    }
    this.state = {
      ...this.state,
      firstRunDismissed: true,
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();
  }

  public skipSpeedTest(): void {
    this.speedTestSkippedByUser = true;
    this.activeAbortController?.abort();
  }

  public async runHardwareCheckAndSpeedTest(options?: {
    silentToast?: boolean;
  }): Promise<ResolvedGraphicsMode> {
    if (this.speedTestStatus.running) {
      return this.state.autoResolvedMode;
    }

    const report = await probeHardwareReport();
    this.hardware = report;

    if (
      !report.webglSupported ||
      !report.webgl2Supported ||
      report.desktopHwAccelDisabled ||
      report.isSoftwareRenderer ||
      report.gpuFeatureSoftwareOnly
    ) {
      const outcome = decideGraphicsModeFromReport(report, null);
      this.state = {
        ...this.state,
        autoResolvedMode: outcome.mode,
        detail3D: outcome.recommendedDetail,
        autoReason: outcome.reason,
        autoChecked: true,
        autoSkipped: false,
        hardwareFingerprint: report.fingerprint,
        hardwareReport: report,
        speedTestResult: null,
        firstRunDismissed: true,
        lastUpdatedAt: Date.now(),
      };
      await saveGraphicsState(this.state);
      this.notify();
      if (!options?.silentToast) {
        emitSystemToast('Graphics Checked', outcome.reason, 'info');
      }
      return outcome.mode;
    }

    this.speedTestSkippedByUser = false;
    const abortCtrl = new AbortController();
    this.activeAbortController = abortCtrl;
    this.speedTestStatus = {
      running: true,
      phase: 'warmup',
      progressPct: 0,
    };
    this.notify();

    await new Promise<void>((r) => window.requestAnimationFrame(() => r()));

    const container =
      this.speedTestContainer ??
      (() => {
        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.width = '320px';
        el.style.height = '180px';
        el.style.opacity = '0.01';
        el.style.pointerEvents = 'none';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        return el;
      })();
    const createdFallbackEl = container !== this.speedTestContainer;

    let sample: Awaited<
      ReturnType<typeof import('@/src/three/scenes/speedTestScene').runStandardHardwareSpeedTest>
    > | null = null;
    let heavySample: Awaited<
      ReturnType<typeof import('@/src/three/scenes/speedTestScene').runRealisticHeavySpeedTest>
    > | null = null;

    try {
      const {runStandardHardwareSpeedTest, runRealisticHeavySpeedTest} = await import(
        '@/src/three/scenes/speedTestScene'
      );
      sample = await runStandardHardwareSpeedTest({
        container,
        signal: abortCtrl.signal,
        onProgress: (phase, pct) => {
          this.speedTestStatus = {
            running: true,
            phase,
            progressPct: Math.round(pct * 0.65),
          };
          this.notify();
        },
      });

      // Stage 2: run heavier Realistic stress test ONLY if Stage 1 cleared 3D Full
      if (
        !this.speedTestSkippedByUser &&
        !abortCtrl.signal.aborted &&
        sample &&
        !sample.abortedHidden &&
        sample.frameCount >= 5 &&
        sample.medianFps >= GRAPHICS_THRESHOLDS.FULL_MIN_MEDIAN_FPS &&
        sample.onePercentLowFps >= GRAPHICS_THRESHOLDS.FULL_MIN_ONE_PERCENT_LOW_FPS
      ) {
        heavySample = await runRealisticHeavySpeedTest({
          container,
          signal: abortCtrl.signal,
          onProgress: (_phase, pct) => {
            this.speedTestStatus = {
              running: true,
              phase: 'realistic',
              progressPct: Math.min(100, 65 + Math.round(pct * 0.35)),
            };
            this.notify();
          },
        });
      }
    } catch {
      sample = null;
    } finally {
      if (createdFallbackEl && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      this.activeAbortController = null;
      this.speedTestStatus = {
        running: false,
        phase: 'idle',
        progressPct: 100,
      };
    }

    const wasSkippedOrAborted =
      this.speedTestSkippedByUser ||
      !sample ||
      sample.abortedHidden ||
      sample.frameCount < 5 ||
      Boolean(heavySample?.abortedHidden);

    const heavyForDecision =
      heavySample && !heavySample.abortedHidden && heavySample.frameCount >= 5
        ? {
            medianFps: heavySample.medianFps,
            onePercentLowFps: heavySample.onePercentLowFps,
            frameCount: heavySample.frameCount,
            durationMs: heavySample.durationMs,
            skipped: false,
          }
        : null;

    const tentativeResult: SpeedTestResult = {
      medianFps: sample?.medianFps ?? 0,
      onePercentLowFps: sample?.onePercentLowFps ?? 0,
      frameCount: sample?.frameCount ?? 0,
      durationMs: sample?.durationMs ?? 0,
      recommendedMode: '2d',
      timestamp: Date.now(),
      skipped: wasSkippedOrAborted,
      ...(heavyForDecision
        ? {
            heavyMedianFps: heavyForDecision.medianFps,
            heavyOnePercentLowFps: heavyForDecision.onePercentLowFps,
            heavyFrameCount: heavyForDecision.frameCount,
            heavyDurationMs: heavyForDecision.durationMs,
          }
        : {}),
    };

    const outcome = decideGraphicsModeFromReport(report, tentativeResult, heavyForDecision);
    const speedResult: SpeedTestResult = {
      ...tentativeResult,
      recommendedMode: outcome.mode,
    };

    this.state = {
      ...this.state,
      autoResolvedMode: outcome.mode,
      detail3D: outcome.recommendedDetail,
      autoReason: outcome.reason,
      autoChecked: !wasSkippedOrAborted,
      autoSkipped: wasSkippedOrAborted,
      hardwareFingerprint: report.fingerprint,
      hardwareReport: report,
      speedTestResult: speedResult,
      firstRunDismissed: true,
      lastUpdatedAt: Date.now(),
    };
    await saveGraphicsState(this.state);
    this.notify();

    if (!options?.silentToast && !wasSkippedOrAborted) {
      emitSystemToast('Speed Test Complete', outcome.reason, 'info');
    } else if (sample?.abortedHidden || heavySample?.abortedHidden) {
      emitSystemToast(
        'Speed Test Paused',
        'Window was hidden during speed test — using 2D until re-checked.',
        'warning',
      );
    }

    return outcome.mode;
  }

  public async checkFingerprintChangeOnHub(): Promise<void> {
    if (!this.initialized || this.fingerprintCheckedThisSession) return;
    if (this.speedTestStatus.running) return;
    this.fingerprintCheckedThisSession = true;

    if (!this.state.firstRunDismissed || !this.state.autoChecked) return;
    if (!this.state.hardwareFingerprint) return;

    const currentReport = await probeHardwareReport();
    this.hardware = currentReport;
    if (currentReport.fingerprint !== this.state.hardwareFingerprint) {
      emitSystemToast(
        'Hardware Change Detected',
        'Updating Auto graphics check for this display/GPU...',
        'info',
      );
      await this.runHardwareCheckAndSpeedTest({silentToast: false});
    }
  }

  public setActive3DGameId(gameId: GraphicsGameId | null): void {
    this.active3DGameId = gameId;
    this.slowDurationAccumMs = 0;
    this.slowRealisticAccumMs = 0;
  }

  private isManual3DActive(): boolean {
    if (this.active3DGameId) {
      const ov = this.state.gameOverrides[this.active3DGameId] ?? 'default';
      if (ov === '3d') return true;
      if (ov === '2d') return false;
    }
    return this.state.preference === '3d';
  }

  /**
   * Records frame timing, triangles, draw calls, texture memory & render resolution
   * for diagnostics and optional slow-mode suggestions. NEVER changes visuals automatically.
   */
  public recordLiveStats(
    dtMs: number,
    drawCalls?: number | null,
    meta?: {
      targetFps?: number;
      frameWorkMs?: number;
      triangles?: number | null;
      textureMemoryMb?: number | null;
      renderResolution?: {width: number; height: number; totalPixels: number} | null;
      shadowsActive?: boolean;
      postEffectsActive?: boolean;
    },
  ): void {
    if (typeof drawCalls === 'number') {
      this.liveDrawCalls = drawCalls;
    }
    if (typeof meta?.triangles === 'number') {
      this.liveTriangles = meta.triangles;
    }
    if (typeof meta?.textureMemoryMb === 'number') {
      this.liveTextureMemoryMb = meta.textureMemoryMb;
    }
    if (meta?.renderResolution) {
      this.liveRenderResolution = meta.renderResolution;
    }
    if (typeof meta?.shadowsActive === 'boolean') {
      this.shadowsActive = meta.shadowsActive;
    }
    if (typeof meta?.postEffectsActive === 'boolean') {
      this.postEffectsActive = meta.postEffectsActive;
    }

    if (dtMs <= 0 || dtMs > 500) return;
    this.telemetryWindowMs += dtMs;
    this.telemetryFrames += 1;

    const currentMode = this.getResolvedMode(this.active3DGameId ?? undefined);
    const targetFps = meta?.targetFps ?? 60;
    const frameWorkMs = meta?.frameWorkMs ?? 0;

    // 1) Realistic < 40 FPS for 5s -> once per session suggest switching to Full
    if (
      currentMode === '3d-realistic' &&
      this.state.suggestFullWhenRealisticSlow &&
      !this.slowRealisticSuggestedThisSession &&
      !this.slowRealisticPromptVisible &&
      !this.contextLostActive
    ) {
      const budgetMs = 1000 / GRAPHICS_THRESHOLDS.SLOW_REALISTIC_SUGGEST_FPS;
      const pacingSlow =
        targetFps >= GRAPHICS_THRESHOLDS.SLOW_REALISTIC_SUGGEST_FPS + 4
          ? dtMs > budgetMs + 2
          : frameWorkMs > budgetMs || dtMs > Math.max(1000 / targetFps, budgetMs) + 14;
      if (pacingSlow) {
        this.slowRealisticAccumMs += dtMs;
        if (
          this.slowRealisticAccumMs >=
          GRAPHICS_THRESHOLDS.SLOW_REALISTIC_SUGGEST_DURATION_MS
        ) {
          this.slowRealisticSuggestedThisSession = true;
          this.slowRealisticPromptVisible = true;
          this.slowRealisticAccumMs = 0;
          this.notify();
        }
      } else {
        this.slowRealisticAccumMs = Math.max(0, this.slowRealisticAccumMs - dtMs * 0.5);
      }
    } else if (
      // 2) Phase 11 manual-3D < 40 FPS for 5s -> suggest switching to 2D
      this.state.suggest2DWhenSlow &&
      !this.slow3DSuggestedThisSession &&
      !this.slow3DPromptVisible &&
      !this.contextLostActive &&
      this.isManual3DActive() &&
      currentMode !== '2d'
    ) {
      const slowBudgetMs = 1000 / GRAPHICS_THRESHOLDS.SLOW_3D_SUGGEST_FPS;
      const pacingSlow =
        targetFps >= GRAPHICS_THRESHOLDS.SLOW_3D_SUGGEST_FPS + 4
          ? dtMs > slowBudgetMs + 2
          : frameWorkMs > slowBudgetMs || dtMs > Math.max(1000 / targetFps, slowBudgetMs) + 14;

      if (pacingSlow) {
        this.slowDurationAccumMs += dtMs;
        if (this.slowDurationAccumMs >= GRAPHICS_THRESHOLDS.SLOW_3D_SUGGEST_DURATION_MS) {
          this.slow3DSuggestedThisSession = true;
          this.slow3DPromptVisible = true;
          this.slowDurationAccumMs = 0;
          this.notify();
        }
      } else {
        this.slowDurationAccumMs = Math.max(0, this.slowDurationAccumMs - dtMs * 0.5);
      }
    }

    if (this.telemetryWindowMs >= 650) {
      this.liveFps = Math.round((this.telemetryFrames * 1000) / this.telemetryWindowMs);
      this.telemetryWindowMs = 0;
      this.telemetryFrames = 0;
      this.notify();
    }
  }

  public async acceptSlowRealisticSwitchToFull(): Promise<void> {
    this.slowRealisticPromptVisible = false;
    this.slowRealisticSuggestedThisSession = true;
    await this.setDetail3D('full');
    emitSystemToast(
      'Switched to Full Detail',
      '3D detail is now Full (applies cleanly on next round or hub refresh).',
      'info',
    );
  }

  public keepRealisticForSession(): void {
    this.slowRealisticPromptVisible = false;
    this.slowRealisticSuggestedThisSession = true;
    this.notify();
  }

  public async dontAskAgainSlowRealistic(): Promise<void> {
    this.slowRealisticPromptVisible = false;
    this.slowRealisticSuggestedThisSession = true;
    await this.setSuggestFullWhenRealisticSlow(false);
  }

  public async acceptSlow3DSwitchTo2D(): Promise<void> {
    this.slow3DPromptVisible = false;
    this.slow3DSuggestedThisSession = true;
    const activeGame = this.active3DGameId;
    if (activeGame && this.state.gameOverrides[activeGame] === '3d') {
      await this.setGameOverride(activeGame, '2d');
      emitSystemToast(
        'Saved 2D Preference',
        'This game will start in 2D Classic on your next round.',
        'info',
      );
      return;
    }
    await this.setPreference('2d');
    if (activeGame) {
      emitSystemToast(
        'Switched to 2D Classic',
        'Visuals saved as 2D Classic (takes effect on the next round).',
        'info',
      );
    }
  }

  public keep3DForSession(): void {
    this.slow3DPromptVisible = false;
    this.slow3DSuggestedThisSession = true;
    this.notify();
  }

  public async dontAskAgainSlow3D(): Promise<void> {
    this.slow3DPromptVisible = false;
    this.slow3DSuggestedThisSession = true;
    await this.setSuggest2DWhenSlow(false);
  }

  public clearLiveStats(): void {
    this.liveFps = null;
    this.liveDrawCalls = null;
    this.liveTriangles = null;
    this.liveTextureMemoryMb = null;
    this.liveRenderResolution = null;
    this.shadowsActive = false;
    this.postEffectsActive = false;
    this.telemetryWindowMs = 0;
    this.telemetryFrames = 0;
    this.slowDurationAccumMs = 0;
    this.slowRealisticAccumMs = 0;
  }

  public reportContextLost(): void {
    this.contextLostActive = true;
    emitSystemToast(
      'WebGL Context Lost',
      'WebGL context was interrupted — switched safely to 2D Classic.',
      'warning',
    );
    this.notify();
  }

  public retry3DAfterContextLoss(): void {
    this.contextLostActive = false;
    this.notify();
  }

  public buildSupportReport(gameId?: GraphicsGameId): string {
    const snap = this.getSnapshot(gameId);
    return buildGraphicsSupportReportText({
      state: this.state,
      hardware: this.hardware,
      effectiveMode: snap.effectiveMode,
      effectiveReason: snap.reasonText,
      liveFps: this.liveFps,
      liveDrawCalls: this.liveDrawCalls,
      liveTriangles: this.liveTriangles,
      liveTextureMemoryMb: this.liveTextureMemoryMb,
      liveRenderResolution: this.liveRenderResolution,
      shadowsActive: snap.shadowsActive,
      postEffectsActive: snap.postEffectsActive,
    });
  }
}

export const graphicsModeService = new GraphicsModeService();

export function useGraphicsMode(gameId?: GraphicsGameId): GraphicsModeSnapshot {
  const [snap, setSnap] = useState<GraphicsModeSnapshot>(() =>
    graphicsModeService.getSnapshot(gameId),
  );

  useEffect(() => {
    setSnap(graphicsModeService.getSnapshot(gameId));
    return graphicsModeService.subscribe(() => {
      setSnap(graphicsModeService.getSnapshot(gameId));
    });
  }, [gameId]);

  return snap;
}
