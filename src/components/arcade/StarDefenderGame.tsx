import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {
  STAR_DEFENDER_FIELD_HEIGHT,
  StarDefenderEngine,
} from '@/src/arcade/engine/starDefenderEngine';
import {
  CANONICAL_PLAY_HEIGHT,
  CANONICAL_PLAY_WIDTH,
} from '@/src/arcade/playZone';
import {
  renderStarDefender2D,
  type LaserBeam2D,
  type StarParticle2D,
} from '@/src/arcade/renderer-2d/StarDefender2D';
import {StarDefender3D} from '@/src/arcade/renderer-3d/StarDefender3D';
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
  StarDefender3DState,
  StarDefenderMutableSnapshot,
} from '@/src/three/scenes/starDefender3DScene';

export const StarDefenderGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  wordPool,
  personalBestWpm,
  reducedMotion,
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
  } = useRoundLockedVisuals('star-defender', roundStarted, restartNonce);

  const handleWebglContextLost = useCallback(() => {
    if (engineRef.current.state.started && !engineRef.current.state.finished) {
      engineRef.current.setPaused(true);
      setPaused(true);
    }
    markContextLost();
  }, [markContextLost]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beams2DRef = useRef<LaserBeam2D[]>([]);
  const particles2DRef = useRef<StarParticle2D[]>([]);
  const composingRef = useRef(false);

  const engineRef = useRef<StarDefenderEngine>(
    new StarDefenderEngine({
      difficulty,
      wordPool,
      personalBestWpm,
      seed: 101,
      playedVisuals: show3D ? '3d' : '2d',
    }),
  );

  const snapshot3DRef = useRef<StarDefenderMutableSnapshot>(engineRef.current.state);
  const [hudOverlay, setHudOverlay] = useState({shields: 3, wave: 1, clears: 0, score: 0});

  useEffect(() => {
    const eng = new StarDefenderEngine({
      difficulty,
      wordPool,
      personalBestWpm,
      seed: 101 + restartNonce * 17,
      playedVisuals: show3D ? '3d' : '2d',
    });
    engineRef.current = eng;
    snapshot3DRef.current = eng.state;
    beams2DRef.current = [];
    particles2DRef.current = [];

    setHudOverlay({shields: 3, wave: 1, clears: 0, score: 0});
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
        soundEngine.playLaser();
        if (!show3D && res.targetXNorm !== undefined && res.targetY !== undefined) {
          beams2DRef.current.push({
            x1: CANONICAL_PLAY_WIDTH / 2,
            y1: CANONICAL_PLAY_HEIGHT - 36,
            x2: res.targetXNorm * CANONICAL_PLAY_WIDTH,
            y2: res.targetY,
            life: 1,
          });
          if (res.destroyed && !reducedMotion) {
            const cx = res.targetXNorm * CANONICAL_PLAY_WIDTH;
            const cy = res.targetY;
            for (let i = 0; i < 12; i++) {
              if (particles2DRef.current.length >= 48) break;
              const ang = (Math.PI * 2 * i) / 12;
              particles2DRef.current.push({
                x: cx,
                y: cy,
                vx: Math.cos(ang) * (70 + Math.random() * 80),
                vy: Math.sin(ang) * (70 + Math.random() * 80),
                life: 1,
                color: res.destroyedBoss ? '#FBBF24' : '#22D3EE',
              });
            }
          }
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
  }, [lockedMode, reducedMotion, show3D, onFinish, onExit]);

  const render2DFrame = useCallback(
    (dtSec: number) => {
      if (show3D || !canvasRef.current) return;
      const eng = engineRef.current;
      renderStarDefender2D({
        canvas: canvasRef.current,
        state: eng.state,
        targetClears: eng.cfg.targetClears,
        beams: beams2DRef.current,
        particles: particles2DRef.current,
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

      const stepRes = eng.step(dt, STAR_DEFENDER_FIELD_HEIGHT, now);

      if (stepRes.shieldsLost > 0) {
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
            prev.shields === cur.shields &&
            prev.wave === cur.wave &&
            prev.clears === cur.clears &&
            prev.score === cur.score
              ? prev
              : {
                  shields: cur.shields,
                  wave: cur.wave,
                  clears: cur.clears,
                  score: cur.score,
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

  const defender3DState: StarDefender3DState = useMemo(
    () => ({
      gameRef: snapshot3DRef,
      fieldHeight: STAR_DEFENDER_FIELD_HEIGHT,
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
          <span className="truncate">Star Defender · {DIFFICULTY_META[difficulty].label} · Type the first letter to lock target and blast descending asteroids</span>
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
          gameId="star-defender"
          title="Star Defender"
          difficultyLabel={DIFFICULTY_META[difficulty].label}
          hint="Press Start Round or type the first letter of any incoming asteroid."
          onStart={() => {
            engineRef.current.start();
            setRoundStarted(true);
          }}
        />
      )}

      <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)'}}>
        {show3D ? (
          <StarDefender3D
            gameId="star-defender"
            forcedMode={lockedMode}
            retryNonce={webglRetryNonce}
            onContextLostPermanent={handleWebglContextLost}
            sceneState={defender3DState}
            targetClears={engineRef.current.cfg.targetClears}
            hud={hudOverlay}
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            aria-label="Star Defender space canvas"
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
            gameId="star-defender"
            title="Defense Paused"
            resumeLabel="Resume Defense"
            lockedMode={lockedMode}
            webgl2Supported={webgl2Supported}
            onResume={() => {
              engineRef.current.setPaused(false);
              setPaused(false);
            }}
            onRestart={() => setRestartNonce((n) => n + 1)}
            onSwitchVisualsConfirmed={async (nextOverride) => {
              await graphicsModeService.setGameOverride('star-defender', nextOverride);
              setRestartNonce((n) => n + 1);
            }}
          />
        )}
      </div>
    </div>
  );
};
