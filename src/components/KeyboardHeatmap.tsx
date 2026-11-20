import React, {useMemo, useState} from 'react';
import type {KeyAggregateMetric} from '@/src/types/app';

const HEATMAP_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
];

interface KeyboardHeatmapProps {
  keyMetrics: Record<string, KeyAggregateMetric>;
  selectedKeys?: string[];
  onToggleKey?: (key: string) => void;
}

export const KeyboardHeatmap: React.FC<KeyboardHeatmapProps> = ({
  keyMetrics,
  selectedKeys = [],
  onToggleKey,
}) => {
  const [metricView, setMetricView] = useState<'speed' | 'accuracy'>('speed');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const inspectedKey = hoveredKey ?? selectedKeys[0] ?? 'e';
  const inspectedStat = keyMetrics[inspectedKey];

  const getKeyTone = (k: string) => {
    const stat = keyMetrics[k];
    if (!stat || stat.hits + stat.errors === 0) {
      return {
        bg: 'var(--tv-bg)',
        border: 'var(--tv-border)',
        text: 'var(--tv-text-muted)',
        sub: '--',
      };
    }

    const total = stat.hits + stat.errors;
    const acc = (stat.hits / total) * 100;
    const avgMs = stat.hits > 0 ? Math.round(stat.totalLatencyMs / stat.hits) : 450;

    if (metricView === 'speed') {
      if (avgMs <= 165) {
        return {
          bg: 'rgba(52, 211, 153, 0.2)',
          border: 'var(--tv-success)',
          text: 'var(--tv-text)',
          sub: `${avgMs}ms`,
        };
      }
      if (avgMs <= 260) {
        return {
          bg: 'rgba(34, 211, 238, 0.16)',
          border: 'var(--tv-accent)',
          text: 'var(--tv-text)',
          sub: `${avgMs}ms`,
        };
      }
      if (avgMs <= 360) {
        return {
          bg: 'rgba(251, 191, 36, 0.2)',
          border: 'var(--tv-warning)',
          text: 'var(--tv-text)',
          sub: `${avgMs}ms`,
        };
      }
      return {
        bg: 'rgba(251, 113, 133, 0.22)',
        border: 'var(--tv-error)',
        text: 'var(--tv-text)',
        sub: `${avgMs}ms`,
      };
    } else {
      if (acc >= 97) {
        return {
          bg: 'rgba(52, 211, 153, 0.2)',
          border: 'var(--tv-success)',
          text: 'var(--tv-text)',
          sub: `${Math.round(acc)}%`,
        };
      }
      if (acc >= 92) {
        return {
          bg: 'rgba(251, 191, 36, 0.2)',
          border: 'var(--tv-warning)',
          text: 'var(--tv-text)',
          sub: `${Math.round(acc)}%`,
        };
      }
      return {
        bg: 'rgba(251, 113, 133, 0.22)',
        border: 'var(--tv-error)',
        text: 'var(--tv-text)',
        sub: `${Math.round(acc)}%`,
      };
    }
  };

  const inspectedSummary = useMemo(() => {
    if (!inspectedStat || inspectedStat.hits + inspectedStat.errors === 0) {
      return 'No recorded keystrokes yet';
    }
    const total = inspectedStat.hits + inspectedStat.errors;
    const acc = ((inspectedStat.hits / total) * 100).toFixed(1);
    const avgMs =
      inspectedStat.hits > 0
        ? Math.round(inspectedStat.totalLatencyMs / inspectedStat.hits)
        : 0;
    return `${inspectedStat.hits} hits · ${inspectedStat.errors} errors · ${acc}% accuracy · ${avgMs} ms avg`;
  }, [inspectedStat]);

  return (
    <div className="tv-surface rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold">Keyboard Telemetry Heatmap</h3>
          <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
            {onToggleKey
              ? 'Click any keys to target them in a custom drill, or hover to inspect speed & accuracy.'
              : 'Hover any key to inspect average latency and error rate.'}
          </p>
        </div>

        <div
          className="flex items-center gap-1 rounded-xl border p-1"
          style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
        >
          <button
            type="button"
            onClick={() => setMetricView('speed')}
            className="rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: metricView === 'speed' ? 'var(--tv-accent)' : 'transparent',
              color: metricView === 'speed' ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
            }}
          >
            Speed (ms)
          </button>
          <button
            type="button"
            onClick={() => setMetricView('accuracy')}
            className="rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: metricView === 'accuracy' ? 'var(--tv-accent)' : 'transparent',
              color: metricView === 'accuracy' ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
            }}
          >
            Accuracy (%)
          </button>
        </div>
      </div>

      {/* Heatmap Key Grid */}
      <div className="mx-auto max-w-[740px] space-y-1.5">
        {HEATMAP_ROWS.map((row, rIdx) => (
          <div
            key={rIdx}
            className="flex justify-center gap-1.5"
            style={{paddingLeft: `${rIdx * 10}px`}}
          >
            {row.map((k) => {
              const tone = getKeyTone(k);
              const isSelected = selectedKeys.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onMouseEnter={() => setHoveredKey(k)}
                  onFocus={() => setHoveredKey(k)}
                  onClick={() => onToggleKey?.(k)}
                  className="flex flex-col items-center justify-center rounded-lg border h-12 flex-1 max-w-[54px] transition-transform hover:-translate-y-0.5"
                  style={{
                    backgroundColor: tone.bg,
                    borderColor: isSelected ? 'var(--tv-text)' : tone.border,
                    borderWidth: isSelected ? '2px' : '1px',
                    boxShadow: isSelected ? '0 0 0 2px var(--tv-accent)' : undefined,
                    color: tone.text,
                  }}
                >
                  <span className="font-typing text-xs font-bold uppercase leading-none">
                    {k}
                  </span>
                  <span className="font-typing text-[10px] tabular-nums opacity-80 mt-1 leading-none">
                    {tone.sub}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Inspection & Legend Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-xs"
        style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text-muted)'}}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-typing font-bold uppercase px-2 py-0.5 rounded border"
            style={{
              borderColor: 'var(--tv-border)',
              backgroundColor: 'var(--tv-bg)',
              color: 'var(--tv-accent)',
            }}
          >
            {inspectedKey}
          </span>
          <span className="font-typing tabular-nums">{inspectedSummary}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span style={{color: 'var(--tv-success)'}}>Fast / 97%+</span>
          <span style={{color: 'var(--tv-accent)'}}>Steady</span>
          <span style={{color: 'var(--tv-warning)'}}>Moderate</span>
          <span style={{color: 'var(--tv-error)'}}>Needs Focus</span>
        </div>
      </div>
    </div>
  );
};
