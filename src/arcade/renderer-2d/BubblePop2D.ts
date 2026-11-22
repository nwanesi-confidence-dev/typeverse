import type {BubblePopState} from '@/src/arcade/engine/bubblePopEngine';

export interface PopBurst2D {
  x: number;
  y: number;
  r: number;
  life: number;
  color: string;
}

export function renderBubblePop2D(params: {
  canvas: HTMLCanvasElement;
  state: BubblePopState;
  goal: number;
  multiLetter: boolean;
  bursts: PopBurst2D[];
  dtSec: number;
}): void {
  const {canvas, state, goal, multiLetter, bursts, dtSec} = params;
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
  bg.addColorStop(0, '#0B132B');
  bg.addColorStop(1, '#162447');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(251, 113, 133, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, 38);
  ctx.lineTo(w, 38);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = bursts.length - 1; i >= 0; i--) {
    const bt = bursts[i];
    bt.r += dtSec * 70;
    bt.life -= dtSec * 3;
    if (bt.life <= 0) {
      bursts.splice(i, 1);
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

  for (const b of state.bubbles) {
    const bx = b.x * w;
    const by = b.y;
    const locked = state.lockedId === b.id;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = locked ? '#FFFFFF' : b.color;
    ctx.lineWidth = locked ? 3 : 2;
    ctx.beginPath();
    ctx.arc(bx, by, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(bx - b.radius * 0.35, by - b.radius * 0.35, b.radius * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = multiLetter
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
    `LIVES ${'●'.repeat(Math.max(0, state.lives))}   POPPED ${state.popped}/${goal}   SCORE ${state.score}`,
    16,
    24,
  );

  ctx.restore();
}
