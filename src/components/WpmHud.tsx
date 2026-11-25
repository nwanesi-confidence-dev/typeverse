import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, Flame, Gauge, Target, Timer} from 'lucide-react';
import {useAppearance} from '@/src/context/AppearanceContext';
import {
  getActiveProfileId,
  loadProfileProgress,
  subscribeProfileProgressChanged,
} from '@/src/db/storage';
import type {TypingTelemetrySnapshot} from '@/src/types/typing';
import {
  computeDailyGoalProgress,
  getTodayActivitySeconds,
} from '@/src/utils/progression';
import {computeHudLayout} from '@/src/utils/responsiveLayout';
import {useScreenInfo} from '@/src/utils/screenInfo';

interface WpmHudProps {
  telemetry: TypingTelemetrySnapshot;
  personalBestWpm: number;
  targetWpm: number;
  dailyGoalMinutes?: number;
  todayActivitySeconds?: number;
  showGhostPace?: boolean;
  compact?: boolean;
}

const DIAL_START_DEG = -125;
const DIAL_END_DEG = 125;
const DIAL_SWEEP = DIAL_END_DEG - DIAL_START_DEG; // 250 deg

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const WpmHud: React.FC<WpmHudProps> = ({
  telemetry,
  personalBestWpm,
  targetWpm,
  dailyGoalMinutes,
  todayActivitySeconds,
  showGhostPace = false,
  compact = false,
}) => {
  const {settings} = useAppearance();
  const screen = useScreenInfo();
  const hudLayout = useMemo(() => computeHudLayout(screen), [screen]);
  const displayWpm = telemetry.started ? telemetry.rollingWpm || telemetry.netWpm : 0;

  const needsFallbackProgress =
    dailyGoalMinutes === undefined || todayActivitySeconds === undefined;
  const [fallbackGoal, setFallbackGoal] = useState<{
    dailyGoalMinutes: number;
    todayActivitySeconds: number;
  } | null>(null);

  useEffect(() => {
    if (!needsFallbackProgress) return;
    let cancelled = false;
    const syncFallback = async () => {
      const pid = await getActiveProfileId();
      const prog = await loadProfileProgress(pid);
      if (!cancelled) {
        setFallbackGoal({
          dailyGoalMinutes: prog.dailyGoalMinutes,
          todayActivitySeconds: getTodayActivitySeconds(prog),
        });
      }
    };
    void syncFallback();
    const unsub = subscribeProfileProgressChanged(() => {
      void syncFallback();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [needsFallbackProgress]);

  const dailyGoal = computeDailyGoalProgress({
    dailyGoalMinutes: dailyGoalMinutes ?? fallbackGoal?.dailyGoalMinutes ?? 15,
    savedTodaySeconds: todayActivitySeconds ?? fallbackGoal?.todayActivitySeconds ?? 0,
    liveElapsedMs: telemetry.elapsedMs,
    includeLiveElapsed: telemetry.started && !telemetry.finished,
  });
  const goalColor = dailyGoal.goalReached ? 'var(--tv-success)' : 'var(--tv-accent)';
  const GoalIcon = dailyGoal.goalReached ? CheckCircle2 : Target;

  // Auto-extend dial scale above 150 WPM when user hits elite speeds
  const maxDialWpm = useMemo(() => {
    const peak = Math.max(displayWpm, telemetry.netWpm, personalBestWpm, targetWpm);
    if (peak > 195) return 250;
    if (peak > 145) return 200;
    return 150;
  }, [displayWpm, telemetry.netWpm, personalBestWpm, targetWpm]);

  // Smooth spring-eased needle angle
  const [needleAngle, setNeedleAngle] = useState(DIAL_START_DEG);
  const needleStateRef = useRef({angle: DIAL_START_DEG, velocity: 0});

  const targetAngle =
    DIAL_START_DEG + Math.min(1, Math.max(0, displayWpm / maxDialWpm)) * DIAL_SWEEP;

  useEffect(() => {
    if (settings.reducedMotion) {
      needleStateRef.current.angle = targetAngle;
      setNeedleAngle(targetAngle);
      return;
    }

    let rafId = 0;
    const step = () => {
      const st = needleStateRef.current;
      const force = (targetAngle - st.angle) * 0.16;
      st.velocity = (st.velocity + force) * 0.72;
      st.angle += st.velocity;
      setNeedleAngle(st.angle);
      if (Math.abs(targetAngle - st.angle) > 0.25 || Math.abs(st.velocity) > 0.1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        st.angle = targetAngle;
        st.velocity = 0;
        setNeedleAngle(targetAngle);
      }
    };
    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [targetAngle, settings.reducedMotion]);

  // Colour bands along the speedometer arc
  const bands = useMemo(() => {
    const wpmToDeg = (w: number) =>
      DIAL_START_DEG + Math.min(1, w / maxDialWpm) * DIAL_SWEEP;
    return [
      {from: 0, to: 20, color: '#FB7185'}, // red < 20
      {from: 20, to: 45, color: '#FBBF24'}, // amber 20-45
      {from: 45, to: 65, color: '#34D399'}, // green 45-65
      {from: 65, to: 80, color: '#22D3EE'}, // cyan 65-80
      {from: 80, to: maxDialWpm, color: '#F59E0B'}, // gold 80+
    ].map((b) => ({
      ...b,
      d: describeArc(90, 88, 68, wpmToDeg(b.from), wpmToDeg(b.to)),
    }));
  }, [maxDialWpm]);

  const pbAngle =
    personalBestWpm > 0
      ? DIAL_START_DEG + Math.min(1, personalBestWpm / maxDialWpm) * DIAL_SWEEP
      : null;
  const targetMarkerAngle =
    targetWpm > 0
      ? DIAL_START_DEG + Math.min(1, targetWpm / maxDialWpm) * DIAL_SWEEP
      : null;

  const accuracyRadius = 22;
  const accuracyCircumference = 2 * Math.PI * accuracyRadius;
  const accuracyDash = (telemetry.accuracy / 100) * accuracyCircumference;

  // Live sparkline path
  const sparklinePoints = useMemo(() => {
    const hist = telemetry.wpmHistory;
    if (hist.length < 2) return '';
    const maxVal = Math.max(60, ...hist);
    return hist
      .map((val, idx) => {
        const x = (idx / (hist.length - 1)) * 120;
        const y = 32 - (val / maxVal) * 28;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [telemetry.wpmHistory]);

  if (compact) {
    return (
      <div
        data-testid="wpm-hud"
        className="tv-surface tv-hud-depth rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-3"
        aria-label="Live WPM telemetry bar"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Gauge className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
          <div className="flex items-baseline gap-2">
            <span className="font-typing text-xl font-bold tabular-nums">
              {telemetry.netWpm}
            </span>
            <span className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
              Net WPM
            </span>
          </div>
          <span className="text-xs" style={{color: 'var(--tv-text-muted)'}}>·</span>
          <span className="font-typing text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            {telemetry.accuracy.toFixed(0)}% accuracy
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs" style={{color: 'var(--tv-text-muted)'}}>
          <div className="flex items-center gap-2">
            <GoalIcon
              className="w-3.5 h-3.5 shrink-0"
              style={{color: goalColor}}
              aria-hidden="true"
            />
            <span>Daily</span>
            <div
              className="h-1.5 w-20 overflow-hidden rounded-full"
              style={{backgroundColor: 'var(--tv-surface-elevated)'}}
              role="progressbar"
              aria-label="Daily activity goal progress"
              aria-valuenow={Math.min(dailyGoal.todayMinutes, dailyGoal.goalMinutes)}
              aria-valuemin={0}
              aria-valuemax={dailyGoal.goalMinutes}
              aria-valuetext={`${dailyGoal.todayMinutes} of ${dailyGoal.goalMinutes} minutes (${dailyGoal.pct}%)`}
              title={`Daily goal: ${dailyGoal.todayMinutes} / ${dailyGoal.goalMinutes} min (${dailyGoal.pct}%)`}
            >
              <div
                className={
                  settings.reducedMotion
                    ? 'h-full rounded-full'
                    : 'h-full rounded-full transition-[width] duration-300'
                }
                style={{
                  width: `${dailyGoal.pct}%`,
                  backgroundColor: goalColor,
                }}
              />
            </div>
            <strong
              className="font-typing tabular-nums"
              style={{color: dailyGoal.goalReached ? 'var(--tv-success)' : 'var(--tv-text)'}}
            >
              {dailyGoal.todayMinutes}/{dailyGoal.goalMinutes}m
            </strong>
            <span className="font-typing tabular-nums text-[11px]" style={{color: goalColor}}>
              {dailyGoal.pct}%
            </span>
          </div>
          {screen.width >= 640 && <span aria-hidden="true">·</span>}
          <span>
            Target <strong className="font-typing tabular-nums" style={{color: 'var(--tv-text)'}}>{targetWpm} WPM</strong>
          </span>
          <span>
            Best <strong className="font-typing tabular-nums" style={{color: 'var(--tv-accent)'}}>{personalBestWpm} WPM</strong>
          </span>
        </div>
      </div>
    );
  }

  return (
    <section
      data-testid="wpm-hud"
      className="tv-glass tv-hud-depth rounded-2xl w-full min-w-0"
      style={{
        padding: `${hudLayout.paddingPx}px`,
      }}
      aria-label="Live WPM Meter and Session Telemetry"
    >
      <div className={hudLayout.dense ? 'space-y-2' : 'space-y-3'}>
        <div
          className="grid items-center gap-3"
          style={{
            gridTemplateColumns:
              hudLayout.cols === 3
                ? 'minmax(0, 5fr) minmax(0, 4fr) minmax(0, 3fr)'
                : hudLayout.cols === 2
                  ? 'minmax(0, 1fr) minmax(0, 1fr)'
                  : 'minmax(0, 1fr)',
          }}
        >
          {/* Speedometer Dial + Digital Readout */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="tv-hud-gauge-well relative shrink-0 p-1"
              style={{
                width: `${hudLayout.gaugeWidthPx}px`,
                height: `${hudLayout.gaugeHeightPx}px`,
              }}
            >
              <svg viewBox="0 0 180 128" className="w-full h-full overflow-visible" aria-hidden="true">
                {bands.map((b, idx) => (
                  <path
                    key={idx}
                    d={b.d}
                    fill="none"
                    stroke={b.color}
                    strokeWidth="9"
                    strokeLinecap="butt"
                    opacity="0.88"
                  />
                ))}

                {targetMarkerAngle !== null && (() => {
                  const p1 = polarToCartesian(90, 88, 56, targetMarkerAngle);
                  const p2 = polarToCartesian(90, 88, 78, targetMarkerAngle);
                  return (
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="var(--tv-text)"
                      strokeWidth="2"
                      strokeDasharray="2 2"
                    />
                  );
                })()}

                {pbAngle !== null && (() => {
                  const p = polarToCartesian(90, 88, 79, pbAngle);
                  return (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill="#FBBF24"
                      stroke="var(--tv-bg)"
                      strokeWidth="1.5"
                    />
                  );
                })()}

                <g
                  className="tv-hud-needle-shadow"
                  style={{
                    transform: `rotate(${needleAngle}deg)`,
                    transformOrigin: '90px 88px',
                  }}
                >
                  <polygon points="87,88 90,26 93,88" fill="var(--tv-text)" />
                  <circle cx="90" cy="88" r="7" fill="var(--tv-accent)" />
                </g>

                <text x="22" y="116" fill="var(--tv-text-muted)" fontSize="10" className="font-typing">
                  0
                </text>
                <text x="144" y="116" fill="var(--tv-text-muted)" fontSize="10" className="font-typing">
                  {maxDialWpm}
                </text>
              </svg>
            </div>

            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
                Net Speed
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-typing font-bold tabular-nums leading-none"
                  style={{
                    color: 'var(--tv-accent)',
                    fontSize: `${hudLayout.netWpmFontPx}px`,
                  }}
                >
                  {telemetry.netWpm}
                </span>
                <span className="text-xs font-semibold" style={{color: 'var(--tv-text-muted)'}}>
                  WPM
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                <span>Gross {telemetry.grossWpm}</span>
                <span aria-hidden="true">·</span>
                <span>{telemetry.cpm} CPM</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                <span>Target {targetWpm}</span>
                {personalBestWpm > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span style={{color: 'var(--tv-warning)'}}>PB {personalBestWpm}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Accuracy Ring, Streak, Timer */}
          <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <svg
                width={hudLayout.accuracySvgPx}
                height={hudLayout.accuracySvgPx}
                viewBox="0 0 54 54"
                className="shrink-0"
                aria-hidden="true"
              >
                <circle
                  cx="27"
                  cy="27"
                  r={accuracyRadius}
                  fill="none"
                  stroke="var(--tv-border)"
                  strokeWidth="4.5"
                />
                <circle
                  cx="27"
                  cy="27"
                  r={accuracyRadius}
                  fill="none"
                  stroke={
                    telemetry.accuracy >= 95
                      ? 'var(--tv-success)'
                      : telemetry.accuracy >= 88
                        ? 'var(--tv-warning)'
                        : 'var(--tv-error)'
                  }
                  strokeWidth="4.5"
                  strokeDasharray={`${accuracyDash} ${accuracyCircumference}`}
                  strokeLinecap="round"
                  transform="rotate(-90 27 27)"
                />
                <text
                  x="27"
                  y="31"
                  textAnchor="middle"
                  fill="var(--tv-text)"
                  fontSize="11"
                  fontWeight="700"
                  className="font-typing"
                >
                  {Math.round(telemetry.accuracy)}%
                </text>
              </svg>
              <div className="min-w-0">
                <div className="text-[11px] truncate" style={{color: 'var(--tv-text-muted)'}}>
                  Accuracy
                </div>
                <div
                  className="font-typing text-xs font-semibold tabular-nums truncate"
                  style={{color: telemetry.errors > 0 ? 'var(--tv-error)' : 'var(--tv-text)'}}
                >
                  {telemetry.errors} {telemetry.errors === 1 ? 'err' : 'errs'}
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border px-2 py-1.5 text-center min-w-0"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-[11px] flex items-center justify-center gap-1" style={{color: 'var(--tv-text-muted)'}}>
                <Flame className="w-3 h-3 shrink-0" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
                <span>Streak</span>
              </div>
              <div className="font-typing text-base font-bold tabular-nums mt-0.5">
                {telemetry.combo}{' '}
                <span className="text-xs font-semibold" style={{color: 'var(--tv-accent)'}}>
                  x{telemetry.multiplier}
                </span>
              </div>
            </div>

            <div
              className="rounded-xl border px-2 py-1.5 text-center min-w-0"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-[11px] flex items-center justify-center gap-1" style={{color: 'var(--tv-text-muted)'}}>
                <Timer className="w-3 h-3 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                <span>{telemetry.remainingMs !== null ? 'Left' : 'Time'}</span>
              </div>
              <div className="font-typing text-base font-bold tabular-nums mt-0.5">
                {telemetry.remainingMs !== null
                  ? formatClock(telemetry.remainingMs)
                  : formatClock(telemetry.elapsedMs)}
              </div>
            </div>
          </div>

          {/* Rolling WPM Sparkline + Progress / Ghost Pace */}
          <div
            className="min-w-0 space-y-1.5"
            style={hudLayout.cols === 2 ? {gridColumn: '1 / -1'} : undefined}
          >
            <div className="flex items-center justify-between text-xs" style={{color: 'var(--tv-text-muted)'}}>
              <span>Rolling Pace (8s)</span>
              <span className="font-typing tabular-nums">{telemetry.rollingWpm} WPM</span>
            </div>
            <div
              className={`rounded-lg border px-2 flex items-center ${hudLayout.dense ? 'h-7' : 'h-9'}`}
              style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
            >
              {sparklinePoints ? (
                <svg viewBox="0 0 120 34" className="w-full h-6 overflow-visible" aria-hidden="true">
                  <polyline
                    fill="none"
                    stroke="var(--tv-accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={sparklinePoints}
                  />
                </svg>
              ) : (
                <span className="text-[11px] truncate" style={{color: 'var(--tv-text-muted)'}}>
                  Start typing to plot live speed...
                </span>
              )}
            </div>

            <div className="space-y-0.5">
              <div
                className="relative h-1.5 w-full overflow-hidden rounded-full"
                style={{backgroundColor: 'var(--tv-surface-elevated)'}}
                aria-label="Session progress"
              >
                {showGhostPace && personalBestWpm > 0 && telemetry.ghostProgress > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-1 rounded-full z-10"
                    style={{
                      left: `${Math.min(99, telemetry.ghostProgress * 100)}%`,
                      backgroundColor: 'var(--tv-warning)',
                      opacity: 0.75,
                    }}
                    title={`Personal Best Ghost Pace (${personalBestWpm} WPM)`}
                  />
                )}
                <div
                  className="h-full rounded-full transition-transform duration-100 origin-left"
                  style={{
                    width: '100%',
                    transform: `scaleX(${Math.max(0.01, telemetry.userProgress)})`,
                    backgroundColor: 'var(--tv-accent)',
                  }}
                />
              </div>
              {showGhostPace && personalBestWpm > 0 && !hudLayout.dense && (
                <div className="flex items-center justify-between text-[11px]" style={{color: 'var(--tv-text-muted)'}}>
                  <span>Progress {Math.round(telemetry.userProgress * 100)}%</span>
                  <span style={{color: 'var(--tv-warning)'}}>Ghost PB active</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Daily Activity Goal Progress */}
        <div
          className={`flex flex-wrap items-center gap-3 border-t text-xs ${
            hudLayout.dense ? 'pt-2' : 'pt-2.5'
          }`}
          style={{borderColor: 'var(--tv-border)'}}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <GoalIcon className="w-3.5 h-3.5 shrink-0" style={{color: goalColor}} aria-hidden="true" />
            <span className="font-medium" style={{color: 'var(--tv-text-muted)'}}>
              Daily Goal
            </span>
            {dailyGoal.goalReached && (
              <span
                className="font-typing text-[11px] font-semibold"
                style={{color: 'var(--tv-success)'}}
              >
                Goal met
              </span>
            )}
          </div>

          <div
            className="relative h-2 flex-1 min-w-[120px] overflow-hidden rounded-full"
            style={{backgroundColor: 'var(--tv-surface-elevated)'}}
            role="progressbar"
            aria-label="Daily activity goal progress"
            aria-valuenow={Math.min(dailyGoal.todayMinutes, dailyGoal.goalMinutes)}
            aria-valuemin={0}
            aria-valuemax={dailyGoal.goalMinutes}
            aria-valuetext={`${dailyGoal.todayMinutes} of ${dailyGoal.goalMinutes} minutes (${dailyGoal.pct}%)`}
          >
            <div
              className={
                settings.reducedMotion
                  ? 'h-full rounded-full'
                  : 'h-full rounded-full transition-[width] duration-300'
              }
              style={{
                width: `${dailyGoal.pct}%`,
                backgroundColor: goalColor,
              }}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 font-typing tabular-nums">
            <span className="font-semibold" style={{color: 'var(--tv-text)'}}>
              {dailyGoal.todayMinutes} / {dailyGoal.goalMinutes} min
            </span>
            <span className="font-bold" style={{color: goalColor}}>
              {dailyGoal.pct}%
            </span>
          </div>
        </div>

        {(telemetry.capsLock || telemetry.strictBlocked) && (
          <div
            className="flex flex-wrap items-center gap-4 rounded-xl border px-3 py-1.5 text-xs font-medium"
            style={{
              borderColor: 'var(--tv-warning)',
              backgroundColor: 'var(--tv-surface)',
              color: 'var(--tv-warning)',
            }}
            role="alert"
          >
            {telemetry.capsLock && (
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Caps Lock is on</span>
              </span>
            )}
            {telemetry.strictBlocked && (
              <span>Strict mode: press Backspace to fix the highlighted character before continuing.</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
