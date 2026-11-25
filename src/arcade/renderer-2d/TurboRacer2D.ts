import type {TurboRacerState} from '@/src/arcade/engine/turboRacerEngine';
import {
  CANONICAL_PLAY_HEIGHT,
  CANONICAL_PLAY_WIDTH,
  computeCanvas2DBackingSize,
  computePlayZoneViewport,
} from '@/src/arcade/playZone';
import type {ResolvedGraphicsMode} from '@/src/types/app';

export interface ExhaustParticle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  isPlayer: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (isPlayer) {
    ctx.shadowColor = '#22D3EE';
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-24, -12, 48, 24, 7);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#090E1C';
  ctx.beginPath();
  ctx.roundRect(2, -8, 13, 16, 3);
  ctx.fill();

  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(22, -9, 4, 4);
  ctx.fillRect(22, 5, 4, 4);

  ctx.fillStyle = isPlayer ? '#22D3EE' : '#CBD5E1';
  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, -18);
  ctx.restore();
}

export function renderTurboRacer2D(params: {
  canvas: HTMLCanvasElement;
  state: TurboRacerState;
  totalWords: number;
  particles: ExhaustParticle2D[];
  dtSec: number;
  reducedMotion: boolean;
  resolvedMode?: ResolvedGraphicsMode;
  isSoftwareRenderer?: boolean;
}): void {
  const {
    canvas,
    state,
    totalWords,
    particles,
    dtSec,
    reducedMotion,
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

  if (
    dtSec > 0 &&
    !state.paused &&
    !state.finished &&
    state.started &&
    !reducedMotion &&
    state.boostTimer > 0 &&
    particles.length < 48
  ) {
    particles.push({
      x: 0,
      y: 0,
      vx: -110 - Math.random() * 90,
      vy: (Math.random() - 0.5) * 28,
      life: 1,
      color: state.boostTimer > 0.25 ? '#22D3EE' : '#FBBF24',
    });
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const vp = computePlayZoneViewport(w, h);
  const pw = CANONICAL_PLAY_WIDTH;
  const ph = CANONICAL_PLAY_HEIGHT;

  ctx.save();
  ctx.setTransform(backing.scaleX, 0, 0, backing.scaleY, 0, 0);

  // Full-bleed dark cyberpunk backdrop + extended horizon road apron (no black bars)
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#070B18');
  grad.addColorStop(1, '#111936');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const roadTopPx = vp.playY + 44 * vp.scale;
  const roadHeightPx = (ph - 64) * vp.scale;
  const laneHPx = roadHeightPx / 4;

  // Road asphalt spans full width edge-to-edge
  ctx.fillStyle = '#0D1326';
  ctx.fillRect(0, roadTopPx, w, roadHeightPx);

  ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
  ctx.fillRect(0, roadTopPx - 2, w, 2);
  ctx.fillRect(0, roadTopPx + roadHeightPx, w, 2);

  // Full-width scrolling lane dashes
  const dashOffsetPx = ((state.playerDist * 8) % 60) * vp.scale;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = Math.max(1.5, 2 * vp.scale);
  ctx.setLineDash([28 * vp.scale, 32 * vp.scale]);
  ctx.lineDashOffset = dashOffsetPx;
  for (let lane = 1; lane < 4; lane++) {
    const ly = roadTopPx + lane * laneHPx;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(w, ly);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Enter canonical 16:9 (640x360) play zone for start/finish gates, cars, particles & HUD
  ctx.translate(vp.playX, vp.playY);
  ctx.scale(vp.scale, vp.scale);

  const roadTop = 44;
  const roadHeight = ph - 64;
  const laneH = roadHeight / 4;
  const marginX = 76;
  const usableW = pw - marginX * 2;

  // Start & finish markers anchored strictly in canonical 16:9 play zone
  ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.fillRect(marginX - 24, roadTop, 4, roadHeight);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.26)';
  ctx.fillRect(pw - marginX + 18, roadTop, 8, roadHeight);

  for (const rival of state.rivals) {
    const rx = marginX + (rival.dist / 1000) * usableW;
    const ry = roadTop + rival.lane * laneH + laneH / 2;
    drawCar(ctx, rx, ry, rival.color, rival.name, false);
  }

  const px = marginX + (state.playerDist / 1000) * usableW;
  const py = roadTop + 2 * laneH + laneH / 2;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (dtSec > 0) {
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.life -= dtSec * 2.4;
    }
    if (p.life <= 0) {
      particles.splice(i, 1);
    } else {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px - 26 + p.x, py + p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  drawCar(ctx, px, py, '#22D3EE', 'YOU', true);

  // Safe-area HUD anchored inside canonical play zone
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `POS ${state.rank}/4   WORD ${Math.min(state.wordIdx + 1, totalWords)}/${totalWords}   SCORE ${state.score}`,
    16,
    26,
  );

  ctx.restore();
}
