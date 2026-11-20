import React, {useEffect, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  ArcadeMetricsTracker,
  type ArcadeCommonProps,
  type ArcadeDifficulty,
  DIFFICULTY_META,
} from '@/src/components/arcade/arcadeTypes';

interface Raindrop {
  id: number;
  word: string;
  typed: number;
  x: number;
  y: number;
  speed: number;
  golden: boolean;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  life: number;
  color: string;
}

const RAIN_CFG: Record<
  ArcadeDifficulty,
  {speed: number; interval: number; maxDrops: number; goal: number}
> = {
  easy: {speed: 22, interval: 2.5, maxDrops: 4, goal: 22},
  medium: {speed: 34, interval: 2.0, maxDrops: 5, goal: 32},
  hard: {speed: 48, interval: 1.5, maxDrops: 6, goal: 42},
};

export const WordRainGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  wordPool,
  personalBestWpm,
  onTelemetry,
  onFinish,
  onExit,
}) => {
  const cfg = RAIN_CFG[difficulty];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef(new ArcadeMetricsTracker(personalBestWpm));
  const [paused, setPaused] = useState(false);
  const [restartNonce, setRestartNonce] = useState(0);

  const stateRef = useRef({
    paused: false,
    finished: false,
    started: false,
    lives: 5,
    clears: 0,
    score: 0,
    nextId: 1,
    lockedId: null as number | null,
    spawnTimer: 0.4,
    drops: [] as Raindrop[],
    ripples: [] as Ripple[],
    composing: false,
  });

  const spawnDrop = () => {
    const st = stateRef.current;
    const pool = wordPool.length > 0 ? wordPool : ['mist', 'cloud', 'river', 'calm'];
    const golden = st.nextId % 6 === 0;
    const used = new Set(st.drops.map((d) => d.word[0]));
    const filtered = pool.filter((w) => !used.has(w[0]));
    const choices = filtered.length > 0 ? filtered : pool;
    const word = choices[Math.floor(Math.random() * choices.length)];

    st.drops.push({
      id: st.nextId++,
      word,
      typed: 0,
      x: 0.14 + Math.random() * 0.72,
      y: 28,
      speed: cfg.speed * (0.9 + Math.random() * 0.25),
      golden,
    });
  };

  useEffect(() => {
    trackerRef.current = new ArcadeMetricsTracker(personalBestWpm);
    stateRef.current = {
      paused: false,
      finished: false,
      started: false,
      lives: 5,
      clears: 0,
      score: 0,
      nextId: 1,
      lockedId: null,
      spawnTimer: 0.4,
      drops: [],
      ripples: [],
      composing: false,
    };
    setPaused(false);
    spawnDrop();
    spawnDrop();
    onTelemetry(trackerRef.current.getSnapshot(0, null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, wordPool, restartNonce]);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.finished || st.composing) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      trackerRef.current.setCapsLock(e.getModifierState('CapsLock'));

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!st.started) {
          onExit();
          return;
        }
        const nextPaused = !st.paused;
        st.paused = nextPaused;
        trackerRef.current.setPaused(nextPaused);
        setPaused(nextPaused);
        return;
      }

      if (st.paused || e.key.length !== 1) return;
      const key = e.key.toLowerCase();
      st.started = true;

      let target = st.drops.find((d) => d.id === st.lockedId);
      if (!target) {
        const matches = st.drops
          .filter((d) => d.word[0]?.toLowerCase() === key)
          .sort((a, b) => b.y - a.y);
        target = matches[0];
        if (target) st.lockedId = target.id;
      }

      if (!target) {
        trackerRef.current.recordKey(key, false);
        soundEngine.playError();
        return;
      }

      const expected = target.word[target.typed]?.toLowerCase();
      if (key === expected) {
        const {combo, multiplier} = trackerRef.current.recordKey(key, true);
        target.typed++;
        soundEngine.playBubblePop(combo);

        if (target.typed >= target.word.length) {
          trackerRef.current.recordWordCompleted();
          st.clears++;
          st.score += (target.golden ? 220 : 90) * multiplier;
          if (target.golden && st.lives < 5) st.lives++;
          const canvas = canvasRef.current;
          if (canvas) {
            st.ripples.push({
              x: target.x * canvas.clientWidth,
              y: target.y,
              radius: 10,
              life: 1,
              color: target.golden ? '#FBBF24' : '#38BDF8',
            });
          }
          st.lockedId = null;
          st.drops = st.drops.filter((d) => d.id !== target!.id);

          if (st.clears >= cfg.goal && !st.finished) {
            st.finished = true;
            soundEngine.playMilestone();
            onFinish(
              trackerRef.current.finalize(
                `Arcade · Word Rain (${DIFFICULTY_META[difficulty].label})`,
                st.score,
                true,
                `Cleared all ${cfg.goal} raindrops (${st.score} pts)`,
              ),
            );
          }
        }
      } else {
        trackerRef.current.recordKey(expected ?? key, false);
        soundEngine.playError();
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
  }, [cfg.goal, difficulty, onFinish, onExit]);

  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    let lastHud = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const st = stateRef.current;
      const canvas = canvasRef.current;

      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }

        if (!st.paused && !st.finished && st.started) {
          st.spawnTimer -= dt;
          if (st.spawnTimer <= 0 && st.drops.length < cfg.maxDrops) {
            spawnDrop();
            st.spawnTimer = cfg.interval;
          }

          for (let i = st.drops.length - 1; i >= 0; i--) {
            const d = st.drops[i];
            d.y += d.speed * dt;
            if (d.y >= h - 34) {
              st.drops.splice(i, 1);
              if (st.lockedId === d.id) st.lockedId = null;
              st.lives--;
              st.ripples.push({
                x: d.x * w,
                y: h - 26,
                radius: 8,
                life: 1,
                color: '#FB7185',
              });
              soundEngine.playHitChime('miss');
              if (st.lives <= 0 && !st.finished) {
                st.finished = true;
                onFinish(
                  trackerRef.current.finalize(
                    `Arcade · Word Rain (${DIFFICULTY_META[difficulty].label})`,
                    st.score,
                    false,
                    `Out of drops at ${st.clears}/${cfg.goal} words`,
                  ),
                );
              }
            }
          }
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          const bg = ctx.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#09152B');
          bg.addColorStop(1, '#0F2744');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, w, h);

          // Calm pond waterline
          ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
          ctx.fillRect(0, h - 34, w, 34);

          for (let i = st.ripples.length - 1; i >= 0; i--) {
            const rp = st.ripples[i];
            rp.radius += dt * 75;
            rp.life -= dt * 1.9;
            if (rp.life <= 0) {
              st.ripples.splice(i, 1);
            } else {
              ctx.strokeStyle = rp.color;
              ctx.globalAlpha = rp.life;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;

          for (const d of st.drops) {
            const dx = d.x * w;
            const dy = d.y;
            const locked = st.lockedId === d.id;

            // Teardrop badge
            ctx.fillStyle = d.golden
              ? 'rgba(251, 191, 36, 0.22)'
              : locked
                ? 'rgba(34, 211, 238, 0.26)'
                : 'rgba(15, 23, 42, 0.78)';
            ctx.strokeStyle = d.golden
              ? '#FBBF24'
              : locked
                ? '#22D3EE'
                : 'rgba(148, 163, 184, 0.45)';
            ctx.lineWidth = locked || d.golden ? 2 : 1.25;

            ctx.font = '700 15px "JetBrains Mono", monospace';
            const boxW = ctx.measureText(d.word).width + 24;
            ctx.beginPath();
            ctx.roundRect(dx - boxW / 2, dy - 16, boxW, 32, 16);
            ctx.fill();
            ctx.stroke();

            const typedStr = d.word.slice(0, d.typed);
            const restStr = d.word.slice(d.typed);
            const textStart = dx - ctx.measureText(d.word).width / 2;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#34D399';
            ctx.fillText(typedStr, textStart, dy + 5);
            const typedW = ctx.measureText(typedStr).width;
            ctx.fillStyle = d.golden ? '#FDE68A' : '#F8FAFC';
            ctx.fillText(restStr, textStart + typedW, dy + 5);
          }

          ctx.fillStyle = '#E2E8F0';
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `LIVES ${'♦'.repeat(Math.max(0, st.lives))}   DROPS ${st.clears}/${cfg.goal}   SCORE ${st.score}`,
            16,
            24,
          );

          ctx.restore();
        }
      }

      if (now - lastHud >= 33) {
        lastHud = now;
        const locked = stateRef.current.drops.find(
          (d) => d.id === stateRef.current.lockedId,
        );
        const nextChar = locked
          ? locked.word[locked.typed] ?? null
          : stateRef.current.drops[0]?.word[0] ?? null;
        onTelemetry(
          trackerRef.current.getSnapshot(
            stateRef.current.clears / cfg.goal,
            nextChar,
            now,
          ),
        );
      }

      raf = window.requestAnimationFrame(frame);
    };

    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [cfg.goal, cfg.interval, cfg.maxDrops, difficulty, onFinish, onTelemetry]);

  return (
    <div className="tv-surface rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
          Word Rain · {DIFFICULTY_META[difficulty].label} · Catch drifting raindrops before they reach the pond (gold drops restore +1 life)
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
          className="block w-full h-[360px]"
          aria-label="Word Rain canvas"
        />
        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-xs">
            <div className="font-display text-xl font-bold text-white">Rain Paused</div>
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
              Resume Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
