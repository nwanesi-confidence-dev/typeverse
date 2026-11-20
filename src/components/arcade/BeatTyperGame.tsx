import React, {useEffect, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  ArcadeMetricsTracker,
  type ArcadeCommonProps,
  type ArcadeDifficulty,
  DIFFICULTY_META,
} from '@/src/components/arcade/arcadeTypes';

interface BeatNote {
  id: number;
  lane: 0 | 1 | 2 | 3;
  keyChar: string;
  y: number;
  resolved: boolean;
}

interface JudgementToast {
  text: string;
  color: string;
  x: number;
  y: number;
  life: number;
}

const LANE_CHARS: [string[], string[], string[], string[]] = [
  ['a', 's', 'd', 'q', 'w', 'z'],
  ['f', 'g', 'r', 't', 'v', 'c'],
  ['h', 'j', 'y', 'u', 'n', 'b'],
  ['k', 'l', 'i', 'o', 'p', 'm'],
];

const LANE_COLORS = ['#F472B6', '#34D399', '#22D3EE', '#A78BFA'];

const BEAT_CFG: Record<
  ArcadeDifficulty,
  {bpm: number; noteSpeed: number; totalNotes: number}
> = {
  easy: {bpm: 84, noteSpeed: 135, totalNotes: 32},
  medium: {bpm: 106, noteSpeed: 175, totalNotes: 44},
  hard: {bpm: 128, noteSpeed: 220, totalNotes: 60},
};

export const BeatTyperGame: React.FC<ArcadeCommonProps> = ({
  difficulty,
  personalBestWpm,
  onTelemetry,
  onFinish,
  onExit,
}) => {
  const cfg = BEAT_CFG[difficulty];
  const beatSec = 60 / cfg.bpm;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef(new ArcadeMetricsTracker(personalBestWpm));
  const [paused, setPaused] = useState(false);
  const [restartNonce, setRestartNonce] = useState(0);

  const stateRef = useRef({
    paused: false,
    finished: false,
    started: false,
    score: 0,
    perfects: 0,
    goods: 0,
    misses: 0,
    spawned: 0,
    resolvedCount: 0,
    beatTimer: 0.25,
    beatCount: 0,
    nextId: 1,
    notes: [] as BeatNote[],
    laneFlash: [0, 0, 0, 0],
    toasts: [] as JudgementToast[],
    composing: false,
  });

  const spawnNote = () => {
    const st = stateRef.current;
    if (st.spawned >= cfg.totalNotes) return;
    const lane = ((st.spawned * 3 + Math.floor(Math.random() * 2)) % 4) as 0 | 1 | 2 | 3;
    const pool = LANE_CHARS[lane];
    const keyChar = pool[Math.floor(Math.random() * pool.length)];
    st.notes.push({
      id: st.nextId++,
      lane,
      keyChar,
      y: -16,
      resolved: false,
    });
    st.spawned++;
  };

  useEffect(() => {
    trackerRef.current = new ArcadeMetricsTracker(personalBestWpm);
    stateRef.current = {
      paused: false,
      finished: false,
      started: false,
      score: 0,
      perfects: 0,
      goods: 0,
      misses: 0,
      spawned: 0,
      resolvedCount: 0,
      beatTimer: 0.2,
      beatCount: 0,
      nextId: 1,
      notes: [],
      laneFlash: [0, 0, 0, 0],
      toasts: [],
      composing: false,
    };
    setPaused(false);
    spawnNote();
    onTelemetry(trackerRef.current.getSnapshot(0, stateRef.current.notes[0]?.keyChar ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, restartNonce]);

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

      const canvas = canvasRef.current;
      const h = canvas?.clientHeight ?? 360;
      const w = canvas?.clientWidth ?? 720;
      const strikeY = h - 58;

      // Find closest unresolved note with matching character within hit window
      const candidates = st.notes
        .filter((n) => !n.resolved && n.keyChar === key && n.y >= 20)
        .sort((a, b) => Math.abs(a.y - strikeY) - Math.abs(b.y - strikeY));

      const note = candidates[0];
      if (!note) {
        trackerRef.current.recordKey(key, false);
        soundEngine.playHitChime('miss');
        return;
      }

      const dist = Math.abs(note.y - strikeY);
      if (dist > 95) {
        trackerRef.current.recordKey(key, false);
        soundEngine.playHitChime('miss');
        return;
      }

      note.resolved = true;
      st.resolvedCount++;
      const {multiplier} = trackerRef.current.recordKey(key, true);
      trackerRef.current.recordWordCompleted();
      st.laneFlash[note.lane] = 1;

      const laneW = w / 4;
      const nx = note.lane * laneW + laneW / 2;

      if (dist <= 32) {
        st.perfects++;
        st.score += 150 * multiplier;
        soundEngine.playHitChime('perfect');
        st.toasts.push({
          text: 'PERFECT!',
          color: '#22D3EE',
          x: nx,
          y: strikeY - 18,
          life: 1,
        });
      } else {
        st.goods++;
        st.score += 90 * multiplier;
        soundEngine.playHitChime('good');
        st.toasts.push({
          text: 'GOOD',
          color: '#34D399',
          x: nx,
          y: strikeY - 18,
          life: 1,
        });
      }

      if (st.resolvedCount >= cfg.totalNotes && !st.finished) {
        st.finished = true;
        soundEngine.playMilestone();
        onFinish(
          trackerRef.current.finalize(
            `Arcade · Beat Typer (${DIFFICULTY_META[difficulty].label})`,
            st.score,
            st.misses <= Math.floor(cfg.totalNotes * 0.25),
            `${st.perfects} Perfect · ${st.goods} Good · ${st.misses} Miss`,
          ),
        );
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
  }, [cfg.totalNotes, difficulty, onFinish, onExit]);

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

        const strikeY = h - 58;
        const laneW = w / 4;

        if (!st.paused && !st.finished && st.started) {
          st.beatTimer -= dt;
          if (st.beatTimer <= 0) {
            st.beatTimer += beatSec;
            st.beatCount++;
            soundEngine.playBeatTick(st.beatCount % 4 === 0);
            if (st.spawned < cfg.totalNotes) {
              spawnNote();
            }
          }

          for (let i = st.notes.length - 1; i >= 0; i--) {
            const n = st.notes[i];
            if (n.resolved) {
              st.notes.splice(i, 1);
              continue;
            }
            n.y += cfg.noteSpeed * dt;
            if (n.y > h - 14) {
              n.resolved = true;
              st.notes.splice(i, 1);
              st.resolvedCount++;
              st.misses++;
              trackerRef.current.recordKey(n.keyChar, false);
              st.toasts.push({
                text: 'MISS',
                color: '#FB7185',
                x: n.lane * laneW + laneW / 2,
                y: strikeY - 12,
                life: 1,
              });

              if (st.resolvedCount >= cfg.totalNotes && !st.finished) {
                st.finished = true;
                soundEngine.playMilestone();
                onFinish(
                  trackerRef.current.finalize(
                    `Arcade · Beat Typer (${DIFFICULTY_META[difficulty].label})`,
                    st.score,
                    st.misses <= Math.floor(cfg.totalNotes * 0.25),
                    `${st.perfects} Perfect · ${st.goods} Good · ${st.misses} Miss`,
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

          ctx.fillStyle = '#090D1C';
          ctx.fillRect(0, 0, w, h);

          // Lanes + Beat Flash
          for (let l = 0; l < 4; l++) {
            const lx = l * laneW;
            if (st.laneFlash[l] > 0) {
              st.laneFlash[l] = Math.max(0, st.laneFlash[l] - dt * 4);
              ctx.fillStyle = `rgba(34, 211, 238, ${st.laneFlash[l] * 0.22})`;
              ctx.fillRect(lx, 0, laneW, h);
            }
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(lx, 36);
            ctx.lineTo(lx, h);
            ctx.stroke();

            // Strike receptor ring
            ctx.strokeStyle = LANE_COLORS[l];
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(lx + laneW / 2 - 26, strikeY - 20, 52, 40, 12);
            ctx.stroke();
          }

          // Strike line
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, strikeY);
          ctx.lineTo(w, strikeY);
          ctx.stroke();

          // Notes
          for (const n of st.notes) {
            const nx = n.lane * laneW + laneW / 2;
            const color = LANE_COLORS[n.lane];
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(nx - 24, n.y - 18, 48, 36, 10);
            ctx.fill();

            ctx.fillStyle = '#070B14';
            ctx.font = '800 18px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(n.keyChar.toUpperCase(), nx, n.y + 6);
          }

          // Judgements
          for (let i = st.toasts.length - 1; i >= 0; i--) {
            const t = st.toasts[i];
            t.y -= dt * 36;
            t.life -= dt * 2.2;
            if (t.life <= 0) {
              st.toasts.splice(i, 1);
            } else {
              ctx.globalAlpha = t.life;
              ctx.fillStyle = t.color;
              ctx.font = '800 13px "Outfit", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(t.text, t.x, t.y);
            }
          }
          ctx.globalAlpha = 1;

          ctx.fillStyle = '#E2E8F0';
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `${cfg.bpm} BPM   NOTES ${st.resolvedCount}/${cfg.totalNotes}   PERFECT ${st.perfects}   SCORE ${st.score}`,
            16,
            24,
          );

          ctx.restore();
        }
      }

      if (now - lastHud >= 33) {
        lastHud = now;
        const nextNote = stateRef.current.notes
          .filter((n) => !n.resolved)
          .sort((a, b) => b.y - a.y)[0];
        onTelemetry(
          trackerRef.current.getSnapshot(
            stateRef.current.resolvedCount / cfg.totalNotes,
            nextNote?.keyChar ?? null,
            now,
          ),
        );
      }

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatSec, cfg.bpm, cfg.noteSpeed, cfg.totalNotes, difficulty, onFinish, onTelemetry]);

  return (
    <div className="tv-surface rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
          Beat Typer · {DIFFICULTY_META[difficulty].label} ({cfg.bpm} BPM) · Strike the falling key as it hits the glowing bar
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
          aria-label="Beat Typer rhythm canvas"
        />
        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-xs">
            <div className="font-display text-xl font-bold text-white">Rhythm Paused</div>
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
              Resume Beat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
