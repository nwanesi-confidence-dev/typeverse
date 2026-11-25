import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {
  WORD_RAIN_FIELD_HEIGHT,
  WordRainEngine,
} from '@/src/arcade/engine/wordRainEngine';
import {CANONICAL_PLAY_WIDTH} from '@/src/arcade/playZone';
import {
  renderWordRain2D,
  type Ripple2D,
} from '@/src/arcade/renderer-2d/WordRain2D';
import {WordRain3D} from '@/src/arcade/renderer-3d/WordRain3D';
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
import type {WordRain3DState, WordRainMutableSnapshot} from '@/src/three/scenes/wordRain3DScene';

export const WordRainGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  wordPool,
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
  } = useRoundLockedVisuals('word-rain', roundStarted, restartNonce);

  const handleWebglContextLost = useCallback(() => {
    if (engineRef.current.state.started && !engineRef.current.state.finished) {
      engineRef.current.setPaused(true);
      setPaused(true);
    }
    markContextLost();
  }, [markContextLost]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripples2DRef = useRef<Ripple2D[]>([]);
  const composingRef = useRef(false);

  const engineRef = useRef<WordRainEngine>(
    new WordRainEngine({
      difficulty,
      wordPool,
      personalBestWpm,
      seed: 202,
      playedVisuals: show3D ? '3d' : '2d',
    }),
  );

  const snapshot3DRef = useRef<WordRainMutableSnapshot>(engineRef.current.state);
  const [hudOverlay, setHudOverlay] = useState({lives: 5, clears: 0, score: 0});

  useEffect(() => {
    const eng = new WordRainEngine({
      difficulty,
      wordPool,
      personalBestWpm,
      seed: 202 + restartNonce * 19,
      playedVisuals: show3D ? '3d' : '2d',
    });
    engineRef.current = eng;
    snapshot3DRef.current = eng.state;
    ripples2DRef.current = [];

    setHudOverlay({lives: 5, clears: 0, score: 0});
    setPaused(false);
    setRoundStarted(false);
    onTelemetry(eng.getTelemetrySnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, wordPool, restartNonce]);

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

      const res = eng.handleKey(e.key);
      if (!res.handled) return;

      if (res.correct) {
        soundEngine.playBubblePop(res.combo);
        if (!show3D && res.clearedEvent) {
          ripples2DRef.current.push({
            x: res.clearedEvent.xNorm * CANONICAL_PLAY_WIDTH,
            y: res.clearedEvent.yPx ?? 120,
            radius: 10,
            life: 1,
            color: res.clearedEvent.golden ? '#FBBF24' : '#38BDF8',
          });
        }
        if (res.finishedResult) {
          soundEngine.playMilestone();
          onFinish({
            ...res.finishedResult,
            playedVisuals: lockedMode === '2d' ? '2d' : '3d',
          });
        }
      } else {
        soundEngine.playError();
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
      renderWordRain2D({
        canvas: canvasRef.current,
        state: eng.state,
        goal: eng.cfg.goal,
        ripples: ripples2DRef.current,
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

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const eng = engineRef.current;

      const stepRes = eng.step(dt, WORD_RAIN_FIELD_HEIGHT, now);

      if (stepRes.missedEvents.length > 0) {
        soundEngine.playHitChime('miss');
        if (!show3D) {
          for (const ev of stepRes.missedEvents) {
            ripples2DRef.current.push({
              x: ev.xNorm * CANONICAL_PLAY_WIDTH,
              y: WORD_RAIN_FIELD_HEIGHT - 26,
              radius: 8,
              life: 1,
              color: '#FB7185',
            });
          }
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
            prev.lives === cur.lives && prev.clears === cur.clears && prev.score === cur.score
              ? prev
              : {lives: cur.lives, clears: cur.clears, score: cur.score},
          );
        }
        onTelemetry(eng.getTelemetrySnapshot(now));
      }

      raf = window.requestAnimationFrame(frame);
    };

    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [difficulty, lockedMode, render2DFrame, show3D, onFinish, onTelemetry]);

  const rain3DState: WordRain3DState = useMemo(
    () => ({
      gameRef: snapshot3DRef,
      fieldHeight: WORD_RAIN_FIELD_HEIGHT,
    }),
    [restartNonce],
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
          <span className="truncate">Word Rain · {DIFFICULTY_META[difficulty].label} · Catch drifting raindrops before they reach the pond (gold drops restore +1 life)</span>
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
          gameId="word-rain"
          title="Word Rain"
          difficultyLabel={DIFFICULTY_META[difficulty].label}
          hint="Press Start Round or type any visible raindrop word to begin."
          onStart={() => {
            engineRef.current.start();
            setRoundStarted(true);
          }}
        />
      )}

      <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)'}}>
        {show3D ? (
          <WordRain3D
            gameId="word-rain"
            forcedMode={lockedMode}
            retryNonce={webglRetryNonce}
            onContextLostPermanent={handleWebglContextLost}
            sceneState={rain3DState}
            goal={engineRef.current.cfg.goal}
            hud={hudOverlay}
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            aria-label="Word Rain canvas"
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
            gameId="word-rain"
            title="Rain Paused"
            resumeLabel="Resume Game"
            lockedMode={lockedMode}
            webgl2Supported={webgl2Supported}
            onResume={() => {
              engineRef.current.setPaused(false);
              setPaused(false);
            }}
            onRestart={() => setRestartNonce((n) => n + 1)}
            onSwitchVisualsConfirmed={async (nextOverride) => {
              await graphicsModeService.setGameOverride('word-rain', nextOverride);
              setRestartNonce((n) => n + 1);
            }}
          />
        )}
      </div>
    </div>
  );
};
