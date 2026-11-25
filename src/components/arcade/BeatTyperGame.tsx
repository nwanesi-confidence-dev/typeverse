import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {
  BEAT_TYPER_FIELD_HEIGHT,
  BeatTyperEngine,
} from '@/src/arcade/engine/beatTyperEngine';
import {CANONICAL_PLAY_WIDTH} from '@/src/arcade/playZone';
import {
  renderBeatTyper2D,
  type JudgementToast2D,
} from '@/src/arcade/renderer-2d/BeatTyper2D';
import {BeatTyper3D} from '@/src/arcade/renderer-3d/BeatTyper3D';
import {useCanvas2DResizeObserver} from '@/src/arcade/usePlayfieldSize';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  DIFFICULTY_META,
  type ArcadeCommonProps,
} from '@/src/components/arcade/arcadeTypes';
import {
  ArcadeContextLostOverlay,
  ArcadePauseOverlay,
  ArcadeStartBanner,
  useRoundLockedVisuals,
} from '@/src/components/arcade/ArcadeVisualsControl';
import {formatResolvedModeLabel} from '@/src/graphics/decision';
import {graphicsModeService} from '@/src/graphics/graphicsModeService';
import type {
  BeatTyper3DState,
  BeatTyperMutableSnapshot,
} from '@/src/three/scenes/beatTyper3DScene';

export const BeatTyperGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  personalBestWpm,
  onTelemetry,
  onFinish,
  onExit,
}) => {
  const [restartNonce, setRestartNonce] = useState(0);
  const [roundStarted, setRoundStarted] = useState(false);
  const [paused, setPaused] = useState(false);

  const {
    lockedMode,
    show3D,
    webgl2Supported,
    isSoftwareRenderer,
    contextLostOpen,
    webglRetryNonce,
    markContextLost,
    retry3D,
    continueIn2D,
  } = useRoundLockedVisuals('beat-typer', roundStarted, restartNonce);

  const handleWebglContextLost = useCallback(() => {
    if (engineRef.current.state.started && !engineRef.current.state.finished) {
      engineRef.current.setPaused(true);
      setPaused(true);
    }
    markContextLost();
  }, [markContextLost]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toasts2DRef = useRef<JudgementToast2D[]>([]);
  const composingRef = useRef(false);

  const engineRef = useRef<BeatTyperEngine>(
    new BeatTyperEngine({
      difficulty,
      personalBestWpm,
      seed: 404,
      playedVisuals: show3D ? '3d' : '2d',
    }),
  );

  const snapshot3DRef = useRef<BeatTyperMutableSnapshot>(engineRef.current.state);
  const [hudOverlay, setHudOverlay] = useState({
    resolvedCount: 0,
    perfects: 0,
    score: 0,
    judgement: '' as '' | 'PERFECT!' | 'GOOD' | 'MISS',
  });

  useEffect(() => {
    const eng = new BeatTyperEngine({
      difficulty,
      personalBestWpm,
      seed: 404 + restartNonce * 29,
      playedVisuals: show3D ? '3d' : '2d',
    });
    engineRef.current = eng;
    snapshot3DRef.current = eng.state;
    toasts2DRef.current = [];

    setHudOverlay({resolvedCount: 0, perfects: 0, score: 0, judgement: ''});
    setPaused(false);
    setRoundStarted(false);
    onTelemetry(eng.getTelemetrySnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, restartNonce]);

  useEffect(() => {
    engineRef.current.setVisualsTag(lockedMode === '2d' ? '2d' : '3d');
  }, [lockedMode]);

  useEffect(() => {
    const onVis = () => {
      const eng = engineRef.current;
      if (document.hidden && eng.state.started && !eng.state.finished) {
        eng.setPaused(true);
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (eng.state.finished || composingRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      eng.tracker.setCapsLock(e.getModifierState('CapsLock'));

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!eng.state.started) {
          onExit();
          return;
        }
        const nextPaused = !eng.state.paused;
        eng.setPaused(nextPaused);
        setPaused(nextPaused);
        return;
      }

      if (eng.state.paused || e.key.length !== 1) return;

      if (!eng.state.started) {
        setRoundStarted(true);
      }

      const h = BEAT_TYPER_FIELD_HEIGHT;
      const strikeY = h - 58;

      const res = eng.handleKey(e.key, h);
      if (!res.handled) return;

      if (res.grade === 'miss') {
        soundEngine.playHitChime('miss');
      } else {
        soundEngine.playHitChime(res.grade);
        if (!show3D && res.lane !== undefined) {
          const laneW = CANONICAL_PLAY_WIDTH / 4;
          const nx = res.lane * laneW + laneW / 2;
          toasts2DRef.current.push({
            text: res.grade === 'perfect' ? 'PERFECT!' : 'GOOD',
            color: res.grade === 'perfect' ? '#22D3EE' : '#34D399',
            x: nx,
            y: strikeY - 18,
            life: 1,
          });
        }
        if (res.finishedResult) {
          soundEngine.playMilestone();
          onFinish({
            ...res.finishedResult,
            playedVisuals: lockedMode === '2d' ? '2d' : '3d',
          });
        }
      }
    };

    const onCompStart = () => {
      composingRef.current = true;
    };
    const onCompEnd = () => {
      composingRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('compositionstart', onCompStart);
    window.addEventListener('compositionend', onCompEnd);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('compositionstart', onCompStart);
      window.removeEventListener('compositionend', onCompEnd);
    };
  }, [lockedMode, show3D, onFinish, onExit]);

  const render2DFrame = useCallback(
    (dtSec: number) => {
      if (show3D || !canvasRef.current) return;
      const eng = engineRef.current;
      renderBeatTyper2D({
        canvas: canvasRef.current,
        state: eng.state,
        bpm: eng.cfg.bpm,
        totalNotes: eng.cfg.totalNotes,
        toasts: toasts2DRef.current,
        dtSec,
        resolvedMode: lockedMode,
        isSoftwareRenderer,
      });
    },
    [show3D, lockedMode, isSoftwareRenderer],
  );

  useCanvas2DResizeObserver(canvasRef, !show3D, () => render2DFrame(0));

  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    let lastHud = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const eng = engineRef.current;

      const h = BEAT_TYPER_FIELD_HEIGHT;
      const strikeY = h - 58;
      const stepRes = eng.step(dt, h, now);

      if (stepRes.beatTicked) {
        soundEngine.playBeatTick(stepRes.accentBeat);
      }

      if (!show3D && stepRes.missedNotes.length > 0) {
        const laneW = CANONICAL_PLAY_WIDTH / 4;
        for (const m of stepRes.missedNotes) {
          toasts2DRef.current.push({
            text: 'MISS',
            color: '#FB7185',
            x: m.lane * laneW + laneW / 2,
            y: strikeY - 12,
            life: 1,
          });
        }
      }

      if (stepRes.finishedResult) {
        soundEngine.playMilestone();
        onFinish({
          ...stepRes.finishedResult,
          playedVisuals: lockedMode === '2d' ? '2d' : '3d',
        });
      }

      render2DFrame(dt);

      if (now - lastHud >= 33) {
        lastHud = now;
        if (show3D) {
          const cur = eng.state;
          setHudOverlay((prev) =>
            prev.resolvedCount === cur.resolvedCount &&
            prev.perfects === cur.perfects &&
            prev.score === cur.score &&
            prev.judgement === cur.lastJudgement
              ? prev
              : {
                  resolvedCount: cur.resolvedCount,
                  perfects: cur.perfects,
                  score: cur.score,
                  judgement: cur.lastJudgement,
                },
          );
        }
        onTelemetry(eng.getTelemetrySnapshot(now));
      }

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [difficulty, lockedMode, render2DFrame, show3D, onFinish, onTelemetry]);

  const beat3DState: BeatTyper3DState = useMemo(
    () => ({
      gameRef: snapshot3DRef,
      fieldHeight: BEAT_TYPER_FIELD_HEIGHT,
      bpm: engineRef.current.cfg.bpm,
    }),
    [difficulty, restartNonce],
  );

  const togglePause = () => {
    const next = !paused;
    engineRef.current.setPaused(next);
    setPaused(next);
  };

  return (
    <div className="tv-surface rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 flex-1 min-h-0">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs font-medium flex flex-wrap items-center gap-2" style={{color: 'var(--tv-text-muted)'}}>
          <span className="truncate">Beat Typer · {DIFFICULTY_META[difficulty].label} ({engineRef.current.cfg.bpm} BPM) · Strike the falling key as it hits the glowing bar</span>
          <span
            className="rounded-md border px-2 py-0.5 text-[11px] font-semibold shrink-0"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)'}}
          >
            {formatResolvedModeLabel(lockedMode)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={togglePause}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs"
            style={{borderColor: 'var(--tv-border)'}}
          >
            {paused ? <Play className="w-3 h-3" aria-hidden="true" /> : <Pause className="w-3 h-3" aria-hidden="true" />}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRestartNonce((n) => n + 1)}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs"
            style={{borderColor: 'var(--tv-border)'}}
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Restart</span>
          </button>
        </div>
      </div>

      {!roundStarted && !paused && (
        <ArcadeStartBanner
          gameId="beat-typer"
          title="Beat Typer"
          difficultyLabel={DIFFICULTY_META[difficulty].label}
          hint="Press Start Round or type any note key to begin."
          onStart={() => {
            engineRef.current.start();
            setRoundStarted(true);
          }}
        />
      )}

      <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)'}}>
        {show3D ? (
          <BeatTyper3D
            gameId="beat-typer"
            forcedMode={lockedMode}
            retryNonce={webglRetryNonce}
            onContextLostPermanent={handleWebglContextLost}
            sceneState={beat3DState}
            bpm={engineRef.current.cfg.bpm}
            totalNotes={engineRef.current.cfg.totalNotes}
            hud={hudOverlay}
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            aria-label="Beat Typer rhythm canvas"
          />
        )}
        {contextLostOpen && (
          <ArcadeContextLostOverlay
            onRetry3D={retry3D}
            onContinueIn2D={continueIn2D}
          />
        )}
        {paused && !contextLostOpen && (
          <ArcadePauseOverlay
            gameId="beat-typer"
            title="Rhythm Paused"
            resumeLabel="Resume Beat"
            lockedMode={lockedMode}
            webgl2Supported={webgl2Supported}
            onResume={() => {
              engineRef.current.setPaused(false);
              setPaused(false);
            }}
            onRestart={() => setRestartNonce((n) => n + 1)}
            onSwitchVisualsConfirmed={async (nextOverride) => {
              await graphicsModeService.setGameOverride('beat-typer', nextOverride);
              setRestartNonce((n) => n + 1);
            }}
          />
        )}
      </div>
    </div>
  );
};
