import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useAppearance} from '@/src/context/AppearanceContext';
import {buildRenderSpecForMode, type RenderSpec3D} from '@/src/graphics/decision';
import {graphicsModeService, useGraphicsMode} from '@/src/graphics/graphicsModeService';
import {subscribeTexturePrepStatus, type TexturePrepStatus} from '@/src/graphics/texturePrepBus';
import type {GraphicsGameId, ResolvedGraphicsMode} from '@/src/types/app';

export interface SceneCompatPreset extends RenderSpec3D {
  tier: 'low' | 'full';
  realistic?: boolean;
}

export interface SceneCompatProbe {
  webglSupported: boolean;
  isSoftwareGl: boolean;
}

export interface LazyThreeSceneHandle {
  dispose: () => void;
  resize: (width: number, height: number) => void;
  setTypingActive?: (typing: boolean) => void;
  updateState?: (state: unknown) => void;
}

export interface LazyThreeMountContext {
  container: HTMLElement;
  preset: SceneCompatPreset;
  probe: SceneCompatProbe;
  calmMode: boolean;
  onFrameDtMs: (dtMs: number) => void;
  onContextLost: (permanent: boolean) => void;
}

export type LazyThreeSceneLoader = () => Promise<{
  mountScene: (ctx: LazyThreeMountContext) => LazyThreeSceneHandle;
}>;

interface ThreeCanvasHostProps {
  loadScene: LazyThreeSceneLoader;
  sceneKey: string;
  gameId?: GraphicsGameId;
  forcedMode?: ResolvedGraphicsMode;
  retryNonce?: number;
  onContextLostPermanent?: () => void;
  sceneState?: unknown;
  isTypingActive?: boolean;
  className?: string;
  fallback2D?: React.ReactNode;
}

let activeWebglHosts = 0;

function incrementWebglActive(): () => void {
  if (typeof document === 'undefined') return () => {};
  activeWebglHosts += 1;
  document.documentElement.setAttribute('data-webgl-active', 'true');
  return () => {
    activeWebglHosts = Math.max(0, activeWebglHosts - 1);
    if (activeWebglHosts === 0) {
      document.documentElement.removeAttribute('data-webgl-active');
    }
  };
}

/**
 * Dedicated empty React wrapper that mounts a lazily imported Three.js scene.
 * Contains zero static Three.js imports so 2D Classic users never load Three.js.
 */
export const ThreeCanvasHost: React.FC<ThreeCanvasHostProps> = ({
  loadScene,
  sceneKey,
  gameId,
  forcedMode,
  retryNonce = 0,
  onContextLostPermanent,
  sceneState,
  isTypingActive = false,
  className = 'absolute inset-0 pointer-events-none',
  fallback2D = null,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<LazyThreeSceneHandle | null>(null);
  const onLostCallbackRef = useRef(onContextLostPermanent);
  onLostCallbackRef.current = onContextLostPermanent;
  const {settings} = useAppearance();
  const gfx = useGraphicsMode(gameId);

  const [prepStatus, setPrepStatus] = useState<TexturePrepStatus>({
    preparing: false,
    progressPct: 100,
    label: 'Ready',
  });

  useEffect(() => subscribeTexturePrepStatus(setPrepStatus), []);

  const resolvedMode: ResolvedGraphicsMode =
    !gfx.hardwareReport.webglSupported ||
    !gfx.hardwareReport.webgl2Supported ||
    gfx.contextLostActive
      ? '2d'
      : (forcedMode ?? gfx.effectiveMode);

  const {renderScale, shadows, postEffects, hubDof, speedStreaks} =
    gfx.persistedState.realisticOptions;
  const activeSpec = useMemo(
    () =>
      buildRenderSpecForMode(resolvedMode, {
        renderScale,
        shadows,
        postEffects,
        hubDof,
        speedStreaks,
      }),
    [resolvedMode, renderScale, shadows, postEffects, hubDof, speedStreaks],
  );

  const isOff = resolvedMode === '2d';

  const calmMode =
    settings.calmMode || settings.reducedMotion || gfx.hardwareReport.prefersReducedMotion;

  useEffect(() => {
    if (isOff) return;
    const container = hostRef.current;
    if (!container) return;

    const compatPreset: SceneCompatPreset = {
      ...activeSpec,
      tier: resolvedMode === '3d-light' ? 'low' : 'full',
      realistic: resolvedMode === '3d-realistic',
    };
    const compatProbe: SceneCompatProbe = {
      webglSupported: gfx.hardwareReport.webglSupported,
      isSoftwareGl:
        gfx.hardwareReport.isSoftwareRenderer || gfx.hardwareReport.gpuFeatureSoftwareOnly,
    };

    const releaseWebglFlag = incrementWebglActive();
    graphicsModeService.setActive3DGameId(gameId ?? null);
    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
    let lostFallbackTimer = 0;
    let canvasEl: HTMLCanvasElement | null = null;
    let lostHandler: ((e: Event) => void) | null = null;
    let restoredHandler: (() => void) | null = null;

    void loadScene()
      .then((mod) => {
        if (cancelled || !hostRef.current) return;
        let handle: LazyThreeSceneHandle;
        try {
          handle = mod.mountScene({
            container,
            preset: compatPreset,
            probe: compatProbe,
            calmMode,
            onFrameDtMs: () => {
              // Live stats are sampled directly by core.ts without auto-downgrading visuals
            },
            onContextLost: (permanent) => {
              if (permanent) {
                if (onLostCallbackRef.current) {
                  onLostCallbackRef.current();
                } else {
                  graphicsModeService.reportContextLost();
                }
              }
            },
          });
        } catch {
          if (onLostCallbackRef.current) {
            onLostCallbackRef.current();
          } else {
            graphicsModeService.reportContextLost();
          }
          return;
        }
        handleRef.current = handle;
        if (sceneState !== undefined) {
          handle.updateState?.(sceneState);
        }
        handle.setTypingActive?.(isTypingActive);

        canvasEl = container.querySelector('canvas');
        lostHandler = (e: Event) => {
          e.preventDefault();
          if (!lostFallbackTimer) {
            lostFallbackTimer = window.setTimeout(() => {
              lostFallbackTimer = 0;
              if (!cancelled) {
                if (onLostCallbackRef.current) {
                  onLostCallbackRef.current();
                } else {
                  graphicsModeService.reportContextLost();
                }
              }
            }, 1200);
          }
        };
        restoredHandler = () => {
          if (lostFallbackTimer) {
            window.clearTimeout(lostFallbackTimer);
            lostFallbackTimer = 0;
          }
          handle.resize(container.clientWidth, container.clientHeight);
        };
        if (canvasEl) {
          canvasEl.addEventListener('webglcontextlost', lostHandler, false);
          canvasEl.addEventListener('webglcontextrestored', restoredHandler, false);
        }

        if (typeof ResizeObserver !== 'undefined') {
          resizeObs = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            handle.resize(entry.contentRect.width, entry.contentRect.height);
          });
          resizeObs.observe(container);
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (onLostCallbackRef.current) {
            onLostCallbackRef.current();
          } else {
            graphicsModeService.reportContextLost();
          }
        }
      });

    return () => {
      cancelled = true;
      releaseWebglFlag();
      graphicsModeService.setActive3DGameId(null);
      if (lostFallbackTimer) {
        window.clearTimeout(lostFallbackTimer);
        lostFallbackTimer = 0;
      }
      if (canvasEl && lostHandler && restoredHandler) {
        canvasEl.removeEventListener('webglcontextlost', lostHandler, false);
        canvasEl.removeEventListener('webglcontextrestored', restoredHandler, false);
      }
      if (resizeObs) {
        resizeObs.disconnect();
        resizeObs = null;
      }
      if (handleRef.current) {
        handleRef.current.dispose();
        handleRef.current = null;
      }
    };
  }, [isOff, sceneKey, resolvedMode, calmMode, loadScene, activeSpec, gfx.hardwareReport, gameId, retryNonce]);

  useEffect(() => {
    handleRef.current?.updateState?.(sceneState);
  }, [sceneState]);

  useEffect(() => {
    handleRef.current?.setTypingActive?.(isTypingActive);
  }, [isTypingActive]);

  if (isOff) {
    return <>{fallback2D}</>;
  }

  return (
    <div ref={hostRef} className={className} aria-hidden="true">
      {prepStatus.preparing && resolvedMode === '3d-realistic' && (
        <div
          className="absolute bottom-3 left-3 z-10 rounded-lg border px-2.5 py-1 text-[11px] font-medium shadow-md"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: 'var(--tv-border)',
            color: 'var(--tv-text)',
          }}
        >
          {prepStatus.label} ({prepStatus.progressPct}%)
        </div>
      )}
    </div>
  );
};
