import React, {useEffect, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  ArcadeMetricsTracker,
  type ArcadeCommonProps,
  type ArcadeDifficulty,
  DIFFICULTY_META,
} from '@/src/components/arcade/arcadeTypes';

interface Bubble {
  id: number;
  text: string;
  typed: number;
  x: number; // 0..1
  baseX: number;
  y: number; // px from top
  speed: number;
  radius: number;
  color: string;
  phase: number;
}

interface PopBurst {
  x: number;
  y: number;
  r: number;
  life: number;
  color: string;
}

const BUBBLE_COLORS = ['#22D3EE', '#34D399', '#F472B6', '#FBBF24', '#A78BFA', '#60A5FA'];

const FOCUS_ROWS: Array<{id: string; label: string; chars: string}> = [
  {id: 'all', label: 'All Letters', chars: 'abcdefghijklmnopqrstuvwxyz'},
  {id: 'home', label: 'Home Row', chars: 'asdfghjkl'},
  {id: 'top', label: 'Top Row', chars: 'qwertyuiop'},
  {id: 'bottom', label: 'Bottom Row', chars: 'zxcvbnm'},
];

const BUBBLE_CFG: Record<
  ArcadeDifficulty,
  {speed: number; interval: number; maxBubbles: number; goal: number; multiLetter: boolean}
> = {
  easy: {speed: 32, interval: 1.15, maxBubbles: 6, goal: 28, multiLetter: false},
  medium: {speed: 38, interval: 1.5, maxBubbles: 5, goal: 34, multiLetter: true},
  hard: {speed: 52, interval: 1.2, maxBubbles: 6, goal: 44, multiLetter: true},
};

export const BubblePopGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  wordPool,
  personalBestWpm,
  onTelemetry,
  onFinish,
  onExit,
}) => {
  const cfg = BUBBLE_CFG[difficulty];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef(new ArcadeMetricsTracker(personalBestWpm));
  const [paused, setPaused] = useState(false);
  const [focusRowId, setFocusRowId] = useState('all');
  const [restartNonce, setRestartNonce] = useState(0);

  const stateRef = useRef({
    paused: false,
    finished: false,
    started: false,
    lives: 5,
    popped: 0,
    score: 0,
    nextId: 1,
    lockedId: null as number | null,
    spawnTimer: 0.25,
    bubbles: [] as Bubble[],
    bursts: [] as PopBurst[],
    composing: false,
    clock: 0,
  });

  const getFocusRow = () =>
    FOCUS_ROWS.find((r) => r.id === focusRowId) ?? FOCUS_ROWS[0];

  const spawnBubble = (canvasHeight = 360) => {
    const st = stateRef.current;
    const row = getFocusRow();
    let token = 'a';

    if (!cfg.multiLetter) {
      const used = new Set(st.bubbles.map((b) => b.text));
      const avail = row.chars.split('').filter((c) => !used.has(c));
      const list = avail.length > 0 ? avail : row.chars.split('');
      token = list[Math.floor(Math.random() * list.length)];
    } else {
      const allowedSet = new Set(row.chars.split(''));
      const matching = wordPool.filter(
        (w) =>
          w.length >= 2 &&
          w.length <= (difficulty === 'medium' ? 4 : 6) &&
          w.split('').every((ch) => allowedSet.has(ch)),
      );
      if (matching.length > 0) {
        token = matching[Math.floor(Math.random() * matching.length)];
      } else {
        const len = difficulty === 'medium' ? 3 : 4;
        token = Array.from(
          {length: len},
          () => row.chars[Math.floor(Math.random() * row.chars.length)],
        ).join('');
      }
    }

    const bx = 0.14 + Math.random() * 0.72;
    st.bubbles.push({
      id: st.nextId++,
      text: token,
      typed: 0,
      x: bx,
      baseX: bx,
      y: canvasHeight - 24,
      speed: cfg.speed * (0.85 + Math.random() * 0.3),
      radius: cfg.multiLetter ? 30 : 24,
      color: BUBBLE_COLORS[st.nextId % BUBBLE_COLORS.length],
      phase: Math.random() * Math.PI * 2,
    });
  };

  useEffect(() => {
    trackerRef.current = new ArcadeMetricsTracker(personalBestWpm);
    stateRef.current = {
      paused: false,
      finished: false,
      started: false,
      lives: 5,
      popped: 0,
      score: 0,
      nextId: 1,
      lockedId: null,
      spawnTimer: 0.2,
      bubbles: [],
      bursts: [],
      composing: false,
      clock: 0,
    };
    setPaused(false);
    spawnBubble(360);
    spawnBubble(360);
    onTelemetry(trackerRef.current.getSnapshot(0, null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, wordPool, focusRowId, restartNonce]);

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

      let target = st.bubbles.find((b) => b.id === st.lockedId);
      if (!target) {
        // Prefer highest bubble near top danger line
        const matches = st.bubbles
          .filter((b) => b.text[0]?.toLowerCase() === key)
          .sort((a, b) => a.y - b.y);
        target = matches[0];
        if (target) st.lockedId = target.id;
      }

      if (!target) {
        trackerRef.current.recordKey(key, false);
        soundEngine.playError();
        return;
      }

      const expected = target.text[target.typed]?.toLowerCase();
      if (key === expected) {
        const {combo, multiplier} = trackerRef.current.recordKey(key, true);
        target.typed++;

        if (target.typed >= target.text.length) {
          trackerRef.current.recordWordCompleted();
          st.popped++;
          st.score += (cfg.multiLetter ? 110 : 60) * multiplier;
          soundEngine.playBubblePop(combo);

          const canvas = canvasRef.current;
          if (canvas) {
            st.bursts.push({
              x: target.x * canvas.clientWidth,
              y: target.y,
              r: target.radius,
              life: 1,
              color: target.color,
            });
          }

          st.lockedId = null;
          st.bubbles = st.bubbles.filter((b) => b.id !== target!.id);

          if (st.popped >= cfg.goal && !st.finished) {
            st.finished = true;
            soundEngine.playMilestone();
            onFinish(
              trackerRef.current.finalize(
                `Arcade · Bubble Pop (${DIFFICULTY_META[difficulty].label})`,
                st.score,
                true,
                `Popped all ${cfg.goal} bubbles (${st.score} pts)`,
              ),
            );
          }
        } else {
          soundEngine.playKeyClick(Math.min(8, Math.floor(combo / 8)));
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
  }, [cfg.goal, cfg.multiLetter, difficulty, onFinish, onExit]);

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
          st.clock += dt;
          st.spawnTimer -= dt;
          if (st.spawnTimer <= 0 && st.bubbles.length < cfg.maxBubbles) {
            spawnBubble(h);
            st.spawnTimer = cfg.interval;
          }

          for (let i = st.bubbles.length - 1; i >= 0; i--) {
            const b = st.bubbles[i];
            b.y -= b.speed * dt;
            b.x = b.baseX + Math.sin(st.clock * 2 + b.phase) * 0.025;
            if (b.y <= 34) {
              st.bubbles.splice(i, 1);
              if (st.lockedId === b.id) st.lockedId = null;
              st.lives--;
              soundEngine.playHitChime('miss');
              if (st.lives <= 0 && !st.finished) {
                st.finished = true;
                onFinish(
                  trackerRef.current.finalize(
                    `Arcade · Bubble Pop (${DIFFICULTY_META[difficulty].label})`,
                    st.score,
                    false,
                    `Bubbles escaped at ${st.popped}/${cfg.goal}`,
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
          bg.addColorStop(0, '#0B132B');
          bg.addColorStop(1, '#162447');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, w, h);

          // Top spike / escape threshold
          ctx.strokeStyle = 'rgba(251, 113, 133, 0.45)';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(0, 38);
          ctx.lineTo(w, 38);
          ctx.stroke();
          ctx.setLineDash([]);

          for (let i = st.bursts.length - 1; i >= 0; i--) {
            const bt = st.bursts[i];
            bt.r += dt * 70;
            bt.life -= dt * 3;
            if (bt.life <= 0) {
              st.bursts.splice(i, 1);
            } else {
              ctx.strokeStyle = bt.color;
              ctx.globalAlpha = bt.life;
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(bt.x, bt.y, bt.r, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;

          for (const b of st.bubbles) {
            const bx = b.x * w;
            const by = b.y;
            const locked = st.lockedId === b.id;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.strokeStyle = locked ? '#FFFFFF' : b.color;
            ctx.lineWidth = locked ? 3 : 2;
            ctx.beginPath();
            ctx.arc(bx, by, b.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Specular highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.beginPath();
            ctx.arc(bx - b.radius * 0.35, by - b.radius * 0.35, b.radius * 0.18, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = cfg.multiLetter
              ? '700 14px "JetBrains Mono", monospace'
              : '700 20px "JetBrains Mono", monospace';
            const typedStr = b.text.slice(0, b.typed);
            const restStr = b.text.slice(b.typed);
            const fullW = ctx.measureText(b.text).width;
            const sx = bx - fullW / 2;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#34D399';
            ctx.fillText(typedStr, sx, by + 6);
            const tw = ctx.measureText(typedStr).width;
            ctx.fillStyle = '#F8FAFC';
            ctx.fillText(restStr, sx + tw, by + 6);
          }

          ctx.fillStyle = '#E2E8F0';
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `LIVES ${'●'.repeat(Math.max(0, st.lives))}   POPPED ${st.popped}/${cfg.goal}   SCORE ${st.score}`,
            16,
            24,
          );

          ctx.restore();
        }
      }

      if (now - lastHud >= 33) {
        lastHud = now;
        const locked = stateRef.current.bubbles.find(
          (b) => b.id === stateRef.current.lockedId,
        );
        const nextChar = locked
          ? locked.text[locked.typed] ?? null
          : stateRef.current.bubbles[0]?.text[0] ?? null;
        onTelemetry(
          trackerRef.current.getSnapshot(
            stateRef.current.popped / cfg.goal,
            nextChar,
            now,
          ),
        );
      }

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.goal, cfg.interval, cfg.maxBubbles, cfg.multiLetter, difficulty, focusRowId, onFinish, onTelemetry]);

  return (
    <div className="tv-surface rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
            Focus row:
          </span>
          {FOCUS_ROWS.map((row) => (
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
          aria-label="Bubble Pop canvas"
        />
        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-xs">
            <div className="font-display text-xl font-bold text-white">Game Paused</div>
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
