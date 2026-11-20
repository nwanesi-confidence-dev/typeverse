import React, {useEffect, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  ArcadeMetricsTracker,
  type ArcadeCommonProps,
  type ArcadeDifficulty,
  DIFFICULTY_META,
} from '@/src/components/arcade/arcadeTypes';

interface Asteroid {
  id: number;
  word: string;
  typed: number;
  x: number; // 0..1 normalized
  y: number; // px
  speed: number;
  isBoss: boolean;
  radius: number;
}

interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

interface StarParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const DEFENDER_CFG: Record<
  ArcadeDifficulty,
  {baseSpeed: number; spawnInterval: number; maxActive: number; targetClears: number}
> = {
  easy: {baseSpeed: 28, spawnInterval: 2.35, maxActive: 4, targetClears: 22},
  medium: {baseSpeed: 40, spawnInterval: 1.85, maxActive: 5, targetClears: 30},
  hard: {baseSpeed: 56, spawnInterval: 1.4, maxActive: 6, targetClears: 40},
};

export const StarDefenderGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  wordPool,
  personalBestWpm,
  reducedMotion,
  onTelemetry,
  onFinish,
  onExit,
}) => {
  const cfg = DEFENDER_CFG[difficulty];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef(new ArcadeMetricsTracker(personalBestWpm));
  const [paused, setPaused] = useState(false);
  const [restartNonce, setRestartNonce] = useState(0);

  const stateRef = useRef({
    paused: false,
    finished: false,
    started: true,
    shields: 3,
    score: 0,
    clears: 0,
    wave: 1,
    spawnTimer: 0.4,
    nextId: 1,
    lockedId: null as number | null,
    asteroids: [] as Asteroid[],
    beams: [] as LaserBeam[],
    particles: [] as StarParticle[],
    composing: false,
    stars: Array.from({length: 48}, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      size: 1 + (i % 2),
    })),
  });

  const spawnAsteroid = (isBoss: boolean) => {
    const st = stateRef.current;
    const pool = wordPool.length > 0 ? wordPool : ['comet', 'orbit', 'nova', 'pulsar'];
    const candidates = isBoss
      ? pool.filter((w) => w.length >= 7)
      : pool.filter((w) => w.length <= (difficulty === 'easy' ? 5 : 8));
    const list = candidates.length > 0 ? candidates : pool;
    const usedFirstLetters = new Set(st.asteroids.map((a) => a.word[0]));
    const distinct = list.filter((w) => !usedFirstLetters.has(w[0]));
    const chosenList = distinct.length > 0 ? distinct : list;
    const word = chosenList[Math.floor(Math.random() * chosenList.length)];

    st.asteroids.push({
      id: st.nextId++,
      word,
      typed: 0,
      x: 0.14 + Math.random() * 0.72,
      y: 26,
      speed:
        (cfg.baseSpeed + (st.wave - 1) * 7) * (isBoss ? 0.68 : 0.9 + Math.random() * 0.25),
      isBoss,
      radius: isBoss ? 30 : 20,
    });
  };

  useEffect(() => {
    trackerRef.current = new ArcadeMetricsTracker(personalBestWpm);
    stateRef.current = {
      paused: false,
      finished: false,
      started: false,
      shields: 3,
      score: 0,
      clears: 0,
      wave: 1,
      spawnTimer: 0.25,
      nextId: 1,
      lockedId: null,
      asteroids: [],
      beams: [],
      particles: [],
      composing: false,
      stars: stateRef.current.stars,
    };
    setPaused(false);
    spawnAsteroid(false);
    spawnAsteroid(false);
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
    const endGame = (victory: boolean) => {
      const st = stateRef.current;
      if (st.finished) return;
      st.finished = true;
      soundEngine.playMilestone();
      onFinish(
        trackerRef.current.finalize(
          `Arcade · Star Defender (${DIFFICULTY_META[difficulty].label})`,
          st.score,
          victory,
          victory
            ? `Sector defended through Wave ${st.wave} (${st.score} pts)`
            : `Shields depleted at ${st.clears}/${cfg.targetClears} asteroids`,
        ),
      );
    };

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

      let target = st.asteroids.find((a) => a.id === st.lockedId);
      if (!target) {
        const matches = st.asteroids
          .filter((a) => a.word[0]?.toLowerCase() === key)
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
        const {multiplier} = trackerRef.current.recordKey(key, true);
        target.typed++;
        soundEngine.playLaser();

        const canvas = canvasRef.current;
        if (canvas) {
          st.beams.push({
            x1: canvas.clientWidth / 2,
            y1: canvas.clientHeight - 36,
            x2: target.x * canvas.clientWidth,
            y2: target.y,
            life: 1,
          });
        }

        if (target.typed >= target.word.length) {
          trackerRef.current.recordWordCompleted();
          st.clears++;
          st.wave = 1 + Math.floor(st.clears / 8);
          st.score += (target.isBoss ? 350 : 100) * multiplier;
          st.lockedId = null;

          if (!reducedMotion && canvas) {
            const cx = target.x * canvas.clientWidth;
            const cy = target.y;
            for (let i = 0; i < 12; i++) {
              if (st.particles.length >= 48) break;
              const ang = (Math.PI * 2 * i) / 12;
              st.particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(ang) * (70 + Math.random() * 80),
                vy: Math.sin(ang) * (70 + Math.random() * 80),
                life: 1,
                color: target.isBoss ? '#FBBF24' : '#22D3EE',
              });
            }
          }

          st.asteroids = st.asteroids.filter((a) => a.id !== target!.id);

          if (st.clears >= cfg.targetClears) {
            endGame(true);
          } else if (st.clears % 8 === 0) {
            spawnAsteroid(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, cfg.targetClears, reducedMotion, onFinish, onExit]);

  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    let lastHud = 0;

    const loop = (now: number) => {
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
          if (st.spawnTimer <= 0 && st.asteroids.length < cfg.maxActive) {
            spawnAsteroid(false);
            st.spawnTimer = Math.max(0.85, cfg.spawnInterval - (st.wave - 1) * 0.14);
          }

          for (let i = st.asteroids.length - 1; i >= 0; i--) {
            const a = st.asteroids[i];
            a.y += a.speed * dt;
            if (a.y >= h - 42) {
              st.asteroids.splice(i, 1);
              if (st.lockedId === a.id) st.lockedId = null;
              st.shields--;
              soundEngine.playHitChime('miss');
              if (st.shields <= 0 && !st.finished) {
                st.finished = true;
                onFinish(
                  trackerRef.current.finalize(
                    `Arcade · Star Defender (${DIFFICULTY_META[difficulty].label})`,
                    st.score,
                    false,
                    `Shields depleted at ${st.clears}/${cfg.targetClears} asteroids`,
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

          // Deep-space gradient
          const bg = ctx.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#040714');
          bg.addColorStop(1, '#0F172A');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, w, h);

          // Stars
          ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
          for (const star of st.stars) {
            ctx.fillRect(star.x * w, star.y * h, star.size, star.size);
          }

          // Shield horizon line
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, h - 38);
          ctx.lineTo(w, h - 38);
          ctx.stroke();

          // Beams
          for (let i = st.beams.length - 1; i >= 0; i--) {
            const b = st.beams[i];
            b.life -= dt * 7;
            if (b.life <= 0) {
              st.beams.splice(i, 1);
            } else {
              ctx.strokeStyle = `rgba(34, 211, 238, ${b.life})`;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(b.x1, b.y1);
              ctx.lineTo(b.x2, b.y2);
              ctx.stroke();
            }
          }

          // Particles
          for (let i = st.particles.length - 1; i >= 0; i--) {
            const p = st.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 2.5;
            if (p.life <= 0) {
              st.particles.splice(i, 1);
            } else {
              ctx.globalAlpha = p.life;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;

          // Asteroids & Word Labels
          for (const a of st.asteroids) {
            const ax = a.x * w;
            const ay = a.y;
            const locked = st.lockedId === a.id;

            ctx.save();
            ctx.translate(ax, ay);
            ctx.fillStyle = a.isBoss ? '#451A03' : '#1E293B';
            ctx.strokeStyle = locked ? '#22D3EE' : a.isBoss ? '#FBBF24' : '#64748B';
            ctx.lineWidth = locked ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, a.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Word pill right underneath rock
            const typedStr = a.word.slice(0, a.typed);
            const restStr = a.word.slice(a.typed);
            ctx.font = '700 14px "JetBrains Mono", monospace';
            const totalW = ctx.measureText(a.word).width + 18;
            ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
            ctx.beginPath();
            ctx.roundRect(-totalW / 2, a.radius + 4, totalW, 24, 6);
            ctx.fill();

            ctx.textAlign = 'left';
            const startX = -ctx.measureText(a.word).width / 2;
            ctx.fillStyle = '#34D399';
            ctx.fillText(typedStr, startX, a.radius + 20);
            const typedW = ctx.measureText(typedStr).width;
            ctx.fillStyle = locked ? '#22D3EE' : a.isBoss ? '#FDE68A' : '#F8FAFC';
            ctx.fillText(restStr, startX + typedW, a.radius + 20);
            ctx.restore();
          }

          // Defender Ship
          ctx.fillStyle = '#22D3EE';
          ctx.beginPath();
          ctx.moveTo(w / 2, h - 48);
          ctx.lineTo(w / 2 - 16, h - 18);
          ctx.lineTo(w / 2 + 16, h - 18);
          ctx.closePath();
          ctx.fill();

          // HUD header inside canvas
          ctx.fillStyle = '#E2E8F0';
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `SHIELDS ${'♥'.repeat(Math.max(0, st.shields))}   WAVE ${st.wave}   CLEARED ${st.clears}/${cfg.targetClears}   SCORE ${st.score}`,
            16,
            24,
          );

          ctx.restore();
        }
      }

      if (now - lastHud >= 33) {
        lastHud = now;
        const locked = stateRef.current.asteroids.find(
          (a) => a.id === stateRef.current.lockedId,
        );
        const nextChar = locked
          ? locked.word[locked.typed] ?? null
          : stateRef.current.asteroids[0]?.word[0] ?? null;
        onTelemetry(
          trackerRef.current.getSnapshot(
            stateRef.current.clears / cfg.targetClears,
            nextChar,
            now,
          ),
        );
      }

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [cfg.maxActive, cfg.spawnInterval, cfg.targetClears, difficulty, onFinish, onTelemetry]);

  return (
    <div className="tv-surface rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
          Star Defender · {DIFFICULTY_META[difficulty].label} · Type the first letter to lock target and blast descending asteroids
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
          aria-label="Star Defender space canvas"
        />
        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-xs">
            <div className="font-display text-xl font-bold text-white">Defense Paused</div>
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
              Resume Defense
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
