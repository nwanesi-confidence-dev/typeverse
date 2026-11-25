import type {BubblePopState} from '@/src/arcade/engine/bubblePopEngine';
import {
  CANONICAL_PLAY_WIDTH,
  computeCanvas2DBackingSize,
  computePlayZoneViewport,
} from '@/src/arcade/playZone';
import type {ResolvedGraphicsMode} from '@/src/types/app';

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
  resolvedMode?: ResolvedGraphicsMode;
  isSoftwareRenderer?: boolean;
}): void {
  const {
    canvas,
    state,
    goal,
    multiLetter,
    bursts,
    dtSec,
    resolvedMode = '2d',
    isSoftwareRenderer = false,
  } = params;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return;

  const backing = computeCanvas2DBackingSize({
    cssWidth: w,
    cssHeight: h,
    devicePixelRatio: window.devicePixelRatio || 1,
    resolvedMode,
    isSoftwareRenderer,
  });

  if (canvas.width !== backing.width || canvas.height !== backing.height) {
    canvas.width = backing.width;
    canvas.height = backing.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const vp = computePlayZoneViewport(w, h);
  const pw = CANONICAL_PLAY_WIDTH;

  ctx.save();
  ctx.setTransform(backing.scaleX, 0, 0, backing.scaleY, 0, 0);

  // Full-bleed ocean depth gradient (no black bars)
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0B132B');
  bg.addColorStop(1, '#162447');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle ambient water caustic rays on wide aspect ratios
  if (vp.isExtendedWide) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
    for (let i = 0; i < 4; i++) {
      const rx = (w / 5) * (i + 0.6);
      ctx.beginPath();
      ctx.moveTo(rx - 22, 0);
      ctx.lineTo(rx + 28, 0);
      ctx.lineTo(rx + 90, h);
      ctx.lineTo(rx - 10, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(vp.playX, vp.playY + 12);
    ctx.lineTo(vp.playX, vp.playY + vp.playH - 12);
    ctx.moveTo(vp.playX + vp.playW, vp.playY + 12);
    ctx.lineTo(vp.playX + vp.playW, vp.playY + vp.playH - 12);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Enter canonical 16:9 (640x360) play zone
  ctx.translate(vp.playX, vp.playY);
  ctx.scale(vp.scale, vp.scale);

  ctx.strokeStyle = 'rgba(251, 113, 133, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, 38);
  ctx.lineTo(pw, 38);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = bursts.length - 1; i >= 0; i--) {
    const bt = bursts[i];
    if (dtSec > 0) {
      bt.r += dtSec * 70;
      bt.life -= dtSec * 3;
    }
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
    const bx = b.x * pw;
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
