import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, Layers, Monitor, Play, RefreshCw, RotateCcw} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {formatResolvedModeLabel} from '@/src/graphics/decision';
import {graphicsModeService, useGraphicsMode} from '@/src/graphics/graphicsModeService';
import type {
  GameGraphicsOverride,
  GraphicsGameId,
  ResolvedGraphicsMode,
} from '@/src/types/app';

/**
 * Locks the round's visual mode when a round begins and keeps it unchanged
 * for the duration of the running round unless the user restarts or confirms
 * "Switch visuals" inside the pause menu.
 */
export function useRoundLockedVisuals(
  gameId: GraphicsGameId,
  roundStarted: boolean,
  restartNonce: number,
) {
  const gfx = useGraphicsMode(gameId);
  const [lockedMode, setLockedMode] = useState<ResolvedGraphicsMode>(gfx.effectiveMode);
  const [contextLostOpen, setContextLostOpen] = useState(false);
  const [webglRetryNonce, setWebglRetryNonce] = useState(0);
  const lastNonceRef = useRef(restartNonce);

  useEffect(() => {
    if (lastNonceRef.current !== restartNonce) {
      lastNonceRef.current = restartNonce;
      setLockedMode(gfx.effectiveMode);
      setContextLostOpen(false);
      setWebglRetryNonce(0);
      return;
    }
    if (!roundStarted) {
      setLockedMode(gfx.effectiveMode);
    }
  }, [gfx.effectiveMode, roundStarted, restartNonce]);

  const webgl2Supported =
    gfx.hardwareReport.webglSupported && gfx.hardwareReport.webgl2Supported;

  const markContextLost = useCallback(() => {
    setContextLostOpen(true);
  }, []);

  const retry3D = useCallback(() => {
    graphicsModeService.retry3DAfterContextLoss();
    setContextLostOpen(false);
    setWebglRetryNonce((n) => n + 1);
  }, []);

  const continueIn2D = useCallback(() => {
    setContextLostOpen(false);
    setLockedMode('2d');
  }, []);

  return {
    lockedMode,
    show3D: lockedMode !== '2d' && webgl2Supported,
    effectiveGlobalMode: gfx.effectiveMode,
    override: gfx.gameOverrides[gameId] ?? 'default',
    webgl2Supported,
    contextLostOpen,
    webglRetryNonce,
    markContextLost,
    retry3D,
    continueIn2D,
  };
}

interface ArcadeVisualsSelectorProps {
  gameId: GraphicsGameId;
  compact?: boolean;
  onStopPropagation?: boolean;
}

export const ArcadeVisualsSelector: React.FC<ArcadeVisualsSelectorProps> = ({
  gameId,
  compact = false,
  onStopPropagation = false,
}) => {
  const gfx = useGraphicsMode(gameId);
  const override = gfx.gameOverrides[gameId] ?? 'default';
  const webgl2Supported =
    gfx.hardwareReport.webglSupported && gfx.hardwareReport.webgl2Supported;

  const options: Array<{value: GameGraphicsOverride; label: string; disabled?: boolean}> = [
    {value: 'default', label: 'Default'},
    {value: '3d', label: '3D', disabled: !webgl2Supported},
    {value: '2d', label: '2D'},
  ];

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`}
      onClick={(e) => {
        if (onStopPropagation) e.stopPropagation();
      }}
    >
      <span style={{color: 'var(--tv-text-muted)'}}>Visuals:</span>
      <div
        className="inline-flex items-center rounded-lg border p-0.5"
        style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
        role="group"
        aria-label={`Visuals override for ${gameId}`}
      >
        {options.map((opt) => {
          const active = override === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={opt.disabled}
              title={
                opt.disabled
                  ? '3D requires WebGL 2 hardware support'
                  : opt.value === 'default'
                    ? `Follow global mode (${formatResolvedModeLabel(gfx.effectiveMode)})`
                    : `Always use ${opt.label} for this game`
              }
              onClick={(e) => {
                if (onStopPropagation) e.stopPropagation();
                soundEngine.playUiTap();
                void graphicsModeService.setGameOverride(gameId, opt.value);
              }}
              className={`rounded-md font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
              }`}
              style={{
                backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface ArcadeStartBannerProps {
  gameId: GraphicsGameId;
  title: string;
  difficultyLabel: string;
  hint: string;
  onStart: () => void;
}

export const ArcadeStartBanner: React.FC<ArcadeStartBannerProps> = ({
  gameId,
  title,
  difficultyLabel,
  hint,
  onStart,
}) => {
  const gfx = useGraphicsMode(gameId);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
      style={{
        backgroundColor: 'var(--tv-surface-elevated)',
        borderColor: 'var(--tv-border)',
      }}
      data-testid={`arcade-start-${gameId}`}
    >
      <div className="space-y-0.5">
        <div className="text-xs font-semibold" style={{color: 'var(--tv-text)'}}>
          {title} · {difficultyLabel} · Ready ({formatResolvedModeLabel(gfx.effectiveMode)})
        </div>
        <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
          {hint}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ArcadeVisualsSelector gameId={gameId} />
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiTap();
            onStart();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold"
          style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Start Round</span>
        </button>
      </div>
    </div>
  );
};

interface ArcadePauseOverlayProps {
  gameId: GraphicsGameId;
  title: string;
  resumeLabel: string;
  lockedMode: ResolvedGraphicsMode;
  webgl2Supported: boolean;
  onResume: () => void;
  onRestart: () => void;
  onSwitchVisualsConfirmed: (nextOverride: '2d' | '3d') => void;
}

export const ArcadePauseOverlay: React.FC<ArcadePauseOverlayProps> = ({
  title,
  resumeLabel,
  lockedMode,
  webgl2Supported,
  onResume,
  onRestart,
  onSwitchVisualsConfirmed,
}) => {
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const isCurrently3D = lockedMode !== '2d';
  const targetOverride: '2d' | '3d' = isCurrently3D ? '2d' : '3d';
  const targetLabel = isCurrently3D ? '2D Classic' : '3D';

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center">
      {!confirmingSwitch ? (
        <>
          <div className="font-display text-xl font-bold text-white">{title}</div>
          <div className="text-xs text-slate-300">
            Active visuals: {formatResolvedModeLabel(lockedMode)}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onResume}
              className="rounded-xl px-4 py-2 text-xs font-semibold"
              style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
            >
              {resumeLabel}
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Restart</span>
            </button>
            <button
              type="button"
              disabled={!webgl2Supported && targetOverride === '3d'}
              onClick={() => setConfirmingSwitch(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Switch visuals ({targetLabel})</span>
            </button>
          </div>
        </>
      ) : (
        <div className="max-w-sm rounded-2xl border border-slate-600 bg-slate-950 p-5 space-y-3">
          <div className="font-display text-base font-bold text-white">
            Switch to {targetLabel}?
          </div>
          <p className="text-xs text-slate-300">
            This restarts the round in {targetLabel} and saves your preference for this game.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setConfirmingSwitch(false);
                onSwitchVisualsConfirmed(targetOverride);
              }}
              className="rounded-xl px-4 py-2 text-xs font-semibold"
              style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
            >
              Confirm &amp; Restart
            </button>
            <button
              type="button"
              onClick={() => setConfirmingSwitch(false)}
              className="rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface ArcadeContextLostOverlayProps {
  onRetry3D: () => void;
  onContinueIn2D: () => void;
}

export const ArcadeContextLostOverlay: React.FC<ArcadeContextLostOverlayProps> = ({
  onRetry3D,
  onContinueIn2D,
}) => (
  <div
    className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 px-4 text-center"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="webgl-lost-recovery-title"
  >
    <div className="max-w-sm rounded-2xl border border-amber-500/60 bg-slate-950 p-5 space-y-3 shadow-2xl">
      <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden="true" />
      </div>
      <div id="webgl-lost-recovery-title" className="font-display text-base font-bold text-white">
        3D graphics context interrupted
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">
        The round is paused safely with your score and progress intact. Retry 3D or continue this exact round in 2D Classic.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiTap();
            onRetry3D();
          }}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
          style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Retry 3D</span>
        </button>
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiTap();
            onContinueIn2D();
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800"
        >
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Continue in 2D</span>
        </button>
      </div>
    </div>
  </div>
);
