import {
  BEAT_LANE_COLORS,
  type BeatTyperState,
} from '@/src/arcade/engine/beatTyperEngine';
import {
  CANONICAL_PLAY_HEIGHT,
  CANONICAL_PLAY_WIDTH,
  computeCanvas2DBackingSize,
  computePlayZoneViewport,
} from '@/src/arcade/playZone';
import type {ResolvedGraphicsMode} from '@/src/types/app';

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
  resolvedMode?: ResolvedGraphicsMode;
  isSoftwareRenderer?: boolean;
}): void {
  const {
    canvas,
    state,
    bpm,
    totalNotes,
    toasts,
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
  const ph = CANONICAL_PLAY_HEIGHT;
  const laneW = pw / 4;
  const strikeY = ph - 58;

  ctx.save();
  ctx.setTransform(backing.scaleX, 0, 0, backing.scaleY, 0, 0);

  // Full-bleed stage backdrop + extended strike horizon line
  const stageBg = ctx.createLinearGradient(0, 0, 0, h);
  stageBg.addColorStop(0, '#070A18');
  stageBg.addColorStop(1, '#0D132B');
  ctx.fillStyle = stageBg;
  ctx.fillRect(0, 0, w, h);

  const strikeScreenY = vp.playY + strikeY * vp.scale;
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
  ctx.lineWidth = Math.max(1, 1.5 * vp.scale);
  ctx.beginPath();
  ctx.moveTo(0, strikeScreenY);
  ctx.lineTo(w, strikeScreenY);
  ctx.stroke();

  if (vp.isExtendedWide) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vp.playX, 0);
    ctx.lineTo(vp.playX, h);
    ctx.moveTo(vp.playX + vp.playW, 0);
    ctx.lineTo(vp.playX + vp.playW, h);
    ctx.stroke();
  }

  // Enter canonical 16:9 (640x360) play zone
  ctx.translate(vp.playX, vp.playY);
  ctx.scale(vp.scale, vp.scale);

  for (let l = 0; l < 4; l++) {
    const lx = l * laneW;
    if (state.laneFlash[l] > 0) {
      ctx.fillStyle = `rgba(34, 211, 238, ${state.laneFlash[l] * 0.22})`;
      ctx.fillRect(lx, 0, laneW, ph);
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, 36);
    ctx.lineTo(lx, ph);
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
  ctx.lineTo(pw, strikeY);
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
    if (dtSec > 0) {
      t.y -= dtSec * 36;
      t.life -= dtSec * 2.2;
    }
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
