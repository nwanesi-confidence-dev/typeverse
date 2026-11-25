import React, {useMemo} from 'react';
import {Activity, History, Keyboard, Target} from 'lucide-react';
import type {KeyAggregateMetric, ProfileProgress, SceneId} from '@/src/types/app';
import type {TypingTelemetrySnapshot} from '@/src/types/typing';

interface LiveSessionStatsPanelProps {
  telemetry: TypingTelemetrySnapshot;
  progress: ProfileProgress | null;
  modeFilter?: SceneId;
  title?: string;
}

export const LiveSessionStatsPanel: React.FC<LiveSessionStatsPanelProps> = ({
  telemetry,
  progress,
  modeFilter,
  title = 'Live Session Stats',
}) => {
  const recentRuns = useMemo(() => {
    const list = progress?.sessions ?? [];
    const filtered = modeFilter ? list.filter((s) => s.mode === modeFilter) : list;
    return filtered.slice(0, 5);
  }, [progress?.sessions, modeFilter]);

  const wpmHistory = telemetry.wpmHistory;
  const sparkPoints = useMemo(() => {
    if (wpmHistory.length < 2) return '';
    const max = Math.max(60, ...wpmHistory);
    return wpmHistory
      .map((val, i) => {
        const x = 6 + (i / (wpmHistory.length - 1)) * 208;
        const y = 52 - (val / max) * 44;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [wpmHistory]);

  return (
    <div className="space-y-4">
      <section className="tv-surface rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
            <span>{title}</span>
          </h3>
          <span className="font-typing text-xs tabular-nums" style={{color: 'var(--tv-accent)'}}>
            {telemetry.rollingWpm} WPM
          </span>
        </div>

        <div
          className="rounded-xl border p-2.5"
          style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
        >
          {sparkPoints ? (
            <svg viewBox="0 0 220 58" className="w-full h-14 overflow-visible" aria-label="Live WPM trend">
              <line x1="6" y1="52" x2="214" y2="52" stroke="var(--tv-border)" strokeWidth="1" />
              <polyline
                fill="none"
                stroke="var(--tv-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparkPoints}
              />
            </svg>
          ) : (
            <div className="h-14 flex items-center justify-center text-xs" style={{color: 'var(--tv-text-muted)'}}>
              Type to stream WPM curve
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div
            className="rounded-xl border px-3 py-2"
            style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
          >
            <div style={{color: 'var(--tv-text-muted)'}}>Consistency</div>
            <div className="font-typing text-base font-bold tabular-nums mt-0.5">
              {telemetry.consistency}%
            </div>
          </div>
          <div
            className="rounded-xl border px-3 py-2"
            style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
          >
            <div style={{color: 'var(--tv-text-muted)'}}>Progress</div>
            <div className="font-typing text-base font-bold tabular-nums mt-0.5">
              {telemetry.typedChars}/{telemetry.totalChars || '—'}
            </div>
          </div>
        </div>
      </section>

      <section className="tv-surface rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
          <h3 className="font-display text-sm font-bold">Recent Runs</h3>
        </div>
        {recentRuns.length === 0 ? (
          <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
            Finish a session to record your WPM and accuracy history here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentRuns.map((run) => (
              <li
                key={run.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
              >
                <span className="truncate" style={{color: 'var(--tv-text-muted)'}}>
                  {run.subMode}
                </span>
                <span className="font-typing font-semibold tabular-nums shrink-0">
                  <strong style={{color: 'var(--tv-accent)'}}>{run.netWpm}</strong> · {run.accuracy.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

interface CompactKeyHeatmapPanelProps {
  keyMetrics: Record<string, KeyAggregateMetric>;
  selectedKeys?: string[];
  onToggleKey?: (key: string) => void;
}

const COMPACT_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
];

export const CompactKeyHeatmapPanel: React.FC<CompactKeyHeatmapPanelProps> = ({
  keyMetrics,
  selectedKeys = [],
  onToggleKey,
}) => {
  const weakest = useMemo(() => {
    return Object.entries(keyMetrics)
      .filter(([k, s]) => /^[a-z0-9]$/.test(k) && s.hits + s.errors >= 2)
      .map(([key, s]) => {
        const total = s.hits + s.errors;
        const avgMs = s.hits > 0 ? Math.round(s.totalLatencyMs / s.hits) : 420;
        const acc = Math.round((s.hits / total) * 100);
        return {key, avgMs, acc, score: avgMs + (100 - acc) * 14};
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [keyMetrics]);

  const getTone = (k: string) => {
    const stat = keyMetrics[k];
    if (!stat || stat.hits + stat.errors === 0) {
      return {bg: 'var(--tv-bg)', border: 'var(--tv-border)', text: 'var(--tv-text-muted)'};
    }
    const avgMs = stat.hits > 0 ? Math.round(stat.totalLatencyMs / stat.hits) : 420;
    if (avgMs <= 170) return {bg: 'rgba(52, 211, 153, 0.2)', border: 'var(--tv-success)', text: 'var(--tv-text)'};
    if (avgMs <= 260) return {bg: 'rgba(34, 211, 238, 0.16)', border: 'var(--tv-accent)', text: 'var(--tv-text)'};
    if (avgMs <= 360) return {bg: 'rgba(251, 191, 36, 0.2)', border: 'var(--tv-warning)', text: 'var(--tv-text)'};
    return {bg: 'rgba(251, 113, 133, 0.22)', border: 'var(--tv-error)', text: 'var(--tv-text)'};
  };

  return (
    <div className="space-y-4">
      <section className="tv-surface rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold flex items-center gap-2">
            <Keyboard className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
            <span>Key Latency Map</span>
          </h3>
          {onToggleKey && (
            <span className="text-[11px]" style={{color: 'var(--tv-text-muted)'}}>
              Click to focus
            </span>
          )}
        </div>

        <div className="space-y-1">
          {COMPACT_ROWS.map((row, idx) => (
            <div key={idx} className="flex justify-center gap-1" style={{paddingLeft: `${idx * 6}px`}}>
              {row.map((k) => {
                const tone = getTone(k);
                const selected = selectedKeys.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!onToggleKey}
                    onClick={() => onToggleKey?.(k)}
                    className="flex-1 h-7 rounded-md border text-[11px] font-typing font-bold uppercase flex items-center justify-center transition-colors disabled:cursor-default"
                    style={{
                      backgroundColor: tone.bg,
                      borderColor: selected ? 'var(--tv-text)' : tone.border,
                      color: tone.text,
                      boxShadow: selected ? '0 0 0 1.5px var(--tv-accent)' : undefined,
                    }}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="tv-surface rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 shrink-0" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
          <h3 className="font-display text-sm font-bold">Focus Priorities</h3>
        </div>
        {weakest.length === 0 ? (
          <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
            Complete a drill to identify slower keys and accuracy dips.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {weakest.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between text-xs py-1 border-b last:border-b-0"
                style={{borderColor: 'var(--tv-border)'}}
              >
                <span
                  className="font-typing font-bold uppercase px-2 py-0.5 rounded border"
                  style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)'}}
                >
                  {item.key}
                </span>
                <span className="font-typing tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                  {item.avgMs}ms · {item.acc}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
