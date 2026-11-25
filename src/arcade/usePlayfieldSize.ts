import {useEffect, useState, type RefObject} from 'react';
import {
  CANONICAL_PLAY_HEIGHT,
  CANONICAL_PLAY_WIDTH,
  computeSafeZoneHudInsets,
  type SafeZoneHudInsets,
} from '@/src/arcade/playZone';
import {useScreenInfo} from '@/src/utils/screenInfo';

/**
 * Tracks a playfield container's live CSS dimensions with ResizeObserver
 * and returns safe-zone HUD insets anchored inside the canonical 16:9 play zone.
 */
export function usePlayfieldSafeInsets(
  containerRef: RefObject<HTMLElement | null>,
): SafeZoneHudInsets {
  const screen = useScreenInfo();
  const [size, setSize] = useState<{w: number; h: number}>({
    w: CANONICAL_PLAY_WIDTH,
    h: CANONICAL_PLAY_HEIGHT,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      const rw = Math.round(w);
      const rh = Math.round(h);
      setSize((prev) => (prev.w === rw && prev.h === rh ? prev : {w: rw, h: rh}));
    };

    update(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;

    let rafId = 0;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (rafId) window.cancelAnimationFrame(rafId);
      const {width, height} = entry.contentRect;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        update(width, height);
      });
    });
    obs.observe(el);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, [containerRef, screen.width, screen.height]);

  return computeSafeZoneHudInsets(size.w, size.h);
}

/**
 * Observes a 2D game <canvas> and invokes synchronous redraw whenever its box
 * resizes or window devicePixelRatio changes (moving between monitors, F11, zoom).
 */
export function useCanvas2DResizeObserver(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  onRedraw: () => void,
): void {
  const screen = useScreenInfo();

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    onRedraw();
    if (typeof ResizeObserver === 'undefined') return;

    const obs = new ResizeObserver(() => {
      onRedraw();
    });
    obs.observe(canvas);
    return () => {
      obs.disconnect();
    };
  }, [canvasRef, enabled, onRedraw, screen.devicePixelRatio, screen.width, screen.height]);
}
