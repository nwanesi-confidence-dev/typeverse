import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowRight,
  Award,
  Download,
  Printer,
  RotateCcw,
  Star,
  Target,
} from 'lucide-react';
import {useAppearance} from '@/src/context/AppearanceContext';
import {useGraphicsMode} from '@/src/graphics/graphicsModeService';
import {ThreeCanvasHost} from '@/src/three/ThreeCanvasHost';
import type {ResultsTrophyState} from '@/src/three/scenes/resultsTrophyScene';
import type {CompletedSessionStats} from '@/src/types/typing';
import {downloadCertificatePng} from '@/src/utils/certificate';

const loadResultsTrophyScene = () =>
  import('@/src/three/scenes/resultsTrophyScene');

interface SessionResultsProps {
  stats: CompletedSessionStats;
  profileName: string;
  onRetry: () => void;
  onNext: () => void;
  onPractiseWeakKeys: (weakKeys: string[]) => void;
  showCertificate?: boolean;
}

export const SessionResults: React.FC<SessionResultsProps> = ({
  stats,
  profileName,
  onRetry,
  onNext,
  onPractiseWeakKeys,
  showCertificate = true,
}) => {
  const {settings, copy} = useAppearance();
  const gfx = useGraphicsMode();
  const show3DTrophy =
    gfx.effectiveMode !== '2d' &&
    gfx.hardwareReport.webglSupported &&
    gfx.hardwareReport.webgl2Supported;

  const trophyState: ResultsTrophyState = useMemo(
    () => ({
      stars: stats.stars,
      isNewBest: Boolean(stats.isNewBest),
      passed: stats.passed,
    }),
    [stats.stars, stats.isNewBest, stats.passed],
  );

  const [displayWpm, setDisplayWpm] = useState(
    settings.reducedMotion ? stats.netWpm : 0,
  );
  const [displayAcc, setDisplayAcc] = useState(
    settings.reducedMotion ? stats.accuracy : 0,
  );
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Count-up animation for Net WPM & Accuracy
  useEffect(() => {
    if (settings.reducedMotion) {
      setDisplayWpm(stats.netWpm);
      setDisplayAcc(stats.accuracy);
      return;
    }

    const start = performance.now();
    const duration = 550;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayWpm(Math.round(stats.netWpm * eased));
      setDisplayAcc(Math.round(stats.accuracy * eased * 10) / 10);
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [stats.netWpm, stats.accuracy, settings.reducedMotion]);

  // Classic 2D Confetti burst when 3D is Off
  useEffect(() => {
    if (show3DTrophy || !stats.isNewBest || settings.reducedMotion) return;
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const palette = ['#22D3EE', '#34D399', '#FBBF24', '#F472B6', '#A78BFA'];
    const pieces = Array.from({length: 52}, () => ({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 3.5,
      vy: 2 + Math.random() * 3.5,
      size: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.15,
      color: palette[Math.floor(Math.random() * palette.length)],
      alpha: 1,
    }));

    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rot += p.vrot;
        if (p.y > canvas.height * 0.75) p.alpha -= 0.03;
        if (p.alpha > 0 && p.y < canvas.height + 20) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      }
      if (alive) raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [show3DTrophy, stats.isNewBest, settings.reducedMotion]);

  // Build SVG WPM-over-time graph points
  const chartData = useMemo(() => {
    const series =
      stats.wpmOverTime.length >= 2
        ? stats.wpmOverTime
        : [stats.netWpm, stats.netWpm];
    const maxY = Math.max(80, ...series, stats.previousBestWpm);
    const points = series
      .map((v, idx) => {
        const x = 16 + (idx / (series.length - 1)) * 528;
        const y = 134 - (v / maxY) * 114;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const pbY =
      stats.previousBestWpm > 0
        ? 134 - (stats.previousBestWpm / maxY) * 114
        : null;
    return {points, maxY, pbY, count: series.length};
  }, [stats.wpmOverTime, stats.netWpm, stats.previousBestWpm]);

  return (
    <section
      className="tv-surface tv-dash-card relative overflow-hidden rounded-2xl p-6 sm:p-8 space-y-6"
      aria-label="Session Results"
    >
      {!show3DTrophy && stats.isNewBest && (
        <canvas
          ref={confettiCanvasRef}
          className="pointer-events-none absolute inset-0 w-full h-full z-10"
          aria-hidden="true"
        />
      )}

      {/* Procedural 3D Trophy / Medal & Instanced Confetti Banner */}
      {show3DTrophy && (
        <div
          className="relative z-20 h-40 sm:h-44 w-full rounded-xl border overflow-hidden"
          style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
        >
          <ThreeCanvasHost
            loadScene={loadResultsTrophyScene}
            sceneKey="results-trophy-3d"
            sceneState={trophyState}
            className="w-full h-full pointer-events-none"
          />
          <div className="pointer-events-none absolute left-4 bottom-3 z-10 text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
            {stats.isNewBest
              ? 'Champion Chalice · Personal Best Unlocked'
              : stats.stars >= 3
                ? 'Gold Trophy · 3-Star Mastery'
                : `${stats.stars}-Star Commendation Medal`}
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-4 pb-5 border-b" style={{borderColor: 'var(--tv-border)'}}>
        <div className="space-y-1">
          <div className="text-xs font-medium flex flex-wrap items-center gap-2" style={{color: 'var(--tv-accent)'}}>
            <span>{stats.subMode} Complete · +{stats.xpEarned} XP</span>
            {stats.playedVisuals && (
              <span
                className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  borderColor: 'var(--tv-border)',
                  backgroundColor: 'var(--tv-bg)',
                  color: 'var(--tv-text-muted)',
                }}
              >
                Played in {stats.playedVisuals === '3d' ? '3D' : '2D'}
              </span>
            )}
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight flex items-center gap-3">
            <span>Session Summary</span>
            {stats.isNewBest && (
              <span
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--tv-surface-elevated)',
                  color: 'var(--tv-warning)',
                  border: '1px solid var(--tv-warning)',
                }}
              >
                <Award className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Personal Best</span>
              </span>
            )}
          </h2>
        </div>

        {/* 1-3 Stars */}
        <div className="flex items-center gap-1.5" aria-label={`${stats.stars} out of 3 stars`}>
          {[1, 2, 3].map((n) => (
            <Star
              key={n}
              className="w-7 h-7"
              fill={n <= stats.stars ? '#FBBF24' : 'transparent'}
              stroke={n <= stats.stars ? '#FBBF24' : 'var(--tv-border)'}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      {stats.passed !== undefined && stats.passRequirementText && (
        <div
          className="relative z-20 rounded-xl border px-4 py-3 text-sm font-medium"
          style={{
            borderColor: stats.passed ? 'var(--tv-success)' : 'var(--tv-warning)',
            backgroundColor: 'var(--tv-bg)',
            color: stats.passed ? 'var(--tv-success)' : 'var(--tv-warning)',
          }}
        >
          {stats.passRequirementText}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="relative z-20 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border p-4" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Net WPM</div>
          <div className="font-typing text-3xl font-bold tabular-nums mt-1" style={{color: 'var(--tv-accent)'}}>
            {displayWpm}
          </div>
          <div className="text-[11px] mt-1" style={{color: 'var(--tv-text-muted)'}}>
            {stats.previousBestWpm > 0
              ? stats.netWpm >= stats.previousBestWpm
                ? `+${stats.netWpm - stats.previousBestWpm} vs PB`
                : `${stats.netWpm - stats.previousBestWpm} vs PB (${stats.previousBestWpm})`
              : 'First recorded PB'}
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Gross WPM</div>
          <div className="font-typing text-3xl font-bold tabular-nums mt-1">
            {stats.grossWpm}
          </div>
          <div className="text-[11px] mt-1 tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            {stats.cpm} CPM
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Accuracy</div>
          <div className="font-typing text-3xl font-bold tabular-nums mt-1" style={{color: 'var(--tv-success)'}}>
            {displayAcc.toFixed(1)}%
          </div>
          <div className="text-[11px] mt-1 tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            {stats.correctKeystrokes}/{stats.totalKeystrokes} keys
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Errors</div>
          <div className="font-typing text-3xl font-bold tabular-nums mt-1" style={{color: stats.errors > 0 ? 'var(--tv-error)' : 'var(--tv-text)'}}>
            {stats.errors}
          </div>
          <div className="text-[11px] mt-1 tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            {stats.uncorrectedErrors} uncorrected
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Consistency</div>
          <div className="font-typing text-3xl font-bold tabular-nums mt-1">
            {stats.consistency}%
          </div>
          <div className="text-[11px] mt-1" style={{color: 'var(--tv-text-muted)'}}>
            Speed stability
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Time</div>
          <div className="font-typing text-3xl font-bold tabular-nums mt-1">
            {stats.durationSec}s
          </div>
          <div className="text-[11px] mt-1 tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            {stats.wordsTyped} words
          </div>
        </div>
      </div>

      {/* WPM-over-time SVG Chart + Slowest Keys */}
      <div className="relative z-20 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 rounded-xl border p-4 space-y-2" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="flex items-center justify-between text-xs" style={{color: 'var(--tv-text-muted)'}}>
            <span className="font-semibold" style={{color: 'var(--tv-text)'}}>WPM Over Time</span>
            <span>Peak {Math.max(...(stats.wpmOverTime.length ? stats.wpmOverTime : [stats.netWpm]))} WPM · {chartData.count}s samples</span>
          </div>
          <svg viewBox="0 0 560 150" className="w-full h-36 overflow-visible" aria-label="WPM over time chart">
            <line x1="16" y1="134" x2="544" y2="134" stroke="var(--tv-border)" strokeWidth="1" />
            <line x1="16" y1="77" x2="544" y2="77" stroke="var(--tv-border)" strokeWidth="1" strokeDasharray="3 4" />
            <line x1="16" y1="20" x2="544" y2="20" stroke="var(--tv-border)" strokeWidth="1" strokeDasharray="3 4" />
            {chartData.pbY !== null && (
              <line
                x1="16"
                y1={chartData.pbY}
                x2="544"
                y2={chartData.pbY}
                stroke="var(--tv-warning)"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
            )}
            <polyline
              fill="none"
              stroke="var(--tv-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={chartData.points}
            />
          </svg>
        </div>

        <div className="lg:col-span-4 rounded-xl border p-4 space-y-3" style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}>
          <div className="text-xs font-semibold">Slowest Keys</div>
          {stats.slowestKeys.length === 0 ? (
            <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
              Not enough key latency samples yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.slowestKeys.map((k) => (
                <li
                  key={k.key}
                  className="flex items-center justify-between text-xs py-1 border-b last:border-b-0"
                  style={{borderColor: 'var(--tv-border)'}}
                >
                  <span className="font-typing font-bold uppercase px-2 py-0.5 rounded border" style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}>
                    {k.key}
                  </span>
                  <span className="font-typing tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                    {k.avgMs} ms · {k.errors} err
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface-elevated)'}}
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Retry</span>
          </button>

          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
            style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
          >
            <span>Next Passage</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>

          {stats.weakKeys.length > 0 && (
            <button
              type="button"
              onClick={() => onPractiseWeakKeys(stats.weakKeys)}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
              style={{borderColor: 'var(--tv-accent)', color: 'var(--tv-accent)'}}
            >
              <Target className="w-4 h-4" aria-hidden="true" />
              <span>{copy('practise')} weak keys</span>
            </button>
          )}
        </div>

        {showCertificate && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCertificatePng(stats, profileName)}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium"
              style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text)'}}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Certificate (PNG)</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium"
              style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text)'}}
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print</span>
            </button>
          </div>
        )}
      </div>

      {/* Print-only clean certificate view */}
      <div className="hidden print-only-certificate border-4 border-slate-900 p-10 text-center space-y-4">
        <h1 className="text-3xl font-bold">TypeVerse Certificate of Achievement</h1>
        <p className="text-lg">Awarded to {profileName}</p>
        <p className="text-2xl font-mono font-bold">
          {stats.netWpm} Net WPM · {stats.accuracy.toFixed(1)}% Accuracy · {stats.consistency}% Consistency
        </p>
        <p className="text-sm">{stats.subMode} · {new Date().toLocaleDateString()}</p>
      </div>
    </section>
  );
};
