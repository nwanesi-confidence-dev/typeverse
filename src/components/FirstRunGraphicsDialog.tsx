import React from 'react';
import {Box, Layers, Monitor, Sparkles} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {graphicsModeService, useGraphicsMode} from '@/src/graphics/graphicsModeService';
import {useScreenInfo} from '@/src/utils/screenInfo';

export const FirstRunGraphicsDialog: React.FC = () => {
  const gfx = useGraphicsMode();
  const screen = useScreenInfo();

  if (!gfx.initialized || gfx.firstRunDismissed || gfx.speedTestStatus.running) {
    return null;
  }

  const webgl2Ready =
    gfx.hardwareReport.webglSupported && gfx.hardwareReport.webgl2Supported;

  const handleChooseAuto = async () => {
    soundEngine.playUiTap();
    await graphicsModeService.setPreference('auto');
    await graphicsModeService.runHardwareCheckAndSpeedTest();
  };

  const handleChoose3D = async () => {
    if (!webgl2Ready) return;
    soundEngine.playUiTap();
    await graphicsModeService.setPreference('3d');
  };

  const handleChoose2D = async () => {
    soundEngine.playUiTap();
    await graphicsModeService.setPreference('2d');
  };

  const handleSkip = async () => {
    soundEngine.playUiTap();
    await graphicsModeService.dismissFirstRun();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-graphics-title"
    >
      <div
        className={`tv-surface w-[min(100%,42rem)] max-h-[92%] overflow-y-auto rounded-2xl shadow-2xl space-y-5 ${
          screen.height < 680 ? 'p-5' : 'p-6 sm:p-7'
        }`}
        style={{borderColor: 'var(--tv-border)'}}
      >
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold" style={{color: 'var(--tv-accent)'}}>
            <Monitor className="w-4 h-4" aria-hidden="true" />
            <span>Welcome to TypeVerse</span>
          </div>
          <h2 id="first-run-graphics-title" className="font-display text-2xl font-bold tracking-tight">
            Choose Your Visual Mode
          </h2>
          <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
            Pick how TypeVerse renders backgrounds, keyboards, and arcade arenas. Typing accuracy and latency stay sharp in every mode.
          </p>
        </div>

        <div className={`grid gap-3.5 ${screen.width < 640 ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {/* Card 1: Auto */}
          <button
            type="button"
            onClick={() => void handleChooseAuto()}
            className="rounded-xl border p-4 text-left flex flex-col justify-between gap-3 transition-colors hover:opacity-95"
            style={{
              backgroundColor: 'var(--tv-surface-elevated)',
              borderColor: 'var(--tv-accent)',
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Sparkles className="w-5 h-5" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--tv-accent)',
                    color: 'var(--tv-accent-fg)',
                  }}
                >
                  Recommended
                </span>
              </div>
              <div className="font-display text-lg font-bold">Auto</div>
              <p className="text-xs leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
                Tests this computer once and picks 2D, 3D Light, or 3D Full with a clear explanation.
              </p>
            </div>
            <span className="text-xs font-semibold" style={{color: 'var(--tv-accent)'}}>
              Check my computer →
            </span>
          </button>

          {/* Card 2: 3D */}
          <button
            type="button"
            disabled={!webgl2Ready}
            onClick={() => void handleChoose3D()}
            className="rounded-xl border p-4 text-left flex flex-col justify-between gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--tv-bg)',
              borderColor: 'var(--tv-border)',
            }}
          >
            <div className="space-y-2">
              <Box className="w-5 h-5" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
              <div className="font-display text-lg font-bold">3D</div>
              <p className="text-xs leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
                {webgl2Ready
                  ? 'Full 3D Orbit hub, 3D keycaps, 3D heatmap, trophy, and 3D arcade games.'
                  : "3D isn't available on this computer (WebGL 2 is unsupported)."}
              </p>
            </div>
            <span className="text-xs font-semibold" style={{color: webgl2Ready ? 'var(--tv-text)' : 'var(--tv-text-muted)'}}>
              {webgl2Ready ? 'Use 3D visuals →' : 'Unavailable'}
            </span>
          </button>

          {/* Card 3: 2D Classic */}
          <button
            type="button"
            onClick={() => void handleChoose2D()}
            className="rounded-xl border p-4 text-left flex flex-col justify-between gap-3 transition-colors"
            style={{
              backgroundColor: 'var(--tv-bg)',
              borderColor: 'var(--tv-border)',
            }}
          >
            <div className="space-y-2">
              <Layers className="w-5 h-5" style={{color: 'var(--tv-success)'}} aria-hidden="true" />
              <div className="font-display text-lg font-bold">2D Classic</div>
              <p className="text-xs leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
                Original crisp flat interface and Canvas 2D arcade games with zero WebGL loaded.
              </p>
            </div>
            <span className="text-xs font-semibold" style={{color: 'var(--tv-success)'}}>
              Use 2D Classic →
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t" style={{borderColor: 'var(--tv-border)'}}>
          <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
            You can change this any time in Settings, Graphics, or on each game&apos;s start screen.
          </p>
          <button
            type="button"
            onClick={() => void handleSkip()}
            className="rounded-lg border px-3.5 py-2 text-xs font-medium"
            style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text-muted)'}}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};
