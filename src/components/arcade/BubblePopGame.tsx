import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {
  BUBBLE_FOCUS_ROWS,
  BUBBLE_POP_FIELD_HEIGHT,
  BubblePopEngine,
} from '@/src/arcade/engine/bubblePopEngine';
import {CANONICAL_PLAY_WIDTH} from '@/src/arcade/playZone';
import {
  renderBubblePop2D,
  type PopBurst2D,
} from '@/src/arcade/renderer-2d/BubblePop2D';
import {BubblePop3D} from '@/src/arcade/renderer-3d/BubblePop3D';
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
  BubblePop3DState,
  BubblePopMutableSnapshot,
} from '@/src/three/scenes/bubblePop3DScene';

export const BubblePopGame: React.FC<ArcadeCommonProps> = ({
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
  const [focusRowId, setFocusRowId] = useState('all');

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
  } = useRoundLockedVisuals('bubble-pop', roundStarted, restartNonce);

  const handleWebglContextLost = useCallback(() => {
    if (engineRef.current.state.started && !engineRef.current.state.finished) {
      engineRef.current.setPaused(true);
      setPaused(true);
    }
    markContextLost();
  }, [markContextLost]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bursts2DRef = useRef<PopBurst2D[]>([]);
  const composingRef = useRef(false);

  const engineRef = useRef<BubblePopEngine>(
    new BubblePopEngine({
      difficulty,
      wordPool,
      focusRowId,
      personalBestWpm,
      seed: 303,
      playedVisuals: show3D ? '3d' : '2d',
    }),
  );

  const snapshot3DRef = useRef<BubblePopMutableSnapshot>(engineRef.current.state);
  const [hudOverlay, setHudOverlay] = useState({lives: 5, popped: 0, score: 0});

  useEffect(() => {
    const eng = new BubblePopEngine({
      difficulty,
      wordPool,
      focusRowId,
      personalBestWpm,
      seed: 303 + restartNonce * 23,
      playedVisuals: show3D ? '3d' : '2d',
    });
    engineRef.current = eng;
    snapshot3DRef.current = eng.state;
    bursts2DRef.current = [];

    setHudOverlay({lives: 5, popped: 0, score: 0});
    setPaused(false);
    setRoundStarted(false);
    onTelemetry(eng.getTelemetrySnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, wordPool, focusRowId, restartNonce]);

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
        if (res.popped) {
          soundEngine.playBubblePop(res.combo);
          if (!show3D && res.burstEvent) {
            bursts2DRef.current.push({
              x: res.burstEvent.xNorm * CANONICAL_PLAY_WIDTH,
              y: res.burstEvent.yPx,
              r: res.burstEvent.radius,
              life: 1,
              color: res.burstEvent.color,
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
          soundEngine.playKeyClick(Math.min(8, Math.floor(res.combo / 8)));
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
      renderBubblePop2D({
        canvas: canvasRef.current,
        state: eng.state,
        goal: eng.cfg.goal,
        multiLetter: eng.cfg.multiLetter,
        bursts: bursts2DRef.current,
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

      const stepRes = eng.step(dt, BUBBLE_POP_FIELD_HEIGHT, now);

      if (stepRes.escapedCount > 0) {
        soundEngine.playHitChime('miss');
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
            prev.lives === cur.lives && prev.popped === cur.popped && prev.score === cur.score
              ? prev
              : {lives: cur.lives, popped: cur.popped, score: cur.score},
          );
        }
        onTelemetry(eng.getTelemetrySnapshot(now));
      }

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [difficulty, focusRowId, lockedMode, render2DFrame, show3D, onFinish, onTelemetry]);

  const bubble3DState: BubblePop3DState = useMemo(
    () => ({
      gameRef: snapshot3DRef,
      fieldHeight: BUBBLE_POP_FIELD_HEIGHT,
    }),
    [focusRowId, restartNonce],
  );

  const togglePause = () => {
    const next = !paused;
    engineRef.current.setPaused(next);
    setPaused(next);
  };

  return (
    <div className="tv-surface rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 flex-1 min-h-0">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
            Focus row:
          </span>
          {BUBBLE_FOCUS_ROWS.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                setFocusRowId(row.id);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium border"
              style={{
                backgroundColor:
                  focusRowId === row.id ? 'var(--tv-accent)' : 'var(--tv-bg)',
                color:
                  focusRowId === row.id ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                borderColor:
                  focusRowId === row.id ? 'var(--tv-accent)' : 'var(--tv-border)',
              }}
            >
              {row.label}
            </button>
          ))}
          <span
            className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)', color: 'var(--tv-text-muted)'}}
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
          gameId="bubble-pop"
          title="Bubble Pop"
          difficultyLabel={DIFFICULTY_META[difficulty].label}
          hint="Press Start Round or pop the first bubble letter to begin."
          onStart={() => {
            engineRef.current.start();
            setRoundStarted(true);
          }}
        />
      )}

      <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)'}}>
        {show3D ? (
          <BubblePop3D
            gameId="bubble-pop"
            forcedMode={lockedMode}
            retryNonce={webglRetryNonce}
            onContextLostPermanent={handleWebglContextLost}
            sceneState={bubble3DState}
            goal={engineRef.current.cfg.goal}
            hud={hudOverlay}
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            aria-label="Bubble Pop canvas"
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
            gameId="bubble-pop"
            title="Game Paused"
            resumeLabel="Resume Game"
            lockedMode={lockedMode}
            webgl2Supported={webgl2Supported}
            onResume={() => {
              engineRef.current.setPaused(false);
              setPaused(false);
            }}
            onRestart={() => setRestartNonce((n) => n + 1)}
            onSwitchVisualsConfirmed={async (nextOverride) => {
              await graphicsModeService.setGameOverride('bubble-pop', nextOverride);
              setRestartNonce((n) => n + 1);
            }}
          />
        )}
      </div>
    </div>
  );
};
