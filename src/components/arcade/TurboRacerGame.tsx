import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {
  TurboRacerEngine,
  type TurboRacerState,
} from '@/src/arcade/engine/turboRacerEngine';
import {
  renderTurboRacer2D,
  type ExhaustParticle2D,
} from '@/src/arcade/renderer-2d/TurboRacer2D';
import {TurboRacer3D} from '@/src/arcade/renderer-3d/TurboRacer3D';
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
import type {TurboRacer3DState, TurboRacerMutableSnapshot} from '@/src/three/scenes/turboRacer3DScene';

export const TurboRacerGame: React.FC<ArcadeCommonProps> = ({
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
    contextLostOpen,
    webglRetryNonce,
    markContextLost,
    retry3D,
    continueIn2D,
  } = useRoundLockedVisuals('turbo-racer', roundStarted, restartNonce);

  const handleWebglContextLost = useCallback(() => {
    if (engineRef.current.state.started && !engineRef.current.state.finished) {
      engineRef.current.setPaused(true);
      setPaused(true);
    }
    markContextLost();
  }, [markContextLost]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles2DRef = useRef<ExhaustParticle2D[]>([]);
  const composingRef = useRef(false);

  const engineRef = useRef<TurboRacerEngine>(
    new TurboRacerEngine({
      difficulty,
      wordPool,
      personalBestWpm,
      seed: 0,
      playedVisuals: show3D ? '3d' : '2d',
    }),
  );

  // Synced snapshot wrapper passed into lazy 3D scene
  const snapshot3DRef = useRef<TurboRacerMutableSnapshot>(engineRef.current.state);

  const [wordSeq, setWordSeq] = useState<string[]>(engineRef.current.wordSeq);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [typedPrefix, setTypedPrefix] = useState('');
  const [flashErr, setFlashErr] = useState(false);
  const [hudOverlay, setHudOverlay] = useState({rank: 4, score: 0});

  useEffect(() => {
    const eng = new TurboRacerEngine({
      difficulty,
      wordPool,
      personalBestWpm,
      seed: restartNonce,
      playedVisuals: show3D ? '3d' : '2d',
    });
    engineRef.current = eng;
    snapshot3DRef.current = eng.state;
    particles2DRef.current = [];

    setWordSeq(eng.wordSeq);
    setCurrentWordIdx(0);
    setTypedPrefix('');
    setHudOverlay({rank: 4, score: 0});
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

      if (eng.state.paused) return;
      if (e.key.length !== 1 && e.key !== ' ') return;
      if (e.key === ' ') e.preventDefault();

      if (!eng.state.started) {
        setRoundStarted(true);
      }

      const res = eng.handleKey(e.key);
      if (!res.handled) return;

      if (res.correct) {
        soundEngine.playKeyClick(Math.min(8, Math.floor(res.combo / 10)));
        setCurrentWordIdx(eng.state.wordIdx);
        setTypedPrefix(eng.state.typed);
        if (res.finishedResult) {
          soundEngine.playMilestone();
          onFinish({
            ...res.finishedResult,
            playedVisuals: lockedMode === '2d' ? '2d' : '3d',
          });
        }
      } else {
        soundEngine.playError();
        setFlashErr(true);
        window.setTimeout(() => setFlashErr(false), 140);
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
  }, [lockedMode, onFinish, onExit]);

  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    let lastHudEmit = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const eng = engineRef.current;
      eng.step(dt);

      if (!show3D && canvasRef.current) {
        renderTurboRacer2D({
          canvas: canvasRef.current,
          state: eng.state as TurboRacerState,
          totalWords: eng.wordSeq.length,
          particles: particles2DRef.current,
          dtSec: dt,
          reducedMotion,
        });
      }

      if (now - lastHudEmit >= 33) {
        lastHudEmit = now;
        if (show3D) {
          const st = eng.state;
          setHudOverlay((prev) =>
            prev.rank === st.rank && prev.score === st.score
              ? prev
              : {rank: st.rank, score: st.score},
          );
        }
        onTelemetry(eng.getTelemetrySnapshot(now));
      }

      raf = window.requestAnimationFrame(frame);
    };

    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [reducedMotion, show3D, onTelemetry]);

  const racer3DState: TurboRacer3DState = useMemo(
    () => ({
      raceRef: snapshot3DRef,
      getLiveWpm: () => engineRef.current.getTelemetrySnapshot().rollingWpm,
      totalWords: wordSeq.length,
    }),
    [wordSeq.length, restartNonce],
  );

  const currentWord = wordSeq[currentWordIdx] ?? '';
  const upcomingWords = wordSeq.slice(currentWordIdx + 1, currentWordIdx + 5);

  const togglePause = () => {
    const next = !paused;
    engineRef.current.setPaused(next);
    setPaused(next);
  };

  return (
    <div className="tv-surface rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium flex flex-wrap items-center gap-2" style={{color: 'var(--tv-text-muted)'}}>
          <span>Turbo Racer · {DIFFICULTY_META[difficulty].label} · Type each word plus Space to surge past rivals</span>
          <span
            className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)'}}
          >
            {formatResolvedModeLabel(lockedMode)}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
          gameId="turbo-racer"
          title="Turbo Racer"
          difficultyLabel={DIFFICULTY_META[difficulty].label}
          hint="Press Start Round or begin typing the highlighted word below."
          onStart={() => {
            engineRef.current.start();
            setRoundStarted(true);
          }}
        />
      )}

      <div className="relative rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)'}}>
        {show3D ? (
          <TurboRacer3D
            gameId="turbo-racer"
            forcedMode={lockedMode}
            retryNonce={webglRetryNonce}
            onContextLostPermanent={handleWebglContextLost}
            sceneState={racer3DState}
            hud={{
              rank: hudOverlay.rank,
              currentWordNumber: Math.min(currentWordIdx + 1, Math.max(1, wordSeq.length)),
              totalWords: wordSeq.length,
              score: hudOverlay.score,
            }}
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="block w-full h-64 sm:h-72"
            aria-label="Turbo Racer track canvas"
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
            gameId="turbo-racer"
            title="Race Paused"
            resumeLabel="Resume Race"
            lockedMode={lockedMode}
            webgl2Supported={webgl2Supported}
            onResume={() => {
              engineRef.current.setPaused(false);
              setPaused(false);
            }}
            onRestart={() => setRestartNonce((n) => n + 1)}
            onSwitchVisualsConfirmed={async (nextOverride) => {
              await graphicsModeService.setGameOverride('turbo-racer', nextOverride);
              setRestartNonce((n) => n + 1);
            }}
          />
        )}
      </div>

      <div
        className={`rounded-xl border px-5 py-4 flex flex-wrap items-center gap-4 ${flashErr ? 'tv-char-shake' : ''}`}
        style={{
          backgroundColor: 'var(--tv-bg)',
          borderColor: flashErr ? 'var(--tv-error)' : 'var(--tv-border)',
        }}
      >
        <div className="font-typing text-2xl sm:text-3xl font-bold tracking-wide">
          <span style={{color: 'var(--tv-success)'}}>{typedPrefix}</span>
          <span
            className="underline decoration-2 underline-offset-4"
            style={{color: 'var(--tv-accent)'}}
          >
            {currentWord.slice(typedPrefix.length)}
          </span>
        </div>
        <div className="font-typing text-lg flex flex-wrap gap-3" style={{color: 'var(--tv-text-muted)'}}>
          {upcomingWords.map((w, idx) => (
            <span key={`${w}-${idx}`}>{w}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
