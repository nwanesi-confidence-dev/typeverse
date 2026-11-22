import {
  BEAT_LANE_COLORS,
  type BeatTyperState,
} from '@/src/arcade/engine/beatTyperEngine';

export interface JudgementToast2D {
  text: string;
  color: string;
  x: number;
  y: number;
  life: number;
}

export function renderBeatTyper2D(params: {
  canvas: HTMLCanvasElement;
  state: BeatTyperState;
  bpm: number;
  totalNotes: number;
  toasts: JudgementToast2D[];
  dtSec: number;
}): void {
  const {canvas, state, bpm, totalNotes, toasts, dtSec} = params;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const laneW = w / 4;
  const strikeY = h - 58;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#090D1C';
  ctx.fillRect(0, 0, w, h);

  for (let l = 0; l < 4; l++) {
    const lx = l * laneW;
    if (state.laneFlash[l] > 0) {
      ctx.fillStyle = `rgba(34, 211, 238, ${state.laneFlash[l] * 0.22})`;
      ctx.fillRect(lx, 0, laneW, h);
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, 36);
    ctx.lineTo(lx, h);
    ctx.stroke();

    ctx.strokeStyle = BEAT_LANE_COLORS[l];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(lx + laneW / 2 - 26, strikeY - 20, 52, 40, 12);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, strikeY);
  ctx.lineTo(w, strikeY);
  ctx.stroke();

  for (const n of state.notes) {
    const nx = n.lane * laneW + laneW / 2;
    const color = BEAT_LANE_COLORS[n.lane];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(nx - 24, n.y - 18, 48, 36, 10);
    ctx.fill();

    ctx.fillStyle = '#070B14';
    ctx.font = '800 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(n.keyChar.toUpperCase(), nx, n.y + 6);
  }

  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = toasts[i];
    t.y -= dtSec * 36;
    t.life -= dtSec * 2.2;
    if (t.life <= 0) {
      toasts.splice(i, 1);
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
    `${bpm} BPM   NOTES ${state.resolvedCount}/${totalNotes}   PERFECT ${state.perfects}   SCORE ${state.score}`,
    16,
    24,
  );

  ctx.restore();
}
