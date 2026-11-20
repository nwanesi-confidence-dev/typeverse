import React, {useEffect, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  ArcadeMetricsTracker,
  type ArcadeCommonProps,
  type ArcadeDifficulty,
  DIFFICULTY_META,
} from '@/src/components/arcade/arcadeTypes';

const RACE_CONFIG: Record<
  ArcadeDifficulty,
  {targetWords: number; rivalWpms: [number, number, number]}
> = {
  easy: {targetWords: 28, rivalWpms: [20, 26, 33]},
  medium: {targetWords: 40, rivalWpms: [36, 46, 56]},
  hard: {targetWords: 55, rivalWpms: [56, 68, 82]},
};

interface ExhaustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export const TurboRacerGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  wordPool,
  personalBestWpm,
  reducedMotion,
  onTelemetry,
  onFinish,
  onExit,
}) => {
  const cfg = RACE_CONFIG[difficulty];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef(new ArcadeMetricsTracker(personalBestWpm));
  const [paused, setPaused] = useState(false);
  const [restartNonce, setRestartNonce] = useState(0);

  // Pre-build deterministic word sequence for this race
  const [wordSeq, setWordSeq] = useState<string[]>([]);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [typedPrefix, setTypedPrefix] = useState('');
  const [flashErr, setFlashErr] = useState(false);

  const stateRef = useRef({
    paused: false,
    finished: false,
    started: false,
    playerDist: 0, // 0..1000 track units
    playerSpeedWpm: 0,
    boostTimer: 0,
    rivals: [
      {name: 'Bolt', color: '#F472B6', dist: 0, targetWpm: cfg.rivalWpms[0], lane: 0},
      {name: 'Nova', color: '#FBBF24', dist: 0, targetWpm: cfg.rivalWpms[1], lane: 1},
      {name: 'Apex', color: '#A78BFA', dist: 0, targetWpm: cfg.rivalWpms[2], lane: 3},
    ],
    wordIdx: 0,
    typed: '',
    score: 0,
    rank: 4,
    particles: [] as ExhaustParticle[],
    composing: false,
  });

  useEffect(() => {
    const seq: string[] = [];
    const safePool = wordPool.length > 0 ? wordPool : ['turbo', 'speed', 'track', 'glide'];
    for (let i = 0; i < cfg.targetWords; i++) {
      seq.push(safePool[(i * 7 + restartNonce * 13) % safePool.length]);
    }
    setWordSeq(seq);
    setCurrentWordIdx(0);
    setTypedPrefix('');
    setPaused(false);
    trackerRef.current = new ArcadeMetricsTracker(personalBestWpm);
    stateRef.current = {
      paused: false,
      finished: false,
      started: false,
      playerDist: 0,
      playerSpeedWpm: 0,
      boostTimer: 0,
      rivals: [
        {name: 'Bolt', color: '#F472B6', dist: 0, targetWpm: cfg.rivalWpms[0], lane: 0},
        {name: 'Nova', color: '#FBBF24', dist: 0, targetWpm: cfg.rivalWpms[1], lane: 1},
        {name: 'Apex', color: '#A78BFA', dist: 0, targetWpm: cfg.rivalWpms[2], lane: 3},
      ],
      wordIdx: 0,
      typed: '',
      score: 0,
      rank: 4,
      particles: [],
      composing: false,
    };
    onTelemetry(trackerRef.current.getSnapshot(0, seq[0]?.[0] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, wordPool, restartNonce, cfg.targetWords]);

  // Tab visibility auto-pause
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && stateRef.current.started && !stateRef.current.finished) {
        stateRef.current.paused = true;
        trackerRef.current.setPaused(true);
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Keyboard listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.finished || stateRef.current.composing) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      trackerRef.current.setCapsLock(e.getModifierState('CapsLock'));

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!stateRef.current.started) {
          onExit();
          return;
        }
        const nextPaused = !stateRef.current.paused;
        stateRef.current.paused = nextPaused;
        trackerRef.current.setPaused(nextPaused);
        setPaused(nextPaused);
        return;
      }

      if (stateRef.current.paused) return;
      if (e.key.length !== 1 && e.key !== ' ') return;
      if (e.key === ' ') e.preventDefault();

      const currentWord = wordSeq[stateRef.current.wordIdx];
      if (!currentWord) return;

      const nextExpected =
        stateRef.current.typed.length < currentWord.length
          ? currentWord[stateRef.current.typed.length]
          : ' ';

      stateRef.current.started = true;

      if (e.key === nextExpected) {
        const {combo, multiplier} = trackerRef.current.recordKey(e.key, true);
        soundEngine.playKeyClick(Math.min(8, Math.floor(combo / 10)));

        if (nextExpected === ' ' || stateRef.current.typed.length + 1 === currentWord.length && stateRef.current.wordIdx + 1 >= wordSeq.length) {
          // Completed a word!
          trackerRef.current.recordWordCompleted();
          stateRef.current.wordIdx++;
          stateRef.current.typed = '';
          stateRef.current.boostTimer = 0.45;
          stateRef.current.score += 100 * multiplier;
          stateRef.current.playerDist =
            (stateRef.current.wordIdx / wordSeq.length) * 1000;
          setCurrentWordIdx(stateRef.current.wordIdx);
          setTypedPrefix('');

          if (stateRef.current.wordIdx >= wordSeq.length && !stateRef.current.finished) {
            stateRef.current.finished = true;
            soundEngine.playMilestone();
            const rank = stateRef.current.rank;
            const summary = `Finished in ${rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : '4th'} place (${DIFFICULTY_META[difficulty].label})`;
            onFinish(
              trackerRef.current.finalize(
                `Arcade · Turbo Racer (${DIFFICULTY_META[difficulty].label})`,
                stateRef.current.score + (rank === 1 ? 300 : 0),
                rank <= 2,
                summary,
              ),
            );
          }
        } else if (nextExpected !== ' ') {
          const nextTyped = stateRef.current.typed + e.key;
          stateRef.current.typed = nextTyped;
          stateRef.current.score += 12 * multiplier;
          setTypedPrefix(nextTyped);
        }
      } else {
        trackerRef.current.recordKey(nextExpected, false);
        soundEngine.playError();
        setFlashErr(true);
        window.setTimeout(() => setFlashErr(false), 140);
      }
    };

    const onCompStart = () => {
      stateRef.current.composing = true;
    };
    const onCompEnd = () => {
      stateRef.current.composing = false;
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('compositionstart', onCompStart);
    window.addEventListener('compositionend', onCompEnd);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('compositionstart', onCompStart);
      window.removeEventListener('compositionend', onCompEnd);
    };
  }, [wordSeq, difficulty, onFinish, onExit]);

  // 60 FPS Canvas 2D loop + 30 Hz HUD throttle
  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    let lastHudEmit = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const st = stateRef.current;
      const canvas = canvasRef.current;
      const tracker = trackerRef.current;

      if (!st.paused && !st.finished && st.started) {
        // Rivals move proportional to their WPM (1 WPM = 5 chars/min, race scale maps ~1 word to 1000/targetWords dist)
        const trackCharsTotal = Math.max(120, cfg.targetWords * 5.2);
        const distPerChar = 1000 / trackCharsTotal;
        for (const rival of st.rivals) {
          const charsPerSec = (rival.targetWpm * 5) / 60;
          rival.dist = Math.min(995, rival.dist + charsPerSec * distPerChar * dt);
        }

        // Smooth visual player distance slightly ahead as partial word is typed
        const partialWord = wordSeq[st.wordIdx]?.length
          ? st.typed.length / wordSeq[st.wordIdx].length
          : 0;
        const targetDist = ((st.wordIdx + partialWord * 0.9) / Math.max(1, wordSeq.length)) * 1000;
        st.playerDist += (targetDist - st.playerDist) * Math.min(1, dt * 12);

        if (st.boostTimer > 0) st.boostTimer = Math.max(0, st.boostTimer - dt);

        // Compute rank
        const ahead = st.rivals.filter((r) => r.dist > st.playerDist).length;
        st.rank = ahead + 1;

        // Spawn pooled exhaust particles when moving fast
        if (!reducedMotion && st.boostTimer > 0 && st.particles.length < 48) {
          st.particles.push({
            x: 0,
            y: 0,
            vx: -110 - Math.random() * 90,
            vy: (Math.random() - 0.5) * 28,
            life: 1,
            color: st.boostTimer > 0.25 ? '#22D3EE' : '#FBBF24',
          });
        }
      }

      // Draw Canvas
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // Night-highway backdrop
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#070B18');
          grad.addColorStop(1, '#111936');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);

          // Road track area
          const roadTop = 44;
          const roadHeight = h - 64;
          const laneH = roadHeight / 4;

          ctx.fillStyle = '#0D1326';
          ctx.fillRect(0, roadTop, w, roadHeight);

          // Scrolling lane dashes anchored to playerDist
          const dashOffset = (st.playerDist * 8) % 60;
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = 2;
          ctx.setLineDash([28, 32]);
          ctx.lineDashOffset = dashOffset;
          for (let lane = 1; lane < 4; lane++) {
            const ly = roadTop + lane * laneH;
            ctx.beginPath();
            ctx.moveTo(0, ly);
            ctx.lineTo(w, ly);
            ctx.stroke();
          }
          ctx.setLineDash([]);

          // Start & Finish lines
          const marginX = 76;
          const usableW = Math.max(120, w - marginX * 2);
          ctx.fillStyle = 'rgba(34, 211, 238, 0.22)';
          ctx.fillRect(w - marginX + 18, roadTop, 8, roadHeight);

          // Helper to draw a crisp neon racer
          const drawCar = (
            x: number,
            y: number,
            color: string,
            label: string,
            isPlayer: boolean,
          ) => {
            ctx.save();
            ctx.translate(x, y);
            if (isPlayer) {
              ctx.shadowColor = '#22D3EE';
              ctx.shadowBlur = 14;
            }
            // Body
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(-24, -12, 48, 24, 7);
            ctx.fill();
            // Windshield
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#090E1C';
            ctx.beginPath();
            ctx.roundRect(2, -8, 13, 16, 3);
            ctx.fill();
            // Headlights
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(22, -9, 4, 4);
            ctx.fillRect(22, 5, 4, 4);

            // Label
            ctx.fillStyle = isPlayer ? '#22D3EE' : '#CBD5E1';
            ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, 0, -18);
            ctx.restore();
          };

          // Draw Rivals
          for (const rival of st.rivals) {
            const rx = marginX + (rival.dist / 1000) * usableW;
            const ry = roadTop + rival.lane * laneH + laneH / 2;
            drawCar(rx, ry, rival.color, rival.name, false);
          }

          // Draw Player (lane 2)
          const px = marginX + (st.playerDist / 1000) * usableW;
          const py = roadTop + 2 * laneH + laneH / 2;

          // Update & draw particles anchored behind player car
          for (let i = st.particles.length - 1; i >= 0; i--) {
            const p = st.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 2.4;
            if (p.life <= 0) {
              st.particles.splice(i, 1);
            } else {
              ctx.globalAlpha = p.life;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(px - 26 + p.x, py + p.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;

          drawCar(px, py, '#22D3EE', 'YOU', true);

          // Top HUD bar inside canvas
          ctx.fillStyle = '#E2E8F0';
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `POS ${st.rank}/4   WORD ${Math.min(st.wordIdx + 1, wordSeq.length)}/${wordSeq.length}   SCORE ${st.score}`,
            16,
            26,
          );

          ctx.restore();
        }
      }

      // Throttled 30 Hz HUD update
      if (now - lastHudEmit >= 33) {
        lastHudEmit = now;
        const curWord = wordSeq[st.wordIdx] ?? '';
        const nextChar =
          st.typed.length < curWord.length ? curWord[st.typed.length] : ' ';
        onTelemetry(
          tracker.getSnapshot(
            wordSeq.length > 0 ? st.wordIdx / wordSeq.length : 0,
            nextChar,
            now,
          ),
        );
      }

      raf = window.requestAnimationFrame(frame);
    };

    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [cfg.targetWords, wordSeq, reducedMotion, onTelemetry]);

  const currentWord = wordSeq[currentWordIdx] ?? '';
  const upcomingWords = wordSeq.slice(currentWordIdx + 1, currentWordIdx + 5);

  return (
    <div className="tv-surface rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
          Turbo Racer · {DIFFICULTY_META[difficulty].label} · Type each word plus Space to surge past rivals
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !paused;
              stateRef.current.paused = next;
              trackerRef.current.setPaused(next);
              setPaused(next);
            }}
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

      <div className="relative rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)'}}>
        <canvas
          ref={canvasRef}
          className="block w-full h-64 sm:h-72"
          aria-label="Turbo Racer track canvas"
        />
        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-xs">
            <div className="font-display text-xl font-bold text-white">Race Paused</div>
            <button
              type="button"
              onClick={() => {
                stateRef.current.paused = false;
                trackerRef.current.setPaused(false);
                setPaused(false);
              }}
              className="rounded-xl px-4 py-2 text-xs font-semibold"
              style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
            >
              Resume Race
            </button>
          </div>
        )}
      </div>

      {/* Zero-flicker Live Word Prompt Ribbon */}
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
