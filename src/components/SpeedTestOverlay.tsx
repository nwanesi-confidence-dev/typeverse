import React, {useEffect, useRef} from 'react';
import {Monitor} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {graphicsModeService, useGraphicsMode} from '@/src/graphics/graphicsModeService';
import {useScreenInfo} from '@/src/utils/screenInfo';

export const SpeedTestOverlay: React.FC = () => {
  const gfx = useGraphicsMode();
  const screen = useScreenInfo();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const {running, phase, progressPct} = gfx.speedTestStatus;

  useEffect(() => {
    if (!running) {
      graphicsModeService.registerSpeedTestContainer(null);
      return;
    }
    graphicsModeService.registerSpeedTestContainer(containerRef.current);
    return () => {
      graphicsModeService.registerSpeedTestContainer(null);
    };
  }, [running]);

  if (!running) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="speed-test-title"
    >
      <div
        className="tv-surface w-[min(100%,28rem)] max-h-[92%] overflow-y-auto rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4"
        style={{borderColor: 'var(--tv-border)'}}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
            <h2 id="speed-test-title" className="font-display text-lg font-bold">
              Checking your computer...
            </h2>
          </div>
          <span className="font-typing text-xs tabular-nums" style={{color: 'var(--tv-accent)'}}>
            {progressPct}%
          </span>
        </div>

        <div
          ref={containerRef}
          className={`w-full rounded-xl border overflow-hidden ${screen.height < 660 ? 'h-32' : 'h-44'}`}
          style={{backgroundColor: '#080B14', borderColor: 'var(--tv-border)'}}
          aria-hidden="true"
        />

        <div className="space-y-1.5">
          <div
            className="h-2 w-full rounded-full overflow-hidden border"
            style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
          >
            <div
              className="h-full transition-all duration-150"
              style={{
                width: `${progressPct}%`,
                backgroundColor: 'var(--tv-accent)',
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{color: 'var(--tv-text-muted)'}}>
            <span>
              {phase === 'warmup'
                ? 'Warming up WebGL shaders...'
                : phase === 'realistic'
                  ? 'Testing shadows, PBR maps & post effects (Realistic)...'
                  : 'Sampling 2,000 instanced cubes (median & 1% low FPS)...'}
            </span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                graphicsModeService.skipSpeedTest();
              }}
              className="rounded-lg border px-3 py-1 text-xs font-semibold shrink-0"
              style={{
                borderColor: 'var(--tv-border)',
                color: 'var(--tv-text)',
                backgroundColor: 'var(--tv-surface-elevated)',
              }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
