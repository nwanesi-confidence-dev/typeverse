import type {WordRainState} from '@/src/arcade/engine/wordRainEngine';

export interface Ripple2D {
  x: number;
  y: number;
  radius: number;
  life: number;
  color: string;
}

export function renderWordRain2D(params: {
  canvas: HTMLCanvasElement;
  state: WordRainState;
  goal: number;
  ripples: Ripple2D[];
  dtSec: number;
}): void {
  const {canvas, state, goal, ripples, dtSec} = params;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#09152B');
  bg.addColorStop(1, '#0F2744');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.fillRect(0, h - 34, w, 34);

  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.radius += dtSec * 75;
    rp.life -= dtSec * 1.9;
    if (rp.life <= 0) {
      ripples.splice(i, 1);
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

  for (const d of state.drops) {
    const dx = d.x * w;
    const dy = d.y;
    const locked = state.lockedId === d.id;

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
    `LIVES ${'♦'.repeat(Math.max(0, state.lives))}   DROPS ${state.clears}/${goal}   SCORE ${state.score}`,
    16,
    24,
  );

  ctx.restore();
}
