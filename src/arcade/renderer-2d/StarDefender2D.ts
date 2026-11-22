import type {StarDefenderState} from '@/src/arcade/engine/starDefenderEngine';

export interface LaserBeam2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

export interface StarParticle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export const STATIC_STARS_2D = Array.from({length: 48}, (_, i) => ({
  x: ((i * 73) % 100) / 100,
  y: ((i * 41) % 100) / 100,
  size: 1 + (i % 2),
}));

export function renderStarDefender2D(params: {
  canvas: HTMLCanvasElement;
  state: StarDefenderState;
  targetClears: number;
  beams: LaserBeam2D[];
  particles: StarParticle2D[];
  dtSec: number;
}): void {
  const {canvas, state, targetClears, beams, particles, dtSec} = params;
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
  bg.addColorStop(0, '#040714');
  bg.addColorStop(1, '#0F172A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
  for (const star of STATIC_STARS_2D) {
    ctx.fillRect(star.x * w, star.y * h, star.size, star.size);
  }

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h - 38);
  ctx.lineTo(w, h - 38);
  ctx.stroke();

  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.life -= dtSec * 7;
    if (b.life <= 0) {
      beams.splice(i, 1);
    } else {
      ctx.strokeStyle = `rgba(34, 211, 238, ${b.life})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.life -= dtSec * 2.5;
    if (p.life <= 0) {
      particles.splice(i, 1);
    } else {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (const a of state.asteroids) {
    const ax = a.x * w;
    const ay = a.y;
    const locked = state.lockedId === a.id;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.fillStyle = a.isBoss ? '#451A03' : '#1E293B';
    ctx.strokeStyle = locked ? '#22D3EE' : a.isBoss ? '#FBBF24' : '#64748B';
    ctx.lineWidth = locked ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, a.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

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

  ctx.fillStyle = '#22D3EE';
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 48);
  ctx.lineTo(w / 2 - 16, h - 18);
  ctx.lineTo(w / 2 + 16, h - 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `SHIELDS ${'♥'.repeat(Math.max(0, state.shields))}   WAVE ${state.wave}   CLEARED ${state.clears}/${targetClears}   SCORE ${state.score}`,
    16,
    24,
  );

  ctx.restore();
}
