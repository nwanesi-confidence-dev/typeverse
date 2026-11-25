import React from 'react';
import {Maximize2, Minimize2, Monitor, X} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  LAYOUT_TESTER_PRESETS,
  screenInfoService,
  useScreenInfo,
} from '@/src/utils/screenInfo';

export const LayoutTesterBar: React.FC = () => {
  const screen = useScreenInfo();
  if (!screen.emulatedSize) return null;

  const fitScale = screen.fitToWindow
    ? Math.min(
        (screen.hostWindowWidth - 24) / screen.emulatedSize.width,
        (screen.hostWindowHeight - 64) / screen.emulatedSize.height,
        1,
      )
    : 1;

  return (
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[70] flex flex-wrap items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-2xl max-w-[96vw]"
      style={{
        backgroundColor: 'var(--tv-surface)',
        borderColor: 'var(--tv-accent)',
        color: 'var(--tv-text)',
      }}
      role="region"
      aria-label="Layout tester controls"
    >
      <div className="flex items-center gap-1.5 font-semibold shrink-0">
        <Monitor className="w-3.5 h-3.5" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
        <span className="font-typing tabular-nums">
          {screen.width}×{screen.height}
        </span>
        <span style={{color: 'var(--tv-text-muted)'}}>
          ({screen.layoutProfile}, {Math.round(fitScale * 100)}% preview, --ui-scale {screen.uiScale.toFixed(2)}×)
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {LAYOUT_TESTER_PRESETS.map((preset) => {
          const active =
            screen.emulatedSize?.width === preset.width &&
            screen.emulatedSize?.height === preset.height;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                screenInfoService.setEmulatedSize(preset);
              }}
              className="rounded-md px-2 py-1 text-[11px] font-typing transition-colors"
              style={{
                backgroundColor: active ? 'var(--tv-accent)' : 'var(--tv-bg)',
                color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiTap();
            screenInfoService.setFitToWindow(!screen.fitToWindow);
          }}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
          style={{
            borderColor: screen.fitToWindow ? 'var(--tv-accent)' : 'var(--tv-border)',
            backgroundColor: 'var(--tv-bg)',
            color: screen.fitToWindow ? 'var(--tv-accent)' : 'var(--tv-text-muted)',
          }}
          aria-pressed={screen.fitToWindow}
        >
          {screen.fitToWindow ? (
            <Minimize2 className="w-3 h-3" aria-hidden="true" />
          ) : (
            <Maximize2 className="w-3 h-3" aria-hidden="true" />
          )}
          <span>Fit to window</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playUiTap();
            screenInfoService.setEmulatedSize(null);
          }}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold"
          style={{
            backgroundColor: 'var(--tv-error)',
            color: '#ffffff',
          }}
        >
          <X className="w-3 h-3" aria-hidden="true" />
          <span>Exit</span>
        </button>
      </div>
    </div>
  );
};
